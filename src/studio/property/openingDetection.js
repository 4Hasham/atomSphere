// Finds the doors and windows on a floorplan image, given its walls (wallDetection.js).
// A door or window is a gap in a wall: the solid band stops and starts again, or stops a
// short way before the wall it was heading for. What's drawn in the gap tells which:
//   - a door has its swing drawn beside the gap: a quarter circle as wide as the gap
//     (two half-width ones for a double door), often with the leaf as a line;
//   - a window has thin lines running across the gap inside the wall's band (the glass
//     and the frame);
//   - an open archway has neither, and stays open.
// Doors and windows are bridged over: the wall runs on through them, carrying the
// opening, as the property document has it. Pure, so it runs the same in the browser
// and in tests.
//
// Walls and openings are in image pixels: walls { a, b, thickness } (centre lines,
// horizontal or vertical), openings { type: "door" | "window", a, b } (the gap's two
// ends on the wall's centre line), as planReading.js takes them.

import { integral } from "./wallDetection";

// Any drawn mark, however light: door swings are often pale grey or dashed. (So are
// watermarks; a door's leaf is drawn firmly, darker than this.)
const MARK_BELOW = 242;
const FIRM_BELOW = 200;
// Gaps narrower or wider than these many wall thicknesses aren't doors or windows
// (a 9" wall against a 2 ft ventilator and an 11 ft window).
const MIN_GAP = 1.5;
const MAX_GAP = 15;
// A swing is a door if marks follow the leaf (a line out from the hinge) and the arc
// for these shares of their length: a clear leaf with a little of a dashed arc, a
// fainter leaf with most of the arc, or no leaf and nearly all the arc.
const DOOR_LEAF = [0.8, 0.6, 0];
const DOOR_ARC = [0.2, 0.45, 0.8];
// Wall found beyond a gap is no wider than this many wall thicknesses.
const MAX_BAND_WIDTH = 2.2;
// A line across the gap is a window's if this share of it is marked.
const WINDOW_LINE_SHARE = 0.75;

/** Pixels darker than `below`: line work of every colour (with the default, every weight). */
export function markMask(image, below = MARK_BELOW) {
  const { data, width, height } = image;
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const brightness = 0.299 * data[index * 4] + 0.587 * data[index * 4 + 1] + 0.114 * data[index * 4 + 2];
    if (brightness < below) mask[index] = 1;
  }
  return mask;
}

const isHorizontal = (wall) => wall.a[1] === wall.b[1];
// A wall in its own frame: the line it runs on (`across`) and its extent along it.
function frame(wall) {
  const horizontal = isHorizontal(wall);
  const along = horizontal ? [wall.a[0], wall.b[0]] : [wall.a[1], wall.b[1]];
  return { horizontal, across: horizontal ? wall.a[1] : wall.a[0], lo: Math.min(...along), hi: Math.max(...along) };
}
// Image point from a wall frame position.
const point = (horizontal, along, across) => (horizontal ? [along, across] : [across, along]);

/**
 * Whether the wall's band is drawn at a point along its line (most of its middle is
 * wall pixels).
 */
function banded(along, own, thickness, isWall) {
  const half = Math.max(1, Math.round(thickness * 0.35));
  let wall = 0;
  for (let offset = -half; offset <= half; offset += 1) {
    wall += isWall(...point(own.horizontal, Math.round(along), Math.round(own.across + offset)));
  }
  return wall > half;
}

/** How wide the wall pixels at a point along a wall's line run across it. */
function bandWidth(along, own, thickness, isWall) {
  const at = (offset) => isWall(...point(own.horizontal, Math.round(along), Math.round(own.across + offset)));
  const limit = thickness * (MAX_BAND_WIDTH + 1);
  let low = 0;
  while (low < limit && at(-low - 1)) low += 1;
  let high = 0;
  while (high < limit && at(high + 1)) high += 1;
  return low + high + 1;
}

