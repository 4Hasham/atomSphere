// Turns a property document into three.js geometry. Pure (no React, no scene), so it
// can be tested on its own and rebuilt whenever the document changes.
import { Box3, BoxGeometry, ExtrudeGeometry, Matrix4, Shape, ShapeGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { levelElevations } from "./propertyDocument";

const EPSILON = 1e-3;
const GLASS_THICKNESS = 0.02;
const UP = new Vector3(0, 1, 0);

function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * How far to extend a wall past an end so it meets the walls it touches: half the
 * thickest wall there (corners and T-junctions). Free ends aren't extended.
 */
function endExtension(point, wall, walls) {
  let extension = 0;
  walls.forEach((other) => {
    if (other === wall) return;
    if (distanceToSegment(point, other.a, other.b) < EPSILON) {
      extension = Math.max(extension, other.thickness / 2);
    }
  });
  return extension;
}

/** Spans along a wall [start, end] with the openings' gaps, clamped to the wall. */
function openingSpans(wall, length) {
  return wall.openings
    .map((opening) => {
      const half = opening.width / 2;
      const start = Math.max(0, opening.at - half);
      const end = Math.min(length, opening.at + half);
      return { opening, start, end };
    })
    .filter((span) => span.end - span.start > EPSILON)
    .sort((left, right) => left.start - right.start);
}

/**
 * Boxes for one wall in its own frame: x along the wall from a, y up from the floor,
 * z across the wall. Solid stretches run full height; openings leave a gap with the
 * sill wall below (windows) and the lintel above.
 */
export function wallPieces(wall, length, height, extendStart, extendEnd) {
  const pieces = [];
  const glass = [];
  const add = (list, x0, x1, y0, y1) => {
    if (x1 - x0 > EPSILON && y1 - y0 > EPSILON) list.push({ x0, x1, y0, y1 });
  };

  let cursor = -extendStart;
  openingSpans(wall, length).forEach(({ opening, start, end }) => {
    add(pieces, cursor, start, 0, height);
    const top = Math.min(height, opening.sill + opening.height);
    add(pieces, start, end, 0, opening.sill);
    add(pieces, start, end, top, height);
    if (opening.type === "window") add(glass, start, end, opening.sill, top);
    cursor = Math.max(cursor, end);
  });
  add(pieces, cursor, length + extendEnd, 0, height);
  return { pieces, glass };
}

function boxesToGeometry(boxes, depth, frame) {
  return boxes.map(({ x0, x1, y0, y1 }) => {
    const box = new BoxGeometry(x1 - x0, y1 - y0, depth);
    box.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    box.applyMatrix4(frame);
    return box;
  });
}

/** Plan polygon -> horizontal shape in world space (plan y becomes world z). */
function planShape(polygon) {
  return new Shape(polygon.map(([x, y]) => ({ x, y: -y })));
}

function horizontal(geometry, elevation) {
  geometry.rotateX(-Math.PI / 2); // shape (x, -y) -> world (x, z = y); extrusion depth -> up
  geometry.translate(0, elevation, 0);
  return geometry;
}

/** The walls' bounding rectangle, out to their outer faces (centre lines + half a wall). */
function wallBounds(walls) {
  const pad = Math.max(...walls.map((wall) => wall.thickness)) / 2;
  const xs = walls.flatMap((wall) => [wall.a[0], wall.b[0]]);
  const ys = walls.flatMap((wall) => [wall.a[1], wall.b[1]]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

function merged(geometries) {
  if (!geometries.length) return null;
  const result = mergeGeometries(geometries.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry));
  geometries.forEach((geometry) => geometry.dispose());
  return result;
}

/**
 * Builds every level. Each level gets: walls (one merged geometry), window glass,
 * its floor slab and a tinted floor per room. The top level also gets a roof slab.
 */
export default function buildProperty(property) {
  const elevations = levelElevations(property);
  const bounds = new Box3();

  const levels = property.levels.map((level, index) => {
    const elevation = elevations[index];
    const wallBoxes = [];
    const glassBoxes = [];

    level.walls.forEach((wall) => {
      const dx = wall.b[0] - wall.a[0];
      const dy = wall.b[1] - wall.a[1];
      const length = Math.hypot(dx, dy);
      if (length < EPSILON) return;

      const along = new Vector3(dx / length, 0, dy / length);
      const across = new Vector3().crossVectors(along, UP);
      const frame = new Matrix4()
        .makeBasis(along, UP, across)
        .setPosition(wall.a[0], elevation, wall.a[1]);

      const { pieces, glass } = wallPieces(
        wall,
        length,
        level.height,
        endExtension(wall.a, wall, level.walls),
        endExtension(wall.b, wall, level.walls),
      );
      wallBoxes.push(...boxesToGeometry(pieces, wall.thickness, frame));
      glassBoxes.push(...boxesToGeometry(glass, GLASS_THICKNESS, frame));
    });

    const outline = level.outline ?? (level.walls.length ? wallBounds(level.walls) : null);
    // The ground floor's slab is the plinth, down to the ground.
    const slabDepth = index === 0 ? elevation : level.slabThickness;
    const slab = outline && slabDepth > EPSILON
      ? horizontal(new ExtrudeGeometry(planShape(outline), { depth: slabDepth, bevelEnabled: false }), elevation - slabDepth)
      : null;
    const rooms = level.rooms.map((roomItem) => ({
      room: roomItem,
      geometry: horizontal(new ShapeGeometry(planShape(roomItem.polygon)), elevation + 0.003),
    }));

    const walls = merged(wallBoxes);
    const glass = merged(glassBoxes);
    [walls, glass, slab].forEach((geometry) => {
      if (!geometry) return;
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox);
    });

    return { id: level.id, name: level.name, elevation, height: level.height, walls, glass, slab, rooms };
  });

  // Flat roof (the common Pakistani roof) over the top level.
  const top = property.levels.at(-1);
  let roof = null;
  if (top?.walls.length) {
    const roofTop = elevations.at(-1) + top.height;
    roof = horizontal(new ExtrudeGeometry(planShape(wallBounds(top.walls)), { depth: top.slabThickness, bevelEnabled: false }), roofTop);
    roof.computeBoundingBox();
    bounds.union(roof.boundingBox);
  }

  return { levels, roof, bounds };
}

/** Frees the GPU buffers of a built property. */
export function disposeProperty(built) {
  built.levels.forEach((level) => {
    [level.walls, level.glass, level.slab].forEach((geometry) => geometry?.dispose());
    level.rooms.forEach(({ geometry }) => geometry.dispose());
  });
  built.roof?.dispose();
}
