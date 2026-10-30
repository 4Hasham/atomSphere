// Finds the walls drawn on a floorplan image, by image processing rather than AI.
// In architectural plans walls are the thick solid bands (black, grey or coloured);
// furniture, text, door swings and dimension lines are thin. So: keep the dark pixels,
// measure how thick the solid bands typically are, remove everything thinner, and trace
// what's left as straight horizontal and vertical walls. Pure, so it runs the same in
// the browser and in tests.
//
// `image` is { data (RGBA, row by row, as from a canvas), width, height }. Results are
// in that image's pixels.
//
// Plans draw walls one of two ways: solid bands (black, grey, red), or thin outlines
// with light hatching between them. The second shows up as walls far thinner than a
// wall can be, and then the hatching counts as wall too.

// Darker than this is ink (red and grey walls included; pale orange furniture isn't).
const INK_BELOW = 140;
// In outlined plans, light grey (hatching) counts too; coloured line work doesn't.
const HATCH_BELOW = 236;
const HATCH_MAX_SATURATION = 0.2;
// Walls measured thinner than this share of the long side are outlines, not solid.
const OUTLINE_SHARE = 0.006;
// The longest wall of a house plan is at least this share of the image's long side.
const MIN_LONGEST_WALL = 0.2;
// Band thicknesses (pixels) considered when measuring the walls.
const MIN_THICKNESS = 4;
const MAX_THICKNESS_SHARE = 0.05; // of the image's long side
// A traced band may be this much thinner / thicker than the walls and still be one.
const THICKNESS_RANGE = [0.5, 2.2];
// Partitions (half-brick walls) are drawn this thick, as shares of the main walls.
const PARTITION_RANGE = [0.35, 0.7];
// A wall is at least this many times as long as it is thick.
const MIN_LENGTH_RATIO = 1.6;
// A line beside a wall is open (room) if at most this share of it is ink, and a side is
// open when such lines run on for this share of a wall's thickness (gaps in lettering
// are thinner than walls; rooms are far wider).
const OPEN_SIDE_INK = 0.5;
const OPEN_DEPTH = 0.4;
// Pieces of wall pixels carrying less than this share of the most wall length aren't the house.
const HOUSE_PIECE_SHARE = 0.05;

/**
 * Wall-candidate pixels: dark ones, and with `hatching` also light grey ones (not
 * coloured: furniture and windows are often drawn in colour).
 */
export function inkMask(image, hatching = false) {
  const { data, width, height } = image;
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const r = data[index * 4];
    const g = data[index * 4 + 1];
    const b = data[index * 4 + 2];
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    if (brightness < INK_BELOW) {
      mask[index] = 1;
    } else if (hatching && brightness < HATCH_BELOW) {
      const max = Math.max(r, g, b);
      mask[index] = max && (max - Math.min(r, g, b)) / max <= HATCH_MAX_SATURATION ? 1 : 0;
    }
  }
  return mask;
}

/** Fills gaps narrower than `size` (a morphological closing), joining hatch lines into a band. */
export function closeGaps(mask, width, height, size) {
  const grown = new Uint8Array(width * height);
  const sums = integral(mask, width, height);
  const half = Math.floor(size / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - half);
      const y0 = Math.max(0, y - half);
      if (boxSum(sums, width, x0, y0, Math.min(width, x0 + size), Math.min(height, y0 + size)) > 0) grown[y * width + x] = 1;
    }
  }
  const grownSums = integral(grown, width, height);
  const closed = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - half);
      const y0 = Math.max(0, y - half);
      const x1 = Math.min(width, x0 + size);
      const y1 = Math.min(height, y0 + size);
      if (boxSum(grownSums, width, x0, y0, x1, y1) === (x1 - x0) * (y1 - y0)) closed[y * width + x] = 1;
    }
  }
  return closed;
}

/**
 * The plan's usual wall thickness in pixels: the thickness of the solid bands that run
 * on for a long way (walls), weighted by how far they run. Short strokes (text,
 * watermarks, furniture) don't count, however many there are.
 */
