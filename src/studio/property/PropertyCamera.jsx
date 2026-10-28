import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Spherical, Vector3 } from "three";

// Polar angle (from straight down) for looking into a cut-open floor: steep enough to
// see over the walls into the rooms, shallow enough to still read as 3D.
const DOLLHOUSE_POLAR = 0.75;

/** When a floor is picked (dollhouse view), tilts the camera down over the house. */
export default function PropertyCamera({ level }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);

  useEffect(() => {
    if (level === "all" || !controls) return;
    const target = controls.target;
    const offset = new Vector3().subVectors(camera.position, target);
    const spherical = new Spherical().setFromVector3(offset);
    if (spherical.phi <= DOLLHOUSE_POLAR) return;
    spherical.phi = DOLLHOUSE_POLAR;
    camera.position.copy(target).add(new Vector3().setFromSpherical(spherical));
    camera.lookAt(target);
    controls.update();
  }, [level, camera, controls]);

  return null;
}
