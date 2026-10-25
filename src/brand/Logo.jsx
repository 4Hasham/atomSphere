import { useId } from "react";

/**
 * The atomSphere mark: a solid sphere with its orbit engraved into it and one dot
 * for the atom. The orbit and dot are cut out with a mask, so the mark sits on any
 * background. It takes the current text colour.
 */
export function Mark({ size = 24, title }) {
  const maskId = useId();
  const small = size < 24;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="#fff" />
          <ellipse
            cx="50"
            cy="50"
            rx="46"
            ry="13.5"
            fill="none"
            stroke="#000"
            strokeWidth={small ? 9 : 5.5}
            transform="rotate(-24 50 50)"
          />
          <circle cx="59.2" cy="32" r={small ? 9 : 7} fill="#000" />
        </mask>
      </defs>
      <circle cx="50" cy="50" r="46" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

/** Mark plus the atomSphere wordmark. */
export default function Logo({ size = 22, className = "" }) {
  return (
    <span className={`as-logo ${className}`}>
      <Mark size={size} />
      <span className="as-logo-word">atomSphere</span>
    </span>
  );
}
