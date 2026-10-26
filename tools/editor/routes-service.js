// 編輯器的路線服務：記憶體草稿（路線快取）＋呼叫 provider（docs/DESIGN.md 第 15.5 節）。
// 草稿一開始是磁碟上的 data/routes.json；存檔時由 store 寫回（並移除沒用的舊筆）。
// 計算失敗：該段不留在草稿裡（退回直線；重新計算失敗時舊路線也一併移除），不自動重試；provider 自己負責逐一送出、間隔與逾時。
const { httpError } = require('./store');
const cache = require('../routing/cache');
const model = require('../../js/model');

const MAX_LEGS = 200;
const today = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const isPoint = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

// provider：{ route(from, to), name? }；onChange：草稿有新增或更新時呼叫（預覽要重新產生）
function createRoutesService({ root, provider, onChange = () => {} }) {
    let routes = null;
    const inflight = new Map();   // key → Promise，同一段同時只算一次

    const draft = () => routes || (routes = cache.read(root));
    const set = r => { routes = r; };
    const reset = () => { routes = null; };   // 丟掉記憶體草稿，下次用到時重讀磁碟上的 routes.json

    // 草稿與磁碟上的 routes.json 不同（算了還沒存檔）；前端用它決定存檔鈕要不要亮
    function unsaved() {
        let onDisk;
        try { onDisk = cache.read(root); } catch { onDisk = cache.empty(); }
        return cache.serialize(draft()) !== cache.serialize(onDisk);
    }

    // 給前端顯示用：只有 distance 與 duration，加上是否有未存檔的路線
    function summary() {
        const legs = {};
        for (const [k, v] of Object.entries(draft().legs)) legs[k] = { distance: v.distance, duration: v.duration };
        return { legs, unsaved: unsaved() };
    }

    function parseLegs(body) {
        if (!body || !Array.isArray(body.legs)) throw httpError(400, '請求需要 legs 陣列');
        if (body.legs.length > MAX_LEGS) throw httpError(400, `一次最多 ${MAX_LEGS} 段`);
        const seen = new Map();
        for (const l of body.legs) {
            if (!l || !isPoint(l.from) || !isPoint(l.to)) throw httpError(400, '每段需要 key、from、to（含 lat、lng）');
            if (l.key !== model.legKey(l.from, l.to)) throw httpError(400, `key「${l.key}」與座標不符`);
            if (!seen.has(l.key)) seen.set(l.key, l);
        }
        return [...seen.values()];
    }

    function computeOne(l) {
        if (!inflight.has(l.key)) {
            const p = Promise.resolve().then(() => provider.route(l.from, l.to)).then(r => {
                draft().legs[l.key] = {
                    distance: r.distance, duration: r.duration, geometry: r.geometry,
                    provider: provider.name || 'osrm', computedAt: today()
                };
                return { status: 'ok', distance: r.distance, duration: r.duration };
            }, e => {
                // 失敗的段落退回直線：舊快取（重新計算時才會有）一併移除，公開預覽才不會繼續畫舊路線
                const removed = !!draft().legs[l.key];
                delete draft().legs[l.key];
                return { status: 'failed', error: e.message, removed };
            });
            inflight.set(l.key, p);
            p.finally(() => inflight.delete(l.key));
        }
        return inflight.get(l.key);
    }

    async function run(body, force) {
        const legs = parseLegs(body);
        const results = {};
        // 全部先送出，provider 內部排隊逐一執行
        const pending = [];
        for (const l of legs) {
            const hit = draft().legs[l.key];
            if (hit && !force) results[l.key] = { status: 'cached', distance: hit.distance, duration: hit.duration };
            else pending.push(computeOne(l).then(r => { results[l.key] = r; }));
        }
        await Promise.all(pending);
        if (Object.values(results).some(r => r.status === 'ok' || r.removed)) onChange();
        return { results };
    }

    return {
        draft, set, reset, summary,
        compute: body => run(body, false),
        recomputeAll: body => run(body, true)
    };
}

module.exports = { createRoutesService };
