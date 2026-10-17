import { test } from "node:test";
import assert from "node:assert/strict";
import dayjs from "dayjs";
import { renderStatusPage } from "../src/status-page.js";

const NOW = dayjs("2026-10-17T12:00:00Z");
const status = (s, hoursAgo) => ({ status: s, datetime: { seconds: NOW.unix() - hoursAgo * 3600 } });

test("online page shows state, duration and Kyiv time", () => {
  const html = renderStatusPage({ latestStatus: status("online", 3), group: "5.1", now: NOW });
  assert.match(html, /data-state="online"/);
  assert.match(html, /<h1>Світло є<\/h1>/);
  assert.match(html, /вже 3 години/);
  assert.match(html, /увімкнули 17 жовтня о 12:00/); // 09:00Z = 12:00 Kyiv (EEST)
  assert.match(html, /href="\/calendar\/5\.1\.ics"/);
});

test("offline, unknown and error states", () => {
  assert.match(renderStatusPage({ latestStatus: status("offline", 1), now: NOW }), /<h1>Світла немає<\/h1>/);
  assert.match(renderStatusPage({ latestStatus: { status: "online", datetime: "2026-10-17 12:00" } }), /<h1>Світло є<\/h1>/);
  assert.match(renderStatusPage({ error: "boom" }), /data-state="unknown"[\s\S]*boom\. Оновіть/);
});

test("escapes untrusted strings", () => {
  const html = renderStatusPage({ error: "<script>x</script>", lastGraphics: '"><img onerror=1>' });
  assert.doesNotMatch(html, /<script>x|"><img onerror/);
});
