import { test } from "node:test";
import assert from "node:assert/strict";
import { sendTelegramMessage } from "../src/utils/telegram.js";

async function capturePayload(...args) {
  const orig = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, opts) => { body = JSON.parse(opts.body); return new Response("{}"); };
  try { await sendTelegramMessage("tok", "1", ...args); } finally { globalThis.fetch = orig; }
  return body;
}

test("no parseMode: escapes text, uses MarkdownV2", async () => {
  const p = await capturePayload("a.b!");
  assert.equal(p.text, "a\\.b\\!");
  assert.equal(p.parse_mode, "MarkdownV2");
});

test("parseMode given: sends text raw with that mode", async () => {
  const p = await capturePayload("<b>a.b</b>", "HTML");
  assert.equal(p.text, "<b>a.b</b>");
  assert.equal(p.parse_mode, "HTML");
});
