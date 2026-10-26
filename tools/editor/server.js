#!/usr/bin/env node
/*
 * 行程編輯器（只在本機跑，綁 127.0.0.1）：
 *   node tools/editor/server.js [--port 8780]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const store = require('./store');
const { createPreview } = require('./preview');
const publisher = require('./publish');
const discard = require('./discard');
const cache = require('../routing/cache');
const { createRoutesService } = require('./routes-service');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const MAX_BODY = 5 * 1024 * 1024;

function parseArgs(argv) {
    const i = argv.indexOf('--port');
    return { port: i >= 0 ? Number(argv[i + 1]) : 8780 };
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const readBody = req => new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(store.httpError(413, '請求太大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
});

function serveStatic(res, pathname) {
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: '找不到' });
    send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
}

// 會丟東西的動作要求自訂標頭：其他網頁的表單或 no-cors 請求送不出這個標頭（要先 preflight，本伺服器不回應）
const requireEditorHeader = req => {
    if (req.headers['x-requested-with'] !== 'trip-editor') throw store.httpError(403, '缺少 X-Requested-With 標頭');
};

const parseJson = async req => {
    try { return JSON.parse(await readBody(req)); } catch (e) { if (e.status) throw e; throw store.httpError(400, '請求不是有效的 JSON'); }
};

// provider：路線計算服務（預設是 OSRM；測試注入假的）
function createServer({ root, provider = require('../routing/provider') }) {
    let preview;
    const routes = createRoutesService({ root, provider, onChange: () => preview.refresh() });
    preview = createPreview({ root, getRoutes: routes.draft });
    return http.createServer(async (req, res) => {
        try {
            // 只接受本機位址的 Host，避免網頁透過 DNS rebinding 打到編輯器
            if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return send(res, 403, { error: 'Host 不允許' });
            const { pathname } = new URL(req.url, 'http://localhost');
            if (pathname === '/api/data' && req.method === 'GET') return send(res, 200, store.load(root));
            if (pathname === '/api/data' && req.method === 'PUT') {
                const saved = store.save(root, await parseJson(req), { routes: routes.draft() });
                routes.set(saved.routes);   // 草稿跟著修剪成實際寫入的內容
                return send(res, 200, { mtimes: saved.mtimes });
            }
            if (pathname === '/api/routes' && req.method === 'GET') return send(res, 200, routes.summary());
            if (pathname === '/api/routes/reset' && req.method === 'POST') {
                // 丟掉算好但沒存檔的路線：同樣要求自訂標頭，理由同 /api/discard
                requireEditorHeader(req);
                routes.reset();
                preview.refresh();
                return send(res, 200, routes.summary());
            }
            if (pathname === '/api/routes/compute' && req.method === 'POST') return send(res, 200, await routes.compute(await parseJson(req)));
            if (pathname === '/api/routes/recompute-all' && req.method === 'POST') return send(res, 200, await routes.recomputeAll(await parseJson(req)));
            if (pathname === '/api/publish/plan' && req.method === 'GET') return send(res, 200, publisher.plan(root));
            if (pathname === '/api/publish' && req.method === 'POST') return send(res, 200, publisher.publish(root, await parseJson(req), { routes: routes.draft() }));
            if (pathname === '/api/discard/plan' && req.method === 'GET') return send(res, 200, discard.plan(root));
            if (pathname === '/api/discard' && req.method === 'POST') {
                requireEditorHeader(req);   // 會丟掉已存檔的修改
                const result = discard.run(root);
                try { routes.set(cache.read(root)); } catch { routes.set(cache.empty()); }   // 路線草稿回到 HEAD 的快取
                preview.refresh();
                return send(res, 200, result);
            }
            if (pathname === '/api/draft' && req.method === 'POST') {
                preview.setDraft(await parseJson(req));
                return send(res, 200, { ok: true });
            }
            if (pathname.startsWith('/preview/') && req.method === 'GET') {
                const file = preview.resolve(pathname.slice('/preview'.length));
                return file ? send(res, 200, file.body, file.type) : send(res, 404, { error: '找不到' });
            }
            if (pathname === '/lib/model.js' && req.method === 'GET') return send(res, 200, fs.readFileSync(path.join(root, 'js', 'model.js')), TYPES['.js']);
            if (req.method === 'GET' && !pathname.startsWith('/api/')) return serveStatic(res, pathname);
            send(res, 404, { error: '找不到' });
        } catch (e) {
            send(res, e.status || 500, { error: e.message, ...(e.steps && { steps: e.steps }) });
        }
    });
}

module.exports = { createServer, parseArgs };

if (require.main === module) {
    const { port } = parseArgs(process.argv.slice(2));
    const root = path.resolve(__dirname, '..', '..');
    createServer({ root }).listen(port, '127.0.0.1', () => console.log(`編輯器：http://127.0.0.1:${port}/`));
}