/**
 * The gaps where a wall stops short. From each free end, walks on along the wall's
 * line: past any stub too short to have been traced as a wall, across the gap, and, if
 * the band starts again before the wall it was heading for (the next stretch of the
 * same wall, or one across its path), on along that band too. [{ wall, end: "lo" |
 * "hi", target (the wall it reached, or null), kind: "collinear" | "across" | null,
 * stop (along: where the wall now ends, when it didn't reach one), from, to (along:
 * the gap's faces), across, horizontal }].
 */
function findGaps(walls, thickness, isWall) {
  const frames = new Map(walls.map((wall) => [wall, frame(wall)]));
  const near = thickness * 0.6;
  // An end is joined if a crossing wall's centre line passes through it, or another
  // stretch of the same line continues straight on.
  const joined = (wall, at) => {
    const own = frames.get(wall);
    return walls.some((other) => {
      if (other === wall) return false;
      const f = frames.get(other);
      if (f.horizontal !== own.horizontal) {
        return Math.abs(f.across - at) <= near && own.across >= f.lo - near && own.across <= f.hi + near;
      }
      return Math.abs(f.across - own.across) <= near && (Math.abs(f.lo - at) <= near || Math.abs(f.hi - at) <= near);
    });
  };
  const gaps = [];
  const seen = new Set();
  walls.forEach((wall) => {
    const own = frames.get(wall);
    [["lo", -1], ["hi", 1]].forEach(([end, step]) => {
      const at = own[end];
      if (joined(wall, at)) return;
      let best = null;
      walls.forEach((other) => {
        if (other === wall) return;
        const f = frames.get(other);
        let distance;
        let kind;
        if (f.horizontal === own.horizontal) {
          if (Math.abs(f.across - own.across) > near) return;
          distance = step > 0 ? f.lo - at : at - f.hi;
          kind = "collinear";
        } else {
          if (own.across < f.lo - near || own.across > f.hi + near) return;
          distance = (f.across - at) * step;
          kind = "across";
        }
        if (distance > 0 && (!best || distance < best.distance)) best = { other, distance, kind };
      });
      if (!best) return;
      // The walk stops at the target's face (centre lines and wall ends are half a wall
      // inside the faces).
      const limit = best.distance - thickness / 2;
      const isBand = (distance) => banded(at + step * distance, own, thickness, isWall);
      let distance = 0;
      while (distance < limit && isBand(distance)) distance += 1;
      const gapStart = distance;
      while (distance < limit && !isBand(distance)) distance += 1;
      const gapEnd = distance;
      const width = gapEnd - gapStart;
      if (width < thickness * MIN_GAP || width > thickness * MAX_GAP) return;
      // The band starting again short of the target: undetected wall, followed to its
      // end, if it is wall (not some wider block of ink the line runs into).
      let reached = gapEnd >= limit - thickness * 0.75;
      let stop = null;
      if (!reached) {
        while (distance < limit && isBand(distance)) distance += 1;
        const middle = at + step * (gapEnd + distance) / 2;
        if (bandWidth(middle, own, thickness, isWall) > thickness * MAX_BAND_WIDTH) return;
        if (distance >= limit - thickness * 0.75) reached = true;
        else stop = at + step * (distance - thickness / 2);
      }
      const target = reached ? best.other : null;
      const key = target && best.kind === "collinear" ? [walls.indexOf(wall), walls.indexOf(target)].sort().join() : null;
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      const faces = [at + step * gapStart, at + step * gapEnd];
      gaps.push({
        wall,
        end,
        target,
        kind: target ? best.kind : null,
        stop,
        from: Math.min(...faces),
        to: Math.max(...faces),
        across: own.across,
        horizontal: own.horizontal,
      });
    });
  });
  return gaps;
}

/**
 * What's drawn in a gap: "door", "window" or null (open). `marks.faint(x, y, tolerance)`
 * and `marks.firm(…)` say whether there's a mark (any, or firmly drawn) within
 * `tolerance` pixels of a point; `marks.at(x, y)` whether there's one on it.
 */
