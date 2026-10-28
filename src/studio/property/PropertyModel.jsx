import { useEffect, useMemo } from "react";
import { Color, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import buildProperty, { disposeProperty } from "./buildProperty";
import { ROOM_TYPES } from "./propertyDocument";

// Colours per theme, so the house stands out from Studio's background in both: on the
// pale light-mode backdrop, warm sandstone plaster and darker concrete; on the dark
// backdrop, pale plaster. The plinth is stone, a shade darker than the slabs. Tinted
// glass marks the windows from a distance.
const PALETTES = {
  light: { wall: "#bba684", slab: "#7f786d", plinth: "#6f685e", roof: "#968e80", glass: "#4f6f86" },
  dark: { wall: "#e6dece", slab: "#a39d91", plinth: "#8f897e", roof: "#c2bbae", glass: "#6f93ab" },
};

function useMaterials(theme) {
  const materials = useMemo(() => {
    const palette = PALETTES[theme] ?? PALETTES.light;
    return {
      wall: new MeshStandardMaterial({ color: palette.wall, roughness: 0.9 }),
      slab: new MeshStandardMaterial({ color: palette.slab, roughness: 0.95 }),
      plinth: new MeshStandardMaterial({ color: palette.plinth, roughness: 1 }),
      roof: new MeshStandardMaterial({ color: palette.roof, roughness: 0.95 }),
      glass: new MeshPhysicalMaterial({
        color: new Color(palette.glass),
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
      rooms: Object.fromEntries(ROOM_TYPES.map((type) => [
        type.id,
        new MeshStandardMaterial({ color: type.color, roughness: 0.85 }),
      ])),
    };
  }, [theme]);

  useEffect(() => () => {
    [materials.wall, materials.slab, materials.plinth, materials.roof, materials.glass,
      ...Object.values(materials.rooms)]
      .forEach((material) => material.dispose());
  }, [materials]);

  return materials;
}

/**
 * Renders a property document. `level` is "all" or a level index: that level and the
 * ones below are shown, roofless, so picking a level (even the top one) cuts the house
 * open at it: the dollhouse view. The roof shows only for the whole house, with `roof` on.
 * `children` (placed objects) share the house's frame: plan x is x, plan y is z. Pointer
 * handlers (`events`) go on that frame, so they see clicks on the house and its objects.
 */
export default function PropertyModel({ property, level = "all", roof = true, theme = "light", children, ...events }) {
  const built = useMemo(() => buildProperty(property), [property]);
  useEffect(() => () => disposeProperty(built), [built]);
  const materials = useMaterials(theme);

  const lastIndex = built.levels.length - 1;
  const topVisible = level === "all" ? lastIndex : Math.min(Number(level), lastIndex);

  // Centre the footprint on the origin; the ground floor stays at y = 0.
  const centre = built.bounds.getCenter(built.bounds.min.clone());

  return (
    <group position={[-centre.x, 0, -centre.z]} {...events}>
      {built.levels.map((builtLevel, index) => index <= topVisible && (
        <group key={builtLevel.id}>
          {builtLevel.slab && (
            <mesh geometry={builtLevel.slab} material={index === 0 ? materials.plinth : materials.slab} castShadow receiveShadow />
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
      {children}
    </group>
  );
}
