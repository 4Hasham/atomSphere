// The property document: a building as plain JSON, from which Studio generates 3D.
// Every input (trace editor, AI floorplan reading, architect imports) produces one and
// every view (exterior, dollhouse, plan, walkthrough) reads it.
//
// Units are metres. Plan coordinates are [x, y] as seen on a floorplan drawing: x to
// the right, y down the page. In 3D, plan x is world x and plan y is world z.
//
// {
//   version: 1,
//   plinth?: number,                 // ground floor height above the ground (default PLINTH)
//   levels: [{                       // bottom to top; elevations follow from the order
//     id, name,
//     height,                        // floor to ceiling
//     slabThickness,                 // the floor slab under this level
//     outline?: [[x, y], ...],       // floor slab shape; defaults to the walls' bounds
//     walls: [{ id, a: [x, y], b: [x, y], thickness,
//               openings: [{ id, type: "door" | "window", at, width, height, sill }] }],
//               // at: distance from a to the opening's centre; sill: bottom above floor
//     rooms: [{ id, name, type, polygon: [[x, y], ...], openAbove? }],
//             // openAbove: no ceiling over the room. A courtyard is open to the sky
//             // (every slab above and the roof have a hole); any other room is open
//             // one floor up (a double-height lounge, a stairwell). Unset means the
//             // type's default: only courtyards are open.
//   }],
// }

export const PROPERTY_DOCUMENT_VERSION = 1;

// Common Pakistani construction: 9" brick outer walls, 4.5" partitions, ~10.5 ft rooms.
export const EXTERIOR_WALL = 0.23;
export const INTERIOR_WALL = 0.115;
export const LEVEL_HEIGHT = 3.2;
export const SLAB_THICKNESS = 0.15;
// Houses here stand on a raised plinth, with steps up to the entrance.
export const PLINTH = 0.3;
export const DOOR = { width: 0.9, height: 2.1, sill: 0 };
export const WINDOW = { width: 1.5, height: 1.3, sill: 0.9 };

export const ROOM_TYPES = [
  { id: "drawing", label: "Drawing room", color: "#e8cfa9" },
  { id: "lounge", label: "Lounge", color: "#e3d2b4" },
  { id: "bedroom", label: "Bedroom", color: "#c4d4e6" },
  { id: "kitchen", label: "Kitchen", color: "#ecd59a" },
  { id: "bath", label: "Bathroom", color: "#b9ddd7" },
  { id: "stairs", label: "Stairs", color: "#cfcfcf" },
  { id: "entrance", label: "Entrance", color: "#ddd5c6" },
  { id: "store", label: "Store", color: "#d6cfc2" },
  { id: "terrace", label: "Terrace", color: "#d9d3c8" },
  { id: "courtyard", label: "Courtyard", color: "#c9dbbd" },
  { id: "other", label: "Room", color: "#ddd8cf" },
];

export function findRoomType(id) {
  return ROOM_TYPES.find((type) => type.id === id) ?? ROOM_TYPES.at(-1);
}

/** Whether a room has no ceiling (see openAbove above). */
export function isOpenAbove(room) {
  return room.openAbove ?? room.type === "courtyard";
}

/**
 * The rooms with a gap over them in the slab (or roof) on top of level `index`: that
 * level's rooms that are open above, and open courtyards on the floors below it.
 */
export function roomsOpenThrough(property, index) {
  return property.levels.slice(0, index + 1).flatMap((level, levelIndex) => level.rooms.filter((room) => (
    isOpenAbove(room) && (levelIndex === index || room.type === "courtyard")
  )));
}

/** Floor-top elevation of each level, in order: each level sits on the one below, and
 * the ground floor on the plinth. */
export function levelElevations(property) {
  const elevations = [];
  let floorTop = property.plinth ?? PLINTH;
  property.levels.forEach((level, index) => {
    if (index > 0) {
      const below = property.levels[index - 1];
      floorTop += below.height + level.slabThickness;
    }
    elevations.push(floorTop);
  });
  return elevations;
}

/** Largest extent in metres (width, depth or total height), for framing and shadows. */
export function propertySize(property) {
  const points = property.levels.flatMap((level) => level.walls.flatMap((wall) => [wall.a, wall.b]));
  if (!points.length) return 10;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const height = (property.plinth ?? PLINTH)
    + property.levels.reduce((sum, level) => sum + level.height + level.slabThickness, 0);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), height);
}

export function polygonArea(polygon) {
  let twice = 0;
  polygon.forEach(([x1, y1], index) => {
    const [x2, y2] = polygon[(index + 1) % polygon.length];
    twice += x1 * y2 - x2 * y1;
  });
  return Math.abs(twice) / 2;
}

