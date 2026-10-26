// 預覽：提供 repo 靜態檔；有草稿時，產生檔（data/trip.js、data/places.js）由草稿產生，不寫磁碟
const fs = require('fs');
const path = require('path');
const buildData = require('../build-data');
const { httpError } = require('./store');

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
    '.webp': 'image/webp', '.woff2': 'font/woff2'
};

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

function createPreview({ root }) {
    root = path.resolve(root);
    let generated = null; // { 'data/trip.js': 內容, … }，由草稿產生

    // draft 的其他欄位（例如日後的 routes）原樣交給產生器
    function setDraft(draft) {
        if (!isObj(draft) || !isObj(draft.trip) || !isObj(draft.places)) throw httpError(400, '草稿需要 trip 與 places 物件');
        generated = buildData.buildFrom(draft);
    }

    // 回傳 { type, body }；找不到或不允許回 null
    function resolve(pathname) {
        let rel;
        try { rel = decodeURIComponent(pathname); } catch { return null; }
        if (rel.includes('\0')) return null;
        const parts = rel.split('/').filter(Boolean);
        if (parts.some(p => p.startsWith('.') || p === 'node_modules')) return null;
        const key = parts.join('/') || 'index.html';
        const type = TYPES[path.extname(key)] || 'application/octet-stream';
        if (generated && Object.hasOwn(generated, key)) return { type, body: generated[key] };
        const file = path.join(root, key);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
        return { type, body: fs.readFileSync(file) };
    }

    return { setDraft, resolve };
}

module.exports = { createPreview };
