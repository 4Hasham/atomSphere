// Edits to a property document. Each returns a new document and never changes its
// input, so the scene store can keep the old one for undo.
import {
  DOOR,
  EXTERIOR_WALL,
  LEVEL_HEIGHT,
  PROPERTY_DOCUMENT_VERSION,
  SLAB_THICKNESS,
  WINDOW,
  findRoomType,
} from "./propertyDocument";

const EPSILON = 1e-4;
// Keep openings this far from a wall's ends, so they don't cut into the corner.
const OPENING_END_GAP = 0.05;

export function newId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function samePoint(a, b, tolerance = EPSILON) {
  return Math.abs(a[0] - b[0]) < tolerance && Math.abs(a[1] - b[1]) < tolerance;
}

/** Nearest point on segment a-b to p: { point, along (metres from a), distance, length }. */
export function projectOntoSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length))) : 0;
  const point = [a[0] + t * dx, a[1] + t * dy];
  return { point, along: t * length, distance: Math.hypot(p[0] - point[0], p[1] - point[1]), length };
}

export function wallLength(wall) {
  return Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
}

export function levelName(index) {
  if (index === 0) return "Ground floor";
  if (index === 1) return "First floor";
  if (index === 2) return "Second floor";
  return `Floor ${index}`;
}

export function createLevel(index) {
  return {
    id: newId("level"),
    name: levelName(index),
    height: LEVEL_HEIGHT,
    slabThickness: SLAB_THICKNESS,
    walls: [],
    rooms: [],
  };
}

export function createEmptyProperty() {
  return { version: PROPERTY_DOCUMENT_VERSION, levels: [createLevel(0)] };
}

function updateLevel(property, levelIndex, change) {
  return {
    ...property,
    levels: property.levels.map((level, index) => (index === levelIndex ? { ...level, ...change(level) } : level)),
  };
}

function updateWalls(property, levelIndex, change) {
  return updateLevel(property, levelIndex, (level) => ({ walls: change(level.walls) }));
}

// ---------- Levels ----------

export function addLevel(property) {
  return { ...property, levels: [...property.levels, createLevel(property.levels.length)] };
}

export function removeLevel(property, levelIndex) {
  if (property.levels.length <= 1) return property;
  return { ...property, levels: property.levels.filter((_, index) => index !== levelIndex) };
}

export function renameLevel(property, levelIndex, name) {
  return updateLevel(property, levelIndex, () => ({ name }));
}

/** Floorplan image placement for a level: { width, height (px), metresPerPixel, origin: [x, y] }. */
export function setUnderlay(property, levelIndex, underlay) {
  return updateLevel(property, levelIndex, () => ({ underlay }));
}

/**
 * Replaces a floor's walls and rooms with a drawn or read plan (AI floorplan reading),
 * and updates its plan image's scale to match: one edit, so one undo.
 */
export function replaceLevelPlan(property, levelIndex, { walls, rooms }, underlay) {
  return updateLevel(property, levelIndex, () => ({ walls, rooms, ...(underlay ? { underlay } : {}) }));
}

/**
 * Resizes a floor's walls, openings and rooms by `factor` around `about` (plan metres),
 * as its plan image is rescaled, so what was drawn over the image stays on it. Wall
 * thickness and heights don't change.
 */
export function scaleLevel(property, levelIndex, factor, about) {
  const scale = ([x, y]) => [about[0] + (x - about[0]) * factor, about[1] + (y - about[1]) * factor];
  return updateLevel(property, levelIndex, (level) => ({
    walls: level.walls.map((wall) => ({
      ...wall,
      a: scale(wall.a),
      b: scale(wall.b),
      openings: wall.openings.map((opening) => ({ ...opening, at: opening.at * factor, width: opening.width * factor })),
    })),
    rooms: level.rooms.map((room) => ({ ...room, polygon: room.polygon.map(scale) })),
  }));
}

// ---------- Walls ----------