function classifyGap(gap, thickness, marks) {
  const { horizontal, across, from, to } = gap;
  const width = to - from;
  // A swing: a quarter circle from the closed leaf (along the gap) round to the open
  // one (out into the room), hinged at either jamb on either side; often with the open
  // leaf drawn as a line from the hinge, square to the wall or nearly so. The space it
  // sweeps is kept clear (that's what it's drawn for) of furniture, though a faint
  // watermark may run through it.
  const share = (points, tolerance, near = marks.faint) => points.filter(([along, off]) => near(...point(horizontal, along, off), tolerance)).length / points.length;
  const swing = (hingeAlong, towards, side, radius) => {
    const hingeAcross = across + (side * thickness) / 2;
    const at = (degrees, distance) => {
      const angle = (degrees * Math.PI) / 180;
      return [hingeAlong + towards * distance * Math.cos(angle), hingeAcross + side * distance * Math.sin(angle)];
    };
    const swept = [];
    for (let degrees = 15; degrees <= 55; degrees += 10) [0.3, 0.5, 0.7].forEach((part) => swept.push(at(degrees, radius * part)));
    if (share(swept, 1, marks.firm) > 0.2) return 0;
    // Drawn sizes are rarely exact: try the arc a little inside and outside the gap's width.
    let arc = 0;
    [0.92, 1, 1.08].forEach((scale) => {
      const points = [];
      for (let degrees = 12; degrees <= 78; degrees += 3) points.push(at(degrees, radius * scale));
      arc = Math.max(arc, share(points, Math.max(2, Math.round(radius * 0.04))));
    });
    // Leaves are often drawn shorter than the gap, and not quite square to the wall.
    let leaf = 0;
    for (let degrees = 66; degrees <= 90; degrees += 3) {
      const points = [];
      for (let part = 0.2; part <= 0.7; part += 0.05) points.push(at(degrees, radius * part));
      leaf = Math.max(leaf, share(points, 2, marks.firm));
    }
    if (leaf >= DOOR_LEAF[0] && arc >= DOOR_ARC[0]) return 2;
    return DOOR_LEAF.some((least, index) => index > 0 && leaf >= least && arc >= DOOR_ARC[index]) ? 1 : 0;
  };
  // How sure the swing is: 2 a clear leaf, 1 a fainter or missing one with more of the arc.
  let door = 0;
  [-1, 1].forEach((side) => {
    door = Math.max(door, swing(from, 1, side, width), swing(to, -1, side, width),
      // A double door: two leaves, each half the gap, hinged at both jambs.
      Math.min(swing(from, 1, side, width / 2), swing(to, -1, side, width / 2)));
  });
  if (door === 2) return "door";
  // Window lines win over a faint swing: arcs are easily matched by chance in a
  // furnished room, lines running the whole gap aren't (a door's frame can be drawn
  // that way, so a clear leaf comes first).
  if (hasWindowLines(gap, thickness, marks.at)) return "window";
  return door ? "door" : null;
}

/** Whether lines run the length of the gap inside the wall's band (glass and frame). */
function hasWindowLines({ horizontal, across, from, to }, thickness, isMarked) {
  const margin = Math.max(2, Math.round(thickness * 0.3));
  const start = Math.round(from + margin);
  const end = Math.round(to - margin);
  if (end - start < 2) return false;
  const reach = Math.round(thickness * 0.75);
  for (let offset = -reach; offset <= reach; offset += 1) {
    let marked = 0;
    for (let along = start; along < end; along += 1) {
      if (isMarked(...point(horizontal, along, Math.round(across + offset)))) marked += 1;
    }
    if (marked >= (end - start) * WINDOW_LINE_SHARE) return true;
  }
  return false;
}