export function wallThickness(mask, width, height) {
  const max = Math.max(MIN_THICKNESS + 2, Math.round(Math.max(width, height) * MAX_THICKNESS_SHARE));
  const minRun = Math.max(12, Math.round(Math.max(width, height) * 0.015));
  const weights = new Float64Array(max + 2);
  // A wall has open space (its rooms) along both sides; strips inside a dark block (a
  // banner split up by its text) don't, so they don't count.
  const clearAlong = (read, line, lines, start, end) => {
    if (line < 0 || line >= lines) return true;
    let ink = 0;
    for (let i = start; i < end; i += 1) ink += read(line, i);
    return ink <= (end - start) * 0.5;
  };
  const tally = (read, lines, length) => traceBands(read, lines, length, minRun).forEach((band) => {
    const thickness = band.to - band.from;
    const along = band.end - band.start;
    if (thickness < MIN_THICKNESS || thickness > max || along < 4 * thickness) return;
    if (!clearAlong(read, band.from - 1, lines, band.start, band.end) || !clearAlong(read, band.to, lines, band.start, band.end)) return;
    weights[thickness] += along;
  });
  tally((line, i) => mask[line * width + i], height, width);
  tally((line, i) => mask[i * width + line], width, height);
  // Smooth over neighbouring thicknesses (a 10 px wall traces as 9-11), then take the peak.
  let best = 0;
  let bestScore = 0;
  for (let thickness = MIN_THICKNESS; thickness <= max; thickness += 1) {
    const score = weights[thickness - 1] + weights[thickness] * 2 + weights[thickness + 1];
    if (score > bestScore) {
      best = thickness;
      bestScore = score;
    }
  }
  return best || null;
}

/** Sums over a mask, so any rectangle's count is four lookups. */
export function integral(mask, width, height) {
  const sums = new Int32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += mask[y * width + x];
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row;
    }
  }
  return sums;
}

function boxSum(sums, width, x0, y0, x1, y1) {
  const w = width + 1;
  return sums[y1 * w + x1] - sums[y0 * w + x1] - sums[y1 * w + x0] + sums[y0 * w + x0];
}

/**
 * Keeps only ink that's at least `size` thick in both directions (a morphological
 * opening): thin lines, text and furniture outlines disappear, walls stay whole.
 */
export function keepThick(mask, width, height, size) {
  const sums = integral(mask, width, height);
  const core = new Uint8Array(width * height);
  const half = Math.floor(size / 2);
  for (let y = half; y < height - (size - half) + 1; y += 1) {
    for (let x = half; x < width - (size - half) + 1; x += 1) {
      if (boxSum(sums, width, x - half, y - half, x - half + size, y - half + size) === size * size) core[y * width + x] = 1;
    }
  }
  // Grow the surviving cores back to their full extent.
  const coreSums = integral(core, width, height);
  const kept = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      const x0 = Math.max(0, x - (size - half - 1));
      const y0 = Math.max(0, y - (size - half - 1));
      const x1 = Math.min(width, x + half + 1);
      const y1 = Math.min(height, y + half + 1);
      if (boxSum(coreSums, width, x0, y0, x1, y1) > 0) kept[y * width + x] = 1;
    }
  }
  return kept;
}

/**
 * Traces bands running along one axis. `along` reads the mask so that rows are lines
 * along the walls being traced: horizontal walls read row by row, vertical walls column
 * by column. Runs shorter than `minRun` are ignored. Returns [{ from, to, start, end }]
 * in that frame: from-to across the band (its rows), start-end along it.
 */
function traceBands(read, lines, length, minRun) {
  const open = [];
  const done = [];
  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  for (let line = 0; line <= lines; line += 1) {
    const runs = [];
    if (line < lines) {
      let start = -1;
      for (let i = 0; i <= length; i += 1) {
        const on = i < length && read(line, i);
        if (on && start < 0) start = i;
        if (!on && start >= 0) {
          if (i - start >= minRun) runs.push([start, i]);
          start = -1;
        }
      }
    }
    const continued = new Set();
    runs.forEach(([start, end]) => {
      // The band this run continues: they cover nearly the same stretch. (Overlapping isn't
      // enough: a vertical wall's rows overlap the end of the horizontal wall above it.)
      const band = open.find((item) => !continued.has(item)
        && overlap(start, end, item.start, item.end) >= 0.7 * Math.max(end - start, item.end - item.start));
      if (band) {
        band.starts.push(start);
        band.ends.push(end);
        band.start = start;
        band.end = end;
        band.to = line + 1;
        continued.add(band);
      } else {
        const created = { from: line, to: line + 1, start, end, starts: [start], ends: [end] };
        open.push(created);
        continued.add(created);
      }
    });
    for (let index = open.length - 1; index >= 0; index -= 1) {
      if (!continued.has(open[index])) done.push(...open.splice(index, 1));
    }
  }
  const median = (values) => [...values].sort((p, q) => p - q)[Math.floor(values.length / 2)];
  return done.map((band) => ({ from: band.from, to: band.to, start: median(band.starts), end: median(band.ends) }));
}

