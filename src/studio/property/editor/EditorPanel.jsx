import { useState } from "react";
import { RedoIcon, UndoIcon } from "../../../brand/icons";
import { useScene } from "../../sceneStore";
import { EXTERIOR_WALL, INTERIOR_WALL, ROOM_TYPES, isOpenAbove, polygonArea } from "../propertyDocument";
import {
  addLevel,
  moveCorner,
  removeLevel,
  removeOpening,
  removeRoom,
  removeWall,
  renameLevel,
  setUnderlay,
  updateOpening,
  updateRoom,
  updateWall,
  wallLength,
} from "../propertyEdits";
import preparePlanImage, { checkPlanFile, initialUnderlay, isPdf } from "../planImage";
import { formatArea, formatLength, parseLength } from "../units";
import { findTool } from "./editorTools";

const WALL_THICKNESSES = [
  { value: EXTERIOR_WALL, label: '9" brick (outer)' },
  { value: INTERIOR_WALL, label: '4.5" brick (partition)' },
  { value: 0.345, label: '13.5" brick' },
];

/** A length field that accepts feet/inches or metres and commits on Enter or blur. */
function LengthInput({ id, value, unit, onCommit }) {
  const [text, setText] = useState(null);
  const shown = text ?? formatLength(value, unit);
  function commit() {
    if (text === null) return;
    const metres = parseLength(text, unit);
    if (metres && Math.abs(metres - value) > 1e-4) onCommit(metres);
    setText(null);
  }
  return (
    <input
      id={id}
      value={shown}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setText(null);
      }}
    />
  );
}

