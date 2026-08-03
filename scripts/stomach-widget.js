const MODULE_ID = "food";
const TEMPLATE_PATH = `modules/${MODULE_ID}/templates/stomach-widget.hbs`;

const clamp = (value) => Math.min(100, Math.max(0, Number(value) || 0));

function stateFor(value) {
  if (value <= 0) return "empty";
  if (value <= 10) return "starving";
  if (value <= 25) return "hungry";
  if (value <= 50) return "peckish";
  if (value <= 75) return "comfortable";
  return "full";
}

function getActor(app) {
  const actor = app.actor ?? app.document;
  return actor instanceof Actor && actor.type === "character" ? actor : null;
}

function getRoot(html) {
  return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

async function renderStomach(actor, host) {
  if (!host) return;
  const value = clamp(actor.getFlag(MODULE_ID, "satiety") ?? 100);
  const id = `${actor.id}-${host.closest(".app")?.id ?? crypto.randomUUID()}`.replace(/[^a-zA-Z0-9-]/g, "");
  const fillY = 155 - value * 1.15;
  const data = {
    id,
    state: stateFor(value),
    fillY: fillY.toFixed(2),
    waveY: (fillY - 5).toFixed(2),
    ariaLabel: game.i18n.format("FOOD.Widget.Aria", { value: Math.round(value) })
  };

  const markup = await foundry.applications.handlebars.renderTemplate(TEMPLATE_PATH, data);
  const current = host.querySelector(".food-stomach-svg");
  if (current) current.outerHTML = markup;
  else host.insertAdjacentHTML("afterbegin", markup);
}

async function upgradeRenderedWidget(app, html) {
  const actor = getActor(app);
  const root = getRoot(html);
  if (!actor || !root) return;

  const widget = root.querySelector(".food-widget");
  const host = widget?.querySelector(".food-visual");
  if (!host) return;

  try {
    await renderStomach(actor, host);
    widget.dataset.stomachTemplate = "external";
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to render stomach template`, error);
  }
}

Hooks.on("renderActorSheet", upgradeRenderedWidget);
Hooks.on("renderActorSheetV2", upgradeRenderedWidget);

Hooks.once("init", async () => {
  await foundry.applications.handlebars.loadTemplates([TEMPLATE_PATH]);
});

export { renderStomach, stateFor };
