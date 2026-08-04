const MODULE_ID = "food";
const openFoodDialogs = new Map();

const setting = key => game.settings.get(MODULE_ID, key);
const getApi = () => game.modules.get(MODULE_ID)?.api;

function canControl(actor) {
  return Boolean(game.user.isGM || (setting("allowPlayerAdjust") && actor?.testUserPermission?.(game.user, "OWNER")));
}

function getRoot(value) {
  if (value instanceof HTMLElement) return value;
  if (value?.[0] instanceof HTMLElement) return value[0];
  return null;
}

function resolveActor(widget) {
  for (const app of Object.values(ui.windows ?? {})) {
    const root = getRoot(app?.element) ?? getRoot(app?._element);
    if (!root?.contains(widget)) continue;
    const actor = app.actor ?? app.document;
    if (actor instanceof Actor) return actor;
  }

  const actorId = widget?.dataset.actorId;
  const worldActor = actorId ? game.actors.get(actorId) : null;
  if (worldActor) return worldActor;

  for (const token of canvas?.tokens?.placeables ?? []) {
    if (token.actor?.id === actorId) return token.actor;
  }
  return null;
}

function itemQuantity(item) {
  const value = Number(foundry.utils.getProperty(item, "system.quantity") ?? 1);
  return Number.isFinite(value) ? value : 0;
}

function availableConsumables(actor, flag) {
  return actor.items.filter(item =>
    item.type === "consumable"
    && item.parent === actor
    && itemQuantity(item) > 0
    && Number(item.getFlag(MODULE_ID, flag)) > 0
  );
}

function optionMarkup(actor, flag) {
  return availableConsumables(actor, flag).map(item => {
    const value = Number(item.getFlag(MODULE_ID, flag) || 0);
    return `<option value="${item.id}">${foundry.utils.escapeHTML(item.name)} ×${itemQuantity(item)} (+${value}%)</option>`;
  }).join("");
}

function findDialogPanel(id) {
  if (!id) return null;
  const escaped = globalThis.CSS?.escape ? CSS.escape(id) : id;
  return document.querySelector(`[data-food-dialog-id="${escaped}"]`);
}

function refreshDialog(entry, suppliedPanel = null) {
  const panel = suppliedPanel ?? entry.panel ?? findDialogPanel(entry.id);
  if (!panel?.isConnected) {
    entry.panel = null;
    return -1;
  }
  entry.panel = panel;

  const items = availableConsumables(entry.actor, entry.flag);
  const select = panel.querySelector('[data-food-item-select]');
  const previous = select?.value;
  if (select) {
    select.innerHTML = optionMarkup(entry.actor, entry.flag);
    select.disabled = items.length === 0;
    if (previous && items.some(item => item.id === previous)) select.value = previous;
  }

  const empty = panel.querySelector('[data-food-empty]');
  if (empty) empty.hidden = items.length > 0;

  const consumeButton = panel.querySelector('[data-food-dialog-consume]');
  if (consumeButton) consumeButton.disabled = items.length === 0 || entry.busy;
  return items.length;
}

async function consumeItemPortion(item) {
  const quantity = itemQuantity(item);
  if (quantity <= 1) await item.delete();
  else await item.update({ "system.quantity": quantity - 1 });
}

function removeDialogHooks(entry) {
  if (!entry) return;
  for (const [hook, id] of [["updateItem", entry.updateHook], ["deleteItem", entry.deleteHook], ["createItem", entry.createHook]]) {
    if (id != null) Hooks.off(hook, id);
  }
  openFoodDialogs.delete(entry.id);
}

async function refreshAndMaybeClose(entry) {
  await new Promise(resolve => setTimeout(resolve, 0));
  if (refreshDialog(entry) === 0) await entry.dialog.close();
}

