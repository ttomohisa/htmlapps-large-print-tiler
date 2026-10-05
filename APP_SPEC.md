# APP_SPEC.md — Large Print Tiler / 大判分割印刷

## 1. Product identity

- **Name:** Large Print Tiler
- **Japanese name:** 大判分割印刷
- **Version:** 1.0.0
- **Repository:** `ttomohisa/htmlapps-large-print-tiler`
- **Purpose:** Split large PDF/image/SVG content across ordinary paper while keeping intended physical size, printer margin, overlap, and image resolution explicit.
- **Release artifacts:** `dist/index.html` and `dist/index.self-extract.html`.

## 2. Product direction

This is not a poster-design editor. The core job is physical-size-aware tiling for print. Files are processed locally in the browser and are not uploaded by the app.

## 3. v1.0.0 Stable release scope

v1.0.0 is the initial stable release. No new processing subsystem is introduced beyond the v0.9.0 release candidate; the goal is to publish the behavior accumulated through v0.8.4 after the complete Browser Kitty release surface passed the final regression.

Stable-release requirements:

- Keep embedded PDF.js 6.3.289 Canvas preview for source PDF pages and generated individual-sheet PDF pages.
- Keep PDF export vector-preserving; PDF.js remains preview-only.
- Keep PDF multi-page include/exclude, original source-page numbering, fresh-PDF rebuild, filename editing, progress, and cancellation.
- Keep PNG / JPEG / WebP / SVG input, physical-size handling, effective PPI guidance, and raster/SVG tiled-PDF export.
- Keep 100 mm printer calibration with independent X/Y correction.
- Keep trim lines, registration marks, page IDs, overlap visualization, and assembly maps.
- Keep desktop and 390 px mobile layouts free of horizontal overflow and fixed-UI overlap.
- Keep Japanese / English switching, long-filename handling, empty/error/success/cancel states, and destructive reset confirmation.
- Sheet Preview must close with the close button, Escape, or a click on the backdrop; interactions inside the dialog must not close it.
- Keep runtime external communication at zero with `connect-src 'none'` and embedded dependencies only.
- Keep normal standalone and self-extract outputs behaviorally equivalent, with byte-for-byte restoration of `dist/index.html` from the self-extract payload.
- Release documentation, favicon, screenshots, dependency manifests, and version labels must all identify v1.0.0 consistently.

## 4. Calibration contract

The calibration PDF itself is **never corrected**. It is the neutral reference used to measure the printer/driver/viewer scaling behavior.

For each axis:

- reference length = `100 mm`
- measured printed length = `M`
- correction factor `C = 100 / M`

Examples:

- 100 mm prints as 100 mm → `C = 1.0000` → 100.00%
- 100 mm prints as 98 mm → `C = 1.020408...` → 102.04%
- 100 mm prints as 101 mm → `C = 0.990099...` → 99.01%

X and Y are intentionally independent because some driver/printer pipelines can introduce slightly different scaling per axis.

The measurement input range is 50–150 mm. Values are settings, not source-file data, and may be saved in localStorage.

## 5. Calibrated layout geometry

Without correction:

- `nominalPrintable = paperSize - 2 * margin`
- `printable = nominalPrintable`

With correction factor `C`:

- `effectivePrintable = nominalPrintable / C`
- `step = effectivePrintable - overlap`
- when `target <= effectivePrintable`, tiles = 1
- otherwise `tiles = ceil((target - effectivePrintable) / step) + 1`

Sheet-count mode derives:

`target = effectivePrintable + (sheetCount - 1) * step`

`target` remains the intended final physical dimension. The correction is applied only to the generated PDF coordinate transforms.

For PDF coordinates, intended physical distances are multiplied by the corresponding correction factor. The page MediaBox/CropBox and user-selected printer margin remain nominal paper coordinates. This lets the printer's measured scaling error bring the corrected output back toward the intended physical dimensions.

Overlap is an intended final physical distance. Its PDF-coordinate representation is therefore multiplied by the same axis correction factor before trim lines and registration marks are drawn.

## 6. Multi-page selection contract retained

- Page indexes follow the original PDF order and never renumber after exclusions.
- `P01`, `P02`, ... identify original source pages, not their position in the selected subset.
- All parsed pages are selected by default.
- `Select all` selects every source page.
- `Clear all` leaves the document loaded but disables export until at least one page is selected.
- Selecting a page name changes only the active preview page; it does not implicitly include/exclude that page.
- Original-size mode calculates each selected page from its own physical dimensions.
- Finished-size and sheet-count modes apply the chosen global settings to every selected page.

## 7. Output ordering and IDs

For a selected source page, tile order remains row-major. Multi-page PDF tile IDs use `Pxx-Rxx-Cxx`.

Output ordering is:

1. selected source page's tiled sheets, row-major
2. that source page's assembly map when enabled
3. next selected source page

Excluded source pages produce no tile sheets and no assembly map.

## 8. PDF output contract

PDF exports are rebuilt as fresh PDFs from the required object graph for selected source pages. Original page content/resources are referenced without rasterizing vector page content.

When calibration is enabled:

- page clipping remains inside the nominal printable rectangle;
- source transforms are scaled independently by X/Y correction factors;
- tile offsets use the same corrected coordinate scale;
- tile coverage in the layout is reduced/increased to match the corrected transform;
- overlays use corrected overlap coordinates.

Current limitations remain:

- annotations, forms, and links are not preserved as interactive objects;
- encrypted/password-protected PDFs are rejected;
- unsupported page-content structures fail explicitly;
- SVG is rasterized for PDF output.

## 9. Export workflow retained

