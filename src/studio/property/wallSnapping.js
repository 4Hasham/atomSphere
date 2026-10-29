// Puts AI-read walls exactly on the drawing. The plan reader gets the layout right
// (which walls, rooms, doors) but places walls roughly; here each wall moves onto the
// thick dark band drawn near it, ends are trimmed or extended to meet the walls they
// run into, and room corners follow. Pure arithmetic on the plan image's brightness,
// so it can be tested without a browser.
//
// `gray` is the plan image as brightness: { data (0 black – 255 white, row by row),
// width, height, scale (its pixels per underlay pixel) }. Positions are plan metres;
// the underlay maps them: underlay pixels = (metres - origin) / metresPerPixel.
import { projectOntoSegment } from "./propertyEdits";

// How far (metres) from where the model put it a wall's band may be.
const SEARCH_METRES = 0.6;
// A band is darker than this on average along the wall (0 white – 1 black). Doors,
// windows and text break it up, so it needn't be solid.
const MIN_BAND_DARKNESS = 0.35;
// Ends this close (metres) to a crossing wall are trimmed or extended to meet it.
const JOIN_METRES = 0.6;
// Leave out this share of the wall at each end, where corners and crossing walls are.
const END_MARGIN = 0.12;

const AXIS_TOLERANCE = 1e-6;
const isHorizontal = (wall) => Math.abs(wall.a[1] - wall.b[1]) < AXIS_TOLERANCE;
const isVertical = (wall) => Math.abs(wall.a[0] - wall.b[0]) < AXIS_TOLERANCE;

function darknessAt(gray, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= gray.width || py >= gray.height) return 0;
  return 1 - gray.data[py * gray.width + px] / 255;
}

/**
 * Where the dark band along a wall is: { offset (metres across the wall, along its
 * normal), thickness (metres) }, or null when there's no clear band within reach.
 */
export function findBand(gray, wall, { metresPerPixel, origin }) {
  const toGray = ([x, y]) => [((x - origin[0]) / metresPerPixel) * gray.scale, ((y - origin[1]) / metresPerPixel) * gray.scale];
  const a = toGray(wall.a);
  const b = toGray(wall.b);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 4) return null;
  const along = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const normal = [-along[1], along[0]];
  const metresPerGrayPixel = metresPerPixel / gray.scale;
  const reach = Math.max(3, Math.round(SEARCH_METRES / metresPerGrayPixel));

  const samples = [];
  for (let s = length * END_MARGIN; s <= length * (1 - END_MARGIN); s += Math.max(1, length / 200)) samples.push(s);
  if (!samples.length) return null;

  // Average darkness of the line at each offset across the wall.
  const profile = [];
  for (let offset = -reach; offset <= reach; offset += 1) {
    let total = 0;
    samples.forEach((s) => {
      total += darknessAt(gray, a[0] + along[0] * s + normal[0] * offset, a[1] + along[1] * s + normal[1] * offset);
    });
    profile.push(total / samples.length);
  }

  // The band is the run of dark offsets around the darkest one, nearest the model's line
  // when two are equally dark (a thin double line or a neighbouring wall).
  let best = -1;
  profile.forEach((value, index) => {
    const nearer = best < 0 || value > profile[best] + 0.02
      || (value > profile[best] - 0.02 && Math.abs(index - reach) < Math.abs(best - reach));
    if (nearer) best = index;
  });
  if (profile[best] < MIN_BAND_DARKNESS) return null;
  const threshold = Math.max(MIN_BAND_DARKNESS, profile[best] * 0.6);
  let start = best;
  let end = best;
  while (start > 0 && profile[start - 1] >= threshold) start -= 1;
  while (end < profile.length - 1 && profile[end + 1] >= threshold) end += 1;
  const centre = (start + end) / 2 - reach;
  return {
    offset: centre * metresPerGrayPixel,
    thickness: (end - start + 1) * metresPerGrayPixel,
    normal,
  };
}

