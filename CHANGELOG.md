# Changelog

## Unreleased

- Tie each export to its source generation and captured filename; prevent replaced/removed sources and stale callbacks from producing mislabeled PDFs or changing newer progress.
- Pause file selection/removal and numeric layout changes during export; prevent duplicate saves and stale Reset confirmations from interrupting newer work.
- Re-read incomplete sources on Undo, while preserving filename and existing loaded-source page selections.
- Add browser-free source/export lifecycle regressions and run them against source, standalone, and the tracked root release in CI.

## 1.0.0 - 2026-09-17

- Publish the initial stable release after the v0.9.0 release-candidate regression.
- Keep PDF.js 6.3.289 fully embedded for source-page and generated-sheet Canvas previews while preserving vector PDF export.
- Confirm PDF/image/SVG tiling, multi-page selection, printer calibration, print-layout aids, assembly maps, mobile controls, save/cancel flows, bilingual UI, CSP, offline behavior, and self-extract packaging.
- Retain Sheet Preview backdrop-close behavior and the v0.8.2-v0.8.3 PDF preview fixes.

## 0.9.0 - 2026-09-17

- Mark the application as the release candidate for the initial stable release.
- Run the accumulated PDF, image/SVG, calibration, mobile, export/cancellation, PDF.js preview, CSP, and self-extract regression suite against the release artifacts.
- Refresh release documentation, screenshots, and artifact manifests for v0.9.0.
- Retain PDF.js 6.3.289 as a fully embedded preview dependency and keep PDF export vector-preserving.

## 0.8.4 - 2026-09-17

- Close Sheet Preview when the user clicks the modal backdrop.
- Keep interactions inside the preview, zoom controls, close button, and Escape behavior unchanged.
- Add browser regression coverage for inside-click versus backdrop-click behavior in normal and self-extract builds.

## 0.8.3 - 2026-09-17

- Fixed the PDF individual-sheet preview so the SVG fallback is hidden with a real `hidden` attribute while the PDF.js Canvas is displayed.
- Prevented the SVG fallback and generated-PDF Canvas from being laid out vertically at the same time, which made the sheet preview appear roughly twice as tall.
- Strengthened browser regression checks to assert computed `display: none`, zero SVG layout height, and no doubled preview scroll height.
- Kept generated PDF geometry, PDF.js 6.3.289 embedding, and vector-preserving PDF export unchanged.

## 0.8.2 - 2026-09-17

- Fixed individual PDF sheet previews so the Canvas height follows the actual PDF.js-rendered page aspect ratio instead of being independently forced from paper dimensions.
- Updated Fit zoom to use the rendered PDF Canvas aspect ratio when available.
- Kept generated PDF geometry and vector-preserving export unchanged.
- Added a regression check for the tile-preview aspect-ratio contract.

## 0.8.1 - 2026-09-17

- Replace browser-native PDF preview/opening with embedded PDF.js Canvas rendering.
- Render actual source PDF page content beneath the existing tiling/overlap/trim SVG overlay.
- Render the corresponding page from the actual generated tiled PDF in the individual-sheet preview.
- Remove the `blob:` + browser PDF viewer route and the placeholder `PDF VECTOR` preview.
- Add stale-render generation guards so an older asynchronous preview cannot overwrite the current file/tile.
- Keep tiled PDF export vector-preserving; PDF.js is used only for on-screen preview.
- Add PDF.js as an embedded Apache-2.0 dependency while retaining `connect-src 'none'`.
- Add pixel-level regression checks for nonblank main/tile Canvas output, plus normal/self-extract, 390 px mobile, and no-runtime-network checks.

## 0.8.0 - 2026-09-16

