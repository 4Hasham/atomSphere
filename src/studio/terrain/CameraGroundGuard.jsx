import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { RAY_START_Y } from "../constants";

const CAMERA_MIN_HEIGHT = 2;    // meters the camera must stay above the terrain surface

// Keeps the camera above the terrain: every frame, finds the ground height directly
// under the camera and pushes the camera up if it is lower than ground + CAMERA_MIN_HEIGHT.
export default function CameraGroundGuard() {
  const { world, rapier } = useRapier();

  useFrame((state) => {
    const cam = state.camera;
    const startY = Math.max(RAY_START_Y, cam.position.y + 100);
    const ray = new rapier.Ray({ x: cam.position.x, y: startY, z: cam.position.z }, { x: 0, y: -1, z: 0 });
    // Ignore the car (dynamic); only the fixed terrain counts as ground
    const hit = world.castRay(ray, startY + 20000, true, rapier.QueryFilterFlags.EXCLUDE_DYNAMIC);
    if (!hit) return;

    const groundY = startY - (hit.timeOfImpact ?? hit.toi);
    const minY = groundY + CAMERA_MIN_HEIGHT;
    if (cam.position.y < minY) cam.position.y = minY;
  });

  return null;
}
