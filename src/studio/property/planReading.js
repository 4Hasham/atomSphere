// AI floorplan reading: turns a floorplan image into a draft floor of the property
// document (walls, doors, windows, rooms) and the plan's scale, for the person to check
// and correct in the trace editor. Pure, so it can be tested without a model.
//
// The geometry comes from the drawing itself (readDrawing: the wall, opening and room
// detectors), which places walls to the pixel; a vision model reads the text (room
// names and printed sizes), which it does well, though it places things loosely
// (draftFromDrawing). Where nothing can be found in the drawing, the model's own
// walls and rooms are used instead (draftFromReading).
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
import { detectWalls } from "./wallDetection";
import { detectOpenings } from "./openingDetection";
import { detectRooms } from "./roomDetection";

// Within this angle of horizontal or vertical, a wall is drawn straight.
const STRAIGHTEN_DEGREES = 4;
// Corners and wall lines this close (metres) are the same corner or line.
const SNAP_METRES = 0.25;
const MIN_WALL_METRES = 0.3;
const MIN_ROOM_SQ_METRES = 0.5;
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

// Printed room sizes fit a detected room at a scale if both sides agree this closely.
const SIZE_FIT = 0.12;
// Without any printed size to go by, walls are taken to be 9" brick.
const ASSUMED_WALL_METRES = 0.2286;
// A label further than this share of the house from every room belongs to none.
const LABEL_REACH = 0.06;

