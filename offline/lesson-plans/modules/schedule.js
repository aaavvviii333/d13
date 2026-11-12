// modules/schedule.js — the time cascade. Pure: no DOM, no state.
//
// Only `duration` and `startAnchor` are ever stored. Every start/end time is
// derived here on each render, so dragging a block, editing a duration or
// changing the anchor recomputes everything downstream for free.

/** "13:05" -> 785. Returns null for empty/garbage. */
export function parseTime(hhmm) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(hhmm || '');
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 785 -> "1:05 PM". Wraps past midnight. */
export function formatClock(mins) {
  const t = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(t / 60), m = t % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** 95 -> "1:35". Elapsed offset, not a wall clock. */
export function formatOffset(mins) {
  const sign = mins < 0 ? '-' : '';
  const t = Math.abs(mins);
  return `${sign}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** 185 -> "3h 5m". For totals. */
export function formatDuration(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * layout(schedule) -> {
 *   phases:     [{ name, total, blocks: [{ block, phaseIndex, blockIndex,
 *                                          startOffset, endOffset, startLabel, endLabel }] }],
 *   flat:       every block entry above, in run order
 *   grandTotal: minutes
 *   anchor:     minutes past midnight, or null
 *   statedTotalMinutes, mismatch
 * }
 */
export function layout(schedule) {
  const s = schedule || {};
  const anchor = parseTime(s.startAnchor);
  const flat = [];
  let offset = 0;

  const phases = (s.phases || []).map((phase, phaseIndex) => {
    let total = 0;
    const blocks = (phase.blocks || []).map((block, blockIndex) => {
      const duration = Math.max(0, Number(block.duration) || 0);
      const startOffset = offset;
      offset += duration;
      total += duration;
      const entry = {
        block, phaseIndex, blockIndex, duration,
        startOffset, endOffset: offset,
        startLabel: anchor === null ? formatOffset(startOffset) : formatClock(anchor + startOffset),
        endLabel:   anchor === null ? formatOffset(offset)      : formatClock(anchor + offset),
      };
      flat.push(entry);
      return entry;
    });
    return { name: phase.name, phaseIndex, total, blocks };
  });

  const grandTotal = offset;
  const stated = s.statedTotalMinutes == null || s.statedTotalMinutes === ''
    ? null : Number(s.statedTotalMinutes);

  return {
    phases, flat, grandTotal, anchor,
    statedTotalMinutes: stated,
    mismatch: stated !== null && stated !== grandTotal,
  };
}

/** "3h 05" / "3:05" / "185" / "3h" -> 185. null if unparseable. */
export function parseDurationInput(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return +t;
  let m = /^(\d+)\s*:\s*(\d{1,2})$/.exec(t);
  if (m) return +m[1] * 60 + +m[2];
  m = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m?)?$/i.exec(t);
  if (m && (m[1] || m[2])) return (+(m[1] || 0)) * 60 + (+(m[2] || 0));
  return null;
}
