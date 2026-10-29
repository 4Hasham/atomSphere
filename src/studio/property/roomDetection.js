// Finds the rooms of a floorplan from its walls (wallDetection.js, openingDetection.js):
// the spaces the walls enclose. The walls are drawn as their centre lines on a coarse
// grid, open archways closed off (or neighbouring rooms would run together), and each
// enclosed space flood-filled. Spaces open to the image's edge are outside the house.
// Pure, so it runs the same in the browser and in tests.
//
// Everything is in image pixels. Rooms are { polygon (on the walls' centre lines, as the
// property document has them), area, box: [x0, y0, x1, y1] }.

// Grid cells per wall thickness: fine enough to keep thin rooms (a passage two walls
// wide), coarse enough to be quick.
const CELLS_PER_WALL = 3;
// Smaller spaces than this many square wall thicknesses (about 1 m² for 9" walls) are
// shafts, ducts or slivers, not rooms.
const MIN_ROOM_WALLS = 18;
// …or narrower on average than this many (a passage is three or four).
const MIN_ROOM_WIDTH = 2.5;
// A wall stopping short of everything is closed off to the nearest wall within this many
// wall thicknesses (about 19 ft for 9" walls).
const LOOSE_END_REACH = 25;
// …or a wall's corner within this many.
const CORNER_REACH = 12;
// …heading within about 70° of the way the wall runs (the cosine).
const LINK_AHEAD = 0.35;

/**
 * The rooms enclosed by `walls` ([{ a, b }], horizontal or vertical centre lines) with
 * `open` gaps ([{ a, b }]) closed off, in a `width` × `height` image.
 */
