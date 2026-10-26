/*
 * 路線計算的前端流程（不碰 DOM，瀏覽器與 node:test 共用）：
 *   const ctl = RoutesController.create({ data, fetchFn, timers, onUpdate, onComputed });
 *   ctl.schedule();           // 順序、地點或座標改變時呼叫；約 0.6 秒後計算快取沒有的段落
 *   ctl.status(key)           // 'computing' | 'ok' | 'failed' | 'pending'（行程用到但還沒送）| undefined（行程沒用到）
 *   ctl.recompute(keys)       // 重新計算指定段落（忽略快取）
 *   ctl.recomputeAll()        // 全部重算
 * 失敗不自動重試：同一段持續存在時維持 failed；段落離開行程後再出現、或按「重新計算」才會再試。
 */
(function (root) {
    const L = root.RoutesLogic || require('./routes-logic');
    const M = (root.Trip && root.Trip.model) || require('../../../js/model');

    // data()：{ trip, places }；fetchFn(path, init)：同 fetch；onUpdate：狀態變了（重畫）；onComputed：有新結果（預覽要更新）
    function create({ data, fetchFn = (...a) => root.fetch(...a), timers = { setTimeout, clearTimeout }, delay = 600, onUpdate = () => {}, onComputed = () => {} }) {
        const known = {};            // key → { distance, duration }（原始值）
        const failed = new Map();    // key → 錯誤文字
        const computing = new Set();
        let timer = null;
        let unsaved = false;         // 伺服器草稿有還沒存檔的路線（存檔鈕要亮）

        async function call(path, method, body) {
            const r = await fetchFn(path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
            const json = await r.json();
            if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
            return json;
        }

        // 把 legs（API 格式）送去算；force = true 時忽略快取
        async function request(legs, force) {
            if (!legs.length) return;
            for (const l of legs) { computing.add(l.key); failed.delete(l.key); }
            onUpdate();
            let gotNew = false;
            try {
                const { results } = await call(force ? '/api/routes/recompute-all' : '/api/routes/compute', 'POST', { legs });
                for (const l of legs) {
                    const r = results[l.key];
                    if (r && (r.status === 'ok' || r.status === 'cached')) {
                        known[l.key] = { distance: r.distance, duration: r.duration };
                        if (r.status === 'ok') gotNew = true;
                    } else {
                        failed.set(l.key, (r && r.error) || '計算失敗');
                        if (r && r.removed) { delete known[l.key]; gotNew = true; }   // 伺服器已把舊結果移除（退回直線），預覽要更新
                    }
                }
            } catch (e) {
                for (const l of legs) failed.set(l.key, e.message);
            } finally {
                for (const l of legs) computing.delete(l.key);
            }
            if (gotNew) unsaved = true;
            onUpdate();
            if (gotNew) onComputed();
        }

        // 計算目前行程裡快取沒有、也不在計算中或已失敗的段落
        async function pass() {
            const { trip, places } = data();
            const keys = L.legKeys(trip, places);
            for (const k of [...failed.keys()]) if (!keys.has(k)) failed.delete(k);
            await request(L.pendingLegs(trip, places, known, new Set([...failed.keys(), ...computing])), false);
        }

        function schedule() {
            timers.clearTimeout(timer);
            timer = timers.setTimeout(pass, delay);
        }

        const currentLegs = () => {
            const { trip, places } = data();
            const out = [], seen = new Set();
            for (const day of trip.days) for (const l of M.getLegs(day, places)) {
                if (!seen.has(l.key)) { seen.add(l.key); out.push({ key: l.key, from: l.from, to: l.to }); }
            }
            return out;
        };
        const recomputeAll = () => request(currentLegs().filter(l => !computing.has(l.key)), true);
        const recompute = keys => request(currentLegs().filter(l => keys.includes(l.key) && !computing.has(l.key)), true);

        // 重新載入資料時：同步伺服器草稿裡已算的段落
        async function load() {
            const { legs, unsaved: serverUnsaved } = await call('/api/routes', 'GET');
            for (const k of Object.keys(known)) delete known[k];
            Object.assign(known, legs);
            failed.clear();
            unsaved = !!serverUnsaved;
            onUpdate();
        }

        // 存檔成功後呼叫：伺服器已把草稿寫進磁碟
        function markSaved() {
            unsaved = false;
            onUpdate();
        }

        function status(key) {
            if (computing.has(key)) return 'computing';
            if (known[key]) return 'ok';
            if (failed.has(key)) return 'failed';
            const { trip, places } = data();
            return L.legKeys(trip, places).has(key) ? 'pending' : undefined;
        }

        return {
            known, schedule, pass, recompute, recomputeAll, load, markSaved, status,
            unsaved: () => unsaved,
            error: key => failed.get(key),
            summary: () => ({ computing: computing.size, failed: failed.size })
        };
    }

    const api = { create };
    root.RoutesController = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
