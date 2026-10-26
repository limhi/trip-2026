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

// 路線快取 data/routes.json（結構見 docs/DESIGN.md 第 15.2 節）。
// 它不在 TARGETS 裡：編輯器的 trip／places 存檔與 mtime 檢查不涉及它。
const ROUTES_JSON = 'data/routes.json';

// 由路線快取 { profile, legs: { key: { distance, duration, geometry, … } } } 產生兩個檔（不寫檔）：
//   data/routes.js     window.TRIP_ROUTES = { legs: { key: { distance, duration } } }（小，首頁載入）
//   data/routes-geo.js window.TRIP_ROUTES_GEO = { key: geometry }（大，第一次展開地圖才載入）
function buildRoutes(routes) {
    const keys = Object.keys(routes.legs).sort();
    const legs = {}, geo = {};
    for (const k of keys) {
        legs[k] = { distance: routes.legs[k].distance, duration: routes.legs[k].duration };
        geo[k] = routes.legs[k].geometry;
    }
    return {
        'data/routes.js': render('TRIP_ROUTES', { legs }),
        'data/routes-geo.js': render('TRIP_ROUTES_GEO', geo)
    };
}

// 由記憶體中的資料 { trip, places[, routes] } 產生 { 'data/trip.js': 內容, … }（不寫檔）；有給 routes 才產生路線檔
function buildFrom(data) {
    const out = {};
    for (const t of TARGETS) out[t.js] = render(t.name, data[t.key]);
    if (data.routes) Object.assign(out, buildRoutes(data.routes));
    return out;
}

// 由 root 底下的 JSON 產生（不寫檔），含 data/routes.json
function build(root = defaultRoot) {
    const data = {};
    for (const t of TARGETS) data[t.key] = JSON.parse(fs.readFileSync(path.join(root, t.json), 'utf8'));
    data.routes = JSON.parse(fs.readFileSync(path.join(root, ROUTES_JSON), 'utf8'));
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

module.exports = { render, build, buildFrom, buildRoutes, writeAtomic, HEADER, TARGETS, ROUTES_JSON };

if (require.main === module) write().forEach(f => console.log('產生', f));
