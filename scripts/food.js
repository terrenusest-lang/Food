const MODULE_ID = "food";
const F = {
  SATIETY: "satiety",
  HYDRATION: "hydration",
  NOTIFIED: "notifiedThresholds",
  LAST_TIME: "lastWorldTime",
  FOOD_VALUE: "foodValue",
  WATER_VALUE: "waterValue"
};

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const setting = key => game.settings.get(MODULE_ID, key);

function registerSettings() {
  const register = (key, data) => game.settings.register(MODULE_ID, key, {
    scope: "world",
    config: true,
    ...data
  });

  register("enabled", { name: "FOOD.Settings.Enabled.Name", hint: "FOOD.Settings.Enabled.Hint", type: Boolean, default: true });
  register("hydrationEnabled", { name: "FOOD.Settings.Hydration.Name", hint: "FOOD.Settings.Hydration.Hint", type: Boolean, default: false, requiresReload: true });
  register("hoursToEmpty", { name: "FOOD.Settings.HoursToEmpty.Name", hint: "FOOD.Settings.HoursToEmpty.Hint", type: Number, default: 24, range: { min: 1, max: 168, step: 1 } });
  register("waterHoursToEmpty", { name: "FOOD.Settings.WaterHoursToEmpty.Name", hint: "FOOD.Settings.WaterHoursToEmpty.Hint", type: Number, default: 12, range: { min: 1, max: 72, step: 1 } });
  register("thresholds", { name: "FOOD.Settings.Thresholds.Name", hint: "FOOD.Settings.Thresholds.Hint", type: String, default: "50,25,10,0" });
  register("thresholdMessages", { name: "FOOD.Settings.Messages.Name", hint: "FOOD.Settings.Messages.Hint", type: String, default: "50=You start thinking about food.|25=Your stomach growls loudly.|10=Hunger makes it difficult to concentrate.|0=You are starving." });
  register("whisperGM", { name: "FOOD.Settings.WhisperGM.Name", hint: "FOOD.Settings.WhisperGM.Hint", type: Boolean, default: true });
  register("showExactPercent", { name: "FOOD.Settings.ShowPercent.Name", hint: "FOOD.Settings.ShowPercent.Hint", type: Boolean, default: false });
  register("allowPlayerAdjust", { name: "FOOD.Settings.PlayerAdjust.Name", hint: "FOOD.Settings.PlayerAdjust.Hint", type: Boolean, default: true });
  register("applyExhaustion", { name: "FOOD.Settings.Exhaustion.Name", hint: "FOOD.Settings.Exhaustion.Hint", type: Boolean, default: false });
}

function thresholds() {
  return [...new Set(String(setting("thresholds"))
    .split(",")
    .map(Number)
    .filter(Number.isFinite)
    .map(value => clamp(value))
    .sort((a, b) => b - a))];
}

function messages() {
  const output = {};
  for (const part of String(setting("thresholdMessages")).split("|")) {
    const [key, ...message] = part.split("=");
    if (Number.isFinite(Number(key)) && message.length) output[clamp(key)] = message.join("=").trim();
  }
  return output;
}

function getValue(actor, key, fallback = 100) {
  return clamp(actor.getFlag(MODULE_ID, key) ?? fallback);
}

function stateFor(value) {
  if (value <= 0) return "empty";
  if (value <= 10) return "starving";
  if (value <= 25) return "hungry";
  if (value <= 50) return "peckish";
  if (value <= 75) return "comfortable";
  return "full";
}

function canControl(actor) {
  return game.user.isGM || (setting("allowPlayerAdjust") && actor.isOwner);
}

function actorWidgets(actor) {
  return document.querySelectorAll(`.food-widget[data-actor-id="${CSS.escape(actor.id)}"]`);
}