/** Labels the mask's connected pieces: { labels (per pixel, 0 = none), count }. */
function labelPieces(mask, width, height) {
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  let count = 0;
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || labels[seed]) continue;
    count += 1;
    labels[seed] = count;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width];
      for (const n of neighbours) {
        if (n >= 0 && n < mask.length && mask[n] && !labels[n]) {
          labels[n] = count;
          queue[tail++] = n;
        }
      }
    }
  }
  return { labels, count };
}

/**
 * Keeps the walls of the house: those on connected pieces of wall pixels that carry a
 * real share of all the wall length found. Door gaps split a house's walls into a few
 * big pieces; logos, pillars, plants and title text are small pieces of their own.
 */
function houseWalls(walls, mask, width, height) {
  if (!walls.length) return walls;
  const { labels, count } = labelPieces(mask, width, height);
  const pieceOf = (wall) => labels[Math.min(height - 1, Math.max(0, Math.round((wall.a[1] + wall.b[1]) / 2))) * width
    + Math.min(width - 1, Math.max(0, Math.round((wall.a[0] + wall.b[0]) / 2)))];
  const lengths = new Float64Array(count + 1);
  walls.forEach((wall) => {
    lengths[pieceOf(wall)] += Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  });
  const longest = Math.max(...lengths);
  return walls.filter((wall) => lengths[pieceOf(wall)] >= longest * HOUSE_PIECE_SHARE);
}

/**
 * Whether a traced band has open space along both sides, as a wall between rooms does.
 * The edges of filled shapes (banners, title bars) have their fill on one side. A side
 * is open if a few lines in a row within `reach` of the edge are mostly clear: furniture
 * drawn against a wall is a thin line with space beyond it.
 */
function clearBothSides(ink, width, height, band, horizontal, reach) {
  const read = horizontal ? (line, i) => ink[line * width + i] : (line, i) => ink[i * width + line];
  const lines = horizontal ? height : width;
  const clear = (line) => {
    if (line < 0 || line >= lines) return true;
    let marks = 0;
    for (let i = band.start; i < band.end; i += 1) marks += read(line, i);
    return marks <= (band.end - band.start) * OPEN_SIDE_INK;
  };
  // Open space is several clear lines in a row; a single one can be a gap in lettering.
  const depth = Math.max(3, Math.round(reach * OPEN_DEPTH));
  const openSide = (edge, step) => {
    let run = 0;
    for (let offset = 2; offset <= reach + depth; offset += 1) {
      run = clear(edge + step * offset) ? run + 1 : 0;
      if (run >= depth) return true;
    }
    return false;
  };
  return openSide(band.from, -1) && openSide(band.to - 1, 1);
}

/**
 * Drops walls that come near no other wall: text, symbols and stray marks float free in
 * the middle of rooms, while real walls join others or stop a doorway's width short of
 * them.
 */
function connectedWalls(walls, reach) {
  const touches = (point, other) => {
    const horizontal = other.a[1] === other.b[1];
    const [lo, hi] = horizontal
      ? [Math.min(other.a[0], other.b[0]), Math.max(other.a[0], other.b[0])]
      : [Math.min(other.a[1], other.b[1]), Math.max(other.a[1], other.b[1])];
    const along = horizontal ? point[0] : point[1];
    const across = horizontal ? Math.abs(point[1] - other.a[1]) : Math.abs(point[0] - other.a[0]);
    return across <= reach && along >= lo - reach && along <= hi + reach;
  };
  // Both are connected when one ends on the other (an outer wall's own ends may touch
  // nothing while the inner walls end along it).
  const connected = new Set();
  walls.forEach((wall) => walls.forEach((other) => {
    if (other !== wall && (touches(wall.a, other) || touches(wall.b, other))) {
      connected.add(wall);
      connected.add(other);
    }
  }));
  return walls.filter((wall) => connected.has(wall));
}

