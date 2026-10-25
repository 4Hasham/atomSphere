/**
 * Stand-in object on the stage and shelf until model thumbnails exist.
 * state: "ready" (solid), "making" (wireframe) or "failed" (dashed outline).
 */
export default function Cube({ state = "ready", size = 140 }) {
  const half = size / 2;
  const faces = [
    `translateZ(${half}px)`,
    `rotateY(180deg) translateZ(${half}px)`,
    `rotateY(90deg) translateZ(${half}px)`,
    `rotateY(-90deg) translateZ(${half}px)`,
    `rotateX(90deg) translateZ(${half}px)`,
    `rotateX(-90deg) translateZ(${half}px)`,
  ];

  return (
    <div className="st-cube-wrap" aria-hidden="true">
      <div className={`st-cube is-${state}`} style={{ width: size, height: size }}>
        {faces.map((transform, index) => (
          <span key={transform} className={`st-face st-face-${index + 1}`} style={{ transform }} />
        ))}
      </div>
    </div>
  );
}