/** Stretches of the same line that now overlap (both ran on through the same band) as one. */
function joinOverlapping(walls, thickness) {
  const kept = [];
  walls.forEach((wall) => {
    const f = frame(wall);
    const other = kept.find((item) => {
      const g = frame(item);
      return g.horizontal === f.horizontal && Math.abs(g.across - f.across) <= thickness * 0.6
        && Math.min(g.hi, f.hi) - Math.max(g.lo, f.lo) > 0;
    });
    if (!other) {
      kept.push(wall);
      return;
    }
    const g = frame(other);
    other.a = point(g.horizontal, Math.min(f.lo, g.lo), g.across);
    other.b = point(g.horizontal, Math.max(f.hi, g.hi), g.across);
  });
  return kept;
}

/**
 * The doors and windows in the walls' gaps: { walls (doors and windows bridged over),
 * openings: [{ type, a, b }] }. `walls`, `thickness` and `mask` are detectWalls'
 * results for the same image; the walls passed in aren't changed.
 */
export function detectOpenings(image, { walls, thickness, mask }) {
  const { width, height } = image;
  if (!walls.length || !thickness) return { walls: walls.map((wall) => ({ ...wall })), openings: [] };
  // Whether a mask has anything within `tolerance` of a point.
  const nearby = (mask) => {
    const sums = integral(mask, width, height);
    return (x, y, tolerance) => {
      const x0 = Math.max(0, Math.round(x - tolerance));
      const y0 = Math.max(0, Math.round(y - tolerance));
      const x1 = Math.min(width, Math.round(x + tolerance) + 1);
      const y1 = Math.min(height, Math.round(y + tolerance) + 1);
      if (x1 <= x0 || y1 <= y0) return false;
      const w = width + 1;
      return sums[y1 * w + x1] - sums[y0 * w + x1] - sums[y1 * w + x0] + sums[y0 * w + x0] > 0;
    };
  };
  const faint = markMask(image);
  const marks = {
    faint: nearby(faint),
    firm: nearby(markMask(image, FIRM_BELOW)),
    at: (x, y) => x >= 0 && y >= 0 && x < width && y < height && faint[y * width + x] === 1,
  };
  const isWall = (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? mask[y * width + x] : 0);

  let current = walls.map((wall) => ({ ...wall, a: [...wall.a], b: [...wall.b] }));
  const openings = [];
  const setExtent = (wall, lo, hi) => {
    const { horizontal, across } = frame(wall);
    wall.a = point(horizontal, lo, across);
    wall.b = point(horizontal, hi, across);
  };
  // Bridging a gap can bring the wall's new end to the next gap along; a few passes.
  for (let pass = 0; pass < 4; pass += 1) {
    const merged = new Set();
    let bridged = 0;
    findGaps(current, thickness, isWall).forEach((gap) => {
      if (merged.has(gap.wall) || merged.has(gap.target)) return;
      // Walls walking towards each other find the same gap from both sides.
      const repeated = openings.some((opening) => {
        const f = frame(opening);
        return f.horizontal === gap.horizontal && Math.abs(f.across - gap.across) <= thickness * 0.6
          && Math.min(f.hi, gap.to) - Math.max(f.lo, gap.from) > (gap.to - gap.from) / 2;
      });
      const type = repeated ? null : classifyGap(gap, thickness, marks);
      if (!type) return;
      openings.push({ type, a: point(gap.horizontal, gap.from, gap.across), b: point(gap.horizontal, gap.to, gap.across) });
      bridged += 1;
      const f = frame(gap.wall);
      if (gap.kind === "collinear") {
        // One wall now, from the far end of one stretch to the far end of the other.
        const g = frame(gap.target);
        setExtent(gap.wall, Math.min(f.lo, g.lo), Math.max(f.hi, g.hi));
        merged.add(gap.target);
      } else {
        // On to the centre line of the wall across its path, or the end of the band.
        const line = gap.kind === "across" ? frame(gap.target).across : gap.stop;
        setExtent(gap.wall, gap.end === "lo" ? line : f.lo, gap.end === "hi" ? line : f.hi);
      }
    });
    current = joinOverlapping(current.filter((wall) => !merged.has(wall)), thickness);
    if (!bridged) break;
  }
  return { walls: current, openings };
}
