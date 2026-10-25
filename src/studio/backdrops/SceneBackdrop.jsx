import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Vector3,
} from "three";

const CITY_BLOCKS = Array.from({ length: 64 }, (_, index) => {
  const column = index % 8;
  const row = Math.floor(index / 8);
  const x = (column - 3.5) * 12;
  const z = (row - 3.5) * 12;
  const variation = (seed) => {
    const value = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    return value - Math.floor(value);
  };

  return {
    x: x + (variation(4) - 0.5) * 1.2,
    z: z + (variation(5) - 0.5) * 1.2,
    width: 5.2 + variation(1) * 2.8,
    depth: 5.2 + variation(2) * 2.8,
    height: 7 + variation(3) * 16,
    color: ["#555653", "#696761", "#77746c", "#494e50"][index % 4],
  };
}).filter(({ x, z }) => Math.abs(x) > 5 && Math.abs(z) > 5);

const MOUNTAIN_PEAKS = Array.from({ length: 20 }, (_, index) => {
  const angle = (index / 20) * Math.PI * 2;
  const distance = 38 + (index % 5) * 7;

  return {
    x: Math.cos(angle) * distance,
    z: Math.sin(angle) * distance,
    height: 17 + ((index * 7) % 15),
    radius: 14 + ((index * 3) % 8),
  };
});

const TREES = Array.from({ length: 48 }, (_, index) => {
  const angle = index * 2.11;
  const distance = 11 + ((index * 7) % 18);

  return {
    x: Math.cos(angle) * distance,
    z: Math.sin(angle) * distance,
    height: 3 + ((index * 11) % 14) / 10,
    color: ["#1b3a2b", "#234e38", "#2c5e44", "#183224"][index % 4],
  };
});

