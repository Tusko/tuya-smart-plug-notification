# ICS Calendar Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live, subscribable `GET /calendar/:groupId.ics` endpoint that returns a per-group power-outage calendar (Today + Tomorrow) that Google/Apple/Outlook can subscribe to.

**Architecture:** A pure, hand-rolled ICS text builder in a new `src/utils/ics.js` turns parsed schedule groups into a `VCALENDAR` string. A new route in `src/api.js` fetches the live schedule via the existing `fetchScheduleMenu`, parses Today/Tomorrow with the existing `parseScheduleHtml`, picks out the requested group, and hands the matched groups to the builder. Times are emitted in UTC (with a `Z` suffix) converted from `Europe/Kiev`, so no `VTIMEZONE` component is needed and every calendar client renders the correct absolute time.

**Tech Stack:** Plain JS (ESM), Hono (routing, already a dependency), `dayjs` + its `utc`/`timezone`/`customParseFormat` plugins (already dependencies), Node's built-in `node:test` / `node:assert` for tests.

**Scope note:** This plan implements spec section 4 of `docs/superpowers/specs/2026-07-01-blackout-notifications-design.md`. Sections 1–3 (the `fetchScheduleMenu` helper, the `parseScheduleHtml` power/outage fix, and the `buildMyGroupMessage` notification fix) are already implemented and committed on this branch — this plan consumes them, it does not modify them.

## Global Constraints

- No new npm dependencies — use `dayjs` (already present) for date/time, and Node's built-in `node:test` / `node:assert` for tests.
- The schedule group shape produced by `parseScheduleHtml` (already on this branch) is exactly: `{ id: string, date: string|null, status: "power"|"outage", schedule: string }` where `date` is `"DD.MM.YYYY"` and `schedule` is a comma-separated list of `"HH:MM-HH:MM"` ranges (empty string when `status === "power"`).
- Timezone string used throughout the existing codebase is `"Europe/Kiev"` (the tzdata alias of Europe/Kyiv) — match it exactly, do not introduce `"Europe/Kyiv"`.
- Outage VEVENT title: `Група {groupId} Відключення світла`. Power all-day VEVENT title: `Група {groupId} Світло НЕ відключається`. Calendar name (`X-WR-CALNAME` and `NAME`): `Група {groupId} Відключення світла`. Copy these Ukrainian strings verbatim.
- VALARM on outage events: display alarm, 30 minutes before (`TRIGGER:-PT30M`).
- Response `Content-Type: text/calendar; charset=utf-8`. Upstream schedule-API failure → `502` plain text. Unknown/missing group → a valid but empty `VCALENDAR` (HTTP 200), not an error.
- ICS lines are joined with CRLF (`\r\n`), per RFC 5545.

---

## File Structure

- **Create:** `src/utils/ics.js` — pure ICS-string builder. Exports `generateIcs({ groupId, groups, now })`. No network, no `env`, no Hono. One responsibility: parsed groups → `VCALENDAR` string.
- **Create:** `test/ics.test.js` — unit tests for `generateIcs` (pure-function tests, fast and deterministic via an injected `now`).
- **Modify:** `src/api.js` — add the `GET /calendar/:file` route that wires `fetchScheduleMenu` + `parseScheduleHtml` + `generateIcs` together.
- **Modify:** `test/smart-plug.test.js` — append an integration test that drives the route via `app.request(...)` with a mocked `globalThis.fetch`.

---

### Task 1: ICS builder — `src/utils/ics.js`

**Files:**
- Create: `src/utils/ics.js`
- Test: `test/ics.test.js`

**Interfaces:**
- Consumes: parsed group objects shaped `{ id, date: "DD.MM.YYYY", status: "power"|"outage", schedule: "HH:MM-HH:MM, ..." }` (from `parseScheduleHtml`, already on this branch).
- Produces: `export function generateIcs({ groupId, groups, now })` → returns a `string` (a full `BEGIN:VCALENDAR ... END:VCALENDAR` document, CRLF-joined).
  - `groupId`: string like `"1.1"`.
  - `groups`: array of the matched group object for each day that had data (0, 1, or 2 entries). May be empty.
  - `now`: a `dayjs` instance used only for the `DTSTAMP` field (injected so tests are deterministic).