The export filename is editable. Progress is measured in output PDF pages and includes assembly maps when enabled. Cancellation is cooperative and prevents a partial completed download.

Each export owns the selected file, parsed source, source generation, and sanitized output filename captured when Save is pressed. File-picker and Remove controls are disabled while exporting, and queued picker/drop changes are ignored. Numeric layout changes are ignored while exporting, like the other layout controls. Duplicate Save actions do not start concurrent exports. Replacement/removal invalidates any older job: it cannot download, publish progress/errors, or clear a newer job's state. Cancellation prevents download even after the final output-page yield.

Removing a file during reading invalidates that read. Undo re-reads an incomplete source under a fresh generation, preserving its edited filename. A fully read source retains its page selections and active page through Undo. A later selection wins over old read completions, errors, and Undo actions. A Reset confirmation opened before a source change or export cannot clear the newer work.

Calibration changes do not change this workflow. A correction setting can increase or decrease tile count, so progress totals are calculated after the calibrated layout is known.

## 10. Image sizing rules retained

Raster physical size is considered known only when a supported embedded density is present. SVG physical units are converted directly; SVG px units use the CSS reference conversion `96 px = 1 in` and are labeled accordingly.

Effective raster PPI is based on the intended finished size. Printer calibration does not change that intended final size, so it does not alter the effective-PPI calculation.

## 11. States

- `empty`: no source selected.
- `reading`: source metadata is being read locally.
- `ready`: source data, page selection, layout, and calibration values are valid.
- `exporting`: output PDF is being generated locally with progress and cancel controls.
- `cancelled`: generation stopped before a download was created.
- `result`: completed PDF was handed to the browser for saving.
- `error`: unsupported/encrypted PDF, unreadable image/SVG, memory/canvas failure, or invalid layout.

## 12. Privacy and offline requirements

- No runtime CDN, analytics, telemetry, API, external font, or hidden network dependency.
- Runtime CSP keeps `connect-src 'none'`.
- Source bytes and generated PDF bytes stay in the browser.
- Excluded PDF page-specific objects are not retained as a hidden older PDF revision.
- Calibration and layout settings may use localStorage; file bytes are not persisted by the app.
- Direct `file://` opening remains required.

## 13. Non-goals for v1.0.0

- Automatic printer detection or reading printer-driver settings.
- Correcting translation/skew/nonlinear paper-feed distortion; the current calibration model corrects X/Y scale only.
- Per-source-page independent finished-size settings.
- Vector-preserving SVG PDF output.
- PDF annotations/forms/link preservation.
- Per-edge printer margins.
- Known-size scaling from two image points.

## 14. v1.0.0 acceptance criteria

- Main PDF preview contains a nonblank Canvas rendering of the active source PDF page.
- Existing tile grid, overlap, trim lines, registration marks, page IDs, and size annotations remain visible above the rendered PDF page.
- Individual PDF tile preview renders the corresponding page from a newly generated tiled PDF, rather than a synthetic crop illustration.
- Backdrop clicks close Sheet Preview, while clicks on zoom controls or preview content keep it open.
- In PDF sheet preview mode, the SVG fallback has an actual `hidden` attribute, computed `display: none`, and zero layout height while the Canvas is visible.
- Individual PDF tile Canvas display preserves the actual PDF.js-rendered page aspect ratio; zoom changes width without independently stretching height.
- No iframe/browser-native PDF preview or `window.open(blob:...)` preview route remains.
- Stale asynchronous preview results are ignored after file/page/tile changes.
- PDF export remains vector-preserving and is not replaced by Canvas raster output.
- Embedded PDF.js main/worker load without runtime CDN/API access and `connect-src 'none'` remains in force.
- Canvas width/height are nonzero and pixel checks confirm actual nonblank rendering in both main and tile previews.
- Normal standalone and self-extract variants both pass the PDF preview flow.
- Mobile action bar is hidden before a supported source is ready and shown afterward.
- Mobile bar reports current tile count and paper/orientation and mirrors PDF-export readiness.
- Mobile preview shortcut moves the preview panel into the viewport.
- Mobile export action invokes the same PDF export workflow as the main export button.
- During generation the mobile bar displays progress and exposes cancellation rather than a second save action.
- At 390 px viewport width there is no horizontal scrolling and fixed UI does not cover page content.
- Long selected filenames wrap/clamp safely on narrow screens.
- Printer calibration starts collapsed, but enabled calibration is automatically exposed.
- Japanese and English labels are present for the new mobile controls.
- v0.7.0 printer calibration and v0.6.0 multi-page/export/cancellation regressions remain functional.
- `connect-src 'none'`, no runtime external requests, supplied favicon/header icon, direct-file operation, and self-extract output remain intact.

## 15. Roadmap

- **v0.3.0:** image/SVG input, physical-size handling, effective PPI, image tiled-PDF export. ✅
- **v0.4.0:** trim lines, registration marks, page IDs, print-layout markings. ✅
- **v0.5.0:** detailed page preview, zoom, assembly map. ✅
- **v0.6.0:** multi-page PDF workflow, filename, progress, cancellation, completion UX. ✅
- **v0.7.0:** 100 mm printer calibration and X/Y correction. ✅
- **v0.8.0:** desktop/mobile UX finishing. ✅
- **v0.8.1:** embedded PDF.js Canvas preview reliability fix. ✅
- **v0.8.2:** generated-tile PDF preview aspect-ratio fix. ✅
- **v0.8.3:** PDF sheet-preview SVG/Canvas duplicate-layout fix. ✅
- **v0.8.4:** Sheet Preview backdrop-close interaction. ✅
- **v0.9.0:** release-candidate regression. ✅
- **v1.0.0:** initial stable release. ✅
