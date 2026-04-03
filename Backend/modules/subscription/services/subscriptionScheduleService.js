/**
 * Compute next subscription meal delivery instant from admin-configured meal slot ranges.
 * Uses IANA timezone (default Asia/Kolkata) via Intl — works without extra deps.
 * Each slot is { start, end } in HH:mm (e.g. 09:00–10:00). Scheduling uses window start (2h-before flow).
 */

export const DEFAULT_MEAL_SLOT_RANGES = {
  breakfast: { start: "08:00", end: "09:00" },
  lunch: { start: "13:00", end: "14:00" },
  snacks: { start: "17:00", end: "18:00" },
  dinner: { start: "20:00", end: "21:00" },
};

const MEAL_KEYS = ["breakfast", "lunch", "snacks", "dinner"];

/** @deprecated use DEFAULT_MEAL_SLOT_RANGES */
export const DEFAULT_MEAL_SLOT_TIMES = Object.fromEntries(
  MEAL_KEYS.map((k) => [k, DEFAULT_MEAL_SLOT_RANGES[k].start]),
);

/**
 * @param {string} timeStr - "HH:mm" or "H:mm"
 * @returns {{ h: number, m: number } | null}
 */
export function parseTimeString(timeStr) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(min) || min < 0 || min > 59) {
    return null;
  }
  return { h, m: min };
}

export function minutesSinceMidnight(parsed) {
  return parsed.h * 60 + parsed.m;
}

export function addMinutesToHHmm(timeStr, addMins) {
  const p = parseTimeString(timeStr);
  if (!p) return "10:00";
  let total = p.h * 60 + p.m + addMins;
  total = Math.min(Math.max(0, total), 23 * 60 + 59);
  const h = Math.floor(total / 60);
  const mi = total % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/**
 * Normalize DB/API value to { start, end }.
 * @param {string | { start?: string, end?: string } | null | undefined} raw
 * @param {string} mealKey - for defaults
 */
export function normalizeMealSlotRange(raw, mealKey) {
  const fallback = DEFAULT_MEAL_SLOT_RANGES[mealKey] || DEFAULT_MEAL_SLOT_RANGES.lunch;
  if (raw == null) return { ...fallback };
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!parseTimeString(s)) return { ...fallback };
    return { start: s, end: addMinutesToHHmm(s, 60) };
  }
  if (typeof raw === "object") {
    let start = typeof raw.start === "string" ? raw.start.trim() : "";
    let end = typeof raw.end === "string" ? raw.end.trim() : "";
    if (!parseTimeString(start)) start = fallback.start;
    if (!parseTimeString(end)) end = addMinutesToHHmm(start, 60);
    return { start, end };
  }
  return { ...fallback };
}

/**
 * @param {number} ms - UTC instant
 * @param {string} timeZone - IANA zone
 */
export function wallClockFromUtc(ms, timeZone) {
  try {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = f.formatToParts(new Date(ms));
    const map = {};
    for (const p of parts) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    return {
      y: Number(map.year),
      mo: Number(map.month),
      d: Number(map.day),
      h: Number(map.hour),
      mi: Number(map.minute),
    };
  } catch {
    return wallClockFromUtc(ms, "UTC");
  }
}

/**
 * Find UTC ms for a given local wall-clock minute in timeZone (brute-force minute scan; fine for cron).
 */
export function utcForWallClockMinute(y, mo, d, hour, minute, timeZone) {
  const start = Date.UTC(y, mo - 1, d) - 14 * 60 * 60 * 1000;
  const end = Date.UTC(y, mo - 1, d) + 38 * 60 * 60 * 1000;
  for (let t = start; t <= end; t += 60 * 1000) {
    const w = wallClockFromUtc(t, timeZone);
    if (w.y === y && w.mo === mo && w.d === d && w.h === hour && w.mi === minute) {
      return t;
    }
  }
  return null;
}

export function addCalendarDaysFromYmd(y, mo, d, deltaDays, timeZone) {
  const noon = utcForWallClockMinute(y, mo, d, 12, 0, timeZone);
  if (noon == null) {
    const fallback = new Date(Date.UTC(y, mo - 1, d + deltaDays));
    return { y: fallback.getUTCFullYear(), mo: fallback.getUTCMonth() + 1, d: fallback.getUTCDate() };
  }
  const next = noon + deltaDays * 24 * 60 * 60 * 1000;
  const w = wallClockFromUtc(next, timeZone);
  return { y: w.y, mo: w.mo, d: w.d };
}

