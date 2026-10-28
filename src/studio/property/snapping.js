// Snapping for the plan editor. Distances are tested in screen pixels so it feels the
// same at every zoom level; points are in plan metres.
import { projectOntoSegment } from "./propertyEdits";

const CORNER_PX = 12;
const WALL_PX = 8;
const ALIGN_PX = 7;
const STRAIGHT_DEGREES = 8;
// Round to 1 cm, so traced lengths come out clean (x100 / 100 avoids 3.3000000000000003).
const round = (value) => Math.round(value * 100) / 100;

/** Every distinct wall end on the level, plus any extra points (e.g. a room in progress). */
export function cornersOf(walls, extra = []) {
  const corners = [];
  [...walls.flatMap((wall) => [wall.a, wall.b]), ...extra].forEach((point) => {
    if (!corners.some((corner) => Math.abs(corner[0] - point[0]) < 1e-4 && Math.abs(corner[1] - point[1]) < 1e-4)) {
      corners.push(point);
    }
  });
  return corners;
}

/**
 * Snaps a pointer position. Priority: an existing corner, then a point on a wall
 * (for T-junctions), then lines straight from `anchor` (the previous click) and
 * alignment with other corners, then a 1 cm grid.
 * Returns { point, kind, guides } where guides are lines to draw while snapping.
 */
export function snapPoint(raw, { walls, pixelsPerMetre, anchor = null, extraCorners = [], ignoreCorner = null }) {
  const toMetres = (pixels) => pixels / pixelsPerMetre;
  const corners = cornersOf(walls, extraCorners).filter((corner) => !ignoreCorner || corner !== ignoreCorner);

  let best = null;
  corners.forEach((corner) => {
    const distance = Math.hypot(raw[0] - corner[0], raw[1] - corner[1]);
    if (distance <= toMetres(CORNER_PX) && (!best || distance < best.distance)) best = { point: corner, distance };
  });
  if (best) return { point: [...best.point], kind: "corner", guides: [] };

  let onWall = null;
  walls.forEach((wall) => {
    const projection = projectOntoSegment(raw, wall.a, wall.b);
    if (projection.distance <= toMetres(WALL_PX) && (!onWall || projection.distance < onWall.distance)) onWall = projection;
  });
  if (onWall) return { point: onWall.point.map(round), kind: "wall", guides: [] };

  let [x, y] = raw;
  const guides = [];
  let kind = "free";

  if (anchor) {
    const angle = Math.abs((Math.atan2(y - anchor[1], x - anchor[0]) * 180) / Math.PI);
    if (angle < STRAIGHT_DEGREES || angle > 180 - STRAIGHT_DEGREES) {
      y = anchor[1];
      kind = "straight";
    } else if (Math.abs(angle - 90) < STRAIGHT_DEGREES) {
      x = anchor[0];
      kind = "straight";
    }
  }

  // Line up with other corners horizontally / vertically (only on a free axis).
  const lockedX = kind === "straight" && x === anchor[0];
  const lockedY = kind === "straight" && y === anchor[1];
  let alignX = null;
  let alignY = null;
  corners.forEach((corner) => {
    if (!lockedX && Math.abs(corner[0] - x) <= toMetres(ALIGN_PX) && (!alignX || Math.abs(corner[0] - x) < Math.abs(alignX[0] - x))) alignX = corner;
    if (!lockedY && Math.abs(corner[1] - y) <= toMetres(ALIGN_PX) && (!alignY || Math.abs(corner[1] - y) < Math.abs(alignY[1] - y))) alignY = corner;
  });
  if (alignX) {
    x = alignX[0];
    guides.push([alignX, null]);
    kind = kind === "free" ? "align" : kind;
  }
  if (alignY) {
    y = alignY[1];
    guides.push([alignY, null]);
    kind = kind === "free" ? "align" : kind;
  }

  const point = [lockedX ? x : round(x), lockedY ? y : round(y)];
  return { point, kind, guides: guides.map(([from]) => [from, point]) };
}
