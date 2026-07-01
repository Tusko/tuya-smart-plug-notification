# Blackout Notification Fix + ICS Calendar Feed

## Problem

1. **False "no data" notifications.** `parseScheduleHtml` in `src/smart-plug.js` only
   captures groups written as `Група X.X. Електроенергії немає з HH:MM до HH:MM.`
   (outage groups). Groups written as `Група X.X. Електроенергія є.` (full power, no
   outage) are never added to the parsed `groups` array. When the configured
   `SCHEDULE_ID` group has no outage that day, it's absent from `groups`, the code
   treats it as "group not found in schedule", and sends the misleading caption
   `Немає даних про графік відключень` — even though an image with real schedule data
   is sent in the same message, and the LOE API has perfectly good data.

2. **Fragile menu lookup.** The schedule fetch hits `GET /api/menus/9`, hardcoding
   menu ID `9`. The discovery endpoint `GET /api/menus?page=1&type=photo-grafic`
   returns the same menu by filtering on `type`, without depending on a specific
   numeric ID that could change.

3. **No calendar integration.** There's no way to subscribe to a group's outage
   schedule from a calendar app (Google/Apple/Outlook).

## Goals

- Fix the parser so every group (outage or full-power) is always represented,
  eliminating the false "not found" / "no data" message.
- Replace the hardcoded `/api/menus/9` call with the type-filtered discovery
  endpoint, shared by both the existing notify flow and the new calendar feed.
- Add a live, subscribable ICS calendar feed per group ID.

## Non-goals

- No historical/past-day calendar data — only what the LOE API currently exposes
  (Today + Tomorrow).
- No authentication on the calendar endpoint.
- No change to true no-data days (API returns no `rawHtml` / empty groups at all) —
  these stay fully silent, same as today.

## Design

### 1. Shared schedule fetch helper

New function (in `src/smart-plug.js` or extracted to `src/utils/schedule-api.js`)
replaces the current inline fetch in `scrapeAndSendImage`:

```
async function fetchScheduleMenu(env) {
  // GET {SCHEDULE_API_URL}/api/menus?page=1&type=photo-grafic
  // find hydra:member entry, return its menuItems array
}
```

Used by:
- `scrapeAndSendImage` (existing cron notify flow) — replaces the current
  `/api/menus/9` call.
- The new `/calendar/:groupId.ics` endpoint.

Same 10s timeout / abort behavior as the existing fetch.

### 2. Parser fix — `parseScheduleHtml`

Regex changes from matching only `немає` groups to matching every `Група X.X.`
sentence, capturing either branch:

- `Електроенергія є` → `{ id, date, status: "power", schedule: "" }`
- `Електроенергії немає з ... до ... (, з ... до ...)*` → `{ id, date, status: "outage", schedule: "HH:MM-HH:MM, ..." }`

Every group ID present in the source HTML is now always present in the parsed
`groups` array — "group not found" can now only mean the group ID truly isn't in
the source data (e.g. LOE renumbers groups), not "group has no outage today".

### 3. Message building — `scrapeAndSendImage`

When building `myGroupMessage` for the configured `SCHEDULE_ID`:

- `myGroup.status === "power"` → `Група {SCHEDULE_ID}: відключень немає`
- `myGroup.status === "outage"` and a valid upcoming time range exists → existing
  `Наступне вимкнення електроенергії (група {SCHEDULE_ID}): ...` message, unchanged.
- `myGroup` outage but no valid upcoming range parses (edge case) → existing
  `не визначено` fallback, unchanged.
- `myGroup` missing from `groups` entirely (truly not in source data) → existing
  `не знайдено в графіку` message, unchanged.
- True no-data day (no `rawHtml` / empty `groups` for the day) → function returns
  early, no message sent at all — unchanged from current behavior.

`findGroupChanges`'s "removed group" branch is kept as a safety net but should
rarely trigger now, since power↔outage transitions are ordinary "changed" diffs
between two always-present group entries.

### 4. New endpoint — `GET /calendar/:groupId.ics`

Added to `src/api.js`. Unauthenticated, computed live per request (no storage).

Flow:
1. Call `fetchScheduleMenu(env)`, pull out the `Today` and `Tomorrow` menu items.
2. For each day present: parse its `rawHtml` with the fixed `parseScheduleHtml`,
   look up `:groupId`.
   - Day missing (no `rawHtml`) or group ID absent from that day's groups → skip
     that day, no placeholder event, no error.
3. Build VEVENTs per day:
   - `status: "outage"` → one VEVENT per time range: title
     `Група {groupId} Відключення світла`, local `Europe/Kyiv` start/end,
     `TRANSP:TRANSPARENT` / `FREE`, one `VALARM` (display, 30 minutes before).
   - `status: "power"` → one all-day VEVENT: title
     `Група {groupId} Світло НЕ відключається`.
4. Respond `Content-Type: text/calendar; charset=utf-8`, calendar name
   `Група {groupId} Відключення світла`, `BEGIN:VCALENDAR ... END:VCALENDAR` body.

Implementation: hand-rolled ICS text builder in new `src/utils/ics.js` (no new
npm dependency — the format needed is a handful of VEVENT blocks with no
recurrence rules; keeps the Workers bundle light). Uses the existing `dayjs`
dependency for `Europe/Kyiv` local time formatting.

**Errors:** if `fetchScheduleMenu` fails (upstream API down/timeout), respond
`502` plain text. No retry/caching — the calendar client will re-poll on its own
schedule.

## Testing

- Manual verification against the live LOE API (no test suite in this project
  today):
  - Confirm a day with a mix of `є`/`немає` groups parses every group.
  - Confirm the configured `SCHEDULE_ID` on a full-power day now sends
    `Група X.X: відключень немає` instead of the false "no data" message.
  - Confirm `GET /calendar/:groupId.ics` returns a valid `.ics` body importable
    into Google Calendar / Apple Calendar for a group with an outage today, a
    group with full power today, and a nonexistent group ID (should produce a
    valid but empty calendar, not an error).
  - Confirm the shared fetch helper output matches the current `/api/menus/9`
    response shape (same `menuItems`), so the cron notify flow behaves
    identically aside from the parser fix.
