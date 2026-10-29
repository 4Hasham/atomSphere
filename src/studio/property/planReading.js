// AI floorplan reading: turns what a vision model read off a floorplan image into a
// draft floor of the property document (walls, doors, windows, rooms) and the plan's
// scale, for the person to check and correct in the trace editor. Pure, so it can be
// tested without a model.
//
// The reading (the model's answer), in the coordinates of the image it was sent:
//   walls:      [{ a: [x, y], b: [x, y], exterior: boolean }]
//   openings:   [{ type: "door" | "window", a: [x, y], b: [x, y] }]   // the gap's two ends
//   rooms:      [{ name, type?, polygon: [[x, y], ...], size? }]        // size: "12'-0\" x 14'-6\""
//   dimensions: [{ text, a: [x, y], b: [x, y] }]                        // what a dimension line spans
//
// The draft lines up with the floor's plan image (its underlay): plan metres are the
// underlay's origin + underlay pixels × metresPerPixel, so the walls sit on the drawing
// and every mistake is easy to see.
import { DOOR, EXTERIOR_WALL, INTERIOR_WALL, ROOM_TYPES, WINDOW } from "./propertyDocument";
import { newId, projectOntoSegment } from "./propertyEdits";
import { parseLength } from "./units";

// Within this angle of horizontal or vertical, a wall is drawn straight.
const STRAIGHTEN_DEGREES = 4;
// Corners and wall lines this close (metres) are the same corner or line.
const SNAP_METRES = 0.25;
const MIN_WALL_METRES = 0.3;
const MIN_ROOM_SQ_METRES = 1;
// An opening this far (metres) from every wall belongs to none.
const OPENING_REACH_METRES = 0.45;
const OPENING_END_GAP = 0.05;
// Scale samples further than this from the median are misreadings and left out.
const SCALE_OUTLIER_RATIO = 0.2;

const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const round = (value) => Math.round(value * 1000) / 1000;

/**
 * Maps the model's coordinates to underlay pixels. `space` is "pixels" (of the image
 * sent) or "permille" (0–1000 across each side of it, as Qwen's grounding is trained);
 * `sentScale` is the sent image's pixels per underlay pixel (the plan sits at its
 * top-left, see planImageForReading).
 */
export function pixelMapper({ space = "pixels", sentWidth, sentHeight, sentScale = 1 }) {
  const sx = (space === "permille" ? sentWidth / 1000 : 1) / sentScale;
  const sy = (space === "permille" ? sentHeight / 1000 : 1) / sentScale;
  return ([x, y]) => [x * sx, y * sy];
}

