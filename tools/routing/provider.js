// 路線計算服務（目前是 OSRM 公開 demo；要換服務只改這個檔，介面維持 route(from, to)）。
// 只有編輯器伺服器會呼叫；公開頁面與 check.js 都不呼叫。
//
//   route({ lat, lng }, { lat, lng }) → Promise<{ distance（公尺）, duration（秒，原始值）, geometry（polyline，精度 5）}>
//
// 規則（docs/DESIGN.md 第 15.4 節）：請求逐一送出、兩次請求間隔至少 1 秒、逾時 15 秒、失敗直接丟錯（不自動重試）、帶識別專案的 User-Agent。
const DEFAULTS = {
    baseUrl: 'https://router.project-osrm.org',
    userAgent: 'trip-2026-editor/1.0 (+https://github.com/limhi/trip-2026)',
    timeoutMs: 15000,
    minIntervalMs: 1000
};

const model = require('../../js/model');   // 只用座標格式（與路段 key 同一個），model.js 沒有其他依賴

const sleep = ms => new Promise(r => setTimeout(r, ms));
const coord = model.formatCoord;
const isTimeout = e => e && (e.name === 'TimeoutError' || e.name === 'AbortError');

// 測試用 createProvider({ baseUrl, timeoutMs, minIntervalMs, userAgent }) 覆寫預設值；每個 provider 各自排隊
function createProvider(options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    let queue = Promise.resolve();
    let lastFinishedAt = -Infinity;   // 單調時鐘（performance.now），不受系統時間調整影響

    async function request(from, to) {
        // setTimeout 可能提早醒來，所以醒來後重新計算，直到真的滿足間隔
        for (let wait = lastFinishedAt + cfg.minIntervalMs - performance.now(); wait > 0; wait = lastFinishedAt + cfg.minIntervalMs - performance.now()) await sleep(Math.ceil(wait));
        const url = `${cfg.baseUrl}/route/v1/driving/${coord(from)};${coord(to)}?overview=simplified&geometries=polyline`;
        try {
            let res, body;
            try {
                // 逾時涵蓋整個請求（連線、等標頭、讀 body）
                res = await fetch(url, { headers: { 'User-Agent': cfg.userAgent }, signal: AbortSignal.timeout(cfg.timeoutMs) });
                if (!res.ok) throw new Error(`路線服務回應 HTTP ${res.status}`);
                try { body = await res.json(); }
                catch (e) { if (isTimeout(e)) throw e; throw new Error('路線服務回應格式不是 JSON'); }
            } catch (e) {
                if (isTimeout(e)) throw new Error(`路線服務逾時（超過 ${cfg.timeoutMs / 1000} 秒）`);
                if (e.message.startsWith('路線服務')) throw e;
                throw new Error(`路線服務連線失敗：${(e.cause && (e.cause.code || e.cause.message)) || e.message}`);
            }
            if (body.code !== 'Ok') throw new Error(`路線服務回應 ${body.code}${body.message ? `：${body.message}` : ''}`);
            const r = body.routes && body.routes[0];
            if (!r) throw new Error('路線服務沒有路線');
            if (typeof r.distance !== 'number' || typeof r.duration !== 'number' || typeof r.geometry !== 'string') throw new Error('路線服務回應格式不符');
            return { distance: r.distance, duration: r.duration, geometry: r.geometry };
        } finally {
            lastFinishedAt = performance.now();
        }
    }

    function route(from, to) {
        const result = queue.then(() => request(from, to));
        queue = result.catch(() => {});   // 一次失敗不影響後面的請求
        return result;
    }
    return { route };
}

module.exports = { ...createProvider(), createProvider, DEFAULTS };
