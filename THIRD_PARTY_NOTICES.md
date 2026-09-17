# Third-Party Notices

Large Print Tiler v0.8.3 embeds the following third-party runtime library in the generated standalone HTML:

## PDF.js / pdfjs-dist 6.3.289

- Project: PDF.js
- Package: `pdfjs-dist`
- Version: `6.3.289`
- License: Apache License 2.0
- Homepage: https://mozilla.github.io/pdf.js/
- Repository: https://github.com/mozilla/pdf.js
- Usage: on-screen PDF preview rendering only. Large Print Tiler's PDF export path continues to preserve the original PDF vector/content streams and does not rasterize them through PDF.js.

The PDF.js legacy display module and worker are embedded into the standalone HTML at build time. Runtime CDN or API access is not used. See `dependencies.json` and `dependencies.lock.json` for the pinned package/version and npm tarball SHA-256.

Large Print Tiler itself is MIT licensed. See [LICENSE](LICENSE).
