# Changelog

## 1.0.3 — 2026-08-04

- Fixed Eat, Drink, and Adjust buttons on Foundry VTT 14 / dnd5e sheets.
- Replaced per-element click handlers with capture-phase delegated controls that survive sheet DOM replacement.
- Added visible error notifications when a widget action fails.
- Fixed DialogV2 form lookup for Foundry VTT 14 callbacks.
- Added immediate percentage, state, hydration, and SVG refresh after Actor flag changes.
- Added fallback elapsed-time calculation when a time provider omits the `delta` argument.
- Added a hidden world-time checkpoint to prevent missed or duplicated decay.
- Updated automated validation for interaction and live-refresh markers.

## 1.0.2 — 2026-08-03

- Removed demonstration contents from the standalone SVG; it now opens empty by design.
- Reworked the stomach into a more anatomically representative J-shaped form.
- Added cardia, fundus, body, antrum, pylorus, and a short duodenal outlet.
- Added subtle internal rugae that remain separate from the dynamic food layer.
- Recalibrated runtime filling for the new 220 × 220 anatomical cavity.

## 1.0.1 — 2026-08-03

- Added `assets/stomach-widget.svg` as the editable standalone stomach artwork.
- Added `templates/stomach-widget.hbs` as the runtime inline SVG template.
- Added `scripts/stomach-widget.js` to preload and render the template in character sheets.
- Kept unique clip-path and gradient IDs per rendered sheet to avoid SVG collisions.
- Extended automated validation to check the SVG source, template, renderer, and manifest registration.

## 1.0.0 — 2026-08-03

- Initial Foundry VTT 14 release.
- Added an animated side-view cross-section stomach widget.
- Added configurable satiety decay and private threshold messages.
- Added optional hydration tracking.
- Added consumable Item nutrition values and manual adjustments.
- Added integration through Foundry's standard world-time hook, including Simple Timekeeping.
- Added English and Russian localization.
- Added tests and GitHub Actions validation.