function updateWidgetText(actor) {
  const satiety = getValue(actor, F.SATIETY);
  const hydration = getValue(actor, F.HYDRATION);
  const exact = setting("showExactPercent") || game.user.isGM;

  for (const widget of actorWidgets(actor)) {
    const state = widget.querySelector(".food-state");
    if (state) state.textContent = game.i18n.localize(`FOOD.State.${stateFor(satiety)}`);

    const percent = widget.querySelector(".food-percent");
    if (percent) {
      percent.textContent = `${Math.round(satiety)}%`;
      percent.hidden = !exact;
    }

    const hydrationProgress = widget.querySelector(".food-hydration progress");
    if (hydrationProgress) hydrationProgress.value = hydration;

    const hydrationPercent = widget.querySelector(".food-hydration-percent");
    if (hydrationPercent) {
      hydrationPercent.textContent = `${Math.round(hydration)}%`;
      hydrationPercent.hidden = !exact;
    }
  }
}

async function setResource(actor, key, next, { notify = true } = {}) {
  const oldValue = getValue(actor, key);
  const newValue = clamp(next);
  if (oldValue === newValue) return newValue;

  await actor.setFlag(MODULE_ID, key, newValue);
  if (key === F.SATIETY && notify) await processThresholds(actor, oldValue, newValue);

  updateWidgetText(actor);
  Hooks.callAll("foodResourceChanged", actor, key, oldValue, newValue);
  return newValue;
}

async function changeResource(actor, key, delta, options) {
  return setResource(actor, key, getValue(actor, key) + Number(delta || 0), options);
}

async function processThresholds(actor, oldValue, newValue) {
  const notified = foundry.utils.deepClone(actor.getFlag(MODULE_ID, F.NOTIFIED) ?? {});
  for (const threshold of thresholds()) if (newValue > threshold) delete notified[threshold];

  const crossed = thresholds().filter(threshold => oldValue > threshold && newValue <= threshold && !notified[threshold]);
  if (crossed.length) {
    const threshold = crossed[crossed.length - 1];
    notified[threshold] = true;
    await actor.setFlag(MODULE_ID, F.NOTIFIED, notified);
    await sendHungerMessage(actor, threshold, newValue);
    if (threshold === 0 && setting("applyExhaustion")) await addExhaustion(actor);
  } else {
    await actor.setFlag(MODULE_ID, F.NOTIFIED, notified);
  }
}

