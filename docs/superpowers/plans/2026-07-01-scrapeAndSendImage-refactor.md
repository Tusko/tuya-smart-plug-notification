# scrapeAndSendImage Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `scrapeAndSendImage` in `src/smart-plug.js` so it (a) fetches the schedule via the robust `type=photo-grafic` discovery endpoint instead of a hardcoded menu ID, and (b) always produces a correct message for the configured `SCHEDULE_ID` group — including when that group has no outage — instead of the misleading "no data" fallback.

**Architecture:** Two small pure helpers (`fetchScheduleMenu`, `buildMyGroupMessage`) get extracted and unit-tested with Node's built-in test runner, and `parseScheduleHtml`'s regex is widened to capture every group (not just outage groups). All three get wired into the existing `scrapeAndSendImage` function with minimal surrounding changes.

**Tech Stack:** Plain JS (ESM), Node's built-in `node:test` + `node:assert` (no new npm dependency), Cloudflare Workers runtime (`dayjs`, native `fetch`).

**Scope note:** This plan covers spec sections 1–3 of `docs/superpowers/specs/2026-07-01-blackout-notifications-design.md` (shared fetch helper, parser fix, message-building fix). The ICS calendar endpoint (spec section 4) is a separate follow-up plan.

## Global Constraints

- No new npm dependencies — use Node's built-in `node:test` / `node:assert` for unit tests (project has zero test infra today; adding a framework like vitest is out of scope for this fix).
- `SCHEDULE_API_URL` default stays `https://api.loe.lviv.ua` (unchanged).
- No Firestore schema changes — `groups` array shape changes (`status` field values), but `saveGroupsState`/`getLatestGroupsState` in `src/utils/db.js` store/read raw JSON with no shape assumptions, so no `db.js` changes needed.
- Keep the 10-second `AbortController` timeout behavior on the schedule API fetch, matching current behavior.
- Ukrainian message text must match exactly: `Група {SCHEDULE_ID}: відключень немає` for the no-outage case (per approved spec).

---

## File Structure

- **Modify:** `src/smart-plug.js` — add `fetchScheduleMenu`, fix `parseScheduleHtml`, add `buildMyGroupMessage`, wire all three into `scrapeAndSendImage`.
- **Create:** `test/smart-plug.test.js` — unit tests for the three functions above, added incrementally across tasks.
- **Modify:** `package.json` — add a `"test"` script.

---

### Task 1: Shared `fetchScheduleMenu` helper + wire into `scrapeAndSendImage`

**Files:**
- Modify: `src/smart-plug.js:375-421` (inside `scrapeAndSendImage`, plus a new function inserted just above it)
- Create: `test/smart-plug.test.js`
- Modify: `package.json:11-18` (scripts block)

**Interfaces:**
- Produces: `export async function fetchScheduleMenu(env)` — takes `env` (needs `env.SCHEDULE_API_URL`), returns `Promise<Array>` (the `menuItems` array), throws on network/timeout/shape errors.
- Consumes (Task 3 will reuse): nothing new from earlier tasks.

- [ ] **Step 1: Add the `test` script to `package.json`**

Edit `package.json`, in the `"scripts"` block add:

```json
    "test": "node --test test/",
```

so the full scripts block reads:

```json
  "scripts": {
    "dev": "wrangler dev -e=dev",
    "deploy": "wrangler deploy -e=production",
    "preview": "wrangler dev --remote",
    "tail": "wrangler tail",
    "clean": "rm -rf node_modules .wrangler dist",
    "update": "yarn upgrade-interactive",
    "test": "node --test test/"
  },
```

- [ ] **Step 2: Write the failing test**

