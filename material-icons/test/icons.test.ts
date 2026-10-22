import assert from "node:assert/strict";

import {
  assetUrl,
  downloadAsset,
  downloadUrl,
  fuzzyMatch,
  MATERIAL_STYLES,
  MaterialIcon,
  MaterialIconStyle,
  parseMetadata,
  searchIcons,
} from "../src/icons.ts";

let passed = 0;
let failed = 0;
const checks: Array<[string, () => void]> = [];

function check(name: string, body: () => void): void {
  checks.push([name, body]);
}

const METADATA = {
  host: "fonts.gstatic.com",
  asset_url_pattern: "/s/i/{family}/{icon}/v{version}/{asset}",
  families: ["Material Icons", "Material Icons Outlined"],
  icons: [
    {
      categories: ["action"],
      codepoint: 59477,
      name: "alarm",
      sizes_px: [24],
      tags: ["clock", "bell", "time"],
      version: 12,
    },
    {
      categories: ["action"],
      codepoint: 59478,
      name: "alarm-add",
      sizes_px: [24],
      tags: ["clock"],
      version: 12,
    },
    {
      categories: ["navigation"],
      codepoint: 58817,
      name: "arrow-back",
      sizes_px: [24],
      tags: ["direction"],
      version: 9,
    },
  ],
};

const BODY = `)]}'\n${JSON.stringify(METADATA)}`;
const ICONS = parseMetadata(BODY);

check("the anti-hijacking line and the URL pattern are handled", () => {
  assert.equal(ICONS.length, 3);
  assert.equal(ICONS[0].name, "alarm");
  assert.equal(ICONS[0].codepoint, (59477).toString(16));
  assert.equal(ICONS[0].categories, "action");
  assert.equal(ICONS[0].assets.length, 2);
  assert.equal(
    ICONS[0].assets[0].url,
    "https://fonts.gstatic.com/s/i/materialicons/alarm/v12/24px.svg",
  );
  assert.equal(
    ICONS[0].assets[1].url,
    "https://fonts.gstatic.com/s/i/materialiconsoutlined/alarm/v12/24px.svg",
  );
  assert.equal(ICONS[2].assets[0].url.includes("/v9/"), true);
});

check("every style points at its own asset", () => {
  assert.equal(MATERIAL_STYLES.length, 5);
  assert.equal(MATERIAL_STYLES[0].value, MaterialIconStyle.Filled);
  assert.equal(MATERIAL_STYLES[4].value, MaterialIconStyle["Two Tone"]);
  assert.equal(assetUrl(ICONS[0], MaterialIconStyle.Outlined), ICONS[0].assets[1].url);
  assert.equal(assetUrl(ICONS[0], 99 as MaterialIconStyle), ICONS[0].assets[0].url);
});

check("a fuzzy search matches a subsequence and puts name hits first", () => {
  assert.equal(fuzzyMatch("alrm", "alarm"), true);
  assert.equal(fuzzyMatch("abc", "alarm"), false);
  assert.equal(fuzzyMatch("", "alarm"), true);
  assert.deepEqual(searchIcons(ICONS, "").map((icon) => icon.name), ["alarm", "alarm-add", "arrow-back"]);
  assert.deepEqual(searchIcons(ICONS, "bell").map((icon) => icon.name), ["alarm"]);
  assert.deepEqual(searchIcons(ICONS, "arrow").map((icon) => icon.name), ["arrow-back"]);
  assert.deepEqual(searchIcons(ICONS, "zzz"), []);
});

check("the download URL is the one Google serves", () => {
  assert.equal(downloadAsset("Web", "PNG", "Black", "24"), "black-24dp.zip");
  assert.equal(downloadAsset("Web", "SVG", "White", "48"), "24px.svg");
  assert.equal(downloadAsset("Android", "PNG", "Black", "18"), "black-android.zip");
  assert.equal(downloadAsset("IOS", "PDF" as never, "Black", "18"), "black-ios.zip");
  assert.equal(downloadUrl(ICONS[0], "black-24dp.zip"), "https://fonts.gstatic.com/s/i/materialicons/alarm/v12/black-24dp.zip");
});

(async () => {
  for (const [name, body] of checks) {
    try {
      body();
      passed += 1;
      console.log(`ok   ${name}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL ${name}`);
      console.log(`     ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\n${failed > 0 ? `${passed} passed, ${failed} failed` : `all ${passed} checks passed`}`);
  process.exit(failed === 0 ? 0 : 1);
})();
