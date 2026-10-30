import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScene } from "../../sceneStore";
import { findRoomType, isOpenAbove, polygonArea, roomsOpenThrough, EXTERIOR_WALL, INTERIOR_WALL } from "../propertyDocument";
import {
  addOpening,
  addRoom,
  addWall,
  moveCorner,
  projectOntoSegment,
  removeOpening,
  removeRoom,
  removeWall,
  samePoint,
  wallLength,
} from "../propertyEdits";
import { cornersOf, snapPoint } from "../snapping";
import { formatArea, formatLength } from "../units";
import { SHOW_IMAGE_KEY, SHOW_PLAN_KEY, TOOLS } from "./editorTools";

const MIN_SCALE = 4; // pixels per metre
const MAX_SCALE = 400;
const PICK_PX = 8;
const OPENING_PICK_PX = 16;


const wallThicknessFor = (choice) => (choice === "interior" ? INTERIOR_WALL : EXTERIOR_WALL);

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
  if (Math.abs(area) < 1e-9) {
    return polygon.reduce(([sx, sy], [x, y]) => [sx + x / polygon.length, sy + y / polygon.length], [0, 0]);
  }
  return [cx / (3 * area), cy / (3 * area)];
}

function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The four corners of a strip along a wall from `s0` to `s1` metres, `half` wide each side. */
function wallStrip(wall, s0, s1, half) {
  const length = wallLength(wall);
  const ux = (wall.b[0] - wall.a[0]) / length;
  const uy = (wall.b[1] - wall.a[1]) / length;
  const nx = -uy;
  const ny = ux;
  const at = (s, side) => [wall.a[0] + ux * s + nx * side, wall.a[1] + uy * s + ny * side];
  return [at(s0, half), at(s1, half), at(s1, -half), at(s0, -half)];
}

const points = (polygon) => polygon.map(([x, y]) => `${x},${y}`).join(" ");

function nearestWall(walls, point, tolerance) {
  let best = null;
  walls.forEach((wall) => {
    const projection = projectOntoSegment(point, wall.a, wall.b);
    const reach = Math.max(tolerance, wall.thickness / 2);
    if (projection.distance <= reach && (!best || projection.distance < best.projection.distance)) {
      best = { wall, projection };
    }
  });
  return best;
}

