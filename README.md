# Food — Satiety Tracker for Foundry VTT 14

`Food` is a D&D 5e module for Foundry VTT 14 that adds an animated side-view stomach widget to character sheets. The stomach contents rise and fall with satiety. Hydration is optional, eating never posts to chat, and hunger warnings are sent privately only when configured thresholds are crossed.

## Features

- Animated SVG stomach rather than a conventional progress bar.
- Satiety from 0% to 100% with six descriptive states.
- Optional hydration, disabled by default.
- Configurable decay measured in game-world hours.
- No chat messages when eating, drinking, or manually increasing a resource.
- Configurable private hunger warnings.
- Warning anti-spam: one message per downward threshold crossing.
- Consumable Items can restore configurable satiety/hydration values.
- Manual adjustment for tavern meals, spells, rests, and GM corrections.
- Optional D&D 5e exhaustion when satiety first reaches 0%.
- English and Russian localization.
- Public API and `foodResourceChanged` hook.
- Simple Timekeeping compatibility through Foundry's official world-time hook.

## Requirements

- Foundry Virtual Tabletop 14
- D&D 5e game system
- Simple Timekeeping is optional and recommended

## Installation

In Foundry Setup open **Add-on Modules → Install Module** and paste:

```text
https://raw.githubusercontent.com/terrenusest-lang/Food/main/module.json
```

Install the module, open the D&D 5e world, enable **Food — Satiety Tracker** in **Manage Modules**, and reload the world.

For manual installation, download the repository ZIP, rename the extracted directory to `food`, and place it in `{Foundry user data}/Data/modules/food`.

## Recommended initial settings

Open **Game Settings → Configure Settings → Module Settings → Food — Satiety Tracker**.

| Setting | Recommended value |
|---|---:|
| Enable satiety tracking | On |
| Enable hydration | Off |
| Hours until completely hungry | 24 |
| Hunger thresholds | `50,25,10,0` |
| Whisper warnings to GM | On |
| Show exact percentages | Off |
| Allow player controls | On |
| Apply exhaustion at 0% | Off until tested |

Suggested Russian warning configuration:

```text
50=Ты начинаешь думать о еде.|25=У тебя громко урчит в животе.|10=Голод мешает сосредоточиться.|0=Ты изнурён отсутствием пищи.
```

Messages use the format `threshold=message` and are separated by `|`.

## Stomach widget

The widget is inserted near the top of D&D 5e character sheets. The visible contents are clipped to the anatomical stomach shape and move vertically according to satiety.

| Satiety | State |
|---:|---|
| 76–100% | Full / Сыт |
| 51–75% | Comfortable / Комфортно |
| 26–50% | Peckish / Проголодался |
| 11–25% | Hungry / Голоден |
| 1–10% | Starving / Сильно голоден |
| 0% | Empty / Пусто |

At 10% or less, the widget receives a subtle rumble animation. GMs always see exact percentages. Players see them only when **Show exact percentages** is enabled.

## Configuring food Items

Food values are stored on D&D 5e Items of type **Consumable**.

1. Open a consumable Item.
2. Locate **Food — Nutrition values**.
3. Enter **Satiety restored (%)**.
4. When hydration is enabled, optionally enter **Hydration restored (%)**.
5. Save the Item and place it in a character inventory.

Suggested values:

| Item | Satiety | Hydration |
|---|---:|---:|
| Full daily ration | 100% | 0% |
| Half ration | 50% | 0% |
| Large meal | 60% | 10% |
| Bowl of stew | 35% | 15% |
| Apple | 10% | 3% |
| Goodberry | 10% | 0% |
| Waterskin serving | 0% | 50% |

These percentages are campaign abstractions. Adjust them to the desired amount of survival bookkeeping.

## Player use

### Eating

1. Open the character sheet.
2. Select **Eat / Поесть**.
3. Choose a configured consumable or enter a manual amount.
4. Select **Consume / Употребить**.

The module reduces the Item quantity by one, increases satiety, animates the stomach, and creates no chat message.

### Manual adjustment

Use **Adjust / Изменить** to set an exact value. This is useful for tavern meals, NPC-provided food, spells, feasts, and corrections. Disable **Allow player controls** when only the GM should modify nutrition.

### Hydration

Enable hydration in module settings and reload the world. A water bar and Drink button appear. Hydration has its own decay rate and Item value. Disabling hydration hides and stops processing it but does not delete saved flags.

## Hunger warnings

Warnings are sent only when satiety crosses a threshold from above.

- `53% → 49%`: sends the 50% warning.
- `49% → 45%`: sends nothing.
- Eating to 70% re-arms the 50% threshold.
- Falling to 49% later sends it again.

