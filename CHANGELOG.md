# Changelog

## 1.0.2 — 2026-08-03

- Removed the sample food fill from `assets/stomach-widget.svg`; the source artwork is now empty by default.
- Redrew the stomach with a more anatomically plausible J-shaped silhouette.
- Added visible esophageal entry, fundus/body curvature, antral narrowing, pyloric canal, and a short duodenal outlet.
- Added subtle gastric folds without implying that the stomach contains food.
- Updated the runtime template, fill geometry, and CSS for the new 220×220 viewBox.

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
