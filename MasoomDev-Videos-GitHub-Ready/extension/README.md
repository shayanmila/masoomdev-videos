# MasoomDev Screen Recorder — v0.2.0 (development preview)

A local-first Chrome MV3 extension. No cloud, analytics, network permissions, login, or remote upload. Not based on redistributed code from G-RIMA.

## Install
1. Unzip the package.
2. Chrome > chrome://extensions > Developer mode > Load unpacked > select `masoomdev-screen-recorder` folder.
3. On a regular website, click extension > **Enable drawing on this tab**. Pencil/highlighter/eraser toolbar appears. Toggle the popup button again to remove it.
4. Click **Open recorder**, then **Start recording** in the persistent recorder tab, choose the annotated browser tab in Chrome's picker.
5. Stop, preview, and save WebM, or choose MP4 conversion if browser-native MP4 MediaRecorder is supported.

## Scope and limitations
- **Browser tab drawing only**. Chrome internal pages, browser chrome, other applications, and entire desktop are not annotatable with this extension.
- Drawing toolbar appears in a captured browser tab; recording an entire screen may also capture it.
- Recording is controlled in a persistent recorder tab, not a popup. Do not close that tab until recording is finalized.
- No imposed time limit, but recordings are accumulated in memory for now; very long sessions can exhaust memory. Chunk-to-disk streaming is a planned stability improvement.
- MP4 conversion is a browser-native, real-time transcode of WebM via MediaRecorder and HTMLVideoElement.captureStream. It may not work on all Chrome platforms, and audio/codec support varies. The MP4 option is disabled when unsupported. Original WebM remains available.
- Tab/system audio capture is subject to Chrome sharing dialog and OS support; microphone permission is separate.
- Browser file downloads save to the default Downloads directory or browser's configured download prompt location.
- Recording stops if the selected display stream ends. No automatic upload of recordings.
- Google Drive is **not implemented**; future opt-in feature only.
- This is a static-checked development preview, **not yet runtime-tested in Chrome**.

## Security
Uses only `activeTab` and `scripting` permissions, granted on user interaction. No content script is auto-injected and no host permissions or external network endpoints are declared. Video is processed locally. Browser/OS capture permissions still apply.

## Known issues to address before release
- Use disk-backed streaming for large recordings and crash recovery.
- Test MP4 conversion across target browsers and fix codec/audio edge cases; bundle a local transcoder if necessary.
- Validate annotation rendering and browser capture integration on actual Chrome/Edge/Brave.
- Implement automated integration tests and accessibility review.

## v0.2 update
Launch the extension from the website tab you intend to record. After starting the recorder, the drawing toolbar opens automatically on that original website tab. A floating REC/timer control offers Drawing (show/hide) and Stop. Closing the drawing toolbar hides it; use the floating Drawing button to reopen. Select the same browser tab in Chrome's capture picker to record annotations. Chrome's native screen-sharing bar cannot be modified; the new bar is an independent overlay on the website. Other captured tabs/windows do not automatically receive it.

## v0.3 automatic overlays across tabs
- The extension asks for optional website access when opening the recorder. If approved, while recording it automatically adds the annotation toolbar to active regular http/https tabs across browser windows, and on subsequent tab switches.
- Chrome does not expose the selected tab ID from getDisplayMedia, so the toolbar is shown on active eligible tabs, not exclusively the picked source.
- Browser internal pages, other applications and desktop overlays are unsupported. Only browser-tab capture includes website annotations.
- No network upload. Optional website permission is for drawing injection only.
