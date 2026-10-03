# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WebAssembly-based astronomy visualization app embedding Stellarium Web Engine, designed to run in a browser or as a React Native WebView. UI in French, English or Spanish (`?lang=`, default French — see `i18n.js`).

## Running the Dev Server

```bash
npm run serve        # server.js — serveur de référence (python server.py ne gère ni overrides ni langues)
npm test             # node --test
```

Opens on `http://localhost:8000`. The server adds CORS and `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers required for SharedArrayBuffer/WASM.

## Architecture

**Static web app — no build step, no bundler, no dependencies.**

- `index.html` — Entry point. Fullscreen `<canvas>` for WebGL rendering, loading spinner, status panel.
- `app.js` — Application logic: initializes the WASM engine, runs the render loop, handles bidirectional message passing with a parent React Native WebView.
- `stellarium-web-engine.js` / `.wasm` — Emscripten-compiled Stellarium core. **Do not edit** — these are generated artifacts.
- `i18n.js` — Traductions fr/en/es de la carte (noms d'objets, libellés moteur, textes HTML, formats d'heure). Fonctions pures, testées sous `node --test`.
- `server.js` — Serveur de dev/prod : COOP/COEP, proxy `/data/*` vers le CDN Stellarium, overrides locaux (`data-overrides/`) et skyculture par langue (`/data/skycultures/v3/<lang>/western/index.json` → `data-overrides/skycultures/v3/western/index.<lang>.json`).
- `scripts/build-skyculture-i18n.js` — Régénère les `index.<lang>.json` depuis l'upstream (à relancer si les noms de constellations changent dans `i18n.js`).
- `server.py` — Minimal Python HTTP server with required COOP/COEP headers (sans overrides ni langues).

## React Native WebView Bridge

**Langue** : l'app charge la page avec `?lang=fr|en|es` (absent/inconnu → `fr`). Figée pour la vie de la page ; changer de langue recharge la WebView. Les noms renvoyés (`objectClicked.name`) sont dans cette langue, et `lookAt` accepte un nom traduit ou une désignation moteur.

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
