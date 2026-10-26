// 路線快取 data/routes.json 的讀寫（只有編輯器伺服器與測試使用）。
// 格式：{ profile: 'driving', legs: { "經度,緯度>經度,緯度": { distance, duration, geometry, provider, computedAt } } }
// distance 單位公尺、duration 單位秒，都是原始值（不含係數）。
const fs = require('fs');
const path = require('path');
const buildData = require('../build-data');
const model = require('../../js/model');

const LEG_FIELDS = ['distance', 'duration', 'geometry', 'provider', 'computedAt'];
const KEY_PATTERN = /^-?\d+\.\d{5},-?\d+\.\d{5}>-?\d+\.\d{5},-?\d+\.\d{5}$/;

const empty = () => ({ profile: 'driving', legs: {} });

// 固定序列化：legs 依 key 排序、每筆欄位順序固定，縮排 2 格、LF、結尾換行
function serialize(routes) {
    const legs = {};
    for (const key of Object.keys(routes.legs).sort()) {
        const src = routes.legs[key], leg = {};
        for (const f of LEG_FIELDS) if (src[f] !== undefined) leg[f] = src[f];
        legs[key] = leg;
    }
    return JSON.stringify({ profile: routes.profile, legs }, null, 2) + '\n';
}

function read(root) {
    return JSON.parse(fs.readFileSync(path.join(root, buildData.ROUTES_JSON), 'utf8'));
}

// 寫 routes.json 與 routes.js、routes-geo.js（先寫暫存檔再 rename）
function write(root, routes) {
    const files = { [buildData.ROUTES_JSON]: serialize(routes), ...buildData.buildRoutes(routes) };
    buildData.writeAtomic(root, files);
}

// 目前行程用到的全部路段 key
function usedKeys(trip, places) {
    const keys = new Set();
    for (const day of trip.days) for (const leg of model.getLegs(day, places)) keys.add(leg.key);
    return keys;
}

const missingKeys = (trip, places, routes) => [...usedKeys(trip, places)].filter(k => !routes.legs[k]);
const unusedKeys = (trip, places, routes) => { const used = usedKeys(trip, places); return Object.keys(routes.legs).filter(k => !used.has(k)); };

// 只留下 keys 內的筆數（不修改輸入）
function prune(routes, keys) {
    const legs = {};
    for (const k of Object.keys(routes.legs)) if (keys.has(k)) legs[k] = routes.legs[k];
    return { ...routes, legs };
}

// 結構檢查，回傳問題清單
function checkStructure(routes) {
    if (!routes || typeof routes !== 'object' || Array.isArray(routes)) return ['routes.json 不是物件'];
    if (!routes.legs || typeof routes.legs !== 'object' || Array.isArray(routes.legs)) return ['routes.json 缺少 legs 物件'];
    const errors = [];
    for (const [key, leg] of Object.entries(routes.legs)) {
        if (!KEY_PATTERN.test(key)) errors.push(`routes.json：key「${key}」格式不對（應為 經度,緯度>經度,緯度，各 5 位小數）`);
        if (!leg || typeof leg !== 'object') { errors.push(`routes.json ${key}：不是物件`); continue; }
        if (typeof leg.distance !== 'number' || !Number.isFinite(leg.distance)) errors.push(`routes.json ${key}：distance 必須是數字`);
        if (typeof leg.duration !== 'number' || !Number.isFinite(leg.duration)) errors.push(`routes.json ${key}：duration 必須是數字`);
        if (typeof leg.geometry !== 'string') errors.push(`routes.json ${key}：geometry 必須是字串`);
    }
    return errors;
}

module.exports = { empty, serialize, read, write, usedKeys, missingKeys, unusedKeys, prune, checkStructure };