- [ ] **Step 1: Write the failing test**

Create `test/ics.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import { generateIcs } from "../src/utils/ics.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

// Fixed DTSTAMP so output is deterministic. 2026-07-01 12:00 UTC.
const NOW = dayjs.utc("2026-07-01T12:00:00Z");

function lines(ics) {
  return ics.split("\r\n");
}

test("generateIcs wraps events in a VCALENDAR with the group's calendar name", () => {
  const ics = generateIcs({ groupId: "1.1", groups: [], now: NOW });
  const L = lines(ics);
  assert.equal(L[0], "BEGIN:VCALENDAR");
  assert.equal(L[L.length - 1], "END:VCALENDAR");
  assert.ok(ics.includes("X-WR-CALNAME:Група 1.1 Відключення світла"));
  assert.ok(ics.includes("NAME:Група 1.1 Відключення світла"));
  // No events for an empty groups array
  assert.ok(!ics.includes("BEGIN:VEVENT"));
});

test("generateIcs emits a timed VEVENT with a 30-min alarm for an outage range", () => {
  const groups = [
    { id: "1.1", date: "01.07.2026", status: "outage", schedule: "17:00-19:30" },
  ];
  const ics = generateIcs({ groupId: "1.1", groups, now: NOW });

  assert.ok(ics.includes("BEGIN:VEVENT"));
  assert.ok(ics.includes("SUMMARY:Група 1.1 Відключення світла"));
  // 17:00 Kyiv (summer, UTC+3) = 14:00 UTC; 19:30 Kyiv = 16:30 UTC
  assert.ok(ics.includes("DTSTART:20260701T140000Z"));
  assert.ok(ics.includes("DTEND:20260701T163000Z"));
  assert.ok(ics.includes("TRANSP:TRANSPARENT"));
  assert.ok(ics.includes("BEGIN:VALARM"));
  assert.ok(ics.includes("TRIGGER:-PT30M"));
  assert.ok(ics.includes("ACTION:DISPLAY"));
  // Stable UID keyed by group/date/range
  assert.ok(ics.includes("UID:1.1-01.07.2026-1700-1930@loe-blackouts"));
});

test("generateIcs emits one VEVENT per comma-separated range", () => {
  const groups = [
    {
      id: "5.1",
      date: "01.07.2026",
      status: "outage",
      schedule: "00:00-06:00, 11:00-15:00",
    },
  ];
  const ics = generateIcs({ groupId: "5.1", groups, now: NOW });
  const count = ics.split("BEGIN:VEVENT").length - 1;
  assert.equal(count, 2);
});

test("generateIcs handles an overnight range that ends past midnight", () => {
  const groups = [
    { id: "3.1", date: "01.07.2026", status: "outage", schedule: "21:30-24:00" },
  ];
  const ics = generateIcs({ groupId: "3.1", groups, now: NOW });
  // 21:30 Kyiv = 18:30 UTC on 01 Jul; 24:00 -> 00:00 next day Kyiv = 21:00 UTC on 01 Jul
  assert.ok(ics.includes("DTSTART:20260701T183000Z"));
  assert.ok(ics.includes("DTEND:20260701T210000Z"));
});

test("generateIcs emits an all-day VEVENT for a power (no-outage) day", () => {
  const groups = [
    { id: "2.1", date: "01.07.2026", status: "power", schedule: "" },
  ];
  const ics = generateIcs({ groupId: "2.1", groups, now: NOW });

  assert.ok(ics.includes("SUMMARY:Група 2.1 Світло НЕ відключається"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20260701"));
  assert.ok(ics.includes("DTEND;VALUE=DATE:20260702"));
  assert.ok(!ics.includes("BEGIN:VALARM")); // no alarm on all-day power event
  assert.ok(ics.includes("UID:2.1-01.07.2026-power@loe-blackouts"));
});

test("generateIcs combines Today and Tomorrow groups into one calendar", () => {
  const groups = [
    { id: "1.1", date: "01.07.2026", status: "outage", schedule: "17:00-19:30" },
    { id: "1.1", date: "02.07.2026", status: "power", schedule: "" },
  ];
  const ics = generateIcs({ groupId: "1.1", groups, now: NOW });
  const count = ics.split("BEGIN:VEVENT").length - 1;
  assert.equal(count, 2);
  assert.ok(ics.includes("DTSTART:20260701T140000Z"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20260702"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ics.test.js`