function contentBounds(level) {
  const pts = level.walls.flatMap((wall) => [wall.a, wall.b]);
  level.rooms.forEach((room) => pts.push(...room.polygon));
  if (level.underlay) {
    const { origin, width, height, metresPerPixel } = level.underlay;
    pts.push(origin, [origin[0] + width * metresPerPixel, origin[1] + height * metresPerPixel]);
  }
  if (!pts.length) return null;
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The floorplan editor: draws the current level in plan, and edits it with the active tool. */
export default function PlanEditor() {
  const property = useScene((state) => state.document.property);
  const editor = useScene((state) => state.editor);
  const setEditor = useScene((state) => state.setEditor);
  const editProperty = useScene((state) => state.editProperty);
  const underlayImages = useScene((state) => state.underlayImages);

  const levelIndex = Math.min(editor.levelIndex, property.levels.length - 1);
  const level = property.levels[levelIndex];
  const below = levelIndex > 0 ? property.levels[levelIndex - 1] : null;
  const { tool, selection, unit, hideImage, hidePlan } = editor;

  const svgRef = useRef(null);
  const [size, setSize] = useState(null); // measured box; nothing is drawn until known
  const [view, setView] = useState(null); // { x, y, scale }: screen = plan * scale + offset
  const [cursor, setCursor] = useState(null); // snapped plan point under the pointer
  // Something half-drawn: { kind: "wall" | "room" | "scale", points: [] }. It belongs to
  // the tool and floor it was started with, so switching either drops it.
  const [draftState, setDraftState] = useState(null);
  const draft = draftState?.tool === tool && draftState.levelIndex === levelIndex ? draftState : null;
  const setDraft = useCallback(
    (next) => setDraftState(next ? { ...next, tool, levelIndex } : null),
    [tool, levelIndex],
  );
  const [drag, setDrag] = useState(null); // { kind: "corner" | "pan", ... }

  const select = useCallback((next) => setEditor({ selection: next }), [setEditor]);

  // Keep the drawing surface sized to its box.
  useEffect(() => {
    const element = svgRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size) return;
    const bounds = contentBounds(level) ?? [0, 0, 15, 15];
    const [x0, y0, x1, y1] = bounds;
    const margin = 60;
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min((size.width - margin * 2) / Math.max(x1 - x0, 1), (size.height - margin * 2) / Math.max(y1 - y0, 1))),
    );
    setView({
      scale,
      x: size.width / 2 - ((x0 + x1) / 2) * scale,
      y: size.height / 2 - ((y0 + y1) / 2) * scale,
    });
  }, [level, size]);

  // Frame the level once its box is measured, and again when switching floors.
  const framedLevel = useRef(null);
  useEffect(() => {
    if (!size || framedLevel.current === level.id) return;
    framedLevel.current = level.id;
    fit();
  }, [level.id, size, fit]);

  const toPlan = useCallback((event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return [(event.clientX - rect.left - view.x) / view.scale, (event.clientY - rect.top - view.y) / view.scale];
  }, [view]);

  const anchor = draft?.points.at(-1) ?? null;
  const snapFor = useCallback((raw, extra = {}) => snapPoint(raw, {
    walls: level.walls,
    pixelsPerMetre: view.scale,
    anchor,
    extraCorners: draft?.kind === "room" ? draft.points : [],
    ...extra,
  }), [level.walls, view, anchor, draft]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.kind === "wall") editProperty((p) => removeWall(p, levelIndex, selection.id));
    if (selection.kind === "opening") editProperty((p) => removeOpening(p, levelIndex, selection.wallId, selection.id));
    if (selection.kind === "room") editProperty((p) => removeRoom(p, levelIndex, selection.id));
    select(null);
  }, [selection, levelIndex, editProperty, select]);

  // Where the selection is on screen, for the Delete button beside it.
  const selectionAnchor = useMemo(() => {
    if (!selection || !view) return null;
    let point = null;
    if (selection.kind === "room") {
      const room = level.rooms.find((item) => item.id === selection.id);
      if (room) point = centroid(room.polygon);
    } else {
      const wall = level.walls.find((item) => item.id === (selection.kind === "wall" ? selection.id : selection.wallId));
      if (wall && selection.kind === "wall") point = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
      if (wall && selection.kind === "opening") {
        const opening = wall.openings.find((item) => item.id === selection.id);
        const length = wallLength(wall);
        if (opening && length) {
          point = [
            wall.a[0] + ((wall.b[0] - wall.a[0]) * opening.at) / length,
            wall.a[1] + ((wall.b[1] - wall.a[1]) * opening.at) / length,
          ];
        }
      }
    }
    return point ? [point[0] * view.scale + view.x, point[1] * view.scale + view.y] : null;
  }, [selection, view, level]);

  // ---------- Keyboard ----------
  useEffect(() => {
    function onKey(event) {
      if (event.target instanceof HTMLElement && event.target.matches("input, textarea, select")) return;
      if (event.key === "Escape") {
        if (draft) setDraft(null);
        else select(null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selection && !hidePlan) {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === SHOW_IMAGE_KEY) setEditor({ hideImage: !hideImage });
      if (key === SHOW_PLAN_KEY) setEditor({ hidePlan: !hidePlan });
      const match = TOOLS.find((item) => item.key === key);
      if (match) setEditor({ tool: match.id });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, setDraft, selection, deleteSelection, select, setEditor, hideImage, hidePlan]);

  // ---------- Pointer ----------
  function hitTest(point) {
    const tolerance = PICK_PX / view.scale;
    // Openings first: they sit on top of walls.
    for (const wall of level.walls) {
      const projection = projectOntoSegment(point, wall.a, wall.b);
      if (projection.distance > Math.max(tolerance, wall.thickness / 2)) continue;
      const opening = wall.openings.find((item) => Math.abs(projection.along - item.at) <= item.width / 2);
      if (opening) return { kind: "opening", id: opening.id, wallId: wall.id };
    }
    const wall = nearestWall(level.walls, point, tolerance);
    if (wall) return { kind: "wall", id: wall.wall.id };
    const room = [...level.rooms].reverse().find((item) => pointInPolygon(point, item.polygon));
    if (room) return { kind: "room", id: room.id };
    return null;
  }

  function cornerAt(point) {
    const tolerance = (PICK_PX + 2) / view.scale;
    return cornersOf(level.walls).find((corner) => Math.hypot(corner[0] - point[0], corner[1] - point[1]) <= tolerance) ?? null;
  }

  function onPointerDown(event) {
    if (!view || event.button === 2) return;
    const raw = toPlan(event);
    svgRef.current.setPointerCapture(event.pointerId);

    // With what's drawn hidden there's nothing to pick or add to: only the view moves
    // (and the scale, which is set on the image).
    if (event.button === 1 || (tool === "select" && event.shiftKey) || (hidePlan && tool !== "scale")) {
      setDrag({ kind: "pan", start: [event.clientX, event.clientY], view });
      return;
    }

    if (tool === "select") {
      const corner = cornerAt(raw);
      if (corner) {
        setDrag({ kind: "corner", from: corner, to: corner });
        return;
      }
      const hit = hitTest(raw);
      select(hit);
      if (!hit) setDrag({ kind: "pan", start: [event.clientX, event.clientY], view });
      return;
    }

    if (tool === "wall") {
      const { point } = snapFor(raw);
      if (!draft) {
        setDraft({ kind: "wall", points: [point], start: point });
        return;
      }
      if (samePoint(point, anchor, 0.01)) return;
      const thickness = wallThicknessFor(editor.wallThickness);
      editProperty((p) => addWall(p, levelIndex, anchor, point, thickness).property);
      // Back at the chain's first corner: the outline is closed, so stop.
      if (draft.points.length > 1 && samePoint(point, draft.start, 0.01)) setDraft(null);
      else setDraft({ ...draft, points: [...draft.points, point] });
      return;
    }

    if (tool === "door" || tool === "window") {
      const target = nearestWall(level.walls, raw, OPENING_PICK_PX / view.scale);
      if (!target) return;
      let newId = null;
      editProperty((p) => {
        const result = addOpening(p, levelIndex, target.wall.id, tool, target.projection.along);
        newId = result.id;
        return result.property;
      });
      if (newId) select({ kind: "opening", id: newId, wallId: target.wall.id });
      return;
    }

    if (tool === "room") {
      const { point } = snapFor(raw);
      const pointsSoFar = draft?.kind === "room" ? draft.points : [];
      if (pointsSoFar.length >= 3 && samePoint(point, pointsSoFar[0], 0.01)) {
        finishRoom(pointsSoFar);
        return;
      }
      if (pointsSoFar.some((existing) => samePoint(existing, point, 0.01))) return;
      setDraft({ kind: "room", points: [...pointsSoFar, point] });
      return;
    }

    if (tool === "scale") {
      if (!level.underlay) return;
      const pointsSoFar = draft?.kind === "scale" ? draft.points : [];
      const next = pointsSoFar.length >= 2 ? [raw] : [...pointsSoFar, raw];
      setDraft({ kind: "scale", points: next });
      setEditor({ scalePoints: next.length === 2 ? next : null });
    }
  }

  function finishRoom(pointsSoFar) {
    let newId = null;
    editProperty((p) => {
      const result = addRoom(p, levelIndex, pointsSoFar, "other");
      newId = result.id;
      return result.property;
    });
    setDraft(null);
    if (newId) select({ kind: "room", id: newId });
  }

  function onPointerMove(event) {
    if (!view) return;
    const raw = toPlan(event);

    if (drag?.kind === "pan") {
      setView({
        ...drag.view,
        x: drag.view.x + event.clientX - drag.start[0],
        y: drag.view.y + event.clientY - drag.start[1],
      });
      return;
    }
    if (drag?.kind === "corner") {
      // Don't snap a corner onto its own walls.
      const others = level.walls.filter((wall) => !samePoint(wall.a, drag.from) && !samePoint(wall.b, drag.from));
      const snapped = snapPoint(raw, { walls: others, pixelsPerMetre: view.scale, extraCorners: cornersOf(others) });
      setDrag({ ...drag, to: snapped.point, guides: snapped.guides });
      return;
    }

    if (tool === "wall" || tool === "room") setCursor(snapFor(raw));
    else if (tool === "door" || tool === "window") setCursor({ point: raw, target: nearestWall(level.walls, raw, OPENING_PICK_PX / view.scale) });
    else setCursor({ point: raw });
  }

  function onPointerUp() {
    if (drag?.kind === "corner" && !samePoint(drag.from, drag.to)) {
      editProperty((p) => moveCorner(p, levelIndex, drag.from, drag.to));
    }
    setDrag(null);
  }

  function onDoubleClick() {
    if (draft?.kind === "wall") setDraft(null);
    if (draft?.kind === "room" && draft.points.length >= 3) finishRoom(draft.points);
  }

  function onWheel(event) {
    if (!view) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * Math.exp(-event.deltaY * 0.0015)));
    // Zoom around the pointer.
    setView({
      scale,
      x: sx - ((sx - view.x) / view.scale) * scale,
      y: sy - ((sy - view.y) / view.scale) * scale,
    });
  }

  // Wheel needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const element = svgRef.current;
    const stop = (event) => event.preventDefault();
    element?.addEventListener("wheel", stop, { passive: false });
    return () => element?.removeEventListener("wheel", stop);
  }, []);

  // ---------- Drawing ----------
  const px = view ? 1 / view.scale : 0.01; // one screen pixel in metres
  const underlayUrl = underlayImages[level.id];
  const shownWalls = useMemo(() => {
    if (drag?.kind !== "corner") return level.walls;
    return level.walls.map((wall) => ({
      ...wall,
      a: samePoint(wall.a, drag.from) ? drag.to : wall.a,
      b: samePoint(wall.b, drag.from) ? drag.to : wall.b,
    }));
  }, [level.walls, drag]);

  const isSelected = (kind, id) => selection?.kind === kind && selection.id === id;
  const label = (text, [x, y], extra = {}) => (
    <text x={x} y={y} fontSize={12 * px} className="pe-label" textAnchor="middle" dominantBaseline="middle" {...extra}>
      {text}
    </text>
  );

  return (
    <div className="plan-editor-wrap">
      <div className="pe-toolbar" role="toolbar" aria-label="Floorplan tools">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tool === item.id ? "is-on" : ""}
            aria-pressed={tool === item.id}
            title={`${item.label} (${item.key.toUpperCase()})`}
            onClick={() => setEditor({ tool: item.id })}
          >
            {item.label}
          </button>
        ))}
        <span className="pe-toolbar-gap" />
        {/* Show or hide the plan image and what's drawn, to compare one with the other. */}
        {level.underlay && (
          <button
            type="button"
            className={hideImage ? "" : "is-on"}
            aria-pressed={!hideImage}
            title={`${hideImage ? "Show" : "Hide"} the floorplan image (${SHOW_IMAGE_KEY.toUpperCase()})`}
            onClick={() => setEditor({ hideImage: !hideImage })}
          >
            Image
          </button>
        )}
        <button
          type="button"
          className={hidePlan ? "" : "is-on"}
          aria-pressed={!hidePlan}
          title={`${hidePlan ? "Show" : "Hide"} what's drawn: walls, doors, windows and rooms (${SHOW_PLAN_KEY.toUpperCase()})`}
          onClick={() => setEditor({ hidePlan: !hidePlan })}
        >
          Drawing
        </button>
        <span className="pe-toolbar-gap" />
        <button type="button" onClick={fit} title="Fit the floor in view">Fit</button>
        <button
          type="button"
          onClick={() => setEditor({ unit: unit === "ft" ? "m" : "ft" })}
          title="Switch units"
        >
          {unit === "ft" ? "ft" : "m"}
        </button>
      </div>
    <svg
      ref={svgRef}
      className={`plan-editor is-${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setCursor(null)}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
      onContextMenu={(event) => {
        event.preventDefault();
        setDraft(null);
      }}
      role="application"
      aria-label={`Floorplan editor, ${level.name}`}
    >
      {view && (
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {/* Hidden by choice, except while setting the scale on it. */}
          {underlayUrl && level.underlay && (!hideImage || tool === "scale") && (
            <image
              href={underlayUrl}
              x={level.underlay.origin[0]}
              y={level.underlay.origin[1]}
              width={level.underlay.width * level.underlay.metresPerPixel}
              height={level.underlay.height * level.underlay.metresPerPixel}
              opacity={level.underlay.opacity ?? 0.55}
              preserveAspectRatio="none"
              className="pe-underlay"
            />
          )}

          {/* The floor below, faintly, to line up walls between storeys. */}
          {below?.walls.map((wall) => (
            <line key={wall.id} x1={wall.a[0]} y1={wall.a[1]} x2={wall.b[0]} y2={wall.b[1]} strokeWidth={wall.thickness} className="pe-wall-below" />
          ))}

          {/* Rooms below that are open through this floor: a gap in it, so don't build there. */}
          {levelIndex > 0 && roomsOpenThrough(property, levelIndex - 1).map((room) => (
            <g key={`void-${room.id}`}>
              <polygon points={points(room.polygon)} strokeWidth={1.5 * px} strokeDasharray={`${6 * px} ${4 * px}`} className="pe-void" />
              {label("Open to below", centroid(room.polygon), { className: "pe-label is-area" })}
            </g>
          ))}

          {!hidePlan && level.rooms.map((room) => (
            <g key={room.id}>
              <polygon
                points={points(room.polygon)}
                fill={findRoomType(room.type).color}
                className={`pe-room ${isSelected("room", room.id) ? "is-selected" : ""}`}
                strokeWidth={isSelected("room", room.id) ? 2 * px : px}
                strokeDasharray={isOpenAbove(room) && !isSelected("room", room.id) ? `${6 * px} ${4 * px}` : undefined}
              />
              {label(room.name, centroid(room.polygon), { dy: -7 * px, className: "pe-label is-room" })}
              {label(
                isOpenAbove(room) ? `${formatArea(polygonArea(room.polygon), unit)} · open above` : formatArea(polygonArea(room.polygon), unit),
                centroid(room.polygon),
                { dy: 8 * px, className: "pe-label is-area" },
              )}
            </g>
          ))}

          {!hidePlan && shownWalls.map((wall) => (
            <line
              key={wall.id}
              x1={wall.a[0]}
              y1={wall.a[1]}
              x2={wall.b[0]}
              y2={wall.b[1]}
              strokeWidth={wall.thickness}
              className={`pe-wall ${isSelected("wall", wall.id) ? "is-selected" : ""}`}
            />
          ))}

          {!hidePlan && shownWalls.map((wall) => wall.openings.map((opening) => {
            const length = wallLength(wall);
            if (length < 1e-6) return null;
            const s0 = opening.at - opening.width / 2;
            const s1 = opening.at + opening.width / 2;
            const gap = wallStrip(wall, s0, s1, wall.thickness / 2 + px);
            const selected = isSelected("opening", opening.id);
            if (opening.type === "door") {
              const [hinge] = wallStrip(wall, s0, s0, 0);
              const [open] = wallStrip(wall, s0, s0, opening.width);
              const [close] = wallStrip(wall, s1, s1, 0);
              return (
                <g key={opening.id} className={`pe-opening ${selected ? "is-selected" : ""}`}>
                  <polygon points={points(gap)} className="pe-gap" />
                  <path
                    d={`M ${hinge[0]} ${hinge[1]} L ${open[0]} ${open[1]} A ${opening.width} ${opening.width} 0 0 1 ${close[0]} ${close[1]}`}
                    strokeWidth={1.5 * px}
                    className="pe-door"
                  />
                </g>
              );
            }
            const inner = wallStrip(wall, s0, s1, wall.thickness / 6);
            return (
              <g key={opening.id} className={`pe-opening ${selected ? "is-selected" : ""}`}>
                <polygon points={points(gap)} className="pe-gap" />
                <polygon points={points(inner)} strokeWidth={1.5 * px} className="pe-window" />
              </g>
            );
          }))}

          {/* Corner handles while selecting. */}
          {tool === "select" && !hidePlan && cornersOf(shownWalls).map((corner) => (
            <circle key={`${corner[0]},${corner[1]}`} cx={corner[0]} cy={corner[1]} r={4 * px} strokeWidth={1.5 * px} className="pe-corner" />
          ))}

          {/* Selected wall: its length. */}
          {selection?.kind === "wall" && !hidePlan && (() => {
            const wall = shownWalls.find((item) => item.id === selection.id);
            if (!wall) return null;
            const mid = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
            return label(formatLength(wallLength(wall), unit), mid, { dy: -(wall.thickness / 2 + 10 * px), className: "pe-label is-measure" });
          })()}

          {/* Drawing previews. */}
          {draft?.kind === "wall" && cursor && (() => {
            const end = cursor.point;
            const mid = [(anchor[0] + end[0]) / 2, (anchor[1] + end[1]) / 2];
            const length = Math.hypot(end[0] - anchor[0], end[1] - anchor[1]);
            return (
              <g>
                <line
                  x1={anchor[0]}
                  y1={anchor[1]}
                  x2={end[0]}
                  y2={end[1]}
                  strokeWidth={wallThicknessFor(editor.wallThickness)}
                  className="pe-wall is-preview"
                />
                {length > 0.05 && label(formatLength(length, unit), mid, { dy: -14 * px, className: "pe-label is-measure" })}
              </g>
            );
          })()}

          {draft?.kind === "room" && (
            <polyline
              points={points(cursor ? [...draft.points, cursor.point] : draft.points)}
              strokeWidth={1.5 * px}
              className="pe-room-draft"
            />
          )}

          {draft?.kind === "scale" && (
            <g className="pe-scale">
              {draft.points.map((point) => (
                <circle key={`${point[0]},${point[1]}`} cx={point[0]} cy={point[1]} r={5 * px} strokeWidth={2 * px} />
              ))}
              {draft.points.length === 2 && (
                <line x1={draft.points[0][0]} y1={draft.points[0][1]} x2={draft.points[1][0]} y2={draft.points[1][1]} strokeWidth={2 * px} />
              )}
            </g>
          )}

          {(tool === "door" || tool === "window") && cursor?.target && (() => {
            const { wall, projection } = cursor.target;
            const width = tool === "door" ? 0.9 : 1.5;
            const s0 = Math.max(0, projection.along - width / 2);
            const s1 = Math.min(wallLength(wall), projection.along + width / 2);
            return <polygon points={points(wallStrip(wall, s0, s1, wall.thickness / 2 + 2 * px))} className="pe-opening-preview" />;
          })()}

          {/* Snapping feedback. */}
          {(cursor?.guides ?? drag?.guides ?? []).map(([from, to]) => (
            <line key={`${from[0]},${from[1]}`} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} strokeWidth={px} className="pe-guide" />
          ))}
          {(tool === "wall" || tool === "room") && cursor && (
            <circle
              cx={cursor.point[0]}
              cy={cursor.point[1]}
              r={(cursor.kind === "corner" ? 6 : 4) * px}
              strokeWidth={1.5 * px}
              className={`pe-snap is-${cursor.kind}`}
            />
          )}
        </g>
      )}
    </svg>
      {selectionAnchor && !drag && !hidePlan && (
        <button
          type="button"
          className="pe-delete"
          style={{ left: selectionAnchor[0], top: selectionAnchor[1] }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={deleteSelection}
          aria-label={`Delete selected ${selection.kind === "opening" ? "door or window" : selection.kind}`}
        >
          Delete
        </button>
      )}
    </div>
  );
}
