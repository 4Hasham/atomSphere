// Small line icons shared across the Stage, landing page and Studio. They take the
// current text colour and are hidden from screen readers; label the button instead.

export function SunIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 1.5V3.3M9 14.7V16.5M1.5 9H3.3M14.7 9H16.5M3.7 3.7l1.2 1.2M13.1 13.1l1.2 1.2M3.7 14.3l1.2-1.2M13.1 4.9l1.2-1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function MoonIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path d="M15 11.2A6.5 6.5 0 0 1 6.8 3a6.5 6.5 0 1 0 8.2 8.2Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function UndoIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 3.5 2.5 7 6 10.5M2.5 7h7a4 4 0 0 1 0 8H8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RedoIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10 3.5 13.5 7 10 10.5M13.5 7h-7a4 4 0 0 0 0 8H8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Input modes: a sentence, one photo, three photos.

export function TextIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 4.5h12M3 9h12M3 13.5h7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PhotoIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2.25" y="3.25" width="13.5" height="11.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m2.75 12.5 3.75-3.75 3 3 2-2 3.75 3.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="11.75" cy="6.75" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function PhotosIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path d="M5 2.75h9.25a1.75 1.75 0 0 1 1.75 1.75V12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="2" y="5.5" width="11" height="10" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m2.5 13.25 3-3 2.5 2.5 1.5-1.5 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
