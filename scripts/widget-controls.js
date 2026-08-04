const MODULE_ID = "food";

function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

function canControl(actor) {
  return game.user.isGM || (setting("allowPlayerAdjust") && actor?.isOwner);
}

function getApi() {
  return game.modules.get(MODULE_ID)?.api;
}

function dialogForm(button, dialog) {
  return button?.form
    ?? dialog?.element?.querySelector?.("form")
    ?? dialog?.window?.content?.querySelector?.("form")
    ?? null;
}

async function consume(actor, type) {
  const isFood = type === "food";
  const flag = isFood ? "foodValue" : "waterValue";
  const resource = isFood ? "satiety" : "hydration";
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
            const quantity = Number(foundry.utils.getProperty(item, "system.quantity") ?? 1);
            if (quantity > 0) await item.update({ "system.quantity": Math.max(0, quantity - 1) });
          }

          if (amount <= 0) return;
          const api = getApi();
          if (!api) throw new Error("Food API is not ready");
          if (resource === "satiety") await api.changeSatiety(actor, amount, { notify: false });
          else await api.changeHydration(actor, amount, { notify: false });
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

function bindWidget(actor, widget) {
  if (!actor || !widget || widget.dataset.foodControlsBound === "true") return;
  widget.dataset.foodControlsBound = "true";

  widget.addEventListener("pointerup", async event => {
    const button = event.target.closest?.("[data-food-action]");
    if (!button || !widget.contains(button)) return;

    event.preventDefault();
    event.stopPropagation();

    if (!canControl(actor)) {
      ui.notifications.warn("Food: you do not have permission to change this character.");
      return;
    }

    const action = button.dataset.foodAction;
    button.disabled = true;
    try {
      if (action === "eat") await consume(actor, "food");
      else if (action === "drink") await consume(actor, "water");
      else if (action === "adjust") await adjust(actor);
    } catch (error) {
      console.error(`${MODULE_ID} | Widget control failed`, error);
      ui.notifications.error(`Food: ${error.message ?? error}`);
    } finally {
      button.disabled = false;
    }
  }, { capture: true });
}

Hooks.on("foodWidgetInserted", bindWidget);
Hooks.on("renderActorSheet", (app, html) => {
  const actor = app.actor ?? app.document;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const widget = root?.querySelector?.(".food-widget");
  if (actor && widget) bindWidget(actor, widget);
});
Hooks.on("renderActorSheetV2", (app, html) => {
  const actor = app.actor ?? app.document;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const widget = root?.querySelector?.(".food-widget");
  if (actor && widget) bindWidget(actor, widget);
});
