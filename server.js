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

function proxy(req, res) {
    const upstreamPath = req.url.slice(PROXY_PREFIX.length - 1);
    const target = new URL(UPSTREAM + upstreamPath);

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

server.listen(port, '0.0.0.0', () => {
    console.log(`Serveur sur http://localhost:${port}`);
    console.log(`Proxy: ${PROXY_PREFIX}* -> ${UPSTREAM}/*`);
});
