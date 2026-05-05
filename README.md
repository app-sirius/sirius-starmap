# Sirius Starmap

Static web app embedding the [Stellarium Web Engine](https://github.com/Stellarium/stellarium-web-engine)
inside a WebGL canvas. Used by the Sirius mobile app via `react-native-webview`,
and also runnable in any modern browser.

Repository: <https://github.com/app-sirius/sirius-starmap>

## License

This project is distributed under the **GNU Affero General Public License v3.0
(AGPL-3.0)** — see the [LICENSE](./LICENSE) file for the full text and the
[NOTICE](./NOTICE) file for attributions.

It includes pre-compiled binaries of Stellarium Web Engine
(`stellarium-web-engine.js`, `stellarium-web-engine.wasm`), which are themselves
licensed under AGPL-3.0. As required by the copyleft clause, all integration
code in this repository is released under the same license.

If you distribute a build of this project, or run it as part of a service
accessible to users over a network, you must make the corresponding source
code available under AGPL-3.0.

## Running locally

No build step, no dependencies.

```bash
npm run serve            # Node server (server.js)
# or:
python server.py         # Python server (server.py)
```

The server must send the `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` headers — the WASM engine relies
on `SharedArrayBuffer`. Both bundled servers do this.

Open <http://localhost:8000>.

## Architecture

- `index.html` — entry point with the fullscreen canvas
- `app.js` — engine bootstrap, render loop, and React Native WebView bridge
- `stellarium-web-engine.js` / `.wasm` — upstream Emscripten artifacts (do not edit)
- `landscapes/` — HiPS landscape tiles (generated via `pano2hips.py`)
- `server.py` / `server.js` — minimal HTTP servers with the required COOP/COEP headers

## React Native bridge

When loaded inside `react-native-webview`, `app.js` exposes a `postMessage`-based
protocol. See [`CLAUDE.md`](./CLAUDE.md) for the full message catalog.

## Upstream

- Stellarium Web Engine: <https://github.com/Stellarium/stellarium-web-engine>
- Stellarium project home: <https://stellarium.org>
