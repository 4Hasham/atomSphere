import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useScene } from "../sceneStore";
import { levelElevations } from "./propertyDocument";
import { EYE_HEIGHT, blocked, roomAt, step } from "./walkthrough";

const WALK_SPEED = 1.6; // m/s, an easy indoor pace
const TURN_SPEED = 1.8; // rad/s with the arrow keys
const LOOK_SPEED = 0.005; // rad per dragged pixel
const MAX_PITCH = 1.2;
const GLIDE_SPEED = 2.4; // m/s when going to a tapped spot
const FADE_MS = 220;
const WALK_FOV = 70; // wider than the overview's, as eyes are indoors
const WALK_NEAR = 0.05; // walls can be close

/** The turn that faces the camera from `at` towards `look` (plan points; plan y is z). */
const yawTowards = (at, look) => Math.atan2(-(look[0] - at[0]), -(look[1] - at[1]));

/** The shortest way round from one angle to another. */
function angleBetween(from, to) {
  const difference = (to - from) % (Math.PI * 2);
  return difference > Math.PI ? difference - Math.PI * 2 : difference < -Math.PI ? difference + Math.PI * 2 : difference;
}

const isTextEntry = (target) => target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable]");

/**
 * First-person camera for walking through a property, while the scene store's `walk` is
 * set. Rendered inside the property's frame (as a child of PropertyModel), so plan
 * points map straight onto it. Drag to look around; walk with W A S D or the arrows;
 * the store's walk target (a tapped floor, a room picked) is glided to when the way is
 * clear, and reached with a quick fade when it isn't (another room, another floor).
 */
export default function WalkControls({ property }) {
  const walk = useScene((state) => state.walk);
  const setWalkRoom = useScene((state) => state.setWalkRoom);
  const stopWalk = useScene((state) => state.stopWalk);
  const getThree = useThree((state) => state.get);
  const anchor = useRef(null);
  const me = useRef({ at: null, level: null, yaw: 0, pitch: -0.08, glide: null, keys: new Set() });
  const [fading, setFading] = useState(false);
  const elevations = levelElevations(property);
  const levelOf = (index) => (index === null ? null : property.levels[index]);

  // The overview camera is put back as it was afterwards.
  useEffect(() => {
    const { camera } = getThree();
    const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov, near: camera.near };
    camera.fov = WALK_FOV;
    camera.near = WALK_NEAR;
    camera.updateProjectionMatrix();
    return () => {
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.fov = saved.fov;
      camera.near = saved.near;
      camera.updateProjectionMatrix();
    };
  }, [getThree]);

  // A new destination.
  const seq = walk?.seq;
  useEffect(() => {
    const target = walk?.target;
    if (!target) return undefined;
    const state = me.current;
    const arrive = () => {
      state.at = target.at;
      state.level = target.level;
      state.glide = null;
      if (target.look) state.yaw = yawTowards(target.at, target.look);
    };
    if (state.at === null) {
      arrive();
      return undefined;
    }
    const level = levelOf(target.level);
    const clear = target.level === state.level && (!level || !blocked(level, state.at, target.at));
    if (clear) {
      const distance = Math.hypot(target.at[0] - state.at[0], target.at[1] - state.at[1]);
      state.glide = {
        from: state.at,
        to: target.at,
        progress: 0,
        duration: Math.max(0.35, distance / GLIDE_SPEED),
        yawFrom: state.yaw,
        turn: target.look ? angleBetween(state.yaw, yawTowards(target.at, target.look)) : 0,
      };
      return undefined;
    }
    // No straight way there: fade across.
    setFading(true);
    const timer = window.setTimeout(() => {
      arrive();
      setFading(false);
    }, FADE_MS);
    return () => window.clearTimeout(timer);
    // Only a new destination (seq) starts a move; the rest is read as it stands then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  // Looking around: drag anywhere on the view.
  useEffect(() => {
    const element = getThree().gl.domElement;
    let last = null;
    const down = (event) => {
      if (event.button !== 0) return;
      last = [event.clientX, event.clientY];
    };
    const move = (event) => {
      if (!last) return;
      const state = me.current;
      state.yaw -= (event.clientX - last[0]) * LOOK_SPEED;
      state.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, state.pitch - (event.clientY - last[1]) * LOOK_SPEED));
      last = [event.clientX, event.clientY];
    };
    const up = () => {
      last = null;
    };
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    element.style.cursor = "grab";
    return () => {
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      element.style.cursor = "";
    };
  }, [getThree]);

  // Walking with the keyboard; Esc stops.
  useEffect(() => {
    const keys = me.current.keys;
    const down = (event) => {
      if (isTextEntry(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") {
        stopWalk();
        return;
      }
      keys.add(event.key.toLowerCase());
    };
    const up = (event) => keys.delete(event.key.toLowerCase());
    const clear = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [stopWalk]);

  useFrame((three, delta) => {
    const state = me.current;
    if (!state.at || !anchor.current) return;
    const seconds = Math.min(delta, 0.1);
    const { keys } = state;
    const pressed = (...names) => names.some((name) => keys.has(name));

    if (state.glide) {
      const glide = state.glide;
      glide.progress = Math.min(1, glide.progress + seconds / glide.duration);
      const eased = glide.progress < 0.5 ? 2 * glide.progress ** 2 : 1 - (-2 * glide.progress + 2) ** 2 / 2;
      state.at = [glide.from[0] + (glide.to[0] - glide.from[0]) * eased, glide.from[1] + (glide.to[1] - glide.from[1]) * eased];
      state.yaw = glide.yawFrom + glide.turn * eased;
      if (glide.progress >= 1) state.glide = null;
    } else {
      if (pressed("arrowleft")) state.yaw += TURN_SPEED * seconds;
      if (pressed("arrowright")) state.yaw -= TURN_SPEED * seconds;
      const forward = (pressed("w", "arrowup") ? 1 : 0) - (pressed("s", "arrowdown") ? 1 : 0);
      const sideways = (pressed("d") ? 1 : 0) - (pressed("a") ? 1 : 0);
      if (forward || sideways) {
        const distance = WALK_SPEED * seconds;
        const sin = Math.sin(state.yaw);
        const cos = Math.cos(state.yaw);
        // Forward is -z at no turn; plan y is z.
        const to = [
          state.at[0] + (-sin * forward + cos * sideways) * distance,
          state.at[1] + (-cos * forward - sin * sideways) * distance,
        ];
        const level = levelOf(state.level);
        state.at = level ? step(level, state.at, to) : to;
      }
    }

    const floor = state.level === null ? 0 : elevations[state.level];
    three.camera.position.copy(anchor.current.localToWorld(new Vector3(state.at[0], floor + EYE_HEIGHT, state.at[1])));
    three.camera.rotation.set(state.pitch, state.yaw, 0, "YXZ");
    const level = levelOf(state.level);
    setWalkRoom(level ? roomAt(level, state.at)?.id ?? null : null);
  });

  return (
    <>
      {/* The property's frame: plan points are positions in it. */}
      <group ref={anchor} />
      <Html fullscreen style={{ pointerEvents: "none" }}>
        <div className={`walk-fade ${fading ? "is-on" : ""}`} aria-hidden="true" />
      </Html>
    </>
  );
}
