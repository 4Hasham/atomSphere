import { useState } from "react";
import UploadModel from "../../stage/UploadModel";
import { useScene } from "../sceneStore";
import AddObjectDialog from "./AddObjectDialog";
import { useObjectLibrary } from "./objectLibrary";
import { placementLabel, turned } from "./placement";

/**
 * Furnishing a property in Studio's side panel: add objects (then click where they go),
 * and size, turn, move or remove the selected one.
 */
export default function FurnishSection({ SizeControl }) {
  const library = useObjectLibrary();
  const property = useScene((state) => state.document.property);
  const objects = useScene((state) => state.document.objects);
  const staging = useScene((state) => state.staging);
  const setStaging = useScene((state) => state.setStaging);
  const placeObject = useScene((state) => state.placeObject);
  const removeObject = useScene((state) => state.removeObject);
  const viewLevel = useScene((state) => state.propertyView.level);
  const setPropertyView = useScene((state) => state.setPropertyView);
  const [dialog, setDialog] = useState(null);
  if (!property || !library) return null;

  const placed = objects.filter((object) => object.placement);
  const selected = placed.find((object) => object.id === staging.selected);

  function startPlacing(object) {
    setDialog(null);
    // The whole house with its roof hides the floors; open it at the ground floor.
    if (viewLevel === "all") setPropertyView({ level: "0" });
    setStaging({ placing: { object }, selected: null });
  }

  return (
    <section className="terrain-section" aria-labelledby="furnish-title">
      <h3 id="furnish-title">Furnish &amp; stage</h3>
      <p className="terrain-description">
        Sofas, beds, a car in the drive, a water tank on the roof: made from a sentence or a
        photo, or your own model.
      </p>
      <button type="button" className="terrain-submit" onClick={() => setDialog("add")}>
        Add an object
      </button>

      {placed.length > 0 && (
        <ul className="pe-room-list" aria-label="Objects in this property">
          {placed.map((object) => (
            <li key={object.id} className={object.id === staging.selected ? "is-selected" : ""}>
              <button
                type="button"
                className="pe-room-pick"
                aria-pressed={object.id === staging.selected}
                onClick={() => setStaging({ selected: object.id === staging.selected ? null : object.id })}
              >
                <span>{object.name}</span>
                <span className="pe-room-area">{placementLabel(property, object.placement)}</span>
              </button>
              <button
                type="button"
                className="pe-room-delete"
                aria-label={`Remove ${object.name}`}
                title={`Remove ${object.name}`}
                onClick={() => removeObject(object.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="furnish-selected">
          <SizeControl key={`${selected.id}-${selected.sizeMeters}`} object={selected} />
          <div className="furnish-actions" role="group" aria-label={`Arrange ${selected.name}`}>
            <button
              type="button"
              className="terrain-clear"
              title="Turn left 15°"
              onClick={() => placeObject(selected.id, { rotation: turned(selected.placement.rotation, 15) })}
            >
              ↺ 15°
            </button>
            <button
              type="button"
              className="terrain-clear"
              title="Turn right 15°"
              onClick={() => placeObject(selected.id, { rotation: turned(selected.placement.rotation, -15) })}
            >
              ↻ 15°
            </button>
            <button
              type="button"
              className="terrain-clear"
              onClick={() => setStaging({ placing: { id: selected.id } })}
            >
              Move
            </button>
            <button type="button" className="terrain-clear is-danger" onClick={() => removeObject(selected.id)}>
              Remove
            </button>
          </div>
        </div>
      )}

      {dialog === "add" && (
        <AddObjectDialog
          onClose={() => setDialog(null)}
          onPlace={startPlacing}
          onUpload={() => setDialog("upload")}
        />
      )}
      {dialog === "upload" && (
        <UploadModel
          token={library.token}
          hint="Placed at its real size, wherever you click."
          onClose={() => setDialog(null)}
          onUploaded={({ jobId, title, sizeMeters }) => {
            library.reload();
            startPlacing({ jobId, name: title, sizeMeters });
          }}
        />
      )}
    </section>
  );
}
