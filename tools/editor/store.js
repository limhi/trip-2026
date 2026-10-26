// 編輯器的資料存取：讀取、固定格式序列化、mtime 衝突檢查、原子存檔
const fs = require('fs');
const path = require('path');
const buildData = require('../build-data');

const FILES = Object.fromEntries(buildData.TARGETS.map(t => [t.key, t.json]));

const httpError = (status, message) => Object.assign(new Error(message), { status });
const serialize = data => JSON.stringify(data, null, 2) + '\n';
const mtimeOf = (root, key) => fs.statSync(path.join(root, FILES[key])).mtimeMs;
const currentMtimes = root => ({ trip: mtimeOf(root, 'trip'), places: mtimeOf(root, 'places') });

function load(root) {
    const data = {};
    for (const key of Object.keys(FILES)) data[key] = JSON.parse(fs.readFileSync(path.join(root, FILES[key]), 'utf8'));
    return { ...data, mtimes: currentMtimes(root) };
}

// body = { trip, places, mtimes }；opts.buildFrom 讓測試注入失敗
function save(root, body, opts = {}) {
    const isObj = v => v && typeof v === 'object';
    if (!isObj(body) || !isObj(body.trip) || !isObj(body.places) || !isObj(body.mtimes) ||
        !Object.keys(FILES).every(k => Number.isFinite(body.mtimes[k]))) {
        throw httpError(400, '請求需要 trip、places，以及兩個檔案的 mtimes（數字）');
    }
    const disk = currentMtimes(root);
    const stale = Object.keys(FILES).filter(k => disk[k] > body.mtimes[k]);
    if (stale.length) throw httpError(409, `磁碟上的 ${stale.map(k => FILES[k]).join('、')} 比編輯器載入的版本新（可能被其他程式修改），請重新載入`);

    // 寫入順序：JSON 在前，產生檔在後
    const files = {};
    for (const key of Object.keys(FILES)) files[FILES[key]] = serialize(body[key]);
    Object.assign(files, (opts.buildFrom || buildData.buildFrom)({ trip: body.trip, places: body.places }));
    buildData.writeAtomic(root, files);
    return { mtimes: currentMtimes(root) };
}

module.exports = { load, save, serialize, httpError };