const boxOf = (points) => {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

function insidePolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The scale (metres per pixel) a printed size suggests for a room's clear inside, or null if its sides disagree. */
function suggestedScale(size, [w, h]) {
  const spread = ([p, q]) => Math.abs(p - q) / Math.max(p, q);
  // Sides may be printed either way round.
  const asWritten = [size[0] / w, size[1] / h];
  const swapped = [size[1] / w, size[0] / h];
  const [p, q] = spread(asWritten) <= spread(swapped) ? asWritten : swapped;
  return spread([p, q]) <= SIZE_FIT ? (p + q) / 2 : null;
}

/** How far a printed size (metres) is from a room's clear inside (pixels) at a scale: the worse side's error, as a share. */
function sizeError(size, [w, h], metresPerPixel) {
  const error = ([a, b]) => Math.max(Math.abs(a - w * metresPerPixel) / a, Math.abs(b - h * metresPerPixel) / b);
  return Math.min(error(size), error([size[1], size[0]]));
}

/** Labels paired with the rooms their printed sizes fit at a scale: best fits first, one each. */
function matchBySize(labels, rooms, metresPerPixel) {
  const pairs = [];
  labels.forEach((label) => rooms.forEach((room) => {
    const error = sizeError(label.size, room.inside, metresPerPixel);
    // Of equally good fits, the one nearer where the label was read.
    if (error <= SIZE_FIT) pairs.push({ label, room, error: error + label.distanceTo(room) * 0.05 });
  }));
  pairs.sort((p, q) => p.error - q.error);
  const used = new Set();
  return pairs.filter(({ label, room }) => {
    if (used.has(label) || used.has(room)) return false;
    used.add(label);
    used.add(room);
    return true;
  });
}

/**
 * The scale at which most printed room sizes fit detected rooms: every label-room
 * pairing whose two sides agree suggests one, and the one that most labels fit (each
 * to its own room) wins, settled on the median of those fits. { metresPerPixel, fits } or null.
 */
function scaleFromSizes(labels, rooms) {
  let best = null;
  labels.forEach((label) => rooms.forEach((room) => {
    const metresPerPixel = suggestedScale(label.size, room.inside);
    if (!metresPerPixel) return;
    const fits = matchBySize(labels, rooms, metresPerPixel);
    const error = fits.reduce((sum, fit) => sum + fit.error, 0);
    if (!best || fits.length > best.fits.length || (fits.length === best.fits.length && error < best.error)) {
      best = { fits, error };
    }
  }));
  if (!best?.fits.length) return null;
  const metresPerPixel = median(best.fits.map(({ label, room }) => suggestedScale(label.size, room.inside) ?? 0).filter(Boolean));
  return { metresPerPixel, fits: matchBySize(labels, rooms, metresPerPixel) };
}

/**
 * The draft floor from what was found in the drawing itself (wallDetection.js,
 * openingDetection.js, roomDetection.js: `drawing` = { walls, openings, rooms,
 * thickness }, in the pixels of the image they were found in, `drawingScale` of them
 * to an underlay pixel), named from what the model read off it (`reading`, as for
 * draftFromReading, in the coordinates of the image it was sent, `image`: see
 * pixelMapper). The model reads text well but places it loosely, so a label goes to
 * the detected room its printed size fits, or else the one it falls in once the
 * model's layout is stretched over the detected house. The sizes also set the scale.
 * Returns { walls, rooms, metresPerPixel, scaleSource, warnings }, as draftFromReading.
 */
export function draftFromDrawing(drawing, reading, image, { drawingScale = 1, knownMetresPerPixel = null, origin = [0, 0] } = {}) {
  const warnings = [];
  const toUnderlay = (point) => [point[0] / drawingScale, point[1] / drawingScale];
  const thickness = drawing.thickness / drawingScale;
  const detected = (drawing.rooms ?? []).map((room) => {
    const polygon = room.polygon.map(toUnderlay);
    const box = boxOf(polygon);
    // Printed sizes are the clear inside, between the walls' faces.
    return { polygon, box, inside: [box[2] - box[0] - thickness, box[3] - box[1] - thickness], labels: [] };
  });

  // The model's labels where it put them, stretched so its rooms span the detected ones.
  const toPixels = pixelMapper(image);
  const read = (reading?.rooms ?? [])
    .map((room) => ({ room, points: (room?.polygon ?? []).filter(validPoint).map(toPixels) }))
    .filter(({ room, points }) => points.length >= 3 && String(room.name ?? "").trim());
  let stretch = (point) => point;
  if (read.length && detected.length) {
    const from = boxOf(read.flatMap(({ points }) => points));
    const to = boxOf(detected.flatMap(({ polygon }) => polygon));
    if (from[2] > from[0] && from[3] > from[1]) {
      stretch = ([x, y]) => [
        to[0] + ((x - from[0]) / (from[2] - from[0])) * (to[2] - to[0]),
        to[1] + ((y - from[1]) / (from[3] - from[1])) * (to[3] - to[1]),
      ];
    }
  }
  const house = detected.length ? boxOf(detected.flatMap(({ polygon }) => polygon)) : [0, 0, 1, 1];
  const houseSize = Math.max(house[2] - house[0], house[3] - house[1]) || 1;
  const labels = read.map(({ room, points }) => {
    const box = boxOf(points);
    const at = stretch([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]);
    return {
      name: String(room.name).trim().slice(0, 40),
      type: room.type,
      size: parseRoomSize(room.size),
      // How far the label is from a room, as a share of the house: 0 inside it.
      distanceTo: (target) => (insidePolygon(at, target.polygon) ? 0
        : Math.hypot(Math.max(target.box[0] - at[0], 0, at[0] - target.box[2]), Math.max(target.box[1] - at[1], 0, at[1] - target.box[3])) / houseSize),
    };
  });

  // The scale: as set, else from the printed sizes, else from the walls' thickness.
  const sized = labels.filter((label) => label.size);
  const fromSizes = sized.length && detected.length ? scaleFromSizes(sized, detected) : null;
  let metresPerPixel = knownMetresPerPixel;
  let scaleSource = "set";
  if (!metresPerPixel && fromSizes && (fromSizes.fits.length >= 2 || sized.length === 1)) {
    metresPerPixel = fromSizes.metresPerPixel;
    scaleSource = "measurements";
  }
  if (!metresPerPixel) {
    metresPerPixel = ASSUMED_WALL_METRES / thickness;
    scaleSource = "guess";
    warnings.push("The plan's scale couldn't be worked out from its room sizes, so it's a guess from the walls. Set the scale, then check the walls.");
  }
  if (knownMetresPerPixel && fromSizes?.fits.length >= 2
    && Math.abs(fromSizes.metresPerPixel - knownMetresPerPixel) / knownMetresPerPixel > SCALE_OUTLIER_RATIO) {
    warnings.push("The plan's printed room sizes don't match the scale you set. Check the scale.");
  }

  // Each label to the room its size fits, then the rest to the room they fall in (or
  // the nearest). A room with several labels is an open plan the drawing doesn't divide.
  const placed = new Set();
  matchBySize(sized, detected, metresPerPixel).forEach(({ label, room }) => {
    room.labels.push(label);
    placed.add(label);
  });
  labels.filter((label) => !placed.has(label)).forEach((label) => {
    let best = null;
    detected.forEach((room) => {
      const away = label.distanceTo(room);
      // Where the model put it is loose: of rooms about as near, one not yet named.
      const score = away + (room.labels.length ? LABEL_REACH / 2 : 0);
      if (away <= LABEL_REACH && (!best || score < best.score)) best = { room, score };
    });
    best?.room.labels.push(label);
  });

  const underlayToMetres = (point) => point.map((value, axis) => round(origin[axis] + value * metresPerPixel));
  const toMetres = (point) => underlayToMetres(toUnderlay(point));
  // Walls are drawn 9" or 4½"; whichever the drawn thickness is nearer.
  const wallThickness = (pixels) => {
    const metres = (pixels / drawingScale) * metresPerPixel;
    return Math.abs(metres - INTERIOR_WALL) < Math.abs(metres - EXTERIOR_WALL) ? INTERIOR_WALL : EXTERIOR_WALL;
  };
  const walls = (drawing.walls ?? [])
    .map((wall) => ({ id: newId("wall"), a: toMetres(wall.a), b: toMetres(wall.b), thickness: wallThickness(wall.thickness ?? drawing.thickness), openings: [] }))
    .filter((wall) => distance(wall.a, wall.b) >= MIN_WALL_METRES);
  placeOpenings(walls, (drawing.openings ?? []).map((opening) => ({ type: opening.type, a: toMetres(opening.a), b: toMetres(opening.b) })));

  const rooms = detected
    .map((room) => ({ room, polygon: room.polygon.map(underlayToMetres) }))
    .filter(({ polygon }) => polygonArea(polygon) >= MIN_ROOM_SQ_METRES)
    .map(({ room, polygon }) => {
      // Biggest printed room first: its type stands for an open plan.
      const named = [...room.labels].sort((p, q) => (q.size ? q.size[0] * q.size[1] : 0) - (p.size ? p.size[0] * p.size[1] : 0));
      const type = named.length ? roomTypeFor(named[0].type, named[0].name) : "other";
      const name = named.length ? named.map((label) => label.name).join(" & ").slice(0, 60) : ROOM_TYPES.find((item) => item.id === type).label;
      return { id: newId("room"), name, type, polygon };
    });

  if (!walls.length) warnings.push("No walls could be found on this plan. Trace them by hand, or try a clearer image.");
  return { walls, rooms, metresPerPixel, scaleSource, warnings };
}

/**
 * Finds the walls, doors, windows and rooms drawn on a plan image ({ data (RGBA),
 * width, height }), in its pixels: the `drawing` draftFromDrawing takes.
 */
export function readDrawing(image) {
  const found = detectWalls(image);
  const { walls, openings, open } = detectOpenings(image, found);
  const rooms = detectRooms({ walls, open, thickness: found.thickness }, image.width, image.height);
  return { walls, openings, rooms, thickness: found.thickness };
}
