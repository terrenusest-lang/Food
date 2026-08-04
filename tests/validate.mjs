import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const manifest = JSON.parse(read("../module.json"));

assert.equal(manifest.id, "food");
assert.equal(manifest.version, "1.0.6");
assert.equal(manifest.compatibility.minimum, "14");
assert.ok(manifest.esmodules.includes("scripts/stomach-widget.js"));
assert.ok(manifest.esmodules.includes("scripts/widget-controls.js"));
assert.ok(manifest.esmodules.includes("scripts/item-nutrition.js"));

for (const locale of ["en", "ru"]) JSON.parse(read(`../lang/${locale}.json`));

const core = read("../scripts/food.js");
const renderer = read("../scripts/stomach-widget.js");
const controls = read("../scripts/widget-controls.js");
const nutrition = read("../scripts/item-nutrition.js");
const template = read("../templates/stomach-widget.hbs");
const sourceSvg = read("../assets/stomach-widget.svg");

assert.match(core, /updateWorldTime/);
assert.match(core, /foodWidgetInserted/);
assert.match(core, /lastProcessedWorldTime/);
assert.match(renderer, /renderTemplate/);
assert.match(renderer, /loadTemplates/);
assert.match(renderer, /foodResourceChanged/);
assert.match(renderer, /food-stomach-host/);
assert.match(controls, /renderApplicationV2|MutationObserver|data-food-action/);
assert.match(controls, /changeSatiety/);
assert.match(nutrition, /renderApplicationV2/);
assert.match(nutrition, /setFlag\(MODULE_ID, key, value\)/);
assert.match(nutrition, /food-item-config-v2/);
assert.match(template, /food-stomach-clip-\{\{id\}\}/);
assert.match(template, /\{\{fillY\}\}/);
assert.match(sourceSvg, /id="stomach-cavity"/);
assert.match(sourceSvg, /viewBox="0 0 220 220"/);
assert.doesNotMatch(sourceSvg, /sample-fill/);

console.log("Validation passed");