The warning is whispered to active owners of the Actor. Active GMs are included when **Whisper warnings to GM** is enabled. Other players do not see it. If several thresholds are crossed by one large time jump, only the lowest newly crossed warning is sent to prevent chat spam.

## Simple Timekeeping integration

Food includes no clock or calendar. It listens to Foundry VTT's standard hook:

```javascript
Hooks.on("updateWorldTime", (worldTime, delta) => {});
```

Simple Timekeeping advances Foundry world time, so integration works without using undocumented module internals. Other modules and macros that correctly advance `game.time.worldTime` are also compatible.

Default calculation:

```text
satiety loss = 100 / Hours until completely hungry × elapsed game hours
```

With the default 24-hour setting, advancing six game hours removes 25 percentage points.

Only an active GM client processes elapsed time. This prevents each connected player from applying the same loss. Large jumps are handled as one delta and values are clamped to 0–100%.

### Integration test

1. Enable Food and Simple Timekeeping.
2. Set a character to 100% satiety.
3. Advance Simple Timekeeping by one hour.
4. Reopen the character sheet.
5. With a 24-hour decay setting, the value should be approximately 95.83%.

## Settings reference

### Enable satiety tracking
Master switch for the widget and world-time processing.

### Enable hydration
Adds the optional hydration resource and Item field. Reload after changing it.

### Hours until completely hungry
Game hours required to reduce satiety from 100% to 0%. Range: 1–168.

### Hours until completely dehydrated
Equivalent setting for hydration. Used only when hydration is enabled.

### Hunger notification thresholds
Comma-separated percentages, for example `50,25,10,0`. Invalid entries are ignored; duplicates are removed.

### Threshold messages
Pipe-separated `threshold=message` entries. Text is escaped before being shown in chat.

### Whisper warnings to GM
Includes active GMs in private hunger messages.

### Show exact percentages
Players see exact values instead of only descriptive states. GMs always see exact values.

### Allow player controls
Actor owners may use Eat, Drink, and Adjust. GMs always can.

### Apply exhaustion at 0%
When satiety crosses from above 0% to 0%, the module attempts to increment `system.attributes.exhaustion`. Disabled by default because campaign and dnd5e exhaustion workflows may differ. Test it on a copy of an Actor first.

## Public API

Available after `ready`:

```javascript
const api = game.modules.get("food")?.api;
api.getSatiety(actor);
await api.setSatiety(actor, 75);
await api.changeSatiety(actor, -10);
api.getHydration(actor);
await api.setHydration(actor, 90);
```

Suppress threshold notifications during scripted changes:

```javascript
await api.setSatiety(actor, 100, { notify: false });
```

Food also emits:

```javascript
Hooks.on("foodResourceChanged", (actor, resource, oldValue, newValue) => {
  console.log(actor.name, resource, oldValue, newValue);
});
```

## Macro examples

Feed the selected token by 25%:

```javascript
const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) return ui.notifications.warn("Select a token.");
await game.modules.get("food").api.changeSatiety(actor, 25);
```

Fill all character Actors after a feast:

```javascript
const api = game.modules.get("food").api;
for (const actor of game.actors.filter(a => a.type === "character")) {
  await api.setSatiety(actor, 100, { notify: false });
}
```

## Stored data

Actor flags:

```text
flags.food.satiety
flags.food.hydration
flags.food.notifiedThresholds
flags.food.lastWorldTime
```

Consumable Item flags:

```text
flags.food.foodValue
flags.food.waterValue
```

Removing or disabling the module does not delete flags; they remain inert.

## Troubleshooting

### Widget does not appear

- Confirm Foundry 14 and dnd5e.
- Confirm the Actor type is `character`.
- Confirm the module is enabled and reload the world.
- Check the browser console for `food | Initialized`.

### Time advances but satiety does not change

- Ensure an active GM is connected.
- Confirm satiety tracking is enabled.
- Confirm the time module changes official Foundry world time.
- Advance at least one full game hour for an obvious test.

### No Items appear in Eat

- The Item must be a dnd5e `consumable`.
- Enter a positive Satiety restored value and save it.
- Ensure the Item is in that Actor's inventory.

### Warning does not appear

A warning requires a downward crossing. Initializing an Actor directly below a threshold does not count as crossing it.

### Exhaustion does not change

Confirm the setting is enabled, the Actor exposes numeric `system.attributes.exhaustion`, and satiety actually crossed from a positive value to 0%.

## Development and validation

Requires Node.js 20 or newer.

```bash
npm test
npm run check
```

GitHub Actions validates the manifest, localization JSON, integration markers, and JavaScript syntax on every push and pull request.

## License

MIT. See [LICENSE](LICENSE).
