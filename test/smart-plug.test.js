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