function createWindowGeometry() {
  const positions = [];
  const colors = [];
  const darkGlass = new Color("#26343a");
  const litGlass = new Color("#d7bd83");

  const addWindow = (corners, color) => {
    const [a, b, c, d] = corners;
    for (const vertex of [a, b, c, a, c, d]) {
      positions.push(...vertex);
      colors.push(color.r, color.g, color.b);
    }
  };

  CITY_BLOCKS.forEach((building, buildingIndex) => {
    const floors = Math.max(2, Math.floor(building.height / 2.8));
    const columnsX = Math.max(2, Math.floor(building.width / 1.15));
    const columnsZ = Math.max(2, Math.floor(building.depth / 1.15));
    const floorHeight = building.height / (floors + 1);
    const paneHeight = Math.min(1.1, floorHeight * 0.52);

    const facade = (columns, width, pointAt) => {
      for (let floor = 0; floor < floors; floor += 1) {
        const y = floorHeight * (floor + 1);
        for (let column = 0; column < columns; column += 1) {
          const fraction = (column + 1) / (columns + 1);
          const center = pointAt(fraction, y);
          const paneWidth = Math.min(0.62, width / (columns + 1) * 0.58);
          const hash = (buildingIndex * 37 + floor * 17 + column * 13) % 19;
          const color = hash === 0 || hash === 7 ? litGlass : darkGlass;
          addWindow([
            [center[0] - paneWidth / 2, y - paneHeight / 2, center[2]],
            [center[0] + paneWidth / 2, y - paneHeight / 2, center[2]],
            [center[0] + paneWidth / 2, y + paneHeight / 2, center[2]],
            [center[0] - paneWidth / 2, y + paneHeight / 2, center[2]],
          ], color);
        }
      }
    };

    facade(columnsX, building.width, (fraction) => [
      building.x - building.width / 2 + fraction * building.width,
      0,
      building.z + building.depth / 2 + 0.025,
    ]);
    facade(columnsZ, building.depth, (fraction) => [
      building.x + building.width / 2 + 0.025,
      0,
      building.z + building.depth / 2 - fraction * building.depth,
    ]);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function mountainHeight(x, z) {
  let height = 0;
  for (const peak of MOUNTAIN_PEAKS) {
    const dx = x - peak.x;
    const dz = z - peak.z;
    const radius = peak.radius * 1.45;
    height = Math.max(height, peak.height * Math.exp(-(dx * dx + dz * dz) / (2 * radius * radius)));
  }

  const detail = Math.sin(x * 0.34 + Math.cos(z * 0.21))
    * Math.sin(z * 0.29 - x * 0.17) * 1.15;
  return Math.max(0, height + detail * Math.min(height / 5, 1));
}

function createMountainGeometry() {
  const size = 180;
  const segments = 128;
  const side = segments + 1;
  const positions = new Float32Array(side * side * 3);
  const colors = new Float32Array(side * side * 3);
  const indices = [];
  const heights = new Float32Array(side * side);
  const low = new Color("#394c38");
  const mid = new Color("#65704d");
  const rock = new Color("#77766a");
  const snow = new Color("#c4c4b7");
  const color = new Color();

  for (let row = 0; row <= segments; row += 1) {
    const z = (row / segments - 0.5) * size;
    for (let column = 0; column <= segments; column += 1) {
      const x = (column / segments - 0.5) * size;
      const vertex = row * side + column;
      const height = mountainHeight(x, z);
      heights[vertex] = height;
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = height - 1.3;
      positions[vertex * 3 + 2] = z;
    }
  }

  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * side + column;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  for (let row = 0; row <= segments; row += 1) {
    for (let column = 0; column <= segments; column += 1) {
      const vertex = row * side + column;
      const left = heights[row * side + Math.max(0, column - 1)];
      const right = heights[row * side + Math.min(segments, column + 1)];
      const up = heights[Math.max(0, row - 1) * side + column];
      const down = heights[Math.min(segments, row + 1) * side + column];
      const slope = Math.hypot(right - left, down - up);
      const height = heights[vertex];

      if (height > 24) color.copy(rock).lerp(snow, Math.min((height - 24) / 8, 0.72));
      else color.copy(low).lerp(mid, Math.min(height / 18, 1));
      if (slope > 1.4) color.lerp(rock, Math.min((slope - 1.4) * 0.28, 0.65));
      colors.set([color.r, color.g, color.b], vertex * 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function CityBackdrop() {
  const windowGeometry = useMemo(() => createWindowGeometry(), []);
  useEffect(() => () => windowGeometry.dispose(), [windowGeometry]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, 0]} receiveShadow>
        <planeGeometry args={[140, 140]} />
        <meshStandardMaterial color="#343533" roughness={0.96} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.29, 0]}>
        <planeGeometry args={[9, 140]} />
        <meshStandardMaterial color="#292c2c" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.29, 0]}>
        <planeGeometry args={[140, 9]} />
        <meshStandardMaterial color="#292c2c" roughness={0.9} />
      </mesh>

      {CITY_BLOCKS.map((b, index) => (
        <group key={index} position={[b.x, -1.3, b.z]}>
          <mesh position={[0, b.height / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.width, b.height, b.depth]} />
            <meshStandardMaterial color={b.color} roughness={0.82} />
          </mesh>
          <mesh position={[0, b.height + 0.08, 0]} castShadow>
            <boxGeometry args={[b.width * 0.78, 0.16, b.depth * 0.78]} />
            <meshStandardMaterial color="#77756d" roughness={0.9} />
          </mesh>
        </group>
      ))}

      <mesh geometry={windowGeometry} position={[0, -1.3, 0]}>
        <meshStandardMaterial
          vertexColors
          roughness={0.42}
          metalness={0.12}
          emissive="#343024"
          emissiveIntensity={0.18}
        />
      </mesh>

      {Array.from({ length: 18 }, (_, index) => {
        const offset = (index - 8.5) * 8;
        return (
          <group key={`markings-${index}`}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.15, -1.27, offset]}>
              <planeGeometry args={[0.12, 3]} />
              <meshBasicMaterial color="#c3b995" />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[offset, -1.27, -2.15]}>
              <planeGeometry args={[0.12, 3]} />
              <meshBasicMaterial color="#c3b995" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function PineTree({ x, z, height, color }) {
  return (
    <group position={[x, mountainHeight(x, z) - 1.3, z]}>
      <mesh position={[0, height * 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.18, height * 0.6, 5]} />
        <meshStandardMaterial color="#362922" roughness={0.95} />
      </mesh>
      <mesh position={[0, height * 0.7, 0]} castShadow>
        <coneGeometry args={[height * 0.38, height * 0.55, 6]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0, height * 1.05, 0]} castShadow>
        <coneGeometry args={[height * 0.28, height * 0.45, 6]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
    </group>
  );
}

function MountainBackdrop() {
  const geometry = useMemo(() => createMountainGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.96} />
      </mesh>
      {TREES.map((tree, index) => (
        <PineTree key={`pine-${index}`} {...tree} />
      ))}
    </group>
  );
}

export function SceneBackdrop({ type }) {
  if (type === "city") return <CityBackdrop />;
  if (type === "mountains") return <MountainBackdrop />;
  return null;
}

export function VisibleSun({ color = "#fff5e6" }) {
  const group = useRef();
  const target = useMemo(() => new Vector3(), []);
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(), []);

  useFrame((state) => {
    if (!group.current) return;
    if (state.controls?.target) target.copy(state.controls.target);
    else target.set(0, 0, 0);

    const distance = Math.max(state.camera.position.distanceTo(target), 10);
    state.camera.getWorldDirection(forward);
    right.setFromMatrixColumn(state.camera.matrixWorld, 0);
    up.setFromMatrixColumn(state.camera.matrixWorld, 1);
    group.current.position.copy(target)
      .addScaledVector(forward, distance * 0.75)
      .addScaledVector(right, distance * 0.25)
      .addScaledVector(up, distance * 0.15);
    group.current.scale.setScalar(distance * 0.05);
  });

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <pointLight color={color} intensity={4} distance={40} />
    </group>
  );
}