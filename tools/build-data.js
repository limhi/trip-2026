#!/usr/bin/env node
/*
 * 從資料來源 data/*.json 產生網頁載入的 data/*.js（只需要 Node）：
 *   node tools/build-data.js
 * 產生檔要一起 commit，不要手改；node tools/check.js 會檢查兩邊是否同步。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const HEADER = '/* 本檔由 tools/build-data.js 從 *.json 產生，請勿手改 */\n';
const TARGETS = [
    { json: 'data/trip.json', js: 'data/trip.js', name: 'TRIP' },
    { json: 'data/places.json', js: 'data/places.js', name: 'TRIP_PLACES' }
];

const render = (name, data) => `${HEADER}window.${name} = ${JSON.stringify(data, null, 4)};\n`;

// 回傳 { 'data/trip.js': 內容, … }（不寫檔）
function build() {
    const out = {};
    for (const t of TARGETS) out[t.js] = render(t.name, JSON.parse(fs.readFileSync(path.join(root, t.json), 'utf8')));
    return out;
}

// 先全部寫暫存檔再 rename，避免留下半套檔案
function write() {
    const out = build();
    const tmps = [];
    try {
        for (const [f, text] of Object.entries(out)) {
            const tmp = path.join(root, f + '.tmp');
            tmps.push([tmp, path.join(root, f)]);
            fs.writeFileSync(tmp, text, 'utf8');
        }
    } catch (e) {
        tmps.forEach(([tmp]) => fs.rmSync(tmp, { force: true }));
        throw e;
    }
    tmps.forEach(([tmp, dest]) => fs.renameSync(tmp, dest));
    return Object.keys(out);
}

module.exports = { render, build, HEADER, TARGETS };

if (require.main === module) write().forEach(f => console.log('產生', f));
