// The rules of walking through a property in first person: where you stand when you go
// into a room, which room you're in, and which way the walls let you go (through
// doorways, not through walls or windows). Plan coordinates in metres: [x, y], with
// plan y becoming the scene's z. Pure, so it can be tested without a scene.
import { polygonArea } from "./propertyDocument";

export const EYE_HEIGHT = 1.6;
// How close you can walk up to a wall (your body's half-width, roughly).
export const BODY_RADIUS = 0.25;
// A doorway's jambs are this far in from the opening's edges.
const DOOR_MARGIN = 0.1;
// Rooms people come into first, in order of preference.
const ENTRY_TYPES = ["entrance", "lounge", "drawing"];

/** Whether a property has anything to walk through. */
export const canWalk = (property) => Boolean(property?.levels.some((level) => level.walls.length));

export function insidePolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function centroid(polygon) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  polygon.forEach(([x1, y1], index) => {
    const [x2, y2] = polygon[(index + 1) % polygon.length];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  });
  if (Math.abs(area) < 1e-9) return polygon.reduce(([sx, sy], [x, y]) => [sx + x / polygon.length, sy + y / polygon.length], [0, 0]);
  return [cx / (3 * area), cy / (3 * area)];
}

/** The room a point is in, or null. */
export function roomAt(level, point) {
  return level.rooms.find((room) => insidePolygon(point, room.polygon)) ?? null;
}

/**
 * Where to stand to see a room, and where to look: near one end of its longer side,
 * looking across it (the end nearer `from`, as if you'd just walked in). { at, look }.
 */
export function standingSpot(room, from = null) {
  const middle = centroid(room.polygon);
  const xs = room.polygon.map(([x]) => x);
  const ys = room.polygon.map(([, y]) => y);
  const along = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 0 : 1;
  const half = (along === 0 ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys)) / 2;
  // Which end: the one towards where you're coming from.
  const side = from && from[along] > middle[along] ? 1 : -1;
  const at = [...middle];
  at[along] += side * half * 0.6;
  const look = [...middle];
  look[along] -= side * half;
  // An L-shaped room may not reach that far: then stand in the middle.
  if (!insidePolygon(at, room.polygon)) return { at: middle, look };
  return { at, look };
}

/** The room you come into first on a level: the entrance, else the lounge, else the largest. */
export function entryRoom(level) {
  if (!level.rooms.length) return null;
  for (const type of ENTRY_TYPES) {
    const room = level.rooms.find((item) => item.type === type);
    if (room) return room;
  }
  return [...level.rooms].sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon))[0];
}

/** The middle of a level's walls, or null. */
function levelMiddle(level) {
  const points = level.walls.flatMap((wall) => [wall.a, wall.b]);
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/**
 * Where a walk through begins on a level: in its entry room, facing into the house
 * (see arrivalSpot without rooms).
 */
export function entrySpot(level) {
  const room = entryRoom(level);
  if (!room) return arrivalSpot(level);
  const { at, look } = standingSpot(room);
  const middle = levelMiddle(level);
  return { at, look: middle && Math.hypot(middle[0] - at[0], middle[1] - at[1]) > 1 ? middle : look };
}

/** Where you arrive on a level: its stairs if it has some, else its entry room, else its middle. */
export function arrivalSpot(level, from = null) {
  const stairs = level.rooms.find((room) => room.type === "stairs");
  const room = stairs ?? entryRoom(level);
  if (room) return standingSpot(room, from);
  const middle = levelMiddle(level) ?? [0, 0];
  return { at: middle, look: [middle[0], middle[1] + 1] };
}

/** Where along a wall (metres from a) its doorways are: [[from, to]]. */
function doorways(wall) {
  return wall.openings
    .filter((opening) => opening.type === "door")
    .map((opening) => [opening.at - opening.width / 2 + DOOR_MARGIN, opening.at + opening.width / 2 - DOOR_MARGIN]);
}

const throughDoor = (wall, along) => doorways(wall).some(([from, to]) => along >= from && along <= to);

/**
 * Whether a straight walk from `from` to `to` on a level runs into a wall: it may cross
 * a wall only through a doorway.
 */
export function blocked(level, from, to) {
  const [px, py] = from;
  const rx = to[0] - px;
  const ry = to[1] - py;
  return level.walls.some((wall) => {
    const [qx, qy] = wall.a;
    const sx = wall.b[0] - qx;
    const sy = wall.b[1] - qy;
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < 1e-12) return false; // parallel
    const t = ((qx - px) * sy - (qy - py) * sx) / denominator;
    const u = ((qx - px) * ry - (qy - py) * rx) / denominator;
    if (t < 0 || t > 1 || u < 0 || u > 1) return false;
    return !throughDoor(wall, u * Math.hypot(sx, sy));
  });
}

/**
 * How near a point is to a wall you can't pass (doorways don't count), in metres; for
 * keeping a step from ending up inside a wall.
 */
export function wallClearance(level, point) {
  let nearest = Infinity;
  level.walls.forEach((wall) => {
    const dx = wall.b[0] - wall.a[0];
    const dy = wall.b[1] - wall.a[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return;
    const along = Math.max(0, Math.min(length, ((point[0] - wall.a[0]) * dx + (point[1] - wall.a[1]) * dy) / length));
    if (throughDoor(wall, along)) return;
    const distance = Math.hypot(point[0] - (wall.a[0] + (dx * along) / length), point[1] - (wall.a[1] + (dy * along) / length));
    nearest = Math.min(nearest, distance - wall.thickness / 2);
  });
  return nearest;
}

/**
 * A step from `from` towards `to` (keyboard walking): the whole step if it's clear,
 * else sliding along the wall in the way (only one of its x / y parts), else none.
 */
export function step(level, from, to) {
  // Already close to a wall (arrived beside a jamb, say), any step away from it is fine.
  const room = Math.min(BODY_RADIUS, wallClearance(level, from));
  const clear = (point) => !blocked(level, from, point) && wallClearance(level, point) >= room;
  if (clear(to)) return to;
  const alongX = [to[0], from[1]];
  if (clear(alongX)) return alongX;
  const alongY = [from[0], to[1]];
  if (clear(alongY)) return alongY;
  return from;
}
