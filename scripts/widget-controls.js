const MODULE_ID = "food";
const openFoodDialogs = new Map();

function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

function canControl(actor) {
  return Boolean(game.user.isGM || (setting("allowPlayerAdjust") && actor?.testUserPermission?.(game.user, "OWNER")));
}

function getApi() {
  return game.modules.get(MODULE_ID)?.api;
}

function getRoot(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

function appElement(app) {
  return getRoot(app?.element) ?? getRoot(app?._element) ?? null;
}

function resolveActor(widget) {
  for (const app of Object.values(ui.windows ?? {})) {
    const root = appElement(app);
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
  const quantity = Number(foundry.utils.getProperty(item, "system.quantity") ?? 1);
  return Number.isFinite(quantity) ? quantity : 0;
}

function availableConsumables(actor, flag) {
  return actor.items.filter(item => {
    if (item.type !== "consumable") return false;
    if (!item.parent || item.parent !== actor) return false;
    if (itemQuantity(item) <= 0) return false;
    return Number(item.getFlag(MODULE_ID, flag)) > 0;
  });
}

function consumableOptions(actor, flag) {
  return availableConsumables(actor, flag).map(item => {
    const value = Number(item.getFlag(MODULE_ID, flag) || 0);
    const quantity = itemQuantity(item);
    return `<option value="${item.id}">${foundry.utils.escapeHTML(item.name)} ×${quantity} (+${value}%)</option>`;
  }).join("");
}

function dialogRoot(dialog) {
  return getRoot(dialog?.element) ?? getRoot(dialog?._element) ?? null;
}

function dialogForm(dialog) {
  return dialogRoot(dialog)?.querySelector("form.food-dialog") ?? null;
}

function refreshConsumableSelect(entry) {
  const { dialog, actor, flag } = entry;
  const form = dialogForm(dialog);
  const select = form?.elements?.itemId;
  if (!form || !select) return -1;

  const items = availableConsumables(actor, flag);
  const selectedId = select.value;
  select.innerHTML = consumableOptions(actor, flag);
  select.disabled = items.length === 0;

  if (selectedId && items.some(item => item.id === selectedId)) select.value = selectedId;

  const empty = form.querySelector("[data-food-empty]");
  if (empty) empty.hidden = items.length > 0;

  const consumeButton = form.querySelector("[data-food-dialog-consume]");
  if (consumeButton) consumeButton.disabled = items.length === 0 || entry.busy;

  return items.length;
}

async function consumeItemPortion(item) {
  const quantity = itemQuantity(item);
  if (quantity <= 1) await item.delete();
  else await item.update({ "system.quantity": quantity - 1 });
}

function belongsToActor(item, actor) {
  return item instanceof Item && item.parent === actor;
}

function removeDialogHooks(entry) {
  if (!entry) return;
  if (entry.updateHook != null) Hooks.off("updateItem", entry.updateHook);
  if (entry.deleteHook != null) Hooks.off("deleteItem", entry.deleteHook);
  if (entry.createHook != null) Hooks.off("createItem", entry.createHook);
  openFoodDialogs.delete(entry.id);
}

async function refreshDialog(entry) {
  await new Promise(resolve => setTimeout(resolve, 0));
  const remaining = refreshConsumableSelect(entry);
  if (remaining === 0) await entry.dialog.close();
}

async function handleDialogConsume(button) {
  const id = button.dataset.foodDialogConsume;
  const entry = openFoodDialogs.get(id);
  if (!entry || entry.busy) return;

  const form = dialogForm(entry.dialog);
  if (!form) {
    ui.notifications.error("Food: consume dialog form was not found.");
    return;
  }

  const selectedId = form.elements.itemId?.value;
  const item = selectedId ? entry.actor.items.get(selectedId) : null;
  let amount = Number(form.elements.manual?.value || 0);

  if (item && itemQuantity(item) > 0) {
    amount += Number(item.getFlag(MODULE_ID, entry.flag) || 0);
  }

  if (amount <= 0) return;

  entry.busy = true;
  button.disabled = true;

  try {
    const api = getApi();
    if (!api) throw new Error("Food API is not ready");

    if (entry.isFood) await api.changeSatiety(entry.actor, amount, { notify: false });
    else await api.setHydration(entry.actor, api.getHydration(entry.actor) + amount, { notify: false });

    if (item && itemQuantity(item) > 0) await consumeItemPortion(item);
    if (form.elements.manual) form.elements.manual.value = "0";

    await refreshDialog(entry);
    entry.actor.sheet?.render?.(false);
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to consume Item`, error);
    ui.notifications.error(`Food: ${error.message ?? error}`);
  } finally {
    entry.busy = false;
    const liveButton = dialogForm(entry.dialog)?.querySelector("[data-food-dialog-consume]");
    if (liveButton && availableConsumables(entry.actor, entry.flag).length > 0) liveButton.disabled = false;
  }
}

async function consume(actor, type) {
  const isFood = type === "food";
  const flag = isFood ? "foodValue" : "waterValue";
  if (availableConsumables(actor, flag).length === 0) {
    ui.notifications.warn(game.i18n.localize("FOOD.Dialog.NoItems"));
    return;
  }

  const id = foundry.utils.randomID();
  const content = `<form class="food-dialog" data-food-dialog-id="${id}">
    <p data-food-empty hidden>${game.i18n.localize("FOOD.Dialog.NoItems")}</p>
    <select name="itemId">${consumableOptions(actor, flag)}</select>
    <hr>
    <label>${game.i18n.localize("FOOD.Dialog.Manual")}
      <input type="number" name="manual" min="0" max="100" step="1" value="0">
    </label>
    <button type="button" data-food-dialog-consume="${id}">
      <i class="fa-solid fa-check"></i> ${game.i18n.localize("FOOD.Actions.Consume")}
    </button>
  </form>`;

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: game.i18n.localize(isFood ? "FOOD.Actions.Eat" : "FOOD.Actions.Drink") },
    content,
    buttons: [{ action: "cancel", label: game.i18n.localize("Cancel") }],
    close: () => removeDialogHooks(openFoodDialogs.get(id))
  });

  const entry = { id, dialog, actor, flag, isFood, busy: false, updateHook: null, deleteHook: null, createHook: null };
  openFoodDialogs.set(id, entry);

  entry.updateHook = Hooks.on("updateItem", item => {
    if (belongsToActor(item, actor)) refreshDialog(entry);
  });
  entry.deleteHook = Hooks.on("deleteItem", item => {
    if (belongsToActor(item, actor)) refreshDialog(entry);
  });
  entry.createHook = Hooks.on("createItem", item => {
    if (belongsToActor(item, actor)) refreshDialog(entry);
  });

  await dialog.render({ force: true });
}

async function adjust(actor) {
  const hydrationEnabled = setting("hydrationEnabled");
  const api = getApi();
  if (!api) throw new Error("Food API is not ready");

  const content = `<form class="food-dialog">
    <label>${game.i18n.localize("FOOD.Satiety")}
      <input name="satiety" type="number" min="0" max="100" value="${api.getSatiety(actor)}">
    </label>
    ${hydrationEnabled ? `<label>${game.i18n.localize("FOOD.Hydration")}
      <input name="hydration" type="number" min="0" max="100" value="${api.getHydration(actor)}">
    </label>` : ""}
  </form>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("FOOD.Actions.Adjust") },
    content,
    buttons: [
      {
        action: "save",
        label: game.i18n.localize("Save"),
        default: true,
        callback: async (_event, button) => {
          const form = button.form;
          if (!form) throw new Error("Food adjustment form was not found");
          await api.setSatiety(actor, Number(form.elements.satiety.value));
          if (hydrationEnabled) await api.setHydration(actor, Number(form.elements.hydration.value), { notify: false });
        }
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ]
  });
}

async function runAction(button) {
  const widget = button.closest(".food-widget");
  if (!widget) return;

  const actor = resolveActor(widget);
  if (!actor) {
    ui.notifications.error("Food: character document was not found for this sheet.");
    return;
  }

  if (!canControl(actor)) {
    ui.notifications.warn("Food: you do not have permission to change this character.");
    return;
  }

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

function enableWidget(widget) {
  if (!widget) return;
  for (const button of widget.querySelectorAll("[data-food-action]")) {
    button.removeAttribute("disabled");
    button.style.pointerEvents = "auto";
  }
}

function enableAllWidgets(root = document) {
  for (const widget of root.querySelectorAll?.(".food-widget") ?? []) enableWidget(widget);
}

function installGlobalControls() {
  document.addEventListener("click", async event => {
    const consumeButton = event.target.closest?.("[data-food-dialog-consume]");
    if (consumeButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await handleDialogConsume(consumeButton);
      return;
    }

    const button = event.target.closest?.(".food-widget [data-food-action]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await runAction(button);
  }, true);

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.(".food-widget")) enableWidget(node);
        enableAllWidgets(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  enableAllWidgets();
}

Hooks.once("ready", installGlobalControls);
Hooks.on("foodWidgetInserted", (_actor, widget) => enableWidget(widget));
Hooks.on("renderActorSheet", (_app, html) => enableAllWidgets(getRoot(html) ?? document));
Hooks.on("renderActorSheetV2", (_app, html) => enableAllWidgets(getRoot(html) ?? document));
