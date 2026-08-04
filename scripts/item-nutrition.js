const MODULE_ID = "food";

function getItem(application) {
  const document = application?.item ?? application?.document ?? application?.object;
  return document instanceof Item ? document : null;
}

function isConsumable(item) {
  return item?.type === "consumable";
}

function hydrationEnabled() {
  return game.settings.get(MODULE_ID, "hydrationEnabled");
}

function nutritionRow(label, flag, value) {
  return `<div class="food-nutrition-row">
    <label for="food-${flag}">${label}</label>
    <div class="food-nutrition-control">
      <input
        id="food-${flag}"
        class="food-nutrition-input"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="3"
        autocomplete="off"
        spellcheck="false"
        data-food-item-flag="${flag}"
        value="${value}"
        aria-label="${label}">
      <span class="food-nutrition-unit" aria-hidden="true">%</span>
    </div>
  </div>`;
}

function nutritionMarkup(item) {
  const foodValue = Number(item.getFlag(MODULE_ID, "foodValue") ?? 0);
  const waterValue = Number(item.getFlag(MODULE_ID, "waterValue") ?? 0);

  return `<fieldset class="food-item-config food-item-config-v2">
    <legend><i class="fa-solid fa-bowl-food"></i><span>${game.i18n.localize("FOOD.ItemConfig.Title")}</span></legend>
    ${nutritionRow(game.i18n.localize("FOOD.ItemConfig.FoodValue"), "foodValue", foodValue)}
    ${hydrationEnabled() ? nutritionRow(game.i18n.localize("FOOD.ItemConfig.WaterValue"), "waterValue", waterValue) : ""}
  </fieldset>`;
}

function findInsertionTarget(element) {
  const detailsTab = element.querySelector('[data-tab="details"], .tab.details, .details.tab');
  if (detailsTab) {
    const consumableSection = [...detailsTab.querySelectorAll("fieldset")].find(fieldset =>
      /consumable/i.test(fieldset.textContent ?? "")
    );
    return { parent: detailsTab, after: consumableSection };
  }

  const form = element.querySelector("form") ?? element;
  return { parent: form, after: null };
}

function normalizeValue(raw) {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!digits) return 0;
  return Math.min(100, Math.max(0, Number(digits)));
}

async function saveInput(item, input) {
  const key = input.dataset.foodItemFlag;
  const value = normalizeValue(input.value);
  input.value = String(value);

  try {
    await item.setFlag(MODULE_ID, key, value);
    input.dataset.savedValue = String(value);
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to save Item nutrition`, error);
    ui.notifications.error(`Food: ${error.message ?? error}`);
  }
}

function bindInputs(item, block) {
  for (const input of block.querySelectorAll("[data-food-item-flag]")) {
    input.dataset.savedValue = input.value;

    for (const eventName of ["pointerdown", "mousedown", "click", "dblclick", "keydown", "keyup"]) {
      input.addEventListener(eventName, event => event.stopPropagation());
    }

    input.addEventListener("focus", () => input.select());

    input.addEventListener("input", () => {
      const cleaned = input.value.replace(/[^0-9]/g, "").slice(0, 3);
      if (input.value !== cleaned) input.value = cleaned;
    });

    input.addEventListener("keydown", async event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      await saveInput(item, input);
      input.blur();
    });

    input.addEventListener("blur", () => saveInput(item, input));
    input.addEventListener("change", () => saveInput(item, input));
  }
}

function injectNutrition(application, element) {
  const item = getItem(application);
  if (!item || !isConsumable(item) || !(element instanceof HTMLElement)) return;
  if (element.querySelector(".food-item-config-v2")) return;

  const { parent, after } = findInsertionTarget(element);
  if (!parent) return;

  const template = document.createElement("template");
  template.innerHTML = nutritionMarkup(item).trim();
  const block = template.content.firstElementChild;
  if (!block) return;

  if (after?.parentElement) after.insertAdjacentElement("afterend", block);
  else parent.append(block);

  bindInputs(item, block);
}

Hooks.on("renderApplicationV2", injectNutrition);
Hooks.on("renderItemSheetV2", injectNutrition);
Hooks.on("renderItemSheet", injectNutrition);