/** Moves straight ends onto crossing walls' centre lines when they nearly meet. */
function joinEnds(walls, reach) {
  const horizontal = (wall) => wall.a[1] === wall.b[1];
  walls.forEach((wall) => {
    const isHorizontal = horizontal(wall);
    ["a", "b"].forEach((end) => {
      const point = wall[end];
      let best = null;
      walls.forEach((other) => {
        if (other === wall || horizontal(other) === isHorizontal) return;
        const line = isHorizontal ? other.a[0] : other.a[1];
        const lo = Math.min(isHorizontal ? other.a[1] : other.a[0], isHorizontal ? other.b[1] : other.b[0]) - reach;
        const hi = Math.max(isHorizontal ? other.a[1] : other.a[0], isHorizontal ? other.b[1] : other.b[0]) + reach;
        const across = isHorizontal ? point[1] : point[0];
        const gap = Math.abs((isHorizontal ? point[0] : point[1]) - line);
        if (across >= lo && across <= hi && gap <= reach && (!best || gap < best.gap)) best = { gap, line };
      });
      if (best) wall[end] = isHorizontal ? [best.line, point[1]] : [point[0], best.line];
    });
  });
}

/**
 * The walls drawn on the plan: { walls: [{ a, b, thickness }] (image pixels, centre
 * lines), thickness (the usual wall thickness), style ("solid" | "outlined"), mask
 * (the wall pixels found) }.
 */
export function detectWalls(image) {
  const { width, height } = image;
  let style = "solid";
  let ink = inkMask(image);
  let thickness = wallThickness(ink, width, height);
  if (!thickness || thickness < Math.max(width, height) * OUTLINE_SHARE) {
    // Walls this thin are outlines: count the hatching between them, and close the gaps.
    style = "outlined";
    ink = closeGaps(inkMask(image, true), width, height, 3);
    thickness = wallThickness(ink, width, height);
  }
  if (!thickness) return { walls: [], thickness: null, style, mask: ink };
  // Anything thinner than ~60% of a wall goes: text and line work, not walls.
  const mask = keepThick(ink, width, height, Math.max(3, Math.round(thickness * 0.6)));

  const minRun = Math.round(thickness * MIN_LENGTH_RATIO);
  const wallLike = (band) => {
    const across = band.to - band.from;
    return across >= thickness * THICKNESS_RANGE[0] && across <= thickness * THICKNESS_RANGE[1];
  };
  const horizontal = traceBands((line, i) => mask[line * width + i], height, width, minRun)
    .filter((band) => wallLike(band) && clearBothSides(ink, width, height, band, true, thickness))
    .map((band) => {
      const y = (band.from + band.to) / 2;
      return { a: [band.start, y], b: [band.end, y], thickness: band.to - band.from };
    });
  const vertical = traceBands((line, i) => mask[i * width + line], width, height, minRun)
    .filter((band) => wallLike(band) && clearBothSides(ink, width, height, band, false, thickness))
    .map((band) => {
      const x = (band.from + band.to) / 2;
      return { a: [x, band.start], b: [x, band.end], thickness: band.to - band.from };
    });

  // Only the house's walls, not logos, plants or marks around the drawing.
  const walls = houseWalls([...horizontal, ...vertical], mask, width, height);

  // A band's ends are the outer faces of the walls it meets; pull them in to centre lines.
  walls.forEach((wall) => {
    const along = wall.a[1] === wall.b[1] ? 0 : 1;
    const inset = thickness / 2;
    wall.a = wall.a.map((value, axis) => (axis === along ? value + inset : value));
    wall.b = wall.b.map((value, axis) => (axis === along ? value - inset : value));
  });
  joinEnds(walls, thickness * 1.5);
  const solid = walls.filter((wall) => Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) >= thickness);
  // A doorway is about four wall-thicknesses wide (3 ft against 9 in); allow some more.
  const main = connectedWalls(solid, thickness * 6);
  // A house's outer walls run a good part of the drawing. If nothing does, what was
  // traced is lettering: a drawing in thin outlines only (a site or deck plan) has no
  // walls to find.
  const longest = Math.max(0, ...main.map((wall) => Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1])));
  if (longest < Math.max(width, height) * MIN_LONGEST_WALL) return { walls: [], thickness, style, mask };
  const partitions = thinPartitions(ink, mask, main, thickness, width, height);
  return { walls: [...main, ...partitions.walls], thickness, style, mask: partitions.mask };
}

