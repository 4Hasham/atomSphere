import { Suspense, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, Plane, Vector3 } from "three";
import PropertyModel from "../property/PropertyModel";
import { createPlacedObject } from "../sceneDocument";
import { useScene } from "../sceneStore";
import { statusGroup } from "../../stage/model";
import { useJobsById, useModelUrls, useObjectLibrary } from "./objectLibrary";
import { placementAt, placementElevation, placementShown, turned } from "./placement";
import { LoadedModel } from "./SceneModel";
import ViewerErrorBoundary from "./ViewerErrorBoundary";

const SELECTED_COLOR = "#2f6fdf";
// A pointer that moved further than this between press and release was orbiting.
const CLICK_SLOP_PX = 4;
const noRaycast = () => null;
const round = (value) => Math.round(value * 100) / 100;
/** Stops a pointer or click on HTML over the canvas reaching the 3D scene under it. */
const stop = (event) => event.stopPropagation();

/** Whether the clicked surface faces up (a floor, a roof, a table top) rather than a wall. */
function facesUp(event) {
  if (!event.face) return true;
  return event.face.normal.clone().transformDirection(event.object.matrixWorld).y > 0.7;
}

/**
 * The property and the objects placed in it. While something is waiting to be placed,
 * a click on a floor, the roof or the ground outside puts it there; otherwise a click
 * selects an object (or clears the selection), and dragging one moves it about on its
 * floor. The selected one has its turn and delete controls floating over it.
 */
export default function FurnishedProperty({ theme }) {
  const property = useScene((state) => state.document.property);
  const objects = useScene((state) => state.document.objects);
  const view = useScene((state) => state.propertyView);
  const staging = useScene((state) => state.staging);
  const setStaging = useScene((state) => state.setStaging);
  const addObject = useScene((state) => state.addObject);
  const placeObject = useScene((state) => state.placeObject);
  const removeObject = useScene((state) => state.removeObject);
  const readOnly = useScene((state) => state.readOnly);
  const urls = useModelUrls(objects);
  const jobsById = useJobsById();
  const jobsLoading = useObjectLibrary()?.jobsLoading ?? true;
  const ghost = useRef(null);
  const { placing, selected } = staging;
  const placingSize = placing?.object?.sizeMeters
    ?? objects.find((object) => object.id === placing?.id)?.sizeMeters
    ?? 1;

  function placementFor(event) {
    const local = event.eventObject.worldToLocal(event.point.clone());
    return placementAt(property, [local.x, local.y, local.z], facesUp(event));
  }

  function handlePointerMove(event) {
    if (!placing || !ghost.current) return;
    // The nearest surface only; the ones behind it would move the marker there.
    event.stopPropagation();
    const placement = placementFor(event);
    ghost.current.visible = true;
    ghost.current.position.set(placement.at[0], placementElevation(property, placement), placement.at[1]);
  }

  function handleClick(event) {
    event.stopPropagation();
    if (event.delta > CLICK_SLOP_PX) return;
    if (!placing) {
      if (selected) setStaging({ selected: null });
      return;
    }
    const placement = placementFor(event);
    if (placing.object) {
      const object = createPlacedObject(placing.object, placement);
      addObject(object);
      setStaging({ placing: null, selected: object.id });
    } else {
      placeObject(placing.id, placement);
      setStaging({ placing: null, selected: placing.id });
    }
  }

  return (
    <PropertyModel
      property={property}
      level={view.level}
      roof={view.roof}
      theme={theme}
      onClick={readOnly ? undefined : handleClick}
      onPointerMove={placing ? handlePointerMove : undefined}
    >
      {objects.map((object) => {
        // The one being moved follows the pointer instead.
        if (!object.placement || placing?.id === object.id) return null;
        if (!placementShown(property, object.placement, view.level)) return null;
        return (
          <PlacedObject
            key={object.id}
            object={object}
            elevation={placementElevation(property, object.placement)}
            url={urls[object.source.jobId]}
            job={jobsById.get(object.source.jobId)}
            jobsLoading={jobsLoading}
            selected={selected === object.id}
            // While placing, clicks pass through objects, so things can go on a table.
            editable={!placing && !readOnly}
            onSelect={() => setStaging({ selected: object.id })}
            onMove={(at) => placeObject(object.id, { at })}
            onTurn={(degrees) => placeObject(object.id, { rotation: turned(object.placement.rotation, degrees) })}
            onRemove={() => removeObject(object.id)}
          />
        );
      })}

      {placing && (
        <>
          {/* The ground around the house, to catch clicks outside it (a car in the drive). */}
          <mesh rotation-x={-Math.PI / 2} visible={false}>
            <planeGeometry args={[400, 400]} />
          </mesh>
          <group ref={ghost} visible={false}>
            <mesh rotation-x={-Math.PI / 2} position-y={0.03} raycast={noRaycast}>
              <circleGeometry args={[placingSize / 2, 48]} />
              <meshBasicMaterial color={SELECTED_COLOR} transparent opacity={0.35} depthWrite={false} />
            </mesh>
          </group>
        </>
      )}
    </PropertyModel>
  );
}

