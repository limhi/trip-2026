// 編輯器的資料存取：讀取、固定格式序列化、mtime 衝突檢查、原子存檔
const fs = require('fs');
const path = require('path');
const buildData = require('../build-data');
const cache = require('../routing/cache');

const FILES = Object.fromEntries(buildData.TARGETS.map(t => [t.key, t.json]));

const httpError = (status, message) => Object.assign(new Error(message), { status });
const serialize = data => JSON.stringify(data, null, 2) + '\n';
// 衝突檢查的檔案：trip.json、places.json、routes.json（沒有 routes.json 時視為 0）
const MTIME_FILES = { ...FILES, routes: buildData.ROUTES_JSON };
const mtimeOf = (root, key) => { try { return fs.statSync(path.join(root, MTIME_FILES[key])).mtimeMs; } catch { return 0; } };
const currentMtimes = root => Object.fromEntries(Object.keys(MTIME_FILES).map(k => [k, mtimeOf(root, k)]));

function load(root) {
    const data = {};
    for (const key of Object.keys(FILES)) data[key] = JSON.parse(fs.readFileSync(path.join(root, FILES[key]), 'utf8'));
    return { ...data, mtimes: currentMtimes(root) };
}

// body = { trip, places, mtimes }；opts.buildFrom 讓測試注入失敗；opts.routes = 路線快取草稿（見 routes-service.js）
// 回傳 { mtimes, routes }，routes 是實際寫入的（已修剪）快取，沒帶 opts.routes 時為 undefined
function save(root, body, opts = {}) {
    const isObj = v => v && typeof v === 'object';
    if (!isObj(body) || !isObj(body.trip) || !isObj(body.places) || !isObj(body.mtimes) ||
        !Object.keys(MTIME_FILES).every(k => Number.isFinite(body.mtimes[k]))) {
        throw httpError(400, '請求需要 trip、places，以及三個檔案（trip、places、routes）的 mtimes（數字）');
    }
    const disk = currentMtimes(root);
    const stale = Object.keys(MTIME_FILES).filter(k => disk[k] > body.mtimes[k]);
    if (stale.length) throw httpError(409, `磁碟上的 ${stale.map(k => MTIME_FILES[k]).join('、')} 比編輯器載入的版本新（可能被其他程式修改），請重新載入`);

    // 寫入順序：JSON 在前，產生檔在後
    const files = {};
    for (const key of Object.keys(FILES)) files[FILES[key]] = serialize(body[key]);
    Object.assign(files, (opts.buildFrom || buildData.buildFrom)({ trip: body.trip, places: body.places }));
    // 有帶路線快取（草稿）就一併寫：只留目前行程用到的段落，再產生 routes*.js
    let routes;
    if (opts.routes) {
        routes = cache.prune(opts.routes, cache.usedKeys(body.trip, body.places));
        files[buildData.ROUTES_JSON] = cache.serialize(routes);
        Object.assign(files, buildData.buildRoutes(routes));
    }
    buildData.writeAtomic(root, files);
    return { mtimes: currentMtimes(root), routes };
}

module.exports = { load, save, serialize, httpError };
