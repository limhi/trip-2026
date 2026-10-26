#!/usr/bin/env node
/*
 * 從資料來源 data/*.json 產生網頁載入的 data/*.js（只需要 Node）：
 *   node tools/build-data.js
 * 產生檔要一起 commit，不要手改；node tools/check.js 會檢查兩邊是否同步。
 */
const fs = require('fs');
const path = require('path');

const defaultRoot = path.resolve(__dirname, '..');
const HEADER = '/* 本檔由 tools/build-data.js 從 *.json 產生，請勿手改 */\n';
const TARGETS = [
    { key: 'trip', json: 'data/trip.json', js: 'data/trip.js', name: 'TRIP' },
    { key: 'places', json: 'data/places.json', js: 'data/places.js', name: 'TRIP_PLACES' }
];

const render = (name, data) => `${HEADER}window.${name} = ${JSON.stringify(data, null, 4)};\n`;

// 由記憶體中的資料 { trip, places } 產生 { 'data/trip.js': 內容, … }（不寫檔）
function buildFrom(data) {
    const out = {};
    for (const t of TARGETS) out[t.js] = render(t.name, data[t.key]);
    return out;
}

// 由 root 底下的 JSON 產生（不寫檔）
function build(root = defaultRoot) {
    const data = {};
    for (const t of TARGETS) data[t.key] = JSON.parse(fs.readFileSync(path.join(root, t.json), 'utf8'));
    return buildFrom(data);
}

// files = { 相對路徑: 內容 }。先全部寫暫存檔再 rename，避免留下半套檔案
function writeAtomic(root, files) {
    const tmps = [];
    try {
        for (const [f, text] of Object.entries(files)) {
            const tmp = path.join(root, f + '.tmp');
            tmps.push([tmp, path.join(root, f)]);
            fs.writeFileSync(tmp, text, 'utf8');
        }
    } catch (e) {
        for (const [tmp] of tmps) { try { fs.unlinkSync(tmp); } catch { /* 沒建成就不用清 */ } }
        throw e;
    }
    tmps.forEach(([tmp, dest]) => fs.renameSync(tmp, dest));
}

function write(root = defaultRoot) {
    const out = build(root);
    writeAtomic(root, out);
    return Object.keys(out);
}

module.exports = { render, build, buildFrom, writeAtomic, HEADER, TARGETS };

if (require.main === module) write().forEach(f => console.log('產生', f));