- Add a mobile bottom action bar with current sheet count, paper/orientation, preview shortcut, and PDF-save action.
- Reuse the bottom action as generated-page progress and cancellation while exporting.
- Reserve safe bottom spacing so fixed mobile controls do not cover app content or the footer.
- Collapse printer calibration by default as an advanced section and automatically open it whenever correction is enabled.
- Allow long selected filenames to wrap/clamp safely on narrow screens.
- Increase compact mobile touch targets and retain the supplied favicon/header icon.
- Keep v0.7.0 calibration and v0.6.0 multi-page/export behavior unchanged.

## 0.7.0 - 2026-09-16

- Add a locally generated one-page calibration PDF with exact 100 mm horizontal and vertical references.
- Add independent X/Y measured-length inputs and inverse scale correction (`100 / measured`).
- Keep calibration disabled by default and persist measurement/correction settings locally.
- Recalculate effective printable coverage and tile count when correction is enabled without changing the requested finished size.
- Apply calibrated transforms to vector PDF, raster image, and SVG tiled-PDF output.
- Apply corrected overlap geometry to trim lines and registration marks.
- Add explicit 100% / Actual size printing guidance and warn against Fit-to-page scaling.
- Retain v0.6.0 multi-page selection, fresh-PDF export, progress, and cancellation behavior.

## 0.6.0 - 2026-09-16

- Add multi-page PDF selection with all pages selected by default.
- Add active-page switching with per-page physical size and tile-count summaries.
- Add `Pxx-Rxx-Cxx` tile IDs while preserving original source page numbering when pages are excluded.
- Export selected source pages in source order with one optional assembly map per selected page.
- Add editable output filename normalization.
- Add determinate generated-page progress, cooperative cancellation, and explicit completion/cancel states.
- Preserve vector PDF content for included pages and keep excluded pages out of generated output.
- Rebuild selected-page PDFs as fresh files so excluded page-specific objects are not retained in a hidden incremental revision.

## 0.5.0 - 2026-09-16

- Add selectable per-sheet preview from the overall tiling map.
- Add fit / 100% / zoom controls for individual sheet inspection.
- Show actual cropped image/SVG placement in the individual preview.
- Add a vector assembly-map preview with tile IDs and top orientation.
- Append the assembly map as an optional final PDF page, enabled by default.
- Add an actual generated-PDF page check for PDF sources without rasterizing source vector content.

## 0.4.0 - 2026-09-16

- Add right/bottom trim lines to tiled PDF output.
- Add registration marks around trim positions.
- Add `Rxx-Cxx` page IDs to preview and PDF output.
- Visualize overlap bands and trim positions in the live preview.
- Add independent assembly-aid toggles for trim lines, registration marks, and page IDs.
- Replace the app icon and favicon with the supplied Large Print Tiler artwork.


All notable changes to Large Print Tiler are documented here.

## [0.3.0] - 2026-09-16

### Added

- Local PNG / JPEG / WebP / SVG parsing with image preview.
- PNG pHYs and JPEG JFIF physical-size handling plus SVG physical-unit parsing.
- Effective X/Y PPI guidance that updates with finished size.
- Tiled PDF output for raster images, with alpha soft-mask support and no intentional source-pixel downscaling.
- Explicit SVG rasterization notice for v0.3.0 PDF output.

## [0.2.0] - 2026-09-16

### Added

- Local PDF page-tree parsing for first-page MediaBox/CropBox, rotation, UserUnit, and page count.
- Automatic physical-size detection for PDF input.
- Vector-preserving tiled PDF proof that reuses original page content/resources instead of rasterizing.
- Clear handling for encrypted or unsupported PDFs and export progress/status UI.

## [0.1.0] - 2026-09-16

### Added

- Initial Browser Kitty application shell based on `htmlapps-template` v1.3.0.
- Physical-size layout engine for original-size, finished-size, and sheet-count modes.
- A4, A3, and Letter paper presets with portrait/landscape orientation.
- Printer-margin and overlap calculations.
- Live rows/columns/sheet-count summary and SVG tiling overview.
- Local setting persistence, bilingual UI, file drop/select shell, reset confirmation, and Undo for file removal.
- Completely local runtime configuration with no third-party dependency.
