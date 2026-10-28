import { Suspense, useRef } from "react";
import { Html } from "@react-three/drei";
import PropertyModel from "../property/PropertyModel";
import { createPlacedObject } from "../sceneDocument";
import { useScene } from "../sceneStore";
import { statusGroup } from "../../stage/model";
import { useJobsById, useModelUrls, useObjectLibrary } from "./objectLibrary";
import { placementAt, placementElevation, placementShown } from "./placement";
import { LoadedModel } from "./SceneModel";
import ViewerErrorBoundary from "./ViewerErrorBoundary";

const SELECTED_COLOR = "#2f6fdf";
// A pointer that moved further than this between press and release was orbiting.
const CLICK_SLOP_PX = 4;
const noRaycast = () => null;

/** Whether the clicked surface faces up (a floor, a roof, a table top) rather than a wall. */
function facesUp(event) {
  if (!event.face) return true;
  return event.face.normal.clone().transformDirection(event.object.matrixWorld).y > 0.7;
}

/**
 * The property and the objects placed in it. While something is waiting to be placed,
 * a click on a floor, the roof or the ground outside puts it there; otherwise a click
 * selects an object (or clears the selection).
 */
export default function FurnishedProperty({ theme }) {
  const property = useScene((state) => state.document.property);
  const objects = useScene((state) => state.document.objects);
  const view = useScene((state) => state.propertyView);
  const staging = useScene((state) => state.staging);
  const setStaging = useScene((state) => state.setStaging);
  const addObject = useScene((state) => state.addObject);
  const placeObject = useScene((state) => state.placeObject);
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
      onClick={handleClick}
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
            onSelect={placing ? undefined : () => setStaging({ selected: object.id })}
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

function PlacedObject({ object, elevation, url, job, jobsLoading, selected, onSelect }) {
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

  return (
    <group
      position={[at[0], elevation, at[1]]}
      rotation-y={(rotation * Math.PI) / 180}
      onClick={onSelect && ((event) => {
        event.stopPropagation();
        if (event.delta <= CLICK_SLOP_PX) onSelect();
      })}
    >
      {ready ? (
        <ViewerErrorBoundary key={url} fallback={<Placeholder size={size} name={object.name} label="Couldn't load" failed />}>
          <Suspense fallback={<Placeholder size={size} name={object.name} label="Loading…" />}>
            <LoadedModel url={url} sizeMeters={size} />
          </Suspense>
        </ViewerErrorBoundary>
      ) : (
        <Placeholder size={size} name={object.name} label={label} failed={failed} />
      )}
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.03} raycast={noRaycast} renderOrder={2}>
          <ringGeometry args={[size * 0.55, size * 0.55 + Math.max(0.05, size * 0.04), 64]} />
          <meshBasicMaterial color={SELECTED_COLOR} depthTest={false} transparent />
        </mesh>
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
