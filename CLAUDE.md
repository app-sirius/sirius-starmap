# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WebAssembly-based astronomy visualization app embedding Stellarium Web Engine, designed to run in a browser or as a React Native WebView. The UI language is French.

## Running the Dev Server

```bash
npm run serve        # or: python server.py [port]
```

Opens on `http://localhost:8000`. The server adds CORS and `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers required for SharedArrayBuffer/WASM.

## Architecture

**Static web app — no build step, no bundler, no dependencies.**

- `index.html` — Entry point. Fullscreen `<canvas>` for WebGL rendering, loading spinner, status panel.
- `app.js` — Application logic: initializes the WASM engine, runs the render loop, handles bidirectional message passing with a parent React Native WebView.
- `stellarium-web-engine.js` / `.wasm` — Emscripten-compiled Stellarium core. **Do not edit** — these are generated artifacts.
- `server.py` — Minimal Python HTTP server with required COOP/COEP headers.

## React Native WebView Bridge

`app.js` detects `window.ReactNativeWebView` and uses `postMessage` for communication.

**Inbound messages** (from React Native → WebView) — JSON with `type` field:
- `deviceMotion` — Update view from device orientation (`rotation.alpha/beta/gamma`)
- `location` — Set observer coordinates (`coords.latitude/longitude/altitude`)
- `lookAt` — Point at a celestial object (`target`)
- `setTime` — Set observation time UTC (`time`)
- `toggleLayer` — Show/hide layers: `atmosphere`, `landscapes`, `constellations`, `stars`
- `search` — Search celestial objects (`query`)
- `setFov` — Set field of view in degrees (`fov`)

**Outbound messages** (WebView → React Native): `ready`, `error`, `lookAtSuccess`, `lookAtError`, `searchResults`.

## Stellarium Web Engine API

The engine instance (`stel`) exposes:
```
stel.core.observer.{latitude, longitude, elevation, azimuth, altitude, fov, utc}
stel.core.observer.update()
stel.core.observer.lookAt(target) → Promise
stel.core.{atmosphere, landscapes, constellations, stars}.visible
stel.core.search(query)
stel.renderCanvas()
```

Default observer location is Paris (48.8566°N, 2.3522°E).