export function detectRooms({ walls, open = [], thickness }, width, height) {
  if (!walls.length || !thickness) return [];
  const cell = Math.max(1, thickness / CELLS_PER_WALL);
  // One cell of margin all round, so the outside is one connected space.
  const columns = Math.ceil(width / cell) + 2;
  const rows = Math.ceil(height / cell) + 2;
  const toCell = (value) => Math.floor(value / cell) + 1;
  const blocked = new Uint8Array(columns * rows);
  // Ends run on a little, closing corners that nearly meet.
  const reach = thickness / 2;
  [...walls, ...open].forEach(({ a, b }) => {
    const horizontal = Math.abs(a[1] - b[1]) <= Math.abs(a[0] - b[0]);
    const axis = horizontal ? 0 : 1;
    const lo = Math.min(a[axis], b[axis]) - reach;
    const hi = Math.max(a[axis], b[axis]) + reach;
    const line = toCell((a[1 - axis] + b[1 - axis]) / 2);
    for (let along = toCell(Math.max(0, lo)); along <= toCell(Math.min(horizontal ? width : height, hi)); along += 1) {
      const index = horizontal ? line * columns + along : along * columns + line;
      if (index >= 0 && index < blocked.length) blocked[index] = 1;
    }
  });
  // Walls that weren't found (drawn at an angle, hidden under a logo, a window too wide
  // to bridge, a boundary only dashed in) leave rooms open to each other and the
  // outside. Close them off where a wall stops short of everything.
  looseEndLinks([...walls, ...open], thickness).forEach(([a, b]) => {
    // Steps along x then y, so the line is closed to 4-connected filling.
    const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / (cell / 2)) + 1;
    let previous = null;
    for (let step = 0; step <= steps; step += 1) {
      const x = toCell(a[0] + ((b[0] - a[0]) * step) / steps);
      const y = toCell(a[1] + ((b[1] - a[1]) * step) / steps);
      if (previous) blocked[previous[1] * columns + x] = 1;
      blocked[y * columns + x] = 1;
      previous = [x, y];
    }
  });

  // Label the open spaces (4-connected: a wall one cell thick keeps them apart).
  const labels = new Int32Array(columns * rows);
  const sizes = [0];
  const queue = new Int32Array(columns * rows);
  for (let seed = 0; seed < labels.length; seed += 1) {
    if (blocked[seed] || labels[seed]) continue;
    const label = sizes.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    labels[seed] = label;
    while (head < tail) {
      const index = queue[head++];
      const x = index % columns;
      const neighbours = [x > 0 ? index - 1 : -1, x < columns - 1 ? index + 1 : -1, index - columns, index + columns];
      for (const next of neighbours) {
        if (next >= 0 && next < labels.length && !blocked[next] && !labels[next]) {
          labels[next] = label;
          queue[tail++] = next;
        }
      }
    }
    sizes.push(tail);
  }
  const outside = labels[0];
  const minCells = (MIN_ROOM_WALLS * thickness * thickness) / (cell * cell);

  // Vertical and horizontal wall lines, for snapping room edges onto them.
  const lines = { x: [], y: [] };
  [...walls, ...open].forEach(({ a, b }) => {
    if (Math.abs(a[1] - b[1]) <= Math.abs(a[0] - b[0])) lines.y.push((a[1] + b[1]) / 2);
    else lines.x.push((a[0] + b[0]) / 2);
  });
  const snap = (value, axis) => {
    let best = value;
    let bestDistance = cell * 1.5;
    lines[axis].forEach((line) => {
      const distance = Math.abs(line - value);
      if (distance < bestDistance) {
        best = line;
        bestDistance = distance;
      }
    });
    return best;
  };

  const rooms = [];
  for (let label = 1; label < sizes.length; label += 1) {
    if (label === outside || sizes[label] < minCells) continue;
    const region = new Uint8Array(columns * rows);
    for (let index = 0; index < labels.length; index += 1) if (labels[index] === label) region[index] = 1;
    // Fill thin slits (a wall stopping partway into the room) so the outline runs round
    // the room, not into every stub.
    const filled = close(region, columns, rows);
    const outline = traceOutline(filled, columns, rows);
    if (!outline) continue;
    // Staircases along closing lines drawn at an angle become straight edges.
    const polygon = straighten(simplify(outline.map(([x, y]) => [snap((x - 1) * cell, "x"), snap((y - 1) * cell, "y")])), cell * 1.2);
    if (polygon.length < 4) continue;
    const xs = polygon.map(([x]) => x);
    const ys = polygon.map(([, y]) => y);
    const area = polygonArea(polygon);
    // Slivers (between a wall and a closing line drawn at an angle) aren't rooms.
    if (area / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < thickness * MIN_ROOM_WIDTH) continue;
    rooms.push({ polygon, area, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
  }
  return rooms;
}

/**
 * Lines closing off where walls stop short of everything: each end that meets no other
 * wall, to the nearest other loose end or wall within reach, unless the line would
 * cross a wall. [[a, b]].
 */
function looseEndLinks(segments, thickness) {
  const touching = thickness * 0.75;
  const reach = thickness * LOOSE_END_REACH;
  const nearest = (point, segment) => {
    const [a, b] = [segment.a, segment.b];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
    return [a[0] + t * dx, a[1] + t * dy];
  };
  const distance = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const loose = [];
  segments.forEach((segment) => [[segment.a, segment.b], [segment.b, segment.a]].forEach(([end, start]) => {
    if (segments.every((other) => other === segment || distance(end, nearest(end, other)) > touching)) {
      const length = distance(start, end) || 1;
      loose.push({ segment, end, outward: [(end[0] - start[0]) / length, (end[1] - start[1]) / length] });
    }
  }));
  // Whether the open segment p-q crosses a wall (other than at its own ends).
  const crosses = (p, q, skip) => segments.some((segment) => {
    if (skip.includes(segment)) return false;
    const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    return side(p, q, segment.a) * side(p, q, segment.b) < 0 && side(segment.a, segment.b, p) * side(segment.a, segment.b, q) < 0;
  });
  const links = [];
  const linked = new Set();
  loose.forEach(({ segment, end, outward }) => {
    if (linked.has(end)) return;
    let best = null;
    const consider = (point, other, partner, within = reach) => {
      const length = distance(end, point);
      if (length <= touching || length > within || (best && length >= best.length)) return;
      // Carrying on the way the wall was going, more or less (not back alongside it)…
      const heading = [(point[0] - end[0]) / length, (point[1] - end[1]) / length];
      if (heading[0] * outward[0] + heading[1] * outward[1] < LINK_AHEAD) return;
      // …to an end facing back, or across (two walls of a hidden corner), not away: a
      // stub standing in a room isn't heading for the end of some other wall.
      if (partner && (linked.has(partner.end) || -(heading[0] * partner.outward[0] + heading[1] * partner.outward[1]) < -0.2)) return;
      if (crosses(end, point, [segment, other])) return;
      best = { point, length, partner };
    };
    loose.forEach((item) => { if (item.segment !== segment) consider(item.end, item.segment, item); });
    // Onto a wall (a T, or a corner), but not onto a loose end: those pair up end to end.
    segments.forEach((other) => {
      const point = nearest(end, other);
      if (other === segment || loose.some((item) => item.segment === other && distance(point, item.end) <= touching)) return;
      // A corner is a nearer target than a wall's side: it's where a hidden corner's two
      // walls would meet, not something to reach across a room for.
      const atCorner = distance(point, other.a) <= touching || distance(point, other.b) <= touching;
      consider(point, other, null, atCorner ? thickness * CORNER_REACH : reach);
    });
    if (!best) return;
    links.push([end, best.point]);
    linked.add(end);
    if (best.partner) linked.add(best.partner.end);
  });
  return links;
}

/** Morphological closing with a 3×3 square: fills one-cell slits and notches. */
function close(region, columns, rows) {
  const grow = (source, keep) => {
    const result = new Uint8Array(source.length);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < columns && ny < rows) count += source[ny * columns + nx];
          }
        }
        result[y * columns + x] = keep(count) ? 1 : 0;
      }
    }
    return result;
  };
  const dilated = grow(region, (count) => count > 0);
  return grow(dilated, (count) => count === 9);
}

