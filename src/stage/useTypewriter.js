import { useEffect, useState } from "react";

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Types `text` in one character at a time; restarts whenever the text changes. */
export default function useTypewriter(text, speed = 38) {
  const reduce = prefersReducedMotion();
  const [state, setState] = useState({ source: text, count: 0 });

  useEffect(() => {
    if (reduce) return undefined;

    const id = window.setInterval(() => {
      setState((current) => {
        const count = current.source === text ? current.count : 0;
        if (count >= text.length) {
          window.clearInterval(id);
          return { source: text, count };
        }
        return { source: text, count: count + 1 };
      });
    }, speed);

    return () => window.clearInterval(id);
  }, [text, speed, reduce]);

  const count = reduce ? text.length : state.source === text ? state.count : 0;
  return { typed: text.slice(0, count), done: count >= text.length };
}