export function mergeMealSlotRanges(raw) {
  const out = {};
  for (const key of MEAL_KEYS) {
    out[key] = normalizeMealSlotRange(raw?.[key], key);
  }
  return out;
}

/**
 * Label for the delivery window shown to users (matches scheduled slot start when possible).
 */
export function getDeliveryWindowLabelForSubscription(items, mealSlotTimes, mealSlotTimezone, deliveryAtMs) {
  const tz = (mealSlotTimezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const wall = wallClockFromUtc(deliveryAtMs, tz);
  const ranges = mergeMealSlotRanges(mealSlotTimes);
  let cats = getMealCategoriesFromItems(items);
  if (!cats.length) cats = ["lunch"];
  for (const cat of cats) {
    const p = parseTimeString(ranges[cat].start);
    if (p && p.h === wall.h && wall.mi === p.m) {
      return formatMealSlotRangeLabel(ranges[cat], tz);
    }
  }
  const firstCat = items.find((i) => i.mealCategory)?.mealCategory || "lunch";
  return formatMealSlotRangeLabel(ranges[firstCat], tz);
}

/**
 * Unique meal categories from subscription items (non-null).
 * @param {Array<{ mealCategory?: string }>} items
 */
export function getMealCategoriesFromItems(items) {
  const set = new Set();
  for (const i of items || []) {
    if (i?.mealCategory && MEAL_KEYS.includes(i.mealCategory)) {
      set.add(i.mealCategory);
    }
  }
  return [...set];
}

/**
 * Next delivery instant strictly after `afterDate`, among slots for the subscription's meal categories.
 * Uses the **start** of each window for ordering and for `nextDeliveryAt`.
 */
export function getNextMealDeliveryAt(items, settings, afterDate) {
  const afterMs = new Date(afterDate).getTime() + 1000;
  const tz = (settings?.mealSlotTimezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const ranges = mergeMealSlotRanges(settings?.mealSlotTimes);
  let cats = getMealCategoriesFromItems(items);
  if (cats.length === 0) {
    cats = ["lunch"];
  }

  const catsSorted = [...cats].sort((a, b) => {
    const pa = parseTimeString(ranges[a].start) || { h: 12, m: 0 };
    const pb = parseTimeString(ranges[b].start) || { h: 12, m: 0 };
    return pa.h * 60 + pa.m - (pb.h * 60 + pb.m);
  });

  const startWall = wallClockFromUtc(afterMs, tz);

  for (let dayOffset = 0; dayOffset < 21; dayOffset++) {
    const { y, mo, d } = addCalendarDaysFromYmd(startWall.y, startWall.mo, startWall.d, dayOffset, tz);
    for (const cat of catsSorted) {
      const parsed = parseTimeString(ranges[cat].start);
      if (!parsed) continue;
      const utcMs = utcForWallClockMinute(y, mo, d, parsed.h, parsed.m, tz);
      if (utcMs != null && utcMs > afterMs) {
        return new Date(utcMs);
      }
    }
  }

  const fb = new Date();
  fb.setUTCDate(fb.getUTCDate() + 1);
  fb.setUTCHours(9, 0, 0, 0);
  return fb;
}

function compareWallYmd(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.mo !== b.mo) return a.mo - b.mo;
  return a.d - b.d;
}

/**
 * True if the delivery instant falls on a local calendar day after `accessEndDate` (in meal slot TZ).
 */
export function isNextDeliveryAfterAccessEnd(nextAt, accessEndDate, settings) {
  if (!nextAt || !accessEndDate) return false;
  const tz = (settings?.mealSlotTimezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const endWall = wallClockFromUtc(new Date(accessEndDate).getTime(), tz);
  const slotWall = wallClockFromUtc(new Date(nextAt).getTime(), tz);
  return compareWallYmd(slotWall, endWall) > 0;
}

/**
 * Next delivery after `afterDate`, but not on any calendar day after `accessEndDate` (inclusive last day).
 * Returns null if no slot exists before paid access ends.
 */
export function getNextMealDeliveryAtWithinAccess(items, settings, afterDate, accessEndDate) {
  if (!accessEndDate) {
    return getNextMealDeliveryAt(items, settings, afterDate);
  }
  const afterMs = new Date(afterDate).getTime() + 1000;
  const tz = (settings?.mealSlotTimezone || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const endWall = wallClockFromUtc(new Date(accessEndDate).getTime(), tz);
  const ranges = mergeMealSlotRanges(settings?.mealSlotTimes);
  let cats = getMealCategoriesFromItems(items);
  if (cats.length === 0) {
    cats = ["lunch"];
  }

  const catsSorted = [...cats].sort((a, b) => {
    const pa = parseTimeString(ranges[a].start) || { h: 12, m: 0 };
    const pb = parseTimeString(ranges[b].start) || { h: 12, m: 0 };
    return pa.h * 60 + pa.m - (pb.h * 60 + pb.m);
  });

  const startWall = wallClockFromUtc(afterMs, tz);

  for (let dayOffset = 0; dayOffset < 400; dayOffset++) {
    const { y, mo, d } = addCalendarDaysFromYmd(startWall.y, startWall.mo, startWall.d, dayOffset, tz);
    const candWall = { y, mo, d };
    if (compareWallYmd(candWall, endWall) > 0) {
      return null;
    }
    for (const cat of catsSorted) {
      const parsed = parseTimeString(ranges[cat].start);
      if (!parsed) continue;
      const utcMs = utcForWallClockMinute(y, mo, d, parsed.h, parsed.m, tz);
      if (utcMs != null && utcMs > afterMs) {
        const slotWall = wallClockFromUtc(utcMs, tz);
        if (compareWallYmd(slotWall, endWall) > 0) continue;
        return new Date(utcMs);
      }
    }
  }

  return null;
}

/**
 * Human label e.g. "9:00–10:00" (24h) for order notes.
 */
export function formatMealSlotRangeLabel(range, timeZone) {
  const r = normalizeMealSlotRange(range, "lunch");
  try {
    const today = new Date();
    const y = wallClockFromUtc(today.getTime(), timeZone).y;
    const mo = wallClockFromUtc(today.getTime(), timeZone).mo;
    const d = wallClockFromUtc(today.getTime(), timeZone).d;
    const fmt = (hhmm) => {
      const p = parseTimeString(hhmm);
      if (!p) return hhmm;
      const utc = utcForWallClockMinute(y, mo, d, p.h, p.m, timeZone);
      if (utc == null) return hhmm;
      return new Intl.DateTimeFormat("en-IN", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(utc));
    };
    return `${fmt(r.start)} – ${fmt(r.end)}`;
  } catch {
    return `${r.start}–${r.end}`;
  }
}

function validateRangeObject(key, val) {
  if (val == null) return { ok: true, skip: true };
  if (typeof val === "string") {
    const s = val.trim();
    if (!parseTimeString(s)) {
      return { ok: false, message: `Invalid time for ${key}; use HH:mm (24h)` };
    }
    return { ok: true, normalized: { start: s, end: addMinutesToHHmm(s, 60) } };
  }
  if (typeof val !== "object") {
    return { ok: false, message: `Invalid meal slot for ${key}` };
  }
  const start = val.start != null ? String(val.start).trim() : "";
  const end = val.end != null ? String(val.end).trim() : "";
  if (!parseTimeString(start)) {
    return { ok: false, message: `Invalid start time for ${key}; use HH:mm (24h)` };
  }
  if (!parseTimeString(end)) {
    return { ok: false, message: `Invalid end time for ${key}; use HH:mm (24h)` };
  }
  const ms = minutesSinceMidnight(parseTimeString(start));
  const me = minutesSinceMidnight(parseTimeString(end));
  if (me < ms) {
    return { ok: false, message: `End time must be after start for ${key}` };
  }
  if (me === ms) {
    return { ok: false, message: `End time must be after start for ${key}` };
  }
  return { ok: true, normalized: { start, end } };
}

/**
 * Validate PUT body.mealSlotTimes — values may be { start, end } or legacy string.
 */
export function validateMealSlotTimesPayload(body) {
  if (!body || typeof body !== "object") return { ok: false, message: "Invalid body" };
  const out = {};
  for (const key of MEAL_KEYS) {
    if (body[key] == null) continue;
    const v = validateRangeObject(key, body[key]);
    if (!v.ok) return { ok: false, message: v.message };
    if (v.skip) continue;
    out[key] = v.normalized;
  }
  return { ok: true, partial: out };
}
