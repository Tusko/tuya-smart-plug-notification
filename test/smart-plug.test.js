import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchScheduleMenu, parseScheduleHtml, buildMyGroupMessage } from "../src/smart-plug.js";

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

test("fetchScheduleMenu returns menuItems when the API responds with a bare array (observed in production)", async () => {
  const BARE_ARRAY_RESPONSE = SAMPLE_MENUS_RESPONSE["hydra:member"];
  mockFetchOnce(BARE_ARRAY_RESPONSE);

  const menuItems = await fetchScheduleMenu({ SCHEDULE_API_URL: "https://api.loe.lviv.ua" });

  assert.equal(menuItems.length, 2);
  assert.equal(menuItems[0].name, "Today");
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