function PlacedObject({ object, elevation, url, job, jobsLoading, selected, editable, onSelect, onMove, onTurn, onRemove }) {
  const { at, rotation } = object.placement;
  const size = object.sizeMeters;
  const status = statusGroup(job?.status);
  const ready = url && url !== "error";
  // No job once the list has loaded: its model was deleted, or belongs to someone else.
  const missing = !job && !jobsLoading;
  const label = url === "error"
    ? "Couldn't load"
    : missing ? "Not available" : status === "active" ? "Making…" : status === "failed" ? "Didn't finish" : "Loading…";
  const failed = url === "error" || status === "failed" || missing;

  const group = useRef(null);
  const model = useRef(null);
  const tools = useRef(null);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const getThree = useThree((state) => state.get);
  // The camera holds still while something is dragged.
  const holdCamera = (held) => {
    const { controls } = getThree();
    if (controls) controls.enabled = !held;
  };

  // The controls float just over the top of the model, however tall it turns out to be.
  useFrame(() => {
    if (!selected || !tools.current || !model.current) return;
    const bounds = new Box3().setFromObject(model.current);
    if (bounds.isEmpty()) return;
    tools.current.position.y = bounds.max.y - group.current.getWorldPosition(new Vector3()).y + 0.15;
  });

  // Dragging slides the object across the level it stands at: where the pointer's ray
  // meets that horizontal plane, in the property's frame.
  function pointOnPlane(event) {
    const hit = event.ray.intersectPlane(drag.current.plane, new Vector3());
    return hit && group.current.parent.worldToLocal(hit);
  }

  function onPointerDown(event) {
    if (!editable || event.button !== 0) return;
    event.stopPropagation();
    onSelect();
    const worldY = group.current.getWorldPosition(new Vector3()).y;
    drag.current = { plane: new Plane(new Vector3(0, 1, 0), -worldY), start: [event.clientX, event.clientY], moved: false };
    const grabbed = pointOnPlane(event);
    if (!grabbed) {
      drag.current = null;
      return;
    }
    // Where it was grabbed stays under the pointer (no jump to its centre).
    drag.current.offset = [at[0] - grabbed.x, at[1] - grabbed.z];
    event.target.setPointerCapture(event.pointerId);
    holdCamera(true);
  }

  function onPointerMove(event) {
    const current = drag.current;
    if (!current) return;
    event.stopPropagation();
    if (!current.moved && Math.hypot(event.clientX - current.start[0], event.clientY - current.start[1]) <= CLICK_SLOP_PX) return;
    const point = pointOnPlane(event);
    if (!point) return;
    if (!current.moved) {
      current.moved = true;
      setDragging(true);
    }
    current.at = [round(point.x + current.offset[0]), round(point.z + current.offset[1])];
    group.current.position.x = current.at[0];
    group.current.position.z = current.at[1];
  }

  function onPointerUp(event) {
    const current = drag.current;
    if (!current) return;
    event.stopPropagation();
    event.target.releasePointerCapture(event.pointerId);
    holdCamera(false);
    drag.current = null;
    if (current.moved) {
      setDragging(false);
      // One undo step for the whole drag.
      if (current.at) onMove(current.at);
    }
  }

  return (
    <group
      ref={group}
      position={[at[0], elevation, at[1]]}
      rotation-y={(rotation * Math.PI) / 180}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerOver={editable ? () => { document.body.style.cursor = "grab"; } : undefined}
      onPointerOut={editable ? () => { document.body.style.cursor = ""; } : undefined}
      // Selecting happens on press; the click mustn't reach the floor, which deselects.
      onClick={editable ? stop : undefined}
    >
      <group ref={model}>
        {ready ? (
          <ViewerErrorBoundary key={url} fallback={<Placeholder size={size} name={object.name} label="Couldn't load" failed />}>
            <Suspense fallback={<Placeholder size={size} name={object.name} label="Loading…" />}>
              <LoadedModel url={url} sizeMeters={size} />
            </Suspense>
          </ViewerErrorBoundary>
        ) : (
          <Placeholder size={size} name={object.name} label={label} failed={failed} />
        )}
      </group>
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.03} raycast={noRaycast} renderOrder={2}>
          <ringGeometry args={[size * 0.55, size * 0.55 + Math.max(0.05, size * 0.04), 64]} />
          <meshBasicMaterial color={SELECTED_COLOR} depthTest={false} transparent />
        </mesh>
      )}
      {selected && editable && !dragging && (
        <group ref={tools} position-y={size}>
          {/* Only the toolbar takes the pointer: its wrapper sits over the object. */}
          <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <div
              className="object-tools"
              role="toolbar"
              aria-label={`Arrange ${object.name}`}
              onPointerDown={stop}
              onPointerUp={stop}
              onPointerMove={stop}
              onClick={stop}
            >
              <button type="button" title="Turn left 15°" aria-label="Turn left 15°" onClick={() => onTurn(15)}>↺</button>
              <button type="button" title="Turn right 15°" aria-label="Turn right 15°" onClick={() => onTurn(-15)}>↻</button>
              <button type="button" className="is-danger" title={`Remove ${object.name}`} onClick={onRemove}>Delete</button>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

/** Stands in for an object until its model is ready: a box its size, with its status. */
function Placeholder({ size, name, label, failed = false }) {
  const height = Math.min(size, 2) * 0.5;
  return (
    <group>
      <mesh position-y={height / 2} castShadow>
        <boxGeometry args={[size * 0.6, height, size * 0.6]} />
        <meshStandardMaterial color={failed ? "#c4524a" : "#8ea6c6"} transparent opacity={0.5} />
      </mesh>
      <Html center position={[0, height + 0.4, 0]} style={{ pointerEvents: "none" }}>
        <span className={`viewer-loading viewer-object-label ${failed ? "is-failed" : ""}`}>
          {name} · {label}
        </span>
      </Html>
    </group>
  );
}
