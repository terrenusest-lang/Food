import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const manifest = JSON.parse(read("../module.json"));

assert.equal(manifest.id, "food");
assert.equal(manifest.version, "1.0.3");
assert.equal(manifest.compatibility.minimum, "14");
assert.ok(manifest.esmodules.includes("scripts/stomach-widget.js"));

for (const locale of ["en", "ru"]) JSON.parse(read(`../lang/${locale}.json`));

const core = read("../scripts/food.js");
const renderer = read("../scripts/stomach-widget.js");
const template = read("../templates/stomach-widget.hbs");
const sourceSvg = read("../assets/stomach-widget.svg");

assert.match(core, /updateWorldTime/);
assert.match(core, /installDelegatedControls/);
assert.match(core, /foodWidgetInserted/);
assert.match(core, /lastProcessedWorldTime/);
assert.match(renderer, /renderTemplate/);
assert.match(renderer, /loadTemplates/);
assert.match(renderer, /foodResourceChanged/);
assert.match(renderer, /food-stomach-host/);
assert.match(template, /food-stomach-clip-\{\{id\}\}/);
assert.match(template, /\{\{fillY\}\}/);
assert.match(sourceSvg, /id="stomach-cavity"/);
assert.match(sourceSvg, /viewBox="0 0 220 220"/);
assert.doesNotMatch(sourceSvg, /sample-fill/);

console.log("Validation passed");
