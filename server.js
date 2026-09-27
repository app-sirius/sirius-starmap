// Sirius Starmap
// Copyright (C) 2024-2026 Sirius
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
// See LICENSE and NOTICE at the root of this repository for details.
// Source: https://github.com/app-sirius/sirius-starmap

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const port = parseInt(process.argv[2], 10) || 8000;
const root = __dirname;

const UPSTREAM = 'https://stellarium.sfo2.cdn.digitaloceanspaces.com';
const PROXY_PREFIX = '/data/';
// Override local : si un fichier existe sous ./data-overrides/<path>,
// on le sert au lieu de proxifier vers UPSTREAM. Sert notamment les noms de
// constellations traduits (cf. SKYCULTURE_I18N), que le moteur rend
// directement sans passer par translateFn.
const OVERRIDE_DIR = path.join(__dirname, 'data-overrides');
// Skyculture traduite : une URL par langue (western-<lang>, cf. app.js).
const SKYCULTURE_I18N = /^\/skycultures\/v3\/western-(fr|en|es)\/(.*)$/;

const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'cross-origin',
};

// Décide si un chemin /data/* est servi depuis data-overrides/ ou proxifié.
// L'index.json de la skyculture traduite est local ; ses illustrations
// viennent de western/ upstream (identiques pour toutes les langues).
function resolveDataPath(upstreamPath) {
    const pathOnly = upstreamPath.split('?')[0];
    // Chemin non canonique (« .. », « // ») : jamais servi en local.
    if (path.posix.normalize(pathOnly) !== pathOnly) return { upstream: upstreamPath };
    const m = SKYCULTURE_I18N.exec(pathOnly);
    if (m) {
        if (m[2] === 'index.json') {
            return { local: path.join(OVERRIDE_DIR, 'skycultures/v3/western', `index.${m[1]}.json`) };
        }
        return { upstream: '/skycultures/v3/western/' + m[2] };
    }
    const overridePath = path.join(OVERRIDE_DIR, pathOnly);
    if (overridePath.startsWith(OVERRIDE_DIR + path.sep)) {
        try {
            if (fs.statSync(overridePath).isFile()) return { local: overridePath };
        } catch (_) { /* pas d'override */ }
    }
    return { upstream: upstreamPath };
}

function serveLocal(res, filePath) {
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, corsHeaders);
            return res.end('Not found');
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            ...corsHeaders,
            'Content-Type': mime[ext] || 'application/octet-stream',
            'Content-Length': stat.size,
        });
        fs.createReadStream(filePath).pipe(res);
    });
}

function proxy(req, res) {
    const resolved = resolveDataPath(req.url.slice(PROXY_PREFIX.length - 1));
    if (resolved.local) {
        serveLocal(res, resolved.local);
        return;
    }

    const target = new URL(UPSTREAM + resolved.upstream);

    const upstreamReq = https.request(
        {
            hostname: target.hostname,
            path: target.pathname + target.search,
            method: 'GET',
            headers: { 'User-Agent': 'stellarium-proxy' },
        },
        (upstreamRes) => {
            const headers = { ...corsHeaders };
            if (upstreamRes.headers['content-type']) headers['Content-Type'] = upstreamRes.headers['content-type'];
            if (upstreamRes.headers['content-length']) headers['Content-Length'] = upstreamRes.headers['content-length'];
            res.writeHead(upstreamRes.statusCode || 502, headers);
            upstreamRes.pipe(res);
        }
    );
    upstreamReq.on('error', (err) => {
        res.writeHead(502, corsHeaders);
        res.end(String(err));
    });
    upstreamReq.end();
}

const server = http.createServer((req, res) => {
    if (req.url.startsWith(PROXY_PREFIX)) {
        proxy(req, res);
        return;
    }

    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(root, urlPath === '/' ? '/index.html' : urlPath);

    if (!filePath.startsWith(root)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404);
            return res.end('Not found');
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            ...corsHeaders,
            'Content-Type': mime[ext] || 'application/octet-stream',
            'Content-Length': stat.size,
            'Cache-Control': 'no-store',
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

module.exports = { resolveDataPath };

// Démarrage seulement en exécution directe : les tests importent resolveDataPath.
if (require.main === module) server.listen(port, '0.0.0.0', () => {
    console.log(`Serveur sur http://localhost:${port}`);
    console.log(`Proxy: ${PROXY_PREFIX}* -> ${UPSTREAM}/*`);
});
