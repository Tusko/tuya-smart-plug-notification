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
