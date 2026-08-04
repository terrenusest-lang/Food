const MODULE_ID = "food";
const TEMPLATE_PATH = `modules/${MODULE_ID}/templates/stomach-widget.hbs`;
const clamp = value => Math.min(100, Math.max(0, Number(value) || 0));

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
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function uniqueId(actor, host) {
  const appId = host.closest(".app")?.id ?? host.closest(".application")?.id ?? crypto.randomUUID();
  return `${actor.id}-${appId}`.replace(/[^a-zA-Z0-9-]/g, "");
}

async function renderStomach(actor, host) {
  if (!host?.isConnected) return;

  const value = clamp(actor.getFlag(MODULE_ID, "satiety") ?? 100);
  const fillBottom = 198;
  const fillTop = 49;
  const fillY = fillBottom - (fillBottom - fillTop) * (value / 100);
  const data = {
    id: uniqueId(actor, host),
    state: stateFor(value),
    fillY: fillY.toFixed(2),
    waveY: (fillY - 4).toFixed(2),
    ariaLabel: game.i18n.format("FOOD.Widget.Aria", { value: Math.round(value) })
  };

  const markup = await foundry.applications.handlebars.renderTemplate(TEMPLATE_PATH, data);
  const current = host.querySelector(".food-stomach-svg");
  if (current) current.outerHTML = markup;
  else host.insertAdjacentHTML("afterbegin", markup);
}

async function refreshActor(actor) {
  const widgets = document.querySelectorAll(`.food-widget[data-actor-id="${CSS.escape(actor.id)}"]`);
  await Promise.all([...widgets].map(widget => renderStomach(actor, widget.querySelector(".food-stomach-host"))));
}

async function upgradeRenderedWidget(app, html) {
  const actor = getActor(app);
  const root = getRoot(html);
  if (!actor || !root) return;

  const widget = root.querySelector(`.food-widget[data-actor-id="${CSS.escape(actor.id)}"]`);
  const host = widget?.querySelector(".food-stomach-host");
  if (!host) return;

  try {
    await renderStomach(actor, host);
    widget.dataset.stomachTemplate = "external";
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to render stomach template`, error);
  }
}

Hooks.once("init", async () => {
  await foundry.applications.handlebars.loadTemplates([TEMPLATE_PATH]);
});

Hooks.on("renderActorSheet", upgradeRenderedWidget);
Hooks.on("renderActorSheetV2", upgradeRenderedWidget);
Hooks.on("foodWidgetInserted", async (actor, widget) => {
  try {
    await renderStomach(actor, widget?.querySelector(".food-stomach-host"));
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to render inserted stomach widget`, error);
  }
});
Hooks.on("foodResourceChanged", actor => refreshActor(actor));
Hooks.on("foodActorUpdated", actor => refreshActor(actor));

export { renderStomach, refreshActor, stateFor };