/** Moves straight ends onto crossing walls (to their centre line) when they nearly meet. */
function joinEnds(walls) {
  walls.forEach((wall) => {
    const horizontal = isHorizontal(wall);
    const vertical = isVertical(wall);
    if (!horizontal && !vertical) return;
    ["a", "b"].forEach((end) => {
      const point = wall[end];
      let best = null;
      walls.forEach((other) => {
        if (other === wall) return;
        // A horizontal wall's end meets a vertical wall, and the other way round.
        const crossing = horizontal ? isVertical(other) : isHorizontal(other);
        if (!crossing) return;
        const line = horizontal ? other.a[0] : other.a[1];
        const span = horizontal ? [other.a[1], other.b[1]] : [other.a[0], other.b[0]];
        const across = horizontal ? point[1] : point[0];
        const gap = Math.abs((horizontal ? point[0] : point[1]) - line);
        const within = across >= Math.min(...span) - JOIN_METRES && across <= Math.max(...span) + JOIN_METRES;
        if (within && gap <= JOIN_METRES && (!best || gap < best.gap)) best = { gap, line };
      });
      if (best) wall[end] = horizontal ? [best.line, point[1]] : [point[0], best.line];
    });
  });
}

/** Moves a room corner onto the nearest wall line on each axis, if one is close. */
function snapRoomPoint([x, y], xs, ys) {
  const nearest = (value, lines) => lines.reduce((found, line) => (
    Math.abs(line - value) <= JOIN_METRES && (found === null || Math.abs(line - value) < Math.abs(found - value)) ? line : found
  ), null);
  return [nearest(x, xs) ?? x, nearest(y, ys) ?? y];
}

/**
 * The draft with its walls on the drawing: { walls, rooms, moved } (moved: how many
 * walls found their band). Doors and windows keep their place on the drawing.
 */
export function snapToDrawing({ walls, rooms }, gray, placement) {
  // Where each opening is on the drawing, to put it back after its wall moves.
  const openingPoints = new Map();
  walls.forEach((wall) => {
    const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
    wall.openings.forEach((opening) => {
      const t = opening.at / length;
      openingPoints.set(opening.id, [wall.a[0] + (wall.b[0] - wall.a[0]) * t, wall.a[1] + (wall.b[1] - wall.a[1]) * t]);
    });
  });

  let moved = 0;
  const snapped = walls.map((wall) => {
    const band = findBand(gray, wall, placement);
    if (!band) return { ...wall, a: [...wall.a], b: [...wall.b] };
    moved += 1;
    const shift = [band.normal[0] * band.offset, band.normal[1] * band.offset];
    return {
      ...wall,
      a: [wall.a[0] + shift[0], wall.a[1] + shift[1]],
      b: [wall.b[0] + shift[0], wall.b[1] + shift[1]],
    };
  });
  joinEnds(snapped);

  const round = (value) => Math.round(value * 1000) / 1000;
  const finalWalls = snapped
    .map((wall) => ({ ...wall, a: wall.a.map(round), b: wall.b.map(round) }))
    .filter((wall) => Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) > 0.2)
    .map((wall) => ({
      ...wall,
      openings: wall.openings.map((opening) => {
        const projection = projectOntoSegment(openingPoints.get(opening.id), wall.a, wall.b);
        const half = opening.width / 2;
        const at = Math.min(Math.max(projection.along, half + 0.05), projection.length - half - 0.05);
        return { ...opening, at: round(at) };
      }).filter((opening) => opening.at > 0),
    }));

  const xs = finalWalls.filter(isVertical).map((wall) => wall.a[0]);
  const ys = finalWalls.filter(isHorizontal).map((wall) => wall.a[1]);
  const finalRooms = rooms.map((room) => ({
    ...room,
    polygon: room.polygon.map((point) => snapRoomPoint(point, xs, ys).map(round)),
  }));
  return { walls: finalWalls, rooms: finalRooms, moved };
}
