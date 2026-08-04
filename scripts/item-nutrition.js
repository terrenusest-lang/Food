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

function nutritionMarkup(item) {
  const foodValue = Number(item.getFlag(MODULE_ID, "foodValue") ?? 0);
  const waterValue = Number(item.getFlag(MODULE_ID, "waterValue") ?? 0);

  return `<fieldset class="food-item-config food-item-config-v2">
    <legend><i class="fa-solid fa-bowl-food"></i> ${game.i18n.localize("FOOD.ItemConfig.Title")}</legend>
    <div class="form-group">
      <label>${game.i18n.localize("FOOD.ItemConfig.FoodValue")}</label>
      <div class="form-fields">
        <input type="number" data-food-item-flag="foodValue" min="0" max="100" step="1" value="${foodValue}">
        <span class="units">%</span>
      </div>
    </div>
    ${hydrationEnabled() ? `<div class="form-group">
      <label>${game.i18n.localize("FOOD.ItemConfig.WaterValue")}</label>
      <div class="form-fields">
        <input type="number" data-food-item-flag="waterValue" min="0" max="100" step="1" value="${waterValue}">
        <span class="units">%</span>
      </div>
    </div>` : ""}
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

function bindInputs(item, block) {
  block.addEventListener("change", async event => {
    const input = event.target.closest?.("[data-food-item-flag]");
    if (!input) return;

    const key = input.dataset.foodItemFlag;
    const value = Math.min(100, Math.max(0, Number(input.value) || 0));
    input.value = String(value);

    try {
      await item.setFlag(MODULE_ID, key, value);
      ui.notifications.info(`${game.i18n.localize("FOOD.ItemConfig.Title")}: ${value}%`);
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to save Item nutrition`, error);
      ui.notifications.error(`Food: ${error.message ?? error}`);
    }
  });
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