function Field({ id, label, children }) {
  return (
    <div className="scene-preset-control">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function RoomsSection({ level, levelIndex, unit, selection, editProperty, select }) {
  if (!level.rooms.length) return null;
  return (
    <section className="terrain-section" aria-labelledby="pe-rooms-title">
      <h3 id="pe-rooms-title">Rooms on this floor</h3>
      <ul className="pe-room-list">
        {level.rooms.map((room) => (
          <li key={room.id} className={selection?.kind === "room" && selection.id === room.id ? "is-selected" : ""}>
            <button type="button" className="pe-room-pick" onClick={() => select({ kind: "room", id: room.id })}>
              <span>{room.name}</span>
              <span className="pe-room-area">{formatArea(polygonArea(room.polygon), unit)}</span>
            </button>
            <button
              type="button"
              className="pe-room-delete"
              aria-label={`Delete ${room.name}`}
              title={`Delete ${room.name}`}
              onClick={() => {
                editProperty((p) => removeRoom(p, levelIndex, room.id));
                if (selection?.id === room.id) select(null);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LevelsSection({ property, levelIndex, onPick, editProperty }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const level = property.levels[levelIndex];
  return (
    <section className="terrain-section" aria-labelledby="pe-levels-title">
      <h3 id="pe-levels-title">Floors</h3>
      <div className="pe-levels" role="tablist" aria-label="Floor">
        {property.levels.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={index === levelIndex}
            className={index === levelIndex ? "is-on" : ""}
            onClick={() => {
              setConfirmDelete(false);
              onPick(index);
            }}
          >
            {item.name}
          </button>
        ))}
        <button
          type="button"
          className="pe-add"
          onClick={() => {
            editProperty((p) => addLevel(p));
            onPick(property.levels.length);
          }}
        >
          + Floor
        </button>
      </div>
      <Field id="pe-level-name" label="Name">
        <input
          id="pe-level-name"
          key={level.id}
          defaultValue={level.name}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name && name !== level.name) editProperty((p) => renameLevel(p, levelIndex, name));
          }}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        />
      </Field>
      {property.levels.length > 1 && (
        <button
          type="button"
          className="terrain-clear"
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            setConfirmDelete(false);
            onPick(Math.max(0, levelIndex - 1));
            editProperty((p) => removeLevel(p, levelIndex));
          }}
        >
          {confirmDelete ? `Delete ${level.name} and everything on it?` : "Delete floor"}
        </button>
      )}
    </section>
  );
}

function UnderlaySection({ level, levelIndex, editProperty, editor, setEditor, underlayUrl, setUnderlayImage, persistence }) {
  const [scaleText, setScaleText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  // A PDF picked in this session, so another page can be chosen without re-picking.
  const [pdf, setPdf] = useState(null);
  const scalePoints = editor.tool === "scale" ? editor.scalePoints : null;

  async function pickImage(file, page = 1) {
    if (!file) return;
    const problem = checkPlanFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    try {
      setBusy(isPdf(file) ? "Reading the PDF…" : "Reading the floorplan…");
      const plan = await preparePlanImage(file, page);
      let imageKey;
      if (persistence) {
        setBusy("Uploading the floorplan…");
        imageKey = await persistence.uploadPlanImage(level.id, plan.blob);
      }
      setUnderlayImage(level.id, URL.createObjectURL(plan.blob));
      editProperty((p) => setUnderlay(p, levelIndex, initialUnderlay(plan, imageKey)));
      setPdf(isPdf(file) ? { file, page, pageCount: plan.pageCount } : null);
      setEditor({ tool: "scale", scalePoints: null });
    } catch (pickError) {
      setError(pickError.message || "This floorplan couldn't be used.");
    } finally {
      setBusy("");
    }
  }

  function applyScale() {
    const real = parseLength(scaleText, editor.unit);
    const [a, b] = scalePoints;
    const measured = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!real || measured < 1e-6) {
      setError("Type the real distance, e.g. 12'6\" or 3.8 m.");
      return;
    }
    setError("");
    const factor = real / measured;
    const { underlay } = level;
    // Scale around the first point, so it stays where it was clicked.
    editProperty((p) => setUnderlay(p, levelIndex, {
      ...underlay,
      metresPerPixel: underlay.metresPerPixel * factor,
      origin: [a[0] - (a[0] - underlay.origin[0]) * factor, a[1] - (a[1] - underlay.origin[1]) * factor],
      calibrated: true,
    }));
    setScaleText("");
    setEditor({ tool: "wall", scalePoints: null });
  }

  return (
    <section className="terrain-section" aria-labelledby="pe-underlay-title">
      <h3 id="pe-underlay-title">Floorplan image</h3>
      {error && <p className="terrain-error" role="alert">{error}</p>}
      {busy && <p className="terrain-description" role="status">{busy}</p>}
      {!level.underlay || !underlayUrl ? (
        <>
          <p className="terrain-description">
            Upload this floor&apos;s plan (PDF, JPG or PNG) to trace over it.
            {level.underlay && !persistence && " This scene isn't saved, so add the plan again after reloading."}
          </p>
          <label className={`terrain-submit pe-upload ${busy ? "is-busy" : ""}`}>
            Upload floorplan
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={Boolean(busy)}
              onChange={(event) => {
                pickImage(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </>
      ) : (
        <>
          {pdf && pdf.pageCount > 1 && (
            <Field id="pe-pdf-page" label="PDF page">
              <select
                id="pe-pdf-page"
                value={pdf.page}
                disabled={Boolean(busy)}
                onChange={(event) => pickImage(pdf.file, Number(event.target.value))}
              >
                {Array.from({ length: pdf.pageCount }, (_, index) => (
                  <option key={index} value={index + 1}>Page {index + 1} of {pdf.pageCount}</option>
                ))}
              </select>
            </Field>
          )}
          {scalePoints ? (
            <Field id="pe-scale-length" label="Real distance between the two points">
              <input
                id="pe-scale-length"
                autoFocus
                placeholder={editor.unit === "ft" ? `e.g. 12'6"` : "e.g. 3.8 m"}
                value={scaleText}
                onChange={(event) => setScaleText(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && applyScale()}
              />
              <button type="button" className="terrain-submit" onClick={applyScale}>Set scale</button>
            </Field>
          ) : (
            <p className="terrain-description">
              {editor.tool === "scale"
                ? "Click two points on the plan whose real distance you know, such as both ends of a dimension line."
                : "Set the scale before tracing, so walls come out the right size."}
            </p>
          )}
          {editor.tool !== "scale" && (
            <button type="button" className="terrain-clear" onClick={() => setEditor({ tool: "scale", scalePoints: null })}>
              Set scale
            </button>
          )}
          <Field id="pe-underlay-opacity" label="Image opacity">
            <input
              id="pe-underlay-opacity"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={level.underlay.opacity ?? 0.55}
              onChange={(event) => editProperty((p) => setUnderlay(p, levelIndex, { ...level.underlay, opacity: Number(event.target.value) }))}
            />
          </Field>
          <button
            type="button"
            className="terrain-clear"
            onClick={() => {
              editProperty((p) => setUnderlay(p, levelIndex, undefined));
              setUnderlayImage(level.id, undefined);
            }}
          >
            Remove floorplan image
          </button>
        </>
      )}
    </section>
  );
}

function SelectionSection({ level, levelIndex, selection, unit, editProperty, clear }) {
  if (!selection) return null;

  if (selection.kind === "wall") {
    const wall = level.walls.find((item) => item.id === selection.id);
    if (!wall) return null;
    const length = wallLength(wall);
    return (
      <section className="terrain-section" aria-label="Selected wall">
        <h3>Wall</h3>
        <Field id="pe-wall-length" label="Length">
          <LengthInput
            id="pe-wall-length"
            key={`${wall.id}-${length}`}
            value={length}
            unit={unit}
            onCommit={(metres) => {
              // Move the far end along the wall; walls joined there follow it.
              const scale = metres / length;
              const end = [wall.a[0] + (wall.b[0] - wall.a[0]) * scale, wall.a[1] + (wall.b[1] - wall.a[1]) * scale];
              editProperty((p) => moveCorner(p, levelIndex, wall.b, end));
            }}
          />
        </Field>
        <Field id="pe-wall-thickness" label="Thickness">
          <select
            id="pe-wall-thickness"
            value={WALL_THICKNESSES.find((item) => Math.abs(item.value - wall.thickness) < 1e-4)?.value ?? wall.thickness}
            onChange={(event) => editProperty((p) => updateWall(p, levelIndex, wall.id, { thickness: Number(event.target.value) }))}
          >
            {WALL_THICKNESSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            {!WALL_THICKNESSES.some((item) => Math.abs(item.value - wall.thickness) < 1e-4) && (
              <option value={wall.thickness}>{formatLength(wall.thickness, unit)}</option>
            )}
          </select>
        </Field>
        <p className="terrain-description">{wall.openings.length} door/window opening{wall.openings.length === 1 ? "" : "s"}</p>
        <button
          type="button"
          className="terrain-clear"
          onClick={() => {
            editProperty((p) => removeWall(p, levelIndex, wall.id));
            clear();
          }}
        >
          Delete wall
        </button>
      </section>
    );
  }

  if (selection.kind === "opening") {
    const wall = level.walls.find((item) => item.id === selection.wallId);
    const opening = wall?.openings.find((item) => item.id === selection.id);
    if (!opening) return null;
    const update = (patch) => editProperty((p) => updateOpening(p, levelIndex, wall.id, opening.id, patch));
    return (
      <section className="terrain-section" aria-label="Selected opening">
        <h3>{opening.type === "door" ? "Door" : "Window"}</h3>
        <Field id="pe-opening-type" label="Type">
          <select id="pe-opening-type" value={opening.type} onChange={(event) => update({ type: event.target.value })}>
            <option value="door">Door</option>
            <option value="window">Window</option>
          </select>
        </Field>
        <Field id="pe-opening-width" label="Width">
          <LengthInput id="pe-opening-width" key={`w-${opening.id}-${opening.width}`} value={opening.width} unit={unit} onCommit={(width) => update({ width })} />
        </Field>
        <Field id="pe-opening-height" label="Height">
          <LengthInput id="pe-opening-height" key={`h-${opening.id}-${opening.height}`} value={opening.height} unit={unit} onCommit={(height) => update({ height })} />
        </Field>
        {opening.type === "window" && (
          <Field id="pe-opening-sill" label="Sill height">
            <LengthInput id="pe-opening-sill" key={`s-${opening.id}-${opening.sill}`} value={opening.sill} unit={unit} onCommit={(sill) => update({ sill })} />
          </Field>
        )}
        <button
          type="button"
          className="terrain-clear"
          onClick={() => {
            editProperty((p) => removeOpening(p, levelIndex, wall.id, opening.id));
            clear();
          }}
        >
          Delete {opening.type}
        </button>
      </section>
    );
  }

  const room = level.rooms.find((item) => item.id === selection.id);
  if (!room) return null;
  return (
    <section className="terrain-section" aria-label="Selected room">
      <h3>Room</h3>
      <Field id="pe-room-name" label="Name">
        <input
          id="pe-room-name"
          key={room.id}
          defaultValue={room.name}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name && name !== room.name) editProperty((p) => updateRoom(p, levelIndex, room.id, { name }));
          }}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        />
      </Field>
      <Field id="pe-room-type" label="Type">
        <select
          id="pe-room-type"
          value={room.type}
          onChange={(event) => {
            const type = event.target.value;
            const label = ROOM_TYPES.find((item) => item.id === type).label;
            // Rooms still carrying a default name take the new type's name.
            const defaultNamed = ROOM_TYPES.some((item) => room.name === item.label || room.name.startsWith(`${item.label} `));
            editProperty((p) => updateRoom(p, levelIndex, room.id, defaultNamed ? { type, name: label } : { type }));
          }}
        >
          {ROOM_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </Field>
      <label className="scene-toggle">
        <input
          type="checkbox"
          checked={isOpenAbove(room)}
          onChange={(event) => editProperty((p) => updateRoom(p, levelIndex, room.id, { openAbove: event.target.checked }))}
        />
        <span>Open above</span>
      </label>
      <p className="terrain-description">
        {room.type === "courtyard"
          ? "Open to the sky: every floor above and the roof leave a gap over it."
          : "No ceiling: the floor (or roof) directly above leaves a gap, for a double-height room or a stairwell."}
      </p>
      <p className="terrain-description">Area {formatArea(polygonArea(room.polygon), unit)}</p>
      <button
        type="button"
        className="terrain-clear"
        onClick={() => {
          editProperty((p) => removeRoom(p, levelIndex, room.id));
          clear();
        }}
      >
        Delete room
      </button>
    </section>
  );
}

/** Side panel for the floorplan editor. */
export default function EditorPanel() {
  const property = useScene((state) => state.document.property);
  const editor = useScene((state) => state.editor);
  const setEditor = useScene((state) => state.setEditor);
  const editProperty = useScene((state) => state.editProperty);
  const underlayImages = useScene((state) => state.underlayImages);
  const setUnderlayImage = useScene((state) => state.setUnderlayImage);
  const persistence = useScene((state) => state.persistence);
  const canUndo = useScene((state) => state.past.length > 0);
  const canRedo = useScene((state) => state.future.length > 0);
  const undo = useScene((state) => state.undo);
  const redo = useScene((state) => state.redo);

  const levelIndex = Math.min(editor.levelIndex, property.levels.length - 1);
  const level = property.levels[levelIndex];
  const tool = findTool(editor.tool);

  return (
    <aside className="scene-controls" aria-labelledby="pe-title">
      <div className="scene-controls-heading">
        <div className="scene-controls-top">
          <span className="terrain-label">FLOORPLAN</span>
          <div className="scene-history" role="group" aria-label="History">
            <button className="studio-icon" type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
              <UndoIcon />
            </button>
            <button className="studio-icon" type="button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
              <RedoIcon />
            </button>
          </div>
        </div>
        <h3 id="pe-title">{tool.label}</h3>
        <p>{tool.hint}</p>
      </div>

      {editor.tool === "wall" && (
        <Field id="pe-new-wall" label="New walls">
          <select id="pe-new-wall" value={editor.wallThickness} onChange={(event) => setEditor({ wallThickness: event.target.value })}>
            <option value="exterior">9&quot; outer walls</option>
            <option value="interior">4.5&quot; partitions</option>
          </select>
        </Field>
      )}

      <SelectionSection
        level={level}
        levelIndex={levelIndex}
        selection={editor.selection}
        unit={editor.unit}
        editProperty={editProperty}
        clear={() => setEditor({ selection: null })}
      />

      <RoomsSection
        level={level}
        levelIndex={levelIndex}
        unit={editor.unit}
        selection={editor.selection}
        editProperty={editProperty}
        select={(selection) => setEditor({ selection, tool: "select" })}
      />

      <LevelsSection
        property={property}
        levelIndex={levelIndex}
        editProperty={editProperty}
        onPick={(index) => setEditor({ levelIndex: index, selection: null, scalePoints: null })}
      />

      <UnderlaySection
        key={level.id}
        level={level}
        levelIndex={levelIndex}
        editProperty={editProperty}
        editor={editor}
        setEditor={setEditor}
        underlayUrl={underlayImages[level.id]}
        setUnderlayImage={setUnderlayImage}
        persistence={persistence}
      />
    </aside>
  );
}