Create `test/smart-plug.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchScheduleMenu } from "../src/smart-plug.js";

const SAMPLE_MENUS_RESPONSE = {
  "@context": "/api/contexts/Menu",
  "@id": "/api/menus",
  "@type": "hydra:Collection",
  "hydra:member": [
    {
      "@id": "/api/menus/9",
      "@type": "Menu",
      id: 9,
      name: "Чому немає світла (Зображення-графік)",
      type: "photo-grafic",
      menuItems: [
        { "@id": "/api/menu_items/238", name: "Today", imageUrl: "/media/today.png", rawHtml: "<div></div>" },
        { "@id": "/api/menu_items/239", name: "Tomorrow", imageUrl: "", rawHtml: "" },
      ],
    },
  ],
};

function mockFetchOnce(jsonBody, ok = true) {
  globalThis.fetch = async () => ({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Internal Server Error",
    json: async () => jsonBody,
  });
}

test("fetchScheduleMenu returns menuItems from the photo-grafic menu", async () => {
  mockFetchOnce(SAMPLE_MENUS_RESPONSE);

  const menuItems = await fetchScheduleMenu({ SCHEDULE_API_URL: "https://api.loe.lviv.ua" });

  assert.equal(menuItems.length, 2);
  assert.equal(menuItems[0].name, "Today");
  assert.equal(menuItems[1].name, "Tomorrow");
});

test("fetchScheduleMenu throws when no photo-grafic menu is present", async () => {
  mockFetchOnce({ "hydra:member": [{ type: "some-other-type", menuItems: [] }] });

  await assert.rejects(
    () => fetchScheduleMenu({ SCHEDULE_API_URL: "https://api.loe.lviv.ua" }),
    /No photo-grafic menu found/,
  );
});

test("fetchScheduleMenu throws on non-ok response", async () => {
  mockFetchOnce({}, false);

  await assert.rejects(
    () => fetchScheduleMenu({ SCHEDULE_API_URL: "https://api.loe.lviv.ua" }),
    /Schedule API returned 500/,
  );
});
```

- [ ] **Step 2b: Run test to verify it fails**

Run: `node --test test/smart-plug.test.js`
Expected: FAIL — `fetchScheduleMenu` is not exported from `src/smart-plug.js` (import error / undefined is not a function).

- [ ] **Step 3: Implement `fetchScheduleMenu` and wire it into `scrapeAndSendImage`**

In `src/smart-plug.js`, insert this new function directly above `async function scrapeAndSendImage(telegramBotToken, chatIds, env) {` (currently line 375):

```js
export async function fetchScheduleMenu(env) {
  const logger = createLogger(env);
  const scheduleApiUrl = env.SCHEDULE_API_URL || "https://api.loe.lviv.ua";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response;
  try {
    response = await fetch(
      `${scheduleApiUrl}/api/menus?page=1&type=photo-grafic`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Schedule API request timed out after 10 seconds");
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(
      `Schedule API returned ${response.status}: ${response.statusText}`,
    );
  }

  const data = await response.json();
  const menu = data["hydra:member"]?.find((m) => m.type === "photo-grafic");

  if (!menu) {
    logger.warn("No photo-grafic menu found in schedule API response");
    throw new Error("No photo-grafic menu found in schedule API response");
  }

  return menu.menuItems;
}

```

Then, inside `scrapeAndSendImage`, replace this block (currently lines 387-421):

```js
  const scheduleApiUrl = env.SCHEDULE_API_URL || "https://api.loe.lviv.ua";

  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  let response;
  try {
    response = await fetch(`${scheduleApiUrl}/api/menus/9`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      logger.error("Schedule API request timed out");
      throw new Error("Schedule API request timed out after 10 seconds");
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Schedule API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  // logger.info("Schedule API response:", data);

  const menuItems = data.menuItems;
  const tomorrowItem = menuItems?.find(({ name }) => name === "Tomorrow");
```

with:

```js
  const scheduleApiUrl = env.SCHEDULE_API_URL || "https://api.loe.lviv.ua";

  const menuItems = await fetchScheduleMenu(env);
  const tomorrowItem = menuItems?.find(({ name }) => name === "Tomorrow");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/smart-plug.test.js`
Expected: PASS — all 3 tests in the file green.

- [ ] **Step 5: Manual verification against the live schedule API**

Run: `yarn dev`
Then: `curl http://localhost:8787/no-render`
Expected: JSON response with `success: true` and a populated `latestStatus` — confirms the new discovery-endpoint fetch produces the same usable `menuItems` shape the rest of the function expects (no regression from removing the hardcoded `/api/menus/9` call).

- [ ] **Step 6: Commit**