async function sendHungerMessage(actor, threshold, value) {
  const message = messages()[threshold] ?? game.i18n.format("FOOD.Chat.DefaultHunger", { name: actor.name });
  const exact = setting("showExactPercent")
    ? `<div class="food-chat-percent">${game.i18n.localize("FOOD.Satiety")}: ${Math.round(value)}%</div>`
    : "";
  const owners = game.users
    .filter(user => !user.isGM && user.active && actor.testUserPermission(user, "OWNER"))
    .map(user => user.id);
  const gmIds = setting("whisperGM") ? ChatMessage.getWhisperRecipients("GM").map(user => user.id) : [];

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<section class="food-chat"><strong>${game.i18n.localize("FOOD.Chat.Hunger")}</strong><p>${foundry.utils.escapeHTML(message)}</p>${exact}</section>`,
    whisper: [...new Set([...owners, ...gmIds])]
  });
}

async function addExhaustion(actor) {
  const path = "system.attributes.exhaustion";
  const current = foundry.utils.getProperty(actor, path);
  if (typeof current === "number") await actor.update({ [path]: Math.min(6, current + 1) });
}

function widgetHtml(actor) {
  const satiety = getValue(actor, F.SATIETY);
  const hydration = getValue(actor, F.HYDRATION);
  const exact = setting("showExactPercent") || game.user.isGM;
  const controlsDisabled = canControl(actor) ? "" : "disabled";

  return `<section class="food-widget" data-actor-id="${actor.id}">
    <header><i class="fa-solid fa-bowl-food"></i>${game.i18n.localize("FOOD.Title")}</header>
    <div class="food-resource">
      <div class="food-visual">
        <div class="food-stomach-host" aria-live="polite"></div>
        <span class="food-state">${game.i18n.localize(`FOOD.State.${stateFor(satiety)}`)}</span>
        <b class="food-percent" ${exact ? "" : "hidden"}>${Math.round(satiety)}%</b>
      </div>
      <div class="food-actions">
        <button type="button" data-food-action="eat" ${controlsDisabled}><i class="fa-solid fa-utensils"></i>${game.i18n.localize("FOOD.Actions.Eat")}</button>
        <button type="button" data-food-action="adjust" ${controlsDisabled}><i class="fa-solid fa-sliders"></i>${game.i18n.localize("FOOD.Actions.Adjust")}</button>
      </div>
    </div>
    ${setting("hydrationEnabled") ? `<div class="food-hydration">
      <i class="fa-solid fa-droplet"></i><span>${game.i18n.localize("FOOD.Hydration")}</span>
      <progress max="100" value="${hydration}"></progress>
      <b class="food-hydration-percent" ${exact ? "" : "hidden"}>${Math.round(hydration)}%</b>
      <button type="button" data-food-action="drink" ${controlsDisabled}><i class="fa-solid fa-glass-water"></i></button>
    </div>` : ""}
  </section>`;
}

function getRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function injectWidget(app, html) {
  if (!setting("enabled")) return;
  const actor = app.actor ?? app.document;
  if (!(actor instanceof Actor) || actor.type !== "character") return;

  const root = getRoot(html);
  if (!root || root.querySelector(".food-widget")) return;
  const target = root.querySelector(".sheet-body, .window-content, form") ?? root;
  target.insertAdjacentHTML("afterbegin", widgetHtml(actor));
  Hooks.callAll("foodWidgetInserted", actor, target.querySelector(`.food-widget[data-actor-id="${CSS.escape(actor.id)}"]`));
}

function dialogForm(button, dialog) {
  return button?.form
    ?? dialog?.element?.querySelector?.("form")
    ?? dialog?.window?.content?.querySelector?.("form")
    ?? null;
}

async function openConsumeDialog(actor, type) {
  const flag = type === "food" ? F.FOOD_VALUE : F.WATER_VALUE;
  const items = actor.items.filter(item => item.type === "consumable" && Number(item.getFlag(MODULE_ID, flag)) > 0);
  const options = items.map(item => `<option value="${item.id}">${foundry.utils.escapeHTML(item.name)} (+${Number(item.getFlag(MODULE_ID, flag))}%)</option>`).join("");
  const content = `<form class="food-dialog">
    <p>${game.i18n.localize(items.length ? "FOOD.Dialog.Choose" : "FOOD.Dialog.NoItems")}</p>
    ${items.length ? `<select name="itemId">${options}</select>` : ""}
    <hr>
    <label>${game.i18n.localize("FOOD.Dialog.Manual")}<input type="number" name="manual" min="0" max="100" step="1" value="0"></label>
  </form>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize(type === "food" ? "FOOD.Actions.Eat" : "FOOD.Actions.Drink") },
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

          const item = actor.items.get(form.elements.itemId?.value);
          let amount = Number(form.elements.manual?.value || 0);
          if (item) {
            amount += Number(item.getFlag(MODULE_ID, flag) || 0);
            const quantity = Number(foundry.utils.getProperty(item, "system.quantity") ?? 1);
            if (quantity > 0) await item.update({ "system.quantity": Math.max(0, quantity - 1) });
          }
          if (amount > 0) await changeResource(actor, type === "food" ? F.SATIETY : F.HYDRATION, amount, { notify: false });
        }
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ]
  });
}