const validPoint = (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

/** "12'-0\" x 14'-6\"" → [metres, metres], or null. */
export function parseRoomSize(text) {
  const parts = String(text ?? "").split(/\s*[x×X*]\s*/);
  if (parts.length !== 2) return null;
  const sides = parts.map((part) => parseLength(part));
  return sides.every((side) => side && side > 0.8 && side < 30) ? sides : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Metres per underlay pixel from the measurements printed on the plan: dimension lines
 * (a length over a span) and room sizes (width × depth over the room's extent).
 * Returns { metresPerPixel, samples, used } or null when the plan gives nothing usable.
 */
export function estimateScale(reading, toPixels) {
  const samples = [];
  (reading.dimensions ?? []).forEach((dimension) => {
    if (!validPoint(dimension?.a) || !validPoint(dimension?.b)) return;
    const metres = parseLength(dimension.text);
    const pixels = distance(toPixels(dimension.a), toPixels(dimension.b));
    if (metres && metres > 0.5 && metres < 60 && pixels > 10) samples.push(metres / pixels);
  });
  (reading.rooms ?? []).forEach((room) => {
    const size = parseRoomSize(room?.size);
    const points = (room?.polygon ?? []).filter(validPoint).map(toPixels);
    if (!size || points.length < 3) return;
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs);
    const depth = Math.max(...ys) - Math.min(...ys);
    if (width < 10 || depth < 10) return;
    // Which printed side is which isn't fixed; take the pairing whose two scales agree.
    const asWritten = [size[0] / width, size[1] / depth];
    const swapped = [size[1] / width, size[0] / depth];
    const spread = ([p, q]) => Math.abs(p - q) / Math.max(p, q);
    samples.push(...(spread(asWritten) <= spread(swapped) ? asWritten : swapped));
  });
  if (!samples.length) return null;
  const first = median(samples);
  const used = samples.filter((sample) => Math.abs(sample - first) / first <= SCALE_OUTLIER_RATIO);
  return { metresPerPixel: median(used.length ? used : samples), samples: samples.length, used: used.length };
}

/** Joins nearby values (one axis) to their group's mean. */
function snapAxis(values, tolerance) {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const snapped = [...values];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const mean = group.reduce((sum, item) => sum + item.value, 0) / group.length;
    group.forEach((item) => { snapped[item.index] = mean; });
    group = [];
  };
  order.forEach((item) => {
    if (group.length && item.value - group[group.length - 1].value > tolerance) flush();
    group.push(item);
  });
  flush();
  return snapped;
}

/**
 * Cleans the read walls (metres): straightens near-horizontal and near-vertical ones,
 * joins corners and lines that nearly meet, pulls loose ends onto the wall they stop
 * against, and drops scraps and duplicates.
 */
export function cleanWalls(rawWalls) {
  const tan = Math.tan((STRAIGHTEN_DEGREES * Math.PI) / 180);
  const walls = rawWalls
    .filter((wall) => distance(wall.a, wall.b) >= MIN_WALL_METRES)
    .map((wall) => {
      const a = [...wall.a];
      const b = [...wall.b];
      const dx = Math.abs(b[0] - a[0]);
      const dy = Math.abs(b[1] - a[1]);
      if (dy <= dx * tan) a[1] = b[1] = (a[1] + b[1]) / 2;
      else if (dx <= dy * tan) a[0] = b[0] = (a[0] + b[0]) / 2;
      return { ...wall, a, b };
    });

  // Snap x and y separately, so straight walls stay straight while corners meet.
  const xs = snapAxis(walls.flatMap((wall) => [wall.a[0], wall.b[0]]), SNAP_METRES);
  const ys = snapAxis(walls.flatMap((wall) => [wall.a[1], wall.b[1]]), SNAP_METRES);
  walls.forEach((wall, index) => {
    wall.a = [xs[index * 2], ys[index * 2]];
    wall.b = [xs[index * 2 + 1], ys[index * 2 + 1]];
  });

  // A loose end close to another wall (a T-junction) is moved onto it.
  walls.forEach((wall) => {
    ["a", "b"].forEach((end) => {
      let best = null;
      walls.forEach((other) => {
        if (other === wall) return;
        const projection = projectOntoSegment(wall[end], other.a, other.b);
        if (projection.distance > 1e-6 && projection.distance <= SNAP_METRES
          && (!best || projection.distance < best.distance)) {
          best = projection;
        }
      });
      if (best) wall[end] = best.point;
    });
  });

  const seen = new Set();
  return walls
    .map((wall) => ({ ...wall, a: wall.a.map(round), b: wall.b.map(round) }))
    .filter((wall) => {
      if (distance(wall.a, wall.b) < MIN_WALL_METRES) return false;
      const key = [wall.a, wall.b].map((point) => point.join(",")).sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** A room type from the model's type, or failing that from the room's name. */
export function roomTypeFor(type, name) {
  if (ROOM_TYPES.some((item) => item.id === type)) return type;
  const text = String(name ?? "").toLowerCase();
  const rules = [
    [/bed|master|guest\s*room/, "bedroom"],
    [/drawing|dining/, "drawing"],
    [/lounge|living|tv|family|sitting/, "lounge"],
    [/kitchen|pantry/, "kitchen"],
    [/bath|toilet|wash|w\.?c|powder/, "bath"],
    [/stair/, "stairs"],
    [/store|storage|laundry|utility/, "store"],
    [/terrace|balcony|roof/, "terrace"],
    [/courtyard|open\s*to\s*sky|o\.?t\.?s/, "courtyard"],
    [/entrance|lobby|porch|garage|passage|corridor|foyer/, "entrance"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? "other";
}

function polygonArea(points) {
  let twice = 0;
  points.forEach(([x1, y1], index) => {
    const [x2, y2] = points[(index + 1) % points.length];
    twice += x1 * y2 - x2 * y1;
  });
  return Math.abs(twice) / 2;
}

/** Places each read door or window on the wall it sits in. */
function placeOpenings(walls, rawOpenings) {
  rawOpenings.forEach((opening) => {
    const middle = [(opening.a[0] + opening.b[0]) / 2, (opening.a[1] + opening.b[1]) / 2];
    let best = null;
    walls.forEach((wall) => {
      const projection = projectOntoSegment(middle, wall.a, wall.b);
      if (projection.distance <= Math.max(OPENING_REACH_METRES, wall.thickness)
        && (!best || projection.distance < best.projection.distance)) {
        best = { wall, projection };
      }
    });
    if (!best) return;
    const { wall, projection } = best;
    const defaults = opening.type === "door" ? DOOR : WINDOW;
    // The gap's length along the wall, within sensible door and window sizes.
    const along = (point) => projectOntoSegment(point, wall.a, wall.b).along;
    const span = Math.abs(along(opening.b) - along(opening.a));
    const room = projection.length - 2 * OPENING_END_GAP;
    const width = Math.min(Math.max(span || defaults.width, 0.6), 3.6, room);
    if (width < 0.5) return;
    const at = Math.min(Math.max(projection.along, OPENING_END_GAP + width / 2), projection.length - OPENING_END_GAP - width / 2);
    wall.openings.push({ id: newId("opening"), ...defaults, type: opening.type, at: round(at), width: round(width) });
  });
}

/**
 * The draft floor from a reading. `image` describes the image the model saw
 * ({ space, sentWidth, sentHeight, sentScale }, see pixelMapper);
 * `knownMetresPerPixel` is the scale the person already set, which wins over the
 * plan's printed measurements; `origin` is the underlay's (plan metres of its corner). Returns { walls, rooms, metresPerPixel, scaleSource,
 * warnings } (scaleSource: "set" | "measurements" | "guess").
 */
export function draftFromReading(reading, image, { knownMetresPerPixel = null, guessMetresPerPixel = null, origin = [0, 0] } = {}) {
  const toPixels = pixelMapper(image);
  const warnings = [];
  const estimate = estimateScale(reading, toPixels);

  let metresPerPixel = knownMetresPerPixel;
  let scaleSource = "set";
  if (!metresPerPixel && estimate) {
    metresPerPixel = estimate.metresPerPixel;
    scaleSource = "measurements";
  }
  if (!metresPerPixel) {
    metresPerPixel = guessMetresPerPixel;
    scaleSource = "guess";
    warnings.push("No measurements could be read off the plan, so its scale is a guess. Set the scale, then check the walls.");
  }
  if (knownMetresPerPixel && estimate
    && Math.abs(estimate.metresPerPixel - knownMetresPerPixel) / knownMetresPerPixel > SCALE_OUTLIER_RATIO) {
    warnings.push("The plan's printed measurements don't match the scale you set. Check the scale.");
  }
  const toMetres = (point) => toPixels(point).map((value, axis) => origin[axis] + value * metresPerPixel);

  const walls = cleanWalls((reading.walls ?? [])
    .filter((wall) => validPoint(wall?.a) && validPoint(wall?.b))
    .map((wall) => ({
      id: newId("wall"),
      a: toMetres(wall.a),
      b: toMetres(wall.b),
      thickness: wall.exterior ? EXTERIOR_WALL : INTERIOR_WALL,
      openings: [],
    })));
  placeOpenings(walls, (reading.openings ?? [])
    .filter((opening) => (opening?.type === "door" || opening?.type === "window")
      && validPoint(opening.a) && validPoint(opening.b))
    .map((opening) => ({ type: opening.type, a: toMetres(opening.a), b: toMetres(opening.b) })));

  const rooms = (reading.rooms ?? [])
    .map((room) => ({ room, polygon: (room?.polygon ?? []).filter(validPoint).map(toMetres) }))
    .filter(({ polygon }) => polygon.length >= 3 && polygonArea(polygon) >= MIN_ROOM_SQ_METRES)
    .map(({ room, polygon }) => {
      const type = roomTypeFor(room.type, room.name);
      const name = String(room.name ?? "").trim().slice(0, 40)
        || ROOM_TYPES.find((item) => item.id === type).label;
      return { id: newId("room"), name, type, polygon: polygon.map((point) => point.map(round)) };
    });

  if (!walls.length) warnings.push("No walls could be read off this plan. Trace them by hand, or try a clearer image.");
  return { walls, rooms, metresPerPixel, scaleSource, warnings };
}