Expected: FAIL — `generateIcs` is not exported from `src/utils/ics.js` (module not found / undefined).

- [ ] **Step 3: Implement `src/utils/ics.js`**

Create `src/utils/ics.js`:

```js
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

// dayjs.extend is idempotent and global; extend here so this module works
// regardless of import order relative to smart-plug.js.
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const TZ = "Europe/Kiev";

/**
 * Escape a text value for an ICS property per RFC 5545 (backslash, semicolon,
 * comma, and newlines). Group titles here are simple, but escape defensively.
 * @param {string} text
 * @returns {string}
 */
function escapeText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Format a Kyiv-local wall-clock datetime as a UTC ICS timestamp (…Z).
 * @param {string} date - "DD.MM.YYYY"
 * @param {string} time - "HH:MM"
 * @returns {dayjs.Dayjs} a dayjs instance in UTC
 */
function kyivToUtc(date, time) {
  return dayjs.tz(`${date} ${time}`, "DD.MM.YYYY HH:mm", TZ).utc();
}

/**
 * Build the VEVENT lines for a single outage time range.
 * @param {string} groupId
 * @param {string} date - "DD.MM.YYYY"
 * @param {string} range - "HH:MM-HH:MM"
 * @returns {string[]} ICS lines, or [] if the range can't be parsed
 */
function outageEventLines(groupId, date, range) {
  const parts = range.split("-").map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return [];
  }
  const [startTime, endTime] = parts;

  const start = kyivToUtc(date, startTime);

  // LOE writes end-of-day as "24:00", which dayjs won't reliably parse.
  // Normalize it to 00:00 and force the +1-day roll below.
  const endIsMidnight = endTime === "24:00";
  const parsedEndTime = endIsMidnight ? "00:00" : endTime;
  let end = kyivToUtc(date, parsedEndTime);

  // Handle end-of-day / overnight ranges (e.g. 21:30-24:00 or 23:00-01:00):
  // "24:00" always rolls; otherwise roll when the end is at or before the start.
  if (endIsMidnight || !end.isAfter(start)) {
    end = kyivToUtc(date, parsedEndTime).add(1, "day");
  }

  if (!start.isValid() || !end.isValid()) {
    return [];
  }

  const fmt = (d) => d.format("YYYYMMDDTHHmmss") + "Z";
  // UID must be stable so re-fetches update rather than duplicate; strip ":".
  const uid = `${groupId}-${date}-${startTime.replace(":", "")}-${endTime.replace(":", "")}@loe-blackouts`;

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escapeText(`Група ${groupId} Відключення світла`)}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Відключення світла скоро почнеться",
    "TRIGGER:-PT30M",
    "END:VALARM",
    "END:VEVENT",
  ];
}

/**
 * Build the VEVENT lines for an all-day "no outage" (power) day.
 * @param {string} groupId
 * @param {string} date - "DD.MM.YYYY"
 * @returns {string[]} ICS lines, or [] if the date can't be parsed
 */
function powerEventLines(groupId, date) {
  const day = dayjs.tz(date, "DD.MM.YYYY", TZ);
  if (!day.isValid()) {
    return [];
  }
  const startDate = day.format("YYYYMMDD");
  const endDate = day.add(1, "day").format("YYYYMMDD");
  const uid = `${groupId}-${date}-power@loe-blackouts`;

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${startDate}`,
    `DTEND;VALUE=DATE:${endDate}`,
    `SUMMARY:${escapeText(`Група ${groupId} Світло НЕ відключається`)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

/**
 * Build a full VCALENDAR string for one group across the given day-groups.
 * @param {object} params
 * @param {string} params.groupId - e.g. "1.1"
 * @param {Array<{id,date,status,schedule}>} params.groups - matched group per day (0-2)
 * @param {dayjs.Dayjs} params.now - timestamp for DTSTAMP (injected for determinism)
 * @returns {string} CRLF-joined ICS document
 */
export function generateIcs({ groupId, groups, now }) {
  const calName = `Група ${groupId} Відключення світла`;
  const dtstamp = now.utc().format("YYYYMMDDTHHmmss") + "Z";

  const eventLines = [];
  for (const group of groups) {
    if (!group || !group.date) {
      continue;
    }
    if (group.status === "power") {
      eventLines.push(...powerEventLines(groupId, group.date));
      continue;
    }
    // outage: one event per comma-separated range
    const ranges = group.schedule
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    for (const range of ranges) {
      eventLines.push(...outageEventLines(groupId, group.date, range));
    }
  }

  // Inject DTSTAMP into every VEVENT (required by RFC 5545).
  const withStamps = [];
  for (const line of eventLines) {
    withStamps.push(line);
    if (line === "BEGIN:VEVENT") {
      withStamps.push(`DTSTAMP:${dtstamp}`);
    }
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//smart-plug//loe-blackouts//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
    `NAME:${escapeText(calName)}`,
    ...withStamps,
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ics.test.js`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS — the existing 9 tests plus the 6 new ones (15 total), 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/utils/ics.js test/ics.test.js
git commit -m "feat: add ICS calendar builder for per-group outage schedule"
```

---

### Task 2: Calendar route — `GET /calendar/:file`

**Files:**
- Modify: `src/api.js` (add a new route; add one import)
- Test: `test/smart-plug.test.js` (append an integration test)

**Interfaces:**
- Consumes:
  - `fetchScheduleMenu(env)` from `./smart-plug.js` — returns the `menuItems` array (already on this branch).
  - `parseScheduleHtml(rawHtml)` from `./smart-plug.js` — returns `{ groups, date }` (already on this branch).
  - `generateIcs({ groupId, groups, now })` from `./utils/ics.js` (Task 1).
- Produces: an HTTP route `GET /calendar/:file`. `:file` is the last path segment, e.g. `1.1.ics`. Responds `text/calendar` (200), `502` on upstream failure, or an empty calendar (200) for an unknown group. Malformed group id → `404`.

- [ ] **Step 1: Write the failing test**

Append to `test/smart-plug.test.js` (the file already imports `test`, `assert`, and defines `SAMPLE_MENUS_RESPONSE` / `mockFetchOnce` — reuse them; add the new imports at the top of the file next to the existing ones):

```js
import app from "../src/api.js";
import dayjs from "dayjs";

