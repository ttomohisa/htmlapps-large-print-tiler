Single HTML App Template
========================

1. Read README.ja.md.
2. Rewrite APP_SPEC.md for the new application.
3. Update app.config.json and replace `assets\favicon.svg` with the application icon. The build uses that one file for both the browser favicon and upper-left app icon.
4. Inspect components/ and reuse generic patterns where they fit: Undo toast for reversible actions, confirmation dialog for irreversible/high-risk actions, compact popover menus, preset/custom numeric settings, async source guards, the mobile bottom bar for persistent smartphone navigation/actions, and webrtc-qr-pairing.html for fully serverless same-LAN browser pairing. For the WebRTC component, also copy the pinned assets from examples/dependencies.webrtc-qr.json. For long 3-5 group smartphone tools, prefer mobile page tabs over one long stacked page.
5. Give the repository to the coding LLM and tell it to read AGENTS.md first.
6. If you add or change dependencies, sync dependencies.lock.json with scripts\sync-dependency-lock.ps1; use scripts\update-dependency.ps1 for reviewed upgrades.
7. If the app exports files, make the output filename user-editable before export.
8. Run build-standalone.bat on Windows. It runs scripts\check-powershell-syntax.ps1 before the build; fix parser or encoding failures instead of bypassing them.
9. Review dist\build-size-report.json, then open dist\index.html and dist\index.self-extract.html directly and test both with the network disabled. On smartphones, also verify the help dialog can scroll to its final item.

Do not edit either generated HTML in dist\ manually.

WebRTC readiness

For custom WebRTC DataChannel layouts, set readyChannelLabel to a reliable control channel and wait for onConnected rather than raw PeerConnection connected.
