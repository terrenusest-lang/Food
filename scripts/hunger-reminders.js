const MODULE_ID = "food";
const LAST_REMINDER_FLAG = "lastHungerReminderRealTime";
const CHECK_INTERVAL_MS = 30_000;

const setting = key => game.settings.get(MODULE_ID, key);
const clamp = value => Math.min(100, Math.max(0, Number(value) || 0));

function registerReminderSettings() {
  game.settings.register(MODULE_ID, "hungerRemindersEnabled", {
    scope: "world",
    config: true,
    name: "FOOD.Settings.HungerReminders.Name",
    hint: "FOOD.Settings.HungerReminders.Hint",
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "hungerReminderMinutes", {
    scope: "world",
    config: true,
    name: "FOOD.Settings.HungerReminderMinutes.Name",
    hint: "FOOD.Settings.HungerReminderMinutes.Hint",
    type: Number,
    default: 5,
    range: { min: 1, max: 60, step: 1 }
  });
}

function configuredThresholds() {
  return [...new Set(String(setting("thresholds"))
    .split(",")
    .map(Number)
    .filter(Number.isFinite)
    .map(clamp)
    .sort((a, b) => b - a))];
}

function configuredMessages() {
  const result = {};
  for (const part of String(setting("thresholdMessages")).split("|")) {
    const [rawThreshold, ...messageParts] = part.split("=");
    const threshold = Number(rawThreshold);
    if (!Number.isFinite(threshold) || !messageParts.length) continue;
    result[clamp(threshold)] = messageParts.join("=").trim();
  }
  return result;
}

function thresholdFor(value) {
  const matches = configuredThresholds().filter(threshold => value <= threshold);
  return matches.length ? matches[matches.length - 1] : null;
}

function reminderRecipients(actor) {
  const owners = game.users
    .filter(user => !user.isGM && user.active && actor.testUserPermission(user, "OWNER"))
    .map(user => user.id);
  const gms = setting("whisperGM")
    ? ChatMessage.getWhisperRecipients("GM").filter(user => user.active).map(user => user.id)
    : [];
  return [...new Set([...owners, ...gms])];
}

async function sendReminder(actor, value, threshold) {
  const message = configuredMessages()[threshold]
    ?? game.i18n.format("FOOD.Chat.DefaultHunger", { name: actor.name });
  const exact = setting("showExactPercent")
    ? `<div class="food-chat-percent">${game.i18n.localize("FOOD.Satiety")}: ${Math.round(value)}%</div>`
    : "";
  const whisper = reminderRecipients(actor);
  if (!whisper.length) return;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<section class="food-chat"><strong>${game.i18n.localize("FOOD.Chat.HungerReminder")}</strong><p>${foundry.utils.escapeHTML(message)}</p>${exact}</section>`,
    whisper
  });
  await actor.setFlag(MODULE_ID, LAST_REMINDER_FLAG, Date.now());
}

async function checkHungerReminders() {
  if (!game.user.isGM || !setting("enabled") || !setting("hungerRemindersEnabled")) return;

  const intervalMs = Math.max(1, Number(setting("hungerReminderMinutes")) || 5) * 60_000;
  const now = Date.now();
  const api = game.modules.get(MODULE_ID)?.api;
  if (!api) return;

  for (const actor of game.actors.filter(candidate => candidate.type === "character")) {
    const value = clamp(api.getSatiety(actor));
    const threshold = thresholdFor(value);
    const highestThreshold = configuredThresholds()[0];

    if (threshold == null || value > highestThreshold) {
      if (actor.getFlag(MODULE_ID, LAST_REMINDER_FLAG)) {
        await actor.unsetFlag(MODULE_ID, LAST_REMINDER_FLAG);
      }
      continue;
    }

    const lastSent = Number(actor.getFlag(MODULE_ID, LAST_REMINDER_FLAG) || 0);
    if (now - lastSent < intervalMs) continue;
    await sendReminder(actor, value, threshold);
  }
}

Hooks.once("init", registerReminderSettings);
Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  setInterval(() => {
    checkHungerReminders().catch(error => {
      console.error(`${MODULE_ID} | Hunger reminder check failed`, error);
    });
  }, CHECK_INTERVAL_MS);
});