async function openAdjustDialog(actor) {
  const content = `<form class="food-dialog">
    <label>${game.i18n.localize("FOOD.Satiety")}<input name="satiety" type="number" min="0" max="100" value="${getValue(actor, F.SATIETY)}"></label>
    ${setting("hydrationEnabled") ? `<label>${game.i18n.localize("FOOD.Hydration")}<input name="hydration" type="number" min="0" max="100" value="${getValue(actor, F.HYDRATION)}"></label>` : ""}
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
          await setResource(actor, F.SATIETY, form.elements.satiety.value);
          if (setting("hydrationEnabled")) await setResource(actor, F.HYDRATION, form.elements.hydration.value, { notify: false });
        }
      },
      { action: "cancel", label: game.i18n.localize("Cancel") }
    ]
  });
}

function installDelegatedControls() {
  document.addEventListener("click", async event => {
    const button = event.target.closest?.(".food-widget [data-food-action]");
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    const widget = button.closest(".food-widget");
    const actor = game.actors.get(widget?.dataset.actorId);
    if (!actor || !canControl(actor)) return;

    button.disabled = true;
    try {
      const action = button.dataset.foodAction;
      if (action === "eat") await openConsumeDialog(actor, "food");
      else if (action === "drink") await openConsumeDialog(actor, "water");
      else if (action === "adjust") await openAdjustDialog(actor);
    } catch (error) {
      console.error(`${MODULE_ID} | Widget action failed`, error);
      ui.notifications.error(`Food: ${error.message ?? error}`);
    } finally {
      button.disabled = false;
    }
  }, true);
}

function addItemConfig(app, html) {
  const item = app.item ?? app.document;
  if (!(item instanceof Item) || item.type !== "consumable") return;

  const root = getRoot(html);
  const form = root?.querySelector("form") ?? root;
  if (!form || form.querySelector(".food-item-config")) return;

  form.insertAdjacentHTML("beforeend", `<fieldset class="food-item-config">
    <legend>${game.i18n.localize("FOOD.ItemConfig.Title")}</legend>
    <label>${game.i18n.localize("FOOD.ItemConfig.FoodValue")}<input type="number" name="flags.${MODULE_ID}.${F.FOOD_VALUE}" min="0" max="100" step="1" value="${Number(item.getFlag(MODULE_ID, F.FOOD_VALUE) || 0)}"></label>
    ${setting("hydrationEnabled") ? `<label>${game.i18n.localize("FOOD.ItemConfig.WaterValue")}<input type="number" name="flags.${MODULE_ID}.${F.WATER_VALUE}" min="0" max="100" step="1" value="${Number(item.getFlag(MODULE_ID, F.WATER_VALUE) || 0)}"></label>` : ""}
  </fieldset>`);
}

async function processElapsedTime(worldTime, delta) {
  if (!setting("enabled") || !game.user.isGM) return;

  const numericWorldTime = Number(worldTime);
  let elapsedSeconds = Number(delta);
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    const previous = Number(game.settings.get(MODULE_ID, "lastProcessedWorldTime") || numericWorldTime);
    elapsedSeconds = numericWorldTime - previous;
  }
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return;

  await game.settings.set(MODULE_ID, "lastProcessedWorldTime", numericWorldTime);
  const hours = elapsedSeconds / 3600;
  const foodLoss = 100 / Math.max(1, Number(setting("hoursToEmpty"))) * hours;
  const waterLoss = 100 / Math.max(1, Number(setting("waterHoursToEmpty"))) * hours;

  for (const actor of game.actors.filter(candidate => candidate.type === "character")) {
    await changeResource(actor, F.SATIETY, -foodLoss);
    if (setting("hydrationEnabled")) await changeResource(actor, F.HYDRATION, -waterLoss, { notify: false });
    await actor.setFlag(MODULE_ID, F.LAST_TIME, numericWorldTime);
  }
}

Hooks.once("init", () => {
  registerSettings();
  game.settings.register(MODULE_ID, "lastProcessedWorldTime", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });
  console.log(`${MODULE_ID} | Initialized`);
});

Hooks.once("ready", () => {
  installDelegatedControls();
  game.modules.get(MODULE_ID).api = {
    getSatiety: actor => getValue(actor, F.SATIETY),
    setSatiety: (actor, value, options) => setResource(actor, F.SATIETY, value, options),
    changeSatiety: (actor, delta, options) => changeResource(actor, F.SATIETY, delta, options),
    getHydration: actor => getValue(actor, F.HYDRATION),
    setHydration: (actor, value, options) => setResource(actor, F.HYDRATION, value, options)
  };

  if (game.user.isGM && !game.settings.get(MODULE_ID, "lastProcessedWorldTime")) {
    game.settings.set(MODULE_ID, "lastProcessedWorldTime", Number(game.time.worldTime) || 0);
  }
  if (game.modules.get("simple-timekeeping")?.active) ui.notifications.info(game.i18n.localize("FOOD.Notifications.TimekeepingDetected"));
});

Hooks.on("renderActorSheet", injectWidget);
Hooks.on("renderActorSheetV2", injectWidget);
Hooks.on("renderItemSheet", addItemConfig);
Hooks.on("renderItemSheetV2", addItemConfig);
Hooks.on("updateWorldTime", processElapsedTime);
Hooks.on("updateActor", actor => {
  if (actor.type !== "character") return;
  updateWidgetText(actor);
  Hooks.callAll("foodActorUpdated", actor);
});
