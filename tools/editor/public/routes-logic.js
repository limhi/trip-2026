/*
 * 路線功能前端的純邏輯（不碰 DOM，瀏覽器與 node:test 共用）。
 * 路段規則、顯示時間、警告一律用 js/model.js（getLegs／displayMinutes／getTimeWarnings…），不在這裡複製。
 * known = { key: { distance, duration } }，是前端持有的路線快取（原始值，不含係數）。
 */
(function (root) {
    const M = (root.Trip && root.Trip.model) || require('../../../js/model');

    // 目前行程用到的全部路段 key
    function legKeys(trip, places) {
        const keys = new Set();
        for (const day of trip.days) for (const leg of M.getLegs(day, places)) keys.add(leg.key);
        return keys;
    }

    // 還沒有快取、也不在 skip（計算中或已失敗）裡的路段，依出現順序、同 key 只留一筆，格式即 API 的 legs
    function pendingLegs(trip, places, known, skip) {
        const out = [], seen = new Set();
        for (const day of trip.days) {
            for (const leg of M.getLegs(day, places)) {
                if (known[leg.key] || skip.has(leg.key) || seen.has(leg.key)) continue;
                seen.add(leg.key);
                out.push({ key: leg.key, from: leg.from, to: leg.to });
            }
        }
        return out;
    }

    // 當天總車程（顯示分鐘加總）與總里程；missing = 還沒算出來的段數
    function dayTotals(day, places, known, site) {
        const factor = M.getTrafficFactor(day, site);
        const legs = M.getLegs(day, places);
        let minutes = 0, meters = 0, missing = 0;
        for (const leg of legs) {
            const k = known[leg.key];
            if (!k) { missing++; continue; }
            minutes += M.displayMinutes(k.duration, factor);
            meters += k.distance;
        }
        return { minutes, meters, count: legs.length, missing };
    }

    // 一段的顯示文字與是否超過門檻（以顯示分鐘判斷）
    function legText(entry, factor, maxMinutes) {
        const minutes = M.displayMinutes(entry.duration, factor);
        return { text: M.formatLeg(entry, factor), minutes, over: minutes > maxMinutes };
    }

    // 有地點、會顯示在地圖、但地點沒有座標的項目（這些不會算路線；判斷與 validate 相同，見 model.lacksCoords）
    function missingCoords(trip, places) {
        const out = [];
        for (const day of trip.days) {
            day.items.forEach((item, itemIndex) => {
                const p = places[item.place];
                if (M.lacksCoords(item, p)) out.push({ day: day.day, itemIndex, placeId: item.place, name: p.name || item.place });
            });
        }
        return out;
    }

    // 設定欄位輸入：空白 → null（代表刪除欄位）；不是數字 → undefined（忽略這次輸入）
    function parseNumberInput(value) {
        const s = String(value == null ? '' : value).trim();
        if (s === '') return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : undefined;
    }

    const api = { legKeys, pendingLegs, dayTotals, legText, missingCoords, parseNumberInput };
    root.RoutesLogic = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