export function addWall(property, levelIndex, a, b, thickness = EXTERIOR_WALL) {
  if (samePoint(a, b, 0.01)) return { property, id: null };
  const wall = { id: newId("wall"), a, b, thickness, openings: [] };
  return { property: updateWalls(property, levelIndex, (walls) => [...walls, wall]), id: wall.id };
}

export function updateWall(property, levelIndex, wallId, patch) {
  return updateWalls(property, levelIndex, (walls) => walls.map((wall) => (
    wall.id === wallId ? fitOpenings({ ...wall, ...patch }) : wall
  )));
}

export function removeWall(property, levelIndex, wallId) {
  return updateWalls(property, levelIndex, (walls) => walls.filter((wall) => wall.id !== wallId));
}

/** Moves every wall end at `from` to `to`, so connected walls stay connected. */
export function moveCorner(property, levelIndex, from, to) {
  return updateWalls(property, levelIndex, (walls) => walls.map((wall) => {
    const a = samePoint(wall.a, from) ? to : wall.a;
    const b = samePoint(wall.b, from) ? to : wall.b;
    return a === wall.a && b === wall.b ? wall : fitOpenings({ ...wall, a, b });
  }));
}

// ---------- Doors and windows ----------

function clampOpening(opening, length) {
  const width = Math.min(opening.width, Math.max(0.3, length - 2 * OPENING_END_GAP));
  const half = width / 2;
  const at = Math.min(Math.max(opening.at, half + OPENING_END_GAP), length - half - OPENING_END_GAP);
  return { ...opening, width, at };
}

/** Keeps every opening inside its wall after the wall changes length. */
function fitOpenings(wall) {
  const length = wallLength(wall);
  return { ...wall, openings: wall.openings.map((opening) => clampOpening(opening, length)) };
}

export function addOpening(property, levelIndex, wallId, type, at) {
  const defaults = type === "door" ? DOOR : WINDOW;
  const opening = { id: newId(type), type, at, ...defaults };
  return {
    property: updateWalls(property, levelIndex, (walls) => walls.map((wall) => (
      wall.id === wallId
        ? { ...wall, openings: [...wall.openings, clampOpening(opening, wallLength(wall))] }
        : wall
    ))),
    id: opening.id,
  };
}

export function updateOpening(property, levelIndex, wallId, openingId, patch) {
  return updateWalls(property, levelIndex, (walls) => walls.map((wall) => {
    if (wall.id !== wallId) return wall;
    const length = wallLength(wall);
    return {
      ...wall,
      openings: wall.openings.map((opening) => {
        if (opening.id !== openingId) return opening;
        // Switching between door and window brings that type's usual sill and height.
        const typeDefaults = patch.type && patch.type !== opening.type
          ? (patch.type === "door" ? { sill: DOOR.sill, height: DOOR.height } : { sill: WINDOW.sill, height: WINDOW.height })
          : {};
        return clampOpening({ ...opening, ...typeDefaults, ...patch }, length);
      }),
    };
  }));
}

export function removeOpening(property, levelIndex, wallId, openingId) {
  return updateWalls(property, levelIndex, (walls) => walls.map((wall) => (
    wall.id === wallId ? { ...wall, openings: wall.openings.filter((opening) => opening.id !== openingId) } : wall
  )));
}

// ---------- Rooms ----------

export function addRoom(property, levelIndex, polygon, type = "other") {
  if (polygon.length < 3) return { property, id: null };
  const sameType = property.levels[levelIndex].rooms.filter((room) => room.type === type).length;
  const label = findRoomType(type).label;
  const room = { id: newId("room"), name: sameType ? `${label} ${sameType + 1}` : label, type, polygon };
  return {
    property: updateLevel(property, levelIndex, (level) => ({ rooms: [...level.rooms, room] })),
    id: room.id,
  };
}

export function updateRoom(property, levelIndex, roomId, patch) {
  return updateLevel(property, levelIndex, (level) => ({
    rooms: level.rooms.map((room) => (room.id === roomId ? { ...room, ...patch } : room)),
  }));
}

export function removeRoom(property, levelIndex, roomId) {
  return updateLevel(property, levelIndex, (level) => ({ rooms: level.rooms.filter((room) => room.id !== roomId) }));
}
