import { useEffect, useMemo } from "react";
import { Color, Float32BufferAttribute, PlaneGeometry } from "three";

// 1 world unit = 1 meter. Elevations are real meters, and the requested site
// sits at x = 0, z = 0 with y = 0 at the site's ground height.
export default function TerrainSurface({ terrain }) {
  const geometry = useMemo(() => {
    const { size, elevations, metersPerPixel, originX, originZ, siteElevation } = terrain;

    const surface = new PlaneGeometry(1, 1, size - 1, size - 1);
    const positions = surface.attributes.position;
    const colors = new Float32Array(positions.count * 3);

    const lowColor = new Color("#397b50");
    const middleColor = new Color("#a28c63");
    const highColor = new Color("#c5c7b2");
    const rockColor = new Color("#77766a");
    const color = new Color();

    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const vertex = row * size + column;
        const elevation = elevations[vertex];

        positions.setXYZ(
          vertex,
          originX + column * metersPerPixel, // x: east
          elevation - siteElevation,         // y: real meters, up
          originZ + row * metersPerPixel,    // z: south
        );

        if (elevation < 1200) {
          color.copy(lowColor).lerp(middleColor, Math.max(0, elevation / 1200));
        } else {
          color.copy(middleColor).lerp(highColor, Math.min((elevation - 1200) / 2300, 1));
        }
        const left = elevations[row * size + Math.max(0, column - 1)];
        const right = elevations[row * size + Math.min(size - 1, column + 1)];
        const above = elevations[Math.max(0, row - 1) * size + column];
        const below = elevations[Math.min(size - 1, row + 1) * size + column];
        const slope = Math.hypot(
          (right - left) / (2 * metersPerPixel),
          (below - above) / (2 * metersPerPixel),
        );
        if (slope > 0.55) color.lerp(rockColor, Math.min((slope - 0.55) * 0.45, 0.65));
        const variation = (Math.sin(column * 12.9898 + row * 78.233) * 43758.5453) % 1;
        color.multiplyScalar(0.97 + Math.abs(variation) * 0.06);
        colors.set([color.r, color.g, color.b], vertex * 3);
      }
    }

    surface.setAttribute("color", new Float32BufferAttribute(colors, 3));
    positions.needsUpdate = true;
    surface.computeVertexNormals();
    surface.computeBoundingBox();
    surface.computeBoundingSphere();
    return surface;
  }, [terrain]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.92} />
    </mesh>
  );
}