// Menu payload whose Today group 1.1 has an outage and group 2.1 has power.
const CALENDAR_MENUS_RESPONSE = [
  {
    id: 9,
    type: "photo-grafic",
    menuItems: [
      {
        name: "Today",
        imageUrl: "/media/today.png",
        rawHtml:
          "<div><p><b>Графік погодинних відключень на 01.07.2026</b></p>" +
          "<p>Група 1.1. Електроенергії немає з 17:00 до 19:30.</p>" +
          "<p>Група 2.1. Електроенергія є.</p></div>",
      },
      { name: "Tomorrow", imageUrl: "", rawHtml: "" },
    ],
  },
];

test("GET /calendar/:groupId.ics returns a text/calendar outage event", async () => {
  mockFetchOnce(CALENDAR_MENUS_RESPONSE);

  const res = await app.request("/calendar/1.1.ics", {}, { SCHEDULE_API_URL: "https://api.loe.lviv.ua" });

  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/calendar/);
  const body = await res.text();
  assert.ok(body.startsWith("BEGIN:VCALENDAR"));
  assert.ok(body.includes("SUMMARY:Група 1.1 Відключення світла"));
  assert.ok(body.includes("DTSTART:20260701T140000Z"));
});

test("GET /calendar/:groupId.ics returns an empty calendar for an unknown group", async () => {
  mockFetchOnce(CALENDAR_MENUS_RESPONSE);

  const res = await app.request("/calendar/9.9.ics", {}, { SCHEDULE_API_URL: "https://api.loe.lviv.ua" });

  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(body.includes("BEGIN:VCALENDAR"));
  assert.ok(!body.includes("BEGIN:VEVENT"));
});

test("GET /calendar/:file returns 404 for a malformed group id", async () => {
  mockFetchOnce(CALENDAR_MENUS_RESPONSE);

  const res = await app.request("/calendar/notagroup.ics", {}, { SCHEDULE_API_URL: "https://api.loe.lviv.ua" });

  assert.equal(res.status, 404);
});