/**
 * The outer boundary of a region of cells, as grid corner points going round it, or
 * null. Boundary edges keep the region on their left; at a corner shared by two
 * diagonal cells the walk turns right, keeping each touching piece separate.
 */
function traceOutline(region, columns, rows) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < columns && y < rows && region[y * columns + x] === 1;
  // Edges keyed by their start corner; each is [dx, dy] (one grid step).
  const edges = new Map();
  const add = (x, y, dx, dy) => {
    const key = y * (columns + 1) + x;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push([dx, dy]);
  };
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!inside(x, y)) continue;
      // y grows downwards; going round with the region on the left.
      if (!inside(x, y - 1)) add(x + 1, y, -1, 0);
      if (!inside(x, y + 1)) add(x, y + 1, 1, 0);
      if (!inside(x - 1, y)) add(x, y, 0, 1);
      if (!inside(x + 1, y)) add(x + 1, y + 1, 0, -1);
    }
  }
  let best = null;
  let bestArea = 0;
  while (edges.size) {
    const [startKey] = edges.keys();
    const loop = [];
    let key = startKey;
    let heading = null;
    while (edges.has(key)) {
      const options = edges.get(key);
      let pick = 0;
      if (heading && options.length > 1) {
        // Prefer turning right, then straight on, then left.
        const rank = ([dx, dy]) => {
          const cross = heading[0] * dy - heading[1] * dx;
          return cross > 0 ? 0 : cross === 0 ? 1 : 2;
        };
        options.forEach((option, index) => { if (rank(option) < rank(options[pick])) pick = index; });
      }
      const [dx, dy] = options.splice(pick, 1)[0];
      if (!options.length) edges.delete(key);
      const x = key % (columns + 1);
      const y = Math.floor(key / (columns + 1));
      loop.push([x, y]);
      heading = [dx, dy];
      key = (y + dy) * (columns + 1) + x + dx;
    }
    const area = polygonArea(loop);
    if (area > bestArea) {
      best = loop;
      bestArea = area;
    }
  }
  return best;
}

/** Drops repeated points and points on a straight run between their neighbours. */
function simplify(points) {
  let result = points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    return point[0] !== previous[0] || point[1] !== previous[1];
  });
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    const next = result.filter((point, index) => {
      const before = result[(index + result.length - 1) % result.length];
      const after = result[(index + 1) % result.length];
      const straight = (before[0] === point[0] && point[0] === after[0]) || (before[1] === point[1] && point[1] === after[1]);
      return !straight;
    });
    if (next.length !== result.length) {
      changed = true;
      result = next.filter((point, index) => {
        const previous = next[(index + next.length - 1) % next.length];
        return point[0] !== previous[0] || point[1] !== previous[1];
      });
    }
  }
  return result;
}

/**
 * Douglas–Peucker on a closed outline: drops points within `tolerance` of the line
 * between the points kept either side. Square corners stand far off any such line.
 */
function straighten(points, tolerance) {
  if (points.length < 5) return points;
  // Start from the two points furthest apart, so both are kept.
  let first = 0;
  let second = 0;
  let longest = -1;
  points.forEach((p, i) => points.forEach((q, j) => {
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (j > i && length > longest) [first, second, longest] = [i, j, length];
  }));
  const keep = new Set([first, second]);
  const offLine = (p, a, b) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!length) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / length;
  };
  const split = (from, to) => {
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = (from + 1) % points.length; i !== to; i = (i + 1) % points.length) {
      const d = offLine(points[i], points[from], points[to]);
      if (d > worstDistance) [worst, worstDistance] = [i, d];
    }
    if (worst < 0) return;
    keep.add(worst);
    split(from, worst);
    split(worst, to);
  };
  split(first, second);
  split(second, first);
  return points.filter((point, index) => keep.has(index));
}

function polygonArea(points) {
  let twice = 0;
  points.forEach(([x1, y1], index) => {
    const [x2, y2] = points[(index + 1) % points.length];
    twice += x1 * y2 - x2 * y1;
  });
  return Math.abs(twice) / 2;
}