```bash
git add src/smart-plug.js test/smart-plug.test.js package.json
git commit -m "refactor: fetch schedule via type=photo-grafic discovery endpoint"
```

---

### Task 2: Fix `parseScheduleHtml` to capture power (no-outage) groups

**Files:**
- Modify: `src/smart-plug.js:70-120` (`parseScheduleHtml`)
- Modify: `test/smart-plug.test.js` (append tests)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `export function parseScheduleHtml(rawHtml)` returns `{ groups: Array<{ id: string, date: string|null, status: "power"|"outage", schedule: string }>, date: string|null }`. Every group present in the source HTML now appears in `groups` — Task 3 relies on `status` being `"power"` or `"outage"` for every returned group.

- [ ] **Step 1: Write the failing test**

Append to `test/smart-plug.test.js`:

```js
import { parseScheduleHtml } from "../src/smart-plug.js";

const SAMPLE_RAW_HTML =
  "<div><p><b>Графік погодинних відключень на 01.07.2026</b></p>\n" +
  "<p><b>Інформація станом на 19:05 30.06.2026</b></p>\n" +
  "<p>Група 1.1. Електроенергії немає з 17:00 до 19:30.</p>\n" +
  "<p>Група 1.2. Електроенергії немає з 19:30 до 22:00.</p>\n" +
  "<p>Група 2.1. Електроенергія є.</p>\n" +
  "<p>Група 2.2. Електроенергія є.</p>\n" +
  "<p>Група 5.1. Електроенергії немає з 00:00 до 06:00, з 11:00 до 15:00.</p>\n" +
  "</div>";

test("parseScheduleHtml captures both power and outage groups", () => {
  const { groups, date } = parseScheduleHtml(SAMPLE_RAW_HTML);

  assert.equal(date, "01.07.2026");
  assert.equal(groups.length, 5);

  const g11 = groups.find((g) => g.id === "1.1");
  assert.deepEqual(g11, { id: "1.1", date: "01.07.2026", status: "outage", schedule: "17:00-19:30" });

  const g21 = groups.find((g) => g.id === "2.1");
  assert.deepEqual(g21, { id: "2.1", date: "01.07.2026", status: "power", schedule: "" });

  const g51 = groups.find((g) => g.id === "5.1");
  assert.deepEqual(g51, {
    id: "5.1",
    date: "01.07.2026",
    status: "outage",
    schedule: "00:00-06:00, 11:00-15:00",
  });
});

test("parseScheduleHtml returns empty groups for missing rawHtml", () => {
  assert.deepEqual(parseScheduleHtml(null), { groups: [], date: null });
  assert.deepEqual(parseScheduleHtml(""), { groups: [], date: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/smart-plug.test.js`
Expected: FAIL — `parseScheduleHtml` is not exported yet, and even once exported the current regex would only find 3 groups (1.1, 1.2, 5.1), missing 2.1 and 2.2, and `status` would be the literal string `"Електроенергії немає"` instead of `"outage"`.

- [ ] **Step 3: Implement the fix**

In `src/smart-plug.js`, replace the current `parseScheduleHtml` function (lines 70-120):

```js
function parseScheduleHtml(rawHtml) {
  if (!rawHtml) {
    return { groups: [], date: null };
  }

  // Decode HTML entities
  const decodedHtml = rawHtml
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\n/g, "\n");

  // Extract date from first paragraph (e.g., "Графік погодинних відключень на 17.01.2026")
  // Try to find date in format DD.MM.YYYY after "на" or "Графік"
  const dateMatch = decodedHtml.match(
    /(?:Графік|на)\s+[^]*?(\d{2}\.\d{2}\.\d{4})/,
  );
  const date = dateMatch ? dateMatch[1] : null;

  const groups = [];

  // Extract group information from paragraphs
  // Pattern: "Група X.X. Електроенергії немає з HH:MM до HH:MM, з HH:MM до HH:MM."
  const groupPattern =
    /Група\s+(\d+\.\d+)\.\s+Електроенергії\s+немає\s+(.+?)\./g;
  let match;

  while ((match = groupPattern.exec(decodedHtml)) !== null) {
    const groupId = match[1];
    const scheduleText = match[2];

    // Parse time ranges (e.g., "з 00:00 до 06:00, з 11:00 до 15:00")
    const timeRanges = [];
    const timePattern = /з\s+(\d{2}:\d{2})\s+до\s+(\d{2}:\d{2})/g;
    let timeMatch;

    while ((timeMatch = timePattern.exec(scheduleText)) !== null) {
      const startTime = timeMatch[1];
      const endTime = timeMatch[2];
      timeRanges.push(`${startTime}-${endTime}`);
    }

    groups.push({
      id: groupId,
      date: date,
      status: "Електроенергії немає",
      schedule: timeRanges.join(", "),
    });
  }

  return { groups, date };
}
```