test("GET /calendar/:groupId.ics returns 502 when the schedule API fails", async () => {
  mockFetchOnce({}, false); // non-ok response -> fetchScheduleMenu throws

  const res = await app.request("/calendar/1.1.ics", {}, { SCHEDULE_API_URL: "https://api.loe.lviv.ua" });

  assert.equal(res.status, 502);
});
```

Note: `app.request(path, requestInit, env)` — Hono's third argument becomes `c.env` inside the handler, which is how `SCHEDULE_API_URL` reaches `fetchScheduleMenu`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/smart-plug.test.js`
Expected: FAIL — no `/calendar/:file` route exists yet, so the requests hit the `.notFound` handler; the outage-event assertions fail (200/`text/calendar`/`SUMMARY` not present).

- [ ] **Step 3: Implement the route in `src/api.js`**

Add these imports at the top of `src/api.js`, next to the existing imports:

```js
import { fetchScheduleMenu, parseScheduleHtml } from "./smart-plug.js";
import { generateIcs } from "./utils/ics.js";
import dayjs from "dayjs";
```

Then add this route (place it after the existing `app.get("/no-render", ...)` block and before `export default app;`):

```js
/**
 * GET /calendar/:file  (e.g. /calendar/1.1.ics)
 * Live, subscribable ICS feed of a single group's Today+Tomorrow outages.
 */
app.get("/calendar/:file", async (c) => {
  const file = c.req.param("file");
  const groupId = file.replace(/\.ics$/, "");

  // Only accept well-formed group ids like "1.1" / "5.2"; anything else is a
  // bad path, not an empty schedule.
  if (!/^\d+\.\d+$/.test(groupId)) {
    return c.text("🙈 Not found", 404);
  }

  let menuItems;
  try {
    menuItems = await fetchScheduleMenu(c.env);
  } catch (err) {
    const logger = createLogger(c.env);
    logger.error("Calendar: schedule fetch failed:", err);
    return c.text("Schedule API unavailable", 502);
  }

  // Collect the requested group from Today and Tomorrow (skip missing days).
  const dayItems = ["Today", "Tomorrow"]
    .map((name) => menuItems?.find((m) => m.name === name))
    .filter((item) => item && item.rawHtml);

  const groups = [];
  for (const item of dayItems) {
    const { groups: dayGroups } = parseScheduleHtml(item.rawHtml);
    const myGroup = dayGroups.find((g) => g.id === groupId);
    if (myGroup) {
      groups.push(myGroup);
    }
  }

  const ics = generateIcs({ groupId, groups, now: dayjs() });

  return c.body(ics, 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `inline; filename="group-${groupId}.ics"`,
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/smart-plug.test.js`
Expected: PASS — all tests in the file green (the 9 existing plus the 4 new calendar tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS — 19 tests total (9 original + 6 from Task 1 + 4 here), 0 failures.

- [ ] **Step 6: Manual smoke test against the live API**

Run the route logic against real data without Tuya/Firebase by exercising the pieces directly:

```bash
node -e '
import("./src/smart-plug.js").then(async (sp) => {
  const ics = await import("./src/utils/ics.js");
  const dayjs = (await import("dayjs")).default;
  const menuItems = await sp.fetchScheduleMenu({ SCHEDULE_API_URL: "https://api.loe.lviv.ua" });
  const groups = [];
  for (const name of ["Today", "Tomorrow"]) {
    const item = menuItems.find((m) => m.name === name);
    if (!item || !item.rawHtml) continue;
    const myGroup = sp.parseScheduleHtml(item.rawHtml).groups.find((g) => g.id === "1.1");
    if (myGroup) groups.push(myGroup);
  }
  console.log(ics.generateIcs({ groupId: "1.1", groups, now: dayjs() }));
}).catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
'
```

Expected: a printed `BEGIN:VCALENDAR ... END:VCALENDAR` document for group 1.1 reflecting today's real schedule. Paste the `DTSTART`/`SUMMARY` lines into the report. (If the group has an outage today, expect a timed `VEVENT` with a `VALARM`; if it has power all day, expect an all-day `VEVENT`.)

- [ ] **Step 7: Commit**

```bash
git add src/api.js test/smart-plug.test.js
git commit -m "feat: add GET /calendar/:groupId.ics subscribable feed"
```
