/*
 * 公開頁面的路線顯示邏輯（不碰 DOM）：把路線快取（window.TRIP_ROUTES）套到某一天的路段上，
 * 算出每段的顯示時間、是否超過門檻、當天總車程。blocks.js（列與標題）與 map.js（地圖）共用。
 * 路段的規則在 js/model.js 的 getLegs，這裡不複製。沒有快取時每段 cached 為 null，呼叫端照舊畫面。
 */
(function (root) {
    const Trip = root.Trip = root.Trip || {};
    const model = Trip.model || (typeof require !== 'undefined' ? require('./model.js') : null);

    const isNum = v => typeof v === 'number' && Number.isFinite(v);

    // 解碼 polyline（精度 5）→ [[lat, lng], …]
    function decodePolyline(str) {
        if (typeof str !== 'string') return [];
        const points = [];
        let index = 0, lat = 0, lng = 0;
        const next = () => {
            let result = 0, shift = 0, byte;
            do {
                byte = str.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20 && index < str.length);
            return result & 1 ? ~(result >> 1) : result >> 1;
        };
        while (index < str.length) {
            lat += next();
            lng += next();
            points.push([lat / 1e5, lng / 1e5]);
        }
        return points;
    }

    // 標示時間距離的位置：有路線座標時取沿路線一半長度處，否則取起終點中點。回傳 [lat, lng]
    function midpoint(line, from, to) {
        if (!line || line.length < 2) return [(from.lat + to.lat) / 2, (from.lng + to.lng) / 2];
        const dist = (a, b) => Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180));
        let total = 0;
        for (let i = 1; i < line.length; i++) total += dist(line[i - 1], line[i]);
        let rest = total / 2;
        for (let i = 1; i < line.length; i++) {
            const d = dist(line[i - 1], line[i]);
            if (d >= rest && d > 0) {
                const t = rest / d;
                return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
            }
            rest -= d;
        }
        return line[line.length - 1];
    }

    // 某一天每個路段的顯示資料。routes = window.TRIP_ROUTES（可為 undefined）。
    // legs[i]：{ leg（getLegs 的結果）, cached（{distance, duration} 或 null）, minutes（查詢時間）, over（單段超過門檻）, text, scheduled（排定時間或 null）, short（排定不足）}
    // summary：有快取的路段加總 { minutes, meters, missing }；一段都沒有快取時為 null
    function dayRoutes(day, places, routes, site) {
        const cache = (routes && routes.legs) || {};
        const factor = model.getTrafficFactor(day, site);
        const max = (site && site.routing && site.routing.maxLegMinutes) || model.DEFAULT_ROUTING.maxLegMinutes;
        const legs = model.getLegSchedule(day, places, routes, site).map(({ leg, scheduled, short }) => {
            const c = cache[leg.key];
            // 排定時間與是否不足由 model.getLegSchedule 判斷（編輯器的警告列表用同一個）
            if (!c || !isNum(c.distance) || !isNum(c.duration)) return { leg, cached: null, minutes: null, over: false, text: '', scheduled, short: false };
            const minutes = model.displayMinutes(c.duration, factor);
            return { leg, cached: c, minutes, over: minutes > max, text: model.formatLeg(c, factor), scheduled, short };
        });
        const have = legs.filter(l => l.cached);
        // 給 blocks.js 用：綁定到交通列的、沒有交通列時補在前一項後面的計算結果（key 是 day.items 的索引）
        const factorNote = model.formatFactorNote(factor);
        const autoByRow = {}, autoAfter = {};
        have.forEach(l => {
            const auto = { text: l.text, note: factorNote, scheduled: l.scheduled, needed: l.minutes, short: l.short };
            if (l.leg.rowIndex != null) autoByRow[l.leg.rowIndex] = auto;
            else if (l.leg.needsRow) autoAfter[l.leg.fromItemIndex] = auto;
        });
        const summary = have.length ? {
            minutes: have.reduce((s, l) => s + l.minutes, 0),
            meters: have.reduce((s, l) => s + l.cached.distance, 0),
            missing: legs.length - have.length
        } : null;
        return {
            factor, max, legs, summary, autoByRow, autoAfter,
            hasCache: have.length > 0,
            factorNote,
            summaryText: summary
                ? `總車程 ${model.formatDuration(summary.minutes)}・總里程 ${model.formatDistance(summary.meters)}${summary.missing ? '（部分路段未計算）' : ''}`
                : ''
        };
    }

    Trip.routeView = { decodePolyline, midpoint, dayRoutes };
    if (typeof module !== 'undefined') module.exports = Trip.routeView;
})(typeof window !== 'undefined' ? window : globalThis);
