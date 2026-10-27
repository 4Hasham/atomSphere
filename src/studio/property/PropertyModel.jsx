import { useEffect, useMemo } from "react";
import { Color, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import buildProperty, { disposeProperty } from "./buildProperty";
import { ROOM_TYPES } from "./propertyDocument";

function useMaterials() {
  const materials = useMemo(() => ({
    // Plaster walls a shade darker than Studio's light backdrop, concrete slabs darker
    // still, so floors and wall edges read against the background.
    wall: new MeshStandardMaterial({ color: "#e2ddd3", roughness: 0.9 }),
    slab: new MeshStandardMaterial({ color: "#9f9a91", roughness: 0.95 }),
    roof: new MeshStandardMaterial({ color: "#b9b4aa", roughness: 0.95 }),
    glass: new MeshPhysicalMaterial({
      color: new Color("#a9c6d6"),
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
    rooms: Object.fromEntries(ROOM_TYPES.map((type) => [
      type.id,
      new MeshStandardMaterial({ color: type.color, roughness: 0.85 }),
    ])),
  }), []);

  useEffect(() => () => {
    [materials.wall, materials.slab, materials.roof, materials.glass, ...Object.values(materials.rooms)]
      .forEach((material) => material.dispose());
  }, [materials]);

  return materials;
}

/**
 * Renders a property document. `level` is "all" or a level index: that level and the
 * ones below are shown, roofless, so picking a level (even the top one) cuts the house
 * open at it: the dollhouse view. The roof shows only for the whole house, with `roof` on.
 */
export default function PropertyModel({ property, level = "all", roof = true }) {
  const built = useMemo(() => buildProperty(property), [property]);
  useEffect(() => () => disposeProperty(built), [built]);
  const materials = useMaterials();

  const lastIndex = built.levels.length - 1;
  const topVisible = level === "all" ? lastIndex : Math.min(Number(level), lastIndex);

  // Centre the footprint on the origin; the ground floor stays at y = 0.
  const centre = built.bounds.getCenter(built.bounds.min.clone());

  return (
    <group position={[-centre.x, 0, -centre.z]}>
      {built.levels.map((builtLevel, index) => index <= topVisible && (
        <group key={builtLevel.id}>
          {builtLevel.slab && (
            <mesh geometry={builtLevel.slab} material={materials.slab} castShadow receiveShadow />
          )}
          {builtLevel.rooms.map(({ room, geometry }) => (
            <mesh
              key={room.id}
              geometry={geometry}
              material={materials.rooms[room.type] ?? materials.rooms.other}
              receiveShadow
            />
          ))}
          {builtLevel.walls && (
            <mesh geometry={builtLevel.walls} material={materials.wall} castShadow receiveShadow />
          )}
          {builtLevel.glass && <mesh geometry={builtLevel.glass} material={materials.glass} />}
        </group>
      ))}
      {roof && level === "all" && built.roof && (
        <mesh geometry={built.roof} material={materials.roof} castShadow receiveShadow />
      )}
    </group>
  );
}