with:

```js
export function parseScheduleHtml(rawHtml) {
  if (!rawHtml) {
    return { groups: [], date: null };
  }

  // Decode HTML entities
  const decodedHtml = rawHtml
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\n/g, "\n");

  // Extract date from first paragraph (e.g., "Графік погодинних відключень на 17.01.2026")
  // Try to find date in format DD.MM.YYYY after "на" or "Графік"
  const dateMatch = decodedHtml.match(
    /(?:Графік|на)\s+[^]*?(\d{2}\.\d{2}\.\d{4})/,
  );
  const date = dateMatch ? dateMatch[1] : null;

  const groups = [];

  // Every group sentence is either "Група X.X. Електроенергія є." (power,
  // no outage) or "Група X.X. Електроенергії немає з HH:MM до HH:MM(, з HH:MM
  // до HH:MM)*." Both branches must be captured — a group with power all day
  // otherwise silently disappears from `groups` and reads downstream as
  // "group not found in schedule".
  const groupPattern =
    /Група\s+(\d+\.\d+)\.\s+(?:Електроенергія\s+є|Електроенергії\s+немає\s+(.+?))\./g;
  let match;

  while ((match = groupPattern.exec(decodedHtml)) !== null) {
    const groupId = match[1];
    const scheduleText = match[2];

    if (!scheduleText) {
      groups.push({ id: groupId, date, status: "power", schedule: "" });
      continue;
    }

    // Parse time ranges (e.g., "з 00:00 до 06:00, з 11:00 до 15:00")
    const timeRanges = [];
    const timePattern = /з\s+(\d{2}:\d{2})\s+до\s+(\d{2}:\d{2})/g;
    let timeMatch;

    while ((timeMatch = timePattern.exec(scheduleText)) !== null) {
      const startTime = timeMatch[1];
      const endTime = timeMatch[2];
      timeRanges.push(`${startTime}-${endTime}`);
    }

    groups.push({
      id: groupId,
      date,
      status: "outage",
      schedule: timeRanges.join(", "),
    });
  }

  return { groups, date };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/smart-plug.test.js`
Expected: PASS — all tests green, including the new power/outage assertions.

- [ ] **Step 5: Commit**

```bash
git add src/smart-plug.js test/smart-plug.test.js
git commit -m "fix: parseScheduleHtml now captures groups with no scheduled outage"
```

---

### Task 3: `buildMyGroupMessage` helper — fix the false "no data" notification

**Files:**
- Modify: `src/smart-plug.js:526-542` (message-building block inside `scrapeAndSendImage`)
- Modify: `test/smart-plug.test.js` (append tests)

**Interfaces:**
- Consumes: `parseScheduleHtml`'s `status: "power"|"outage"` group shape from Task 2.
- Produces: `export function buildMyGroupMessage({ myGroup, formattedDate, durationText, scheduleId })` — pure, returns a message string. `myGroup` is assumed truthy (caller only invokes this when a group was found).

- [ ] **Step 1: Write the failing test**

Append to `test/smart-plug.test.js`:

```js
import { buildMyGroupMessage } from "../src/smart-plug.js";

test("buildMyGroupMessage: power group with no outage", () => {
  const msg = buildMyGroupMessage({
    myGroup: { id: "2.1", status: "power", schedule: "" },
    formattedDate: "",
    durationText: "",
    scheduleId: "2.1",
  });
  assert.equal(msg, "Група 2.1: відключень немає");
});

test("buildMyGroupMessage: outage group with a known upcoming time", () => {
  const msg = buildMyGroupMessage({
    myGroup: { id: "1.1", status: "outage", schedule: "17:00-19:30" },
    formattedDate: "01.07.2026 17:00",
    durationText: " (тривалість: 2 год 30 хв)",
    scheduleId: "1.1",
  });
  assert.equal(
    msg,
    "Наступне вимкнення електроенергії (група 1.1): 01.07.2026 17:00 (тривалість: 2 год 30 хв)",
  );
});

test("buildMyGroupMessage: outage group with no determinable upcoming time", () => {
  const msg = buildMyGroupMessage({
    myGroup: { id: "1.1", status: "outage", schedule: "" },
    formattedDate: "",
    durationText: "",
    scheduleId: "1.1",
  });
  assert.equal(msg, "Наступне вимкнення електроенергії (група 1.1) не визначено");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/smart-plug.test.js`
Expected: FAIL — `buildMyGroupMessage` is not exported from `src/smart-plug.js`.

- [ ] **Step 3: Implement and wire in**

In `src/smart-plug.js`, add this function directly above `async function scrapeAndSendImage(telegramBotToken, chatIds, env) {`, next to `fetchScheduleMenu`:

```js
export function buildMyGroupMessage({ myGroup, formattedDate, durationText, scheduleId }) {
  if (myGroup.status === "power") {
    return `Група ${scheduleId}: відключень немає`;
  }
  if (formattedDate) {
    return `Наступне вимкнення електроенергії (група ${scheduleId}): ${formattedDate}${durationText}`;
  }
  return `Наступне вимкнення електроенергії (група ${scheduleId}) не визначено`;
}

```

Then, inside `scrapeAndSendImage`, replace this block (currently lines 528-542):

```js
      let myGroupMessage = "";
      if (myGroup) {
        const OCRResult = { groups: [myGroup] };
        const { formattedDate, durationText } = await getScheduleFormattedDate(
          OCRResult,
          env,
        );

        if (formattedDate) {
          await insertNextNotification(formattedDate, env);
          myGroupMessage = `Наступне вимкнення електроенергії (група ${env.SCHEDULE_ID}): ${formattedDate}${durationText}`;
        } else {
          myGroupMessage = `Наступне вимкнення електроенергії (група ${env.SCHEDULE_ID}) не визначено`;
        }
      }
```

with:

```js
      let myGroupMessage = "";
      if (myGroup) {
        if (myGroup.status === "power") {
          myGroupMessage = buildMyGroupMessage({
            myGroup,
            formattedDate: "",
            durationText: "",
            scheduleId: env.SCHEDULE_ID,
          });
        } else {
          const OCRResult = { groups: [myGroup] };
          const { formattedDate, durationText } = await getScheduleFormattedDate(
            OCRResult,
            env,
          );

          if (formattedDate) {
            await insertNextNotification(formattedDate, env);
          }

          myGroupMessage = buildMyGroupMessage({
            myGroup,
            formattedDate,
            durationText,
            scheduleId: env.SCHEDULE_ID,
          });
        }
      }
```

(Skipping `getScheduleFormattedDate` entirely for `status === "power"` groups also avoids the spurious `"has no schedule"` warning log it would otherwise emit every cron run on full-power days.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/smart-plug.test.js`
Expected: PASS — all tests across all three tasks green.

- [ ] **Step 5: Manual end-to-end verification against the live schedule API**

Run: `yarn dev`
Then: `curl http://localhost:8787/no-render`
Expected: `notify` field reflects the current live schedule correctly for whatever `SCHEDULE_ID` is configured in `.dev.vars` — either an upcoming-outage message or `Група {ID}: відключень немає` if that group currently has no scheduled outage. Cross-check the result against the raw API: `curl "https://api.loe.lviv.ua/api/menus?page=1&type=photo-grafic"` and confirm the group's line for today matches what the bot reports.

- [ ] **Step 6: Commit**

```bash
git add src/smart-plug.js test/smart-plug.test.js
git commit -m "fix: send correct no-outage message instead of false 'no data' fallback"
```
