// 路線計算服務（目前是 OSRM 公開 demo；要換服務只改這個檔，介面維持 route(from, to)）。
// 只有編輯器伺服器會呼叫；公開頁面與 check.js 都不呼叫。
//
//   route({ lat, lng }, { lat, lng }) → Promise<{ distance（公尺）, duration（秒，原始值）, geometry（polyline，精度 5）}>
//
// 規則（spec 7.4）：請求逐一送出、兩次請求間隔至少 1 秒、逾時 15 秒、失敗直接丟錯（不自動重試）、帶識別專案的 User-Agent。
const DEFAULTS = {
    baseUrl: 'https://router.project-osrm.org',
    userAgent: 'trip-2026-editor/1.0 (+https://github.com/limhi/trip-2026)',
    timeoutMs: 15000,
    minIntervalMs: 1000
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const coord = p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`;

// 測試用 createProvider({ baseUrl, timeoutMs, minIntervalMs, userAgent }) 覆寫預設值；每個 provider 各自排隊
function createProvider(options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    let queue = Promise.resolve();
    let lastFinishedAt = 0;

    async function request(from, to) {
        const wait = lastFinishedAt + cfg.minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait);
        const url = `${cfg.baseUrl}/route/v1/driving/${coord(from)};${coord(to)}?overview=simplified&geometries=polyline`;
        try {
            let res;
            try {
                res = await fetch(url, { headers: { 'User-Agent': cfg.userAgent }, signal: AbortSignal.timeout(cfg.timeoutMs) });
            } catch (e) {
                if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error(`路線服務逾時（超過 ${cfg.timeoutMs / 1000} 秒）`);
                throw new Error(`路線服務連線失敗：${(e.cause && (e.cause.code || e.cause.message)) || e.message}`);
            }
            if (!res.ok) throw new Error(`路線服務回應 HTTP ${res.status}`);
            let body;
            try { body = await res.json(); }
            catch { throw new Error('路線服務回應格式不是 JSON'); }
            if (body.code !== 'Ok') throw new Error(`路線服務回應 ${body.code}${body.message ? `：${body.message}` : ''}`);
            const r = body.routes && body.routes[0];
            if (!r) throw new Error('路線服務沒有路線');
            if (typeof r.distance !== 'number' || typeof r.duration !== 'number' || typeof r.geometry !== 'string') throw new Error('路線服務回應格式不符');
            return { distance: r.distance, duration: r.duration, geometry: r.geometry };
        } finally {
            lastFinishedAt = Date.now();
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
