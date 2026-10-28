// Where objects stand in a property (see the placement format in sceneDocument.js).
// Pure, so the rules can be tested without a scene.
import { levelElevations } from "../property/propertyDocument";

// A click this close below a floor's top still counts as that floor (slab and room
// surfaces sit a few millimetres apart).
const FLOOR_TOLERANCE = 0.05;
const round = (value) => Math.round(value * 100) / 100;

/**
 * The placement for a click at `point` ([x, y, z] in the property's frame). The floor is
 * the highest one at or below the click; below the ground floor is the ground outside.
 * On a surface facing up (a floor, a roof, a table) the object stands where it was
 * clicked; on a wall it drops to the floor.
 */
export function placementAt(property, [x, y, z], facesUp) {
  const elevations = levelElevations(property);
  let level = null;
  elevations.forEach((elevation, index) => {
    if (y >= elevation - FLOOR_TOLERANCE) level = index;
  });
  const base = level === null ? 0 : elevations[level];
  return { level, at: [round(x), round(z)], height: facesUp ? Math.max(0, round(y - base)) : 0 };
}

/** The floor index a placement refers to, kept valid if floors were removed since. */
function levelOf(property, placement) {
  if (placement.level === null) return null;
  return Math.min(placement.level, property.levels.length - 1);
}

/** Height of the object's base above the ground, in the property's frame. */
export function placementElevation(property, placement) {
  const level = levelOf(property, placement);
  return (level === null ? 0 : levelElevations(property)[level]) + placement.height;
}

/** Whether it stands on top of its floor's ceiling: on the roof, or on the slab above. */
function onCeiling(property, placement, level) {
  return placement.height >= property.levels[level].height - FLOOR_TOLERANCE;
}

/**
 * Whether the object shows in the current view: hidden with its floor when the house is
 * cut open below it, and on the roof of the cut floor (the roof is hidden then too).
 */
export function placementShown(property, placement, viewLevel) {
  const level = levelOf(property, placement);
  if (level === null || viewLevel === "all") return true;
  const top = Number(viewLevel);
  if (level > top) return false;
  return !(level === top && onCeiling(property, placement, level));
}

/** Where it is, in words: "Outside", "Ground floor", "On the roof". */
export function placementLabel(property, placement) {
  const level = levelOf(property, placement);
  if (level === null) return "Outside";
  const last = property.levels.length - 1;
  if (level === last && onCeiling(property, placement, level)) return "On the roof";
  return property.levels[level].name;
}

/** Turns by `degrees`, kept within 0–359. */
export function turned(rotation, degrees) {
  return (((rotation + degrees) % 360) + 360) % 360;
}
