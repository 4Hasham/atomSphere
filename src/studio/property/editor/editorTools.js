// The floorplan editor's tools, with keyboard shortcuts and the hint shown for each.
export const TOOLS = [
  { id: "select", label: "Select", key: "v", hint: "Click to select. Drag a corner to move it. Drag empty space to pan; scroll to zoom. Delete removes the selection." },
  { id: "wall", label: "Wall", key: "w", hint: "Click to start, then click each corner. Double-click, Esc or right-click to finish. Snaps to corners, walls and straight lines." },
  { id: "door", label: "Door", key: "d", hint: "Click on a wall to add a door." },
  { id: "window", label: "Window", key: "n", hint: "Click on a wall to add a window." },
  { id: "room", label: "Room", key: "r", hint: "Click each corner of the room. Click the first corner again or double-click to finish." },
  { id: "scale", label: "Scale", key: "s", hint: "Click two points on the floorplan whose real distance you know, then type that distance in the panel." },
];

// Keys that show or hide the plan image and what's drawn over it.
export const SHOW_IMAGE_KEY = "i";
export const SHOW_PLAN_KEY = "p";

export function findTool(id) {
  return TOOLS.find((tool) => tool.id === id) ?? TOOLS[0];
}
