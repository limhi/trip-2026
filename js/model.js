/*
 * 資料處理（不碰 DOM）：把 data/places.js 與 data/trip.js 組合成頁面需要的資料，並檢查資料是否打錯。
 */
(function (root) {
    const Trip = root.Trip = root.Trip || {};

    const CARD_TYPES = ['spot', 'meal', 'stay', 'end', 'notice'];
    const ROW_TYPES = ['drive', 'move'];
    const ALL_TYPES = [...CARD_TYPES, ...ROW_TYPES, 'brief', 'waypoint'];

    // 地點的聯絡資訊（彈窗用）；沒有 infoType 的地點沒有彈窗
    function getContact(place) {
        if (!place || !place.infoType) return null;
        const digits = place.phone ? place.phone.replace(/\D/g, '') : '';
        return {
            type: place.infoType,
            name: place.name,
            phone: place.phone,
            tel: place.tel || digits || undefined,
            phoneActionLabel: place.phoneActionLabel,
            lineLabel: place.line && place.line.label,
            lineUrl: place.line && place.line.url,
            website: place.website,
            address: place.address,
            navigationUrl: place.navigationUrl,
            bookingName: place.booking && place.booking.name,
            bookingPhone: place.booking && place.booking.phone,
            // parking 可寫成一段文字或文字陣列，統一轉成陣列
            parking: place.parking ? [].concat(place.parking) : [],
            alternate: place.alternate
        };
    }

    // 某一天的地圖標記：依 items 的順序，有 place（且有座標）的項目自動成為標記。
    // number 是標記上的編號，左邊的卡片會顯示同一個編號；numbered:false 的項目不編號（number 為 null）。
    // itemIndex 是該標記對應 day.items 的第幾項。
    function getMapPoints(day, places) {
        const points = [];
        let number = 0;
        day.items.forEach((item, itemIndex) => {
            if (!item.place || item.map === false) return;
            const place = places[item.place];
            if (!place || place.lat == null || place.lng == null) return;
            points.push({
                id: item.place,
                itemIndex,
                number: item.numbered === false ? null : ++number,
                name: item.mapName || place.name,
                type: item.backup ? 'backup' : (place.mapType || 'transport'),
                lat: place.lat,
                lng: place.lng,
                address: place.address,
                navigationUrl: place.navigationUrl,
                excludeFromRoute: !!item.backup
            });
        });
        return points;
    }

    // 檢查資料，回傳問題清單（空陣列代表沒問題）
    function validate(trip, places) {
        const errors = [];
        const needPlace = (id, where) => {
            if (!places[id]) errors.push(`${where}：找不到地點「${id}」（請檢查 data/places.js 的 id）`);
        };

        trip.days.forEach(day => {
            const dayLabel = `DAY ${day.day}`;
            if (day.stay) needPlace(day.stay.place, `${dayLabel} 住宿`);
            day.items.forEach((item, index) => {
                const where = `${dayLabel} 第 ${index + 1} 項`;
                if (!ALL_TYPES.includes(item.type)) errors.push(`${where}：不認得的類型「${item.type}」`);
                if (item.place) needPlace(item.place, where);
                if (item.type === 'waypoint' && !item.place) errors.push(`${where}：waypoint 必須指定 place`);
                if (CARD_TYPES.includes(item.type) && !item.title && !item.place) errors.push(`${where}：卡片需要 place 或 title`);
                if (item.place && places[item.place] && item.map !== false && item.type !== 'waypoint') {
                    const p = places[item.place];
                    if (p.lat == null || p.lng == null) errors.push(`${where}：地點「${item.place}」沒有座標，不會出現在地圖上`);
                }
            });
        });
        trip.hotels.forEach((hotel, index) => needPlace(hotel.place, `住宿區第 ${index + 1} 間`));

        // 路線設定：選填，有填就必須是正數
        const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
        const routing = trip.site && trip.site.routing;
        if (routing) {
            ['trafficFactor', 'maxLegMinutes'].forEach(k => {
                if (routing[k] !== undefined && !positive(routing[k])) errors.push(`site.routing.${k} 必須是大於 0 的數字`);
            });
        }
        trip.days.forEach(day => {
            if (day.trafficFactor !== undefined && !positive(day.trafficFactor)) errors.push(`DAY ${day.day}：trafficFactor 必須是大於 0 的數字`);
        });
        return errors;
    }

    // ───────── 路線與交通時間（spec 7；編輯器、公開頁面、測試共用）─────────

    const DEFAULT_ROUTING = { trafficFactor: 1.25, maxLegMinutes: 180 };

    // 路段快取 key：起終點座標各取 5 位小數，「經度,緯度>經度,緯度」
    function legKey(from, to) {
        const fmt = p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`;
        return `${fmt(from)}>${fmt(to)}`;
    }

    // 某一天的路段：同一天內依順序相鄰的地圖標記兩兩一段（backup 不算，標記規則同 getMapPoints）；
    // closeLoop 的回程段（最後一個標記 → 第一個）也算。
    // rowIndex：兩標記之間恰好一個 drive／move 時是該項目的索引，否則 null；
    // needsRow：兩標記之間沒有交通列（需要補自動連接列）。closeLoop 的回程段不綁定任何列。
    function getLegs(day, places) {
        const points = getMapPoints(day, places).filter(p => !p.excludeFromRoute);
        const legs = [];
        const make = (a, b, closeLoop) => {
            const from = { lat: a.lat, lng: a.lng }, to = { lat: b.lat, lng: b.lng };
            let rowIndex = null, needsRow = false;
            if (!closeLoop) {
                const rows = [];
                for (let i = a.itemIndex + 1; i < b.itemIndex; i++) if (ROW_TYPES.includes(day.items[i].type)) rows.push(i);
                if (rows.length === 1) rowIndex = rows[0];
                needsRow = rows.length === 0;
            }
            legs.push({
                fromItemIndex: a.itemIndex, toItemIndex: b.itemIndex,
                fromId: a.id, toId: b.id,
                from, to, key: legKey(from, to),
                rowIndex, needsRow, closeLoop
            });
        };
        for (let i = 0; i + 1 < points.length; i++) make(points[i], points[i + 1], false);
        if (day.closeLoop && points.length > 1) make(points[points.length - 1], points[0], true);
        return legs;
    }

    // 當天使用的係數：day.trafficFactor > site.routing.trafficFactor > 預設
    function getTrafficFactor(day, site) {
        return (day && day.trafficFactor) || (site && site.routing && site.routing.trafficFactor) || DEFAULT_ROUTING.trafficFactor;
    }

    // 顯示分鐘 = 四捨五入（原始秒數 ÷ 60 × 係數）
    function displayMinutes(duration, factor) {
        return Math.round(duration / 60 * factor);
    }

    // 45 → 「約 45 分」、60 → 「約 1 小時」、65 → 「約 1 小時 5 分」
    function formatDuration(minutes) {
        const h = Math.floor(minutes / 60), m = minutes % 60;
        if (h === 0) return `約 ${m} 分`;
        return m === 0 ? `約 ${h} 小時` : `約 ${h} 小時 ${m} 分`;
    }

    function formatDistance(meters) {
        return `${(meters / 1000).toFixed(1)} km`;
    }

    // leg = { distance, duration }（快取的原始值）→ 「約 1 小時 5 分・75.3 km」
    function formatLeg(leg, factor) {
        return `${formatDuration(displayMinutes(leg.duration, factor))}・${formatDistance(leg.distance)}`;
    }

    function formatFactorNote(factor) {
        return `預估・含路況緩衝 ×${factor}`;
    }

    // 「HH:MM - HH:MM」（後面可接說明文字）→ 分鐘區間；「17:10 後」「12:15」等不完整時間回傳 null
    function parseTimeRange(time) {
        const m = typeof time === 'string' && /^\s*(\d{1,2}):(\d{2})\s*[-–—~]\s*(\d{1,2}):(\d{2})(?!\d)/.exec(time);
        if (!m) return null;
        const start = +m[1] * 60 + +m[2], end = +m[3] * 60 + +m[4];
        return end >= start ? { start, end } : null;
    }

    // 「排太緊」警告（只在編輯器顯示，不擋發布）。routes = { legs: { key: { distance, duration } } }。
    // 有綁定交通列：該列時間區間 < 顯示時間；沒有交通列：前一項結束與後一項開始之差 < 顯示時間。
    // 只在兩端都有可解析的區間時比對；沒有快取、未綁定（多個交通列）、closeLoop 回程都不比對。
    function getTimeWarnings(day, places, routes, site) {
        const warnings = [];
        const cache = (routes && routes.legs) || {};
        const factor = getTrafficFactor(day, site);
        const nameOf = id => (places[id] && places[id].name) || id;
        getLegs(day, places).forEach((leg, legIndex) => {
            const cached = cache[leg.key];
            if (!cached || leg.closeLoop) return;
            let scheduled = null;
            if (leg.rowIndex != null) {
                const range = parseTimeRange(day.items[leg.rowIndex].time);
                if (range) scheduled = range.end - range.start;
            } else if (leg.needsRow) {
                const prev = parseTimeRange(day.items[leg.fromItemIndex].time);
                const next = parseTimeRange(day.items[leg.toItemIndex].time);
                if (prev && next) scheduled = next.start - prev.end;
            }
            if (scheduled == null) return;
            const needed = displayMinutes(cached.duration, factor);
            if (scheduled >= needed) return;
            warnings.push({
                legKey: leg.key, legIndex, scheduled, needed,
                message: `DAY ${day.day} 第 ${legIndex + 1} 段（${nameOf(leg.fromId)} → ${nameOf(leg.toId)}）：排定 ${scheduled} 分，至少需要${formatDuration(needed)}（${formatFactorNote(factor)}）`
            });
        });
        return warnings;
    }

    Trip.model = {
        getContact, getMapPoints, validate, CARD_TYPES, ROW_TYPES,
        DEFAULT_ROUTING, legKey, getLegs, getTrafficFactor, displayMinutes,
        formatDuration, formatDistance, formatLeg, formatFactorNote, getTimeWarnings
    };
    if (typeof module !== 'undefined') module.exports = Trip.model;
})(typeof window !== 'undefined' ? window : globalThis);
