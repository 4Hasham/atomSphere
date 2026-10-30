import { useScene } from "../sceneStore";
import { arrivalSpot, canWalk, entrySpot, standingSpot } from "./walkthrough";

/** Starts a walk through the property, at the ground floor's way in. */
export function WalkButton() {
  const property = useScene((state) => state.document.property);
  const startWalk = useScene((state) => state.startWalk);
  if (!canWalk(property)) return null;
  const first = property.levels.findIndex((level) => level.walls.length);
  return (
    <button
      type="button"
      className="viewer-walk"
      onClick={() => startWalk({ level: first, ...entrySpot(property.levels[first]) })}
    >
      Walk through
    </button>
  );
}

/**
 * The controls over the view while walking through: the rooms of the floor you're on
 * (the one you're in marked; pick one to go there), the floors, and the way out.
 */
export default function WalkOverlay() {
  const property = useScene((state) => state.document.property);
  const walk = useScene((state) => state.walk);
  const walkTo = useScene((state) => state.walkTo);
  const stopWalk = useScene((state) => state.stopWalk);
  if (!walk || !property) return null;
  // Outside, the ground floor's rooms are the ones to go to.
  const levelIndex = walk.target.level ?? 0;
  const level = property.levels[levelIndex];

  return (
    <div className="viewer-walk-bar" role="group" aria-label="Walk through">
      {level.rooms.length > 0 && (
        <div className="viewer-walk-rooms" role="group" aria-label={`Rooms on the ${level.name.toLowerCase()}`}>
          {level.rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              aria-pressed={walk.room === room.id}
              className={walk.room === room.id ? "is-on" : ""}
              onClick={() => walkTo({ level: levelIndex, ...standingSpot(room, walk.target.at) })}
            >
              {room.name}
            </button>
          ))}
        </div>
      )}
      <div className="viewer-walk-row">
        {property.levels.length > 1 && (
          <div className="viewer-placing-floors" role="group" aria-label="Floor">
            {property.levels.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={index === walk.target.level}
                className={index === walk.target.level ? "is-on" : ""}
                // Arriving by the stairs, if the floor has some.
                onClick={() => walkTo({ level: index, ...arrivalSpot(item) })}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        <span className="viewer-walk-hint">Drag to look around · tap a floor to walk there · W A S D or arrows to walk</span>
        <button type="button" className="viewer-placing-cancel" onClick={stopWalk}>
          Exit
        </button>
      </div>
    </div>
  );
}
