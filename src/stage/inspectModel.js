// Opens a .glb in the browser before upload, with the same loader setup Studio uses
// (drei's useGLTF: Draco + Meshopt), so a file that passes here also opens there.
import { Box3, Vector3 } from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export const MAX_MODEL_BYTES = 200 * 1024 * 1024;

const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.5/";

function loader() {
  const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
  return { gltf: new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder), draco };
}

/** Checks the file and returns { triangles, sizeMeters }, or throws a readable error. */
export default async function inspectModel(file) {
  if (!/\.glb$/i.test(file.name)) {
    throw new Error("Upload a .glb file. Most 3D tools (SketchUp, Blender, Revit, 3ds Max) can export one.");
  }
  if (file.size > MAX_MODEL_BYTES) throw new Error("Models must be 200 MB or smaller.");

  const buffer = await file.arrayBuffer();
  const header = new DataView(buffer, 0, Math.min(12, buffer.byteLength));
  const magic = buffer.byteLength >= 12 ? new TextDecoder().decode(new Uint8Array(buffer, 0, 4)) : "";
  if (magic !== "glTF" || header.getUint32(4, true) !== 2) {
    throw new Error("This file isn't a glTF 2.0 binary (.glb). Re-export it as GLB.");
  }

  const { gltf: gltfLoader, draco } = loader();
  let gltf;
  try {
    gltf = await gltfLoader.parseAsync(buffer, "");
  } catch (error) {
    throw new Error(`This model couldn't be opened: ${error?.message || "unknown error"}.`, { cause: error });
  } finally {
    draco.dispose();
  }

  let triangles = 0;
  gltf.scene.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const { index, attributes } = child.geometry;
    triangles += (index ? index.count : attributes.position?.count ?? 0) / 3;
  });
  if (triangles === 0) throw new Error("This model has no visible geometry.");

  // glTF units are metres, so this is the model's real size (unless it was exported
  // in other units, which the size control in Studio can correct).
  const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
  const sizeMeters = Math.max(size.x, size.y, size.z);

  return { triangles: Math.round(triangles), sizeMeters: Number.isFinite(sizeMeters) ? sizeMeters : null };
}