/**
 * Partition walls drawn thinner than the main ones (4½" against 9" brick): bands about
 * half a wall thick, kept only where they join the main walls (directly or through
 * other partitions), as partitions do and plants, furniture and lettering don't.
 * Returns { walls, mask (the main wall pixels and the thin ones) }.
 */
function thinPartitions(ink, mask, main, thickness, width, height) {
  const thin = keepThick(ink, width, height, Math.max(2, Math.round(thickness * PARTITION_RANGE[0])));
  for (let index = 0; index < thin.length; index += 1) if (mask[index]) thin[index] = 0;
  const minRun = Math.round(thickness * MIN_LENGTH_RATIO);
  const fits = (band) => {
    const across = band.to - band.from;
    return across >= thickness * PARTITION_RANGE[0] && across < thickness * PARTITION_RANGE[1];
  };
  const found = [
    ...traceBands((line, i) => thin[line * width + i], height, width, minRun)
      .filter((band) => fits(band) && clearBothSides(ink, width, height, band, true, thickness))
      .map((band) => ({ a: [band.start, (band.from + band.to) / 2], b: [band.end, (band.from + band.to) / 2], thickness: band.to - band.from })),
    ...traceBands((line, i) => thin[i * width + line], width, height, minRun)
      .filter((band) => fits(band) && clearBothSides(ink, width, height, band, false, thickness))
      .map((band) => ({ a: [(band.from + band.to) / 2, band.start], b: [(band.from + band.to) / 2, band.end], thickness: band.to - band.from })),
  ];
  // Ends onto the centre lines of the walls they meet, without moving the main walls.
  const kept = main.map((wall) => ({ a: [...wall.a], b: [...wall.b] }));
  joinEnds([...main, ...found], thickness * 1.5);
  main.forEach((wall, index) => Object.assign(wall, kept[index]));

  const span = (wall, axis) => [Math.min(wall.a[axis], wall.b[axis]), Math.max(wall.a[axis], wall.b[axis])];
  // Within a wall's thickness of a wall (its extent), or of its line (anywhere along it).
  const touches = (point, wall, anywhere = false) => {
    const horizontal = wall.a[1] === wall.b[1];
    const [lo, hi] = span(wall, horizontal ? 0 : 1);
    const along = horizontal ? point[0] : point[1];
    const across = horizontal ? Math.abs(point[1] - wall.a[1]) : Math.abs(point[0] - wall.a[0]);
    return across <= thickness && (anywhere || (along >= lo - thickness && along <= hi + thickness));
  };
  // Partitions that meet each other form a group (an L round a wardrobe, say). A group is
  // kept if it meets a main wall, or at least two of its ends lie on main walls' lines
  // (where those walls have a door or window just there).
  const candidates = found.filter((wall) => Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) >= thickness);
  const group = candidates.map((_, index) => index);
  const root = (index) => (group[index] === index ? index : (group[index] = root(group[index])));
  candidates.forEach((wall, i) => candidates.forEach((other, j) => {
    if (i < j && (touches(wall.a, other) || touches(wall.b, other) || touches(other.a, wall) || touches(other.b, wall))) group[root(i)] = root(j);
  }));
  const meets = new Map();
  const onLines = new Map();
  candidates.forEach((wall, index) => [wall.a, wall.b].forEach((end) => {
    const key = root(index);
    if (main.some((other) => touches(end, other))) meets.set(key, true);
    if (main.some((other) => touches(end, other, true))) onLines.set(key, (onLines.get(key) ?? 0) + 1);
  }));
  const accepted = candidates.filter((_, index) => meets.get(root(index)) || (onLines.get(root(index)) ?? 0) >= 2);
  const both = new Uint8Array(mask);
  for (let index = 0; index < both.length; index += 1) if (thin[index]) both[index] = 1;
  return { walls: accepted, mask: both };
}