async function handleDialogConsume(button) {
  const panel = button.closest('[data-food-dialog-id]');
  const id = panel?.dataset.foodDialogId ?? button.dataset.foodDialogConsume;
  const entry = openFoodDialogs.get(id);
  if (!entry || entry.busy || !panel) return;

  entry.panel = panel;
  const select = panel.querySelector('[data-food-item-select]');
  const manualInput = panel.querySelector('[data-food-manual]');
  const item = select?.value ? entry.actor.items.get(select.value) : null;
  let amount = Number(manualInput?.value || 0);

  if (item && itemQuantity(item) > 0) amount += Number(item.getFlag(MODULE_ID, entry.flag) || 0);
  if (amount <= 0) return;

  entry.busy = true;
  button.disabled = true;
  try {
    const api = getApi();
    if (!api) throw new Error("Food API is not ready");

    if (entry.isFood) await api.changeSatiety(entry.actor, amount, { notify: false });
    else await api.setHydration(entry.actor, api.getHydration(entry.actor) + amount, { notify: false });

    if (item && itemQuantity(item) > 0) await consumeItemPortion(item);
    if (manualInput) manualInput.value = "0";

    await new Promise(resolve => setTimeout(resolve, 0));
    const remaining = refreshDialog(entry, panel);
    entry.actor.sheet?.render?.(false);
    if (remaining === 0) await entry.dialog.close();
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to consume Item`, error);
    ui.notifications.error(`Food: ${error.message ?? error}`);
  } finally {
    entry.busy = false;
    const livePanel = entry.panel?.isConnected ? entry.panel : findDialogPanel(entry.id);
    const liveButton = livePanel?.querySelector('[data-food-dialog-consume]');
    if (liveButton && availableConsumables(entry.actor, entry.flag).length > 0) liveButton.disabled = false;
  }
}

async function consume(actor, type) {
  const isFood = type === "food";
  const flag = isFood ? "foodValue" : "waterValue";
  if (!availableConsumables(actor, flag).length) {
    ui.notifications.warn(game.i18n.localize("FOOD.Dialog.NoItems"));
    return;
  }

  const id = foundry.utils.randomID();
  const content = `<div class="food-dialog" data-food-dialog-id="${id}">
    <p data-food-empty hidden>${game.i18n.localize("FOOD.Dialog.NoItems")}</p>
    <select data-food-item-select>${optionMarkup(actor, flag)}</select>
    <hr>
    <label>${game.i18n.localize("FOOD.Dialog.Manual")}
      <input type="number" data-food-manual min="0" max="100" step="1" value="0">
    </label>
    <button type="button" data-food-dialog-consume="${id}">
      <i class="fa-solid fa-check"></i> ${game.i18n.localize("FOOD.Actions.Consume")}
    </button>
  </div>`;

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: game.i18n.localize(isFood ? "FOOD.Actions.Eat" : "FOOD.Actions.Drink") },
    content,
    buttons: [{ action: "cancel", label: game.i18n.localize("Cancel") }],
    close: () => removeDialogHooks(openFoodDialogs.get(id))
  });

  const entry = { id, dialog, actor, flag, isFood, panel: null, busy: false };
  openFoodDialogs.set(id, entry);
  entry.updateHook = Hooks.on("updateItem", item => item.parent === actor && refreshAndMaybeClose(entry));
  entry.deleteHook = Hooks.on("deleteItem", item => item.parent === actor && refreshAndMaybeClose(entry));
  entry.createHook = Hooks.on("createItem", item => item.parent === actor && refreshAndMaybeClose(entry));

  await dialog.render({ force: true });
  entry.panel = findDialogPanel(id);
  refreshDialog(entry, entry.panel);
}

async function adjust(actor) {
  const hydrationEnabled = setting("hydrationEnabled");
  const api = getApi();
  if (!api) throw new Error("Food API is not ready");

  const content = `<form class="food-dialog">
    <label>${game.i18n.localize("FOOD.Satiety")}<input name="satiety" type="number" min="0" max="100" value="${api.getSatiety(actor)}"></label>
    ${hydrationEnabled ? `<label>${game.i18n.localize("FOOD.Hydration")}<input name="hydration" type="number" min="0" max="100" value="${api.getHydration(actor)}"></label>` : ""}
  </form>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("FOOD.Actions.Adjust") },
    content,
    buttons: [
      { action: "save", label: game.i18n.localize("Save"), default: true, callback: async (_event, button) => {
        const form = button.form;
        if (!form) throw new Error("Food adjustment form was not found");
        await api.setSatiety(actor, Number(form.elements.satiety.value));
        if (hydrationEnabled) await api.setHydration(actor, Number(form.elements.hydration.value), { notify: false });
      }},
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ]
  });
}

async function runWidgetAction(button) {
  const actor = resolveActor(button.closest(".food-widget"));
  if (!actor) return ui.notifications.error("Food: character document was not found for this sheet.");
  if (!canControl(actor)) return ui.notifications.warn("Food: you do not have permission to change this character.");

  button.disabled = true;
  try {
    const action = button.dataset.foodAction;
    if (action === "eat") await consume(actor, "food");
    else if (action === "drink") await consume(actor, "water");
    else if (action === "adjust") await adjust(actor);
  } catch (error) {
    console.error(`${MODULE_ID} | Widget control failed`, error);
    ui.notifications.error(`Food: ${error.message ?? error}`);
  } finally {
    button.disabled = false;
  }
}

function enableWidgets(root = document) {
  for (const button of root.querySelectorAll?.(".food-widget [data-food-action]") ?? []) {
    button.removeAttribute("disabled");
    button.style.pointerEvents = "auto";
  }
}

Hooks.once("ready", () => {
  document.addEventListener("click", async event => {
    const consumeButton = event.target.closest?.('[data-food-dialog-consume]');
    if (consumeButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await handleDialogConsume(consumeButton);
      return;
    }

    const widgetButton = event.target.closest?.(".food-widget [data-food-action]");
    if (!widgetButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await runWidgetAction(widgetButton);
  }, true);

  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node instanceof HTMLElement) enableWidgets(node);
    }
  }).observe(document.body, { childList: true, subtree: true });

  enableWidgets();
});

Hooks.on("foodWidgetInserted", (_actor, widget) => enableWidgets(widget));
Hooks.on("renderActorSheet", (_app, html) => enableWidgets(getRoot(html) ?? document));
Hooks.on("renderActorSheetV2", (_app, html) => enableWidgets(getRoot(html) ?? document));
