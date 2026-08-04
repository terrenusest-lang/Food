const MODULE_ID = "food";

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

function dialogForm(button, dialog) {
  return button?.form
    ?? dialog?.element?.querySelector?.("form")
    ?? dialog?.window?.content?.querySelector?.("form")
    ?? null;
}

async function consumeItemPortion(item) {
  const rawQuantity = foundry.utils.getProperty(item, "system.quantity");
  const quantity = Number(rawQuantity ?? 1);

  if (!Number.isFinite(quantity) || quantity <= 1) {
    await item.delete();
    return;
  }

  await item.update({ "system.quantity": quantity - 1 });
}

async function consume(actor, type) {
  const isFood = type === "food";
  const flag = isFood ? "foodValue" : "waterValue";
  const items = actor.items.filter(item => item.type === "consumable" && Number(item.getFlag(MODULE_ID, flag)) > 0);
  const options = items.map(item => {
    const value = Number(item.getFlag(MODULE_ID, flag) || 0);
    return `<option value="${item.id}">${foundry.utils.escapeHTML(item.name)} (+${value}%)</option>`;
  }).join("");

  const content = `<form class="food-dialog">
    <p>${game.i18n.localize(items.length ? "FOOD.Dialog.Choose" : "FOOD.Dialog.NoItems")}</p>
    ${items.length ? `<select name="itemId">${options}</select>` : ""}
    <hr>
    <label>${game.i18n.localize("FOOD.Dialog.Manual")}
      <input type="number" name="manual" min="0" max="100" step="1" value="0">
    </label>
  </form>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize(isFood ? "FOOD.Actions.Eat" : "FOOD.Actions.Drink") },
    content,
    buttons: [
      {
        action: "consume",
        label: game.i18n.localize("FOOD.Actions.Consume"),
        icon: "fa-solid fa-check",
        default: true,
        callback: async (_event, button, dialog) => {
          const form = dialogForm(button, dialog);
          if (!form) throw new Error("Food dialog form was not found");

          const selectedId = form.elements.itemId?.value;
          const item = selectedId ? actor.items.get(selectedId) : null;
          let amount = Number(form.elements.manual?.value || 0);

          if (item) {
            amount += Number(item.getFlag(MODULE_ID, flag) || 0);
          }

          if (amount <= 0) return;

          const api = getApi();
          if (!api) throw new Error("Food API is not ready");

          if (isFood) await api.changeSatiety(actor, amount, { notify: false });
          else await api.setHydration(actor, api.getHydration(actor) + amount, { notify: false });

          if (item) await consumeItemPortion(item);
        }
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ]
  });
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
        callback: async (_event, button, dialog) => {
          const form = dialogForm(button, dialog);
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
    console.error(`${MODULE_ID} | Could not resolve Actor for widget`, widget);
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
  widget.dataset.foodControlsBound = "true";
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