let nextId = 0;
const id = (prefix) => `${prefix}-${(nextId += 1)}`;

function wall(a, b, thickness, openings = []) {
  return { id: id("wall"), a, b, thickness, openings: openings.map((opening) => ({ id: id("opening"), ...opening })) };
}
const doorAt = (at, extra = {}) => ({ type: "door", at, ...DOOR, ...extra });
const windowAt = (at, extra = {}) => ({ type: "window", at, ...WINDOW, ...extra });
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const room = (name, type, polygon) => ({ id: id("room"), name, type, polygon });

/**
 * A typical two-storey 10 marla house (10 m x 14 m covered area), used to show
 * property mode before a floorplan has been traced. The front of the house is y = 0.
 */
export function createSampleProperty() {
  const E = EXTERIOR_WALL;
  const I = INTERIOR_WALL;
  return {
    version: PROPERTY_DOCUMENT_VERSION,
    levels: [
      {
        id: "ground",
        name: "Ground floor",
        height: LEVEL_HEIGHT,
        slabThickness: SLAB_THICKNESS,
        walls: [
          wall([0, 0], [10, 0], E, [windowAt(2.5, { width: 1.8 }), doorAt(7.5, { width: 1.2 })]),
          wall([10, 0], [10, 14], E, [windowAt(7.5, { width: 1.2, sill: 1.1, height: 1.0 })]),
          wall([10, 14], [0, 14], E, [windowAt(3, { width: 0.6, sill: 1.6, height: 0.6 }), windowAt(7, { width: 1.8 })]),
          wall([0, 14], [0, 0], E, [windowAt(2, { width: 1.5 }), windowAt(6.5, { width: 2.0 })]),
          wall([0, 5], [10, 5], I, [doorAt(4), doorAt(7.5, { width: 1.0 })]),
          wall([5, 0], [5, 5], I, [doorAt(3.5)]),
          wall([6.5, 5], [6.5, 10], I, [doorAt(2.5)]),
          wall([0, 10], [10, 10], I, [doorAt(3), doorAt(7, { width: 0.8 }), doorAt(9, { width: 1.0 })]),
          wall([6, 10], [6, 14], I),
          wall([8, 10], [8, 14], I),
        ],
        rooms: [
          room("Drawing room", "drawing", rect(0, 0, 5, 5)),
          room("Entrance", "entrance", rect(5, 0, 10, 5)),
          room("Lounge", "lounge", rect(0, 5, 6.5, 10)),
          room("Kitchen", "kitchen", rect(6.5, 5, 10, 10)),
          room("Bedroom", "bedroom", rect(0, 10, 6, 14)),
          room("Bath", "bath", rect(6, 10, 8, 14)),
          room("Stairs", "stairs", rect(8, 10, 10, 14)),
        ],
      },
      {
        id: "first",
        name: "First floor",
        height: LEVEL_HEIGHT,
        slabThickness: SLAB_THICKNESS,
        // The slab covers the whole ground floor (to the outer wall faces); the part in
        // front is an open terrace.
        outline: rect(-E / 2, -E / 2, 10 + E / 2, 14 + E / 2),
        walls: [
          wall([0, 5], [10, 5], E, [doorAt(2.5, { width: 1.5 }), windowAt(7.5, { width: 1.8 })]),
          wall([10, 5], [10, 14], E, [windowAt(2.5, { width: 1.5 })]),
          wall([10, 14], [0, 14], E, [windowAt(3, { width: 0.6, sill: 1.6, height: 0.6 }), windowAt(7.5, { width: 1.5 })]),
          wall([0, 14], [0, 5], E, [windowAt(6.5, { width: 1.5 })]),
          wall([0, 10], [10, 10], I, [doorAt(2.5), doorAt(5.5), doorAt(7, { width: 0.8 }), doorAt(9, { width: 1.0 })]),
          wall([5, 5], [5, 10], I),
          wall([6, 10], [6, 14], I),
          wall([8, 10], [8, 14], I),
        ],
        rooms: [
          room("Terrace", "terrace", rect(0, 0, 10, 5)),
          room("Bedroom 2", "bedroom", rect(0, 5, 5, 10)),
          room("Bedroom 3", "bedroom", rect(5, 5, 10, 10)),
          room("Family lounge", "lounge", rect(0, 10, 6, 14)),
          room("Bath", "bath", rect(6, 10, 8, 14)),
          room("Stairs", "stairs", rect(8, 10, 10, 14)),
        ],
      },
    ],
  };
}
