/*
 * 資料處理（不碰 DOM）：把 data/places.json 與 data/trip.json（網頁載入的是產生檔 places.js／trip.js）組合成頁面需要的資料，並檢查資料是否打錯。
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
    // 擇一組（item.alt）的成員共用同一個號碼，label 再加字母（2a、2b）；alt 是該標記所屬的擇一組。
    function getMapPoints(day, places) {
        const points = [];
        let number = 0;
        let lastAlt = null, lastAltNumber = null, letter = 0;   // 目前所在擇一組的號碼與已用字母數
        day.items.forEach((item, itemIndex) => {
            if (!item.place || item.map === false) return;
            const place = places[item.place];
            if (!place || place.lat == null || place.lng == null) return;
            let pointNumber = null, label = null;
            if (item.numbered !== false) {
                const altInGroup = item.alt && item.alt === lastAlt && lastAltNumber != null;
                pointNumber = altInGroup ? lastAltNumber : ++number;
                if (item.alt) {
                    letter = altInGroup ? letter + 1 : 1;
                    label = `${pointNumber}${String.fromCharCode(96 + letter)}`;
                } else label = String(pointNumber);
            }
            if (item.alt) {
                lastAlt = item.alt;
                lastAltNumber = pointNumber;
            } else lastAlt = lastAltNumber = null;
            points.push({
                id: item.place,
                itemIndex,
                number: pointNumber,
                label,
                alt: item.alt || null,
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

    // 走過行程裡每個引用地點的位置：days[].stay.place、days[].items[].place（有填才算）、hotels[].place。
    // fn(id, label, owner)：label 是給人看的位置（「DAY 1 住宿」「DAY 1 第 2 項」「住宿區第 1 間」），
    // owner 是持有 place 欄位的物件（改 id 時 owner.place = newId）。validate、編輯器的引用檢查與改 id 共用
    function forEachPlaceRef(trip, fn) {
        trip.days.forEach(day => {
            if (day.stay) fn(day.stay.place, `DAY ${day.day} 住宿`, day.stay);
            day.items.forEach((item, index) => { if (item.place) fn(item.place, `DAY ${day.day} 第 ${index + 1} 項`, item); });
        });
        (trip.hotels || []).forEach((hotel, index) => fn(hotel.place, `住宿區第 ${index + 1} 間`, hotel));
    }

    // 有地點、會出現在地圖上（map 不是 false、不是 waypoint）、但地點沒有座標。validate 與編輯器的「沒有座標」提示共用
    function lacksCoords(item, place) {
        return !!(item.place && place && item.map !== false && item.type !== 'waypoint' && (place.lat == null || place.lng == null));
    }

    // 某一天的擇一組（ADR 0006）：相鄰、alt 相同的項目為一組，回傳 [{ alt, start, end }]（items 的索引，含頭尾）。
    // 只看相鄰與同名，不管成員合不合法（合法性由 validate 檢查），所以單獨一項的 alt 也會回傳
    function getAltGroups(day) {
        const groups = [];
        day.items.forEach((item, index) => {
            if (!item.alt) return;
            const last = groups[groups.length - 1];
            if (last && last.end === index - 1 && last.alt === item.alt) last.end = index;
            else groups.push({ alt: item.alt, start: index, end: index });
        });
        return groups;
    }

    // 檢查資料，回傳問題清單（空陣列代表沒問題）
    function validate(trip, places) {
        const errors = [];
        forEachPlaceRef(trip, (id, label) => {
            if (!places[id]) errors.push(`${label}：找不到地點「${id}」（請檢查 data/places.json 的 id）`);
        });

        trip.days.forEach(day => {
            day.items.forEach((item, index) => {
                const where = `DAY ${day.day} 第 ${index + 1} 項`;
                if (!ALL_TYPES.includes(item.type)) errors.push(`${where}：不認得的類型「${item.type}」`);
                if (item.type === 'waypoint' && !item.place) errors.push(`${where}：waypoint 必須指定 place`);
                if (CARD_TYPES.includes(item.type) && !item.title && !item.place) errors.push(`${where}：卡片需要 place 或 title`);
                if (lacksCoords(item, places[item.place])) errors.push(`${where}：地點「${item.place}」沒有座標，不會出現在地圖上`);
            });

            // 擇一組：成員只能是 spot、同一個 alt 必須相鄰、至少 2 項、只有第一項可寫 time
            const seen = new Set();
            getAltGroups(day).forEach(group => {
                const label = `DAY ${day.day} 擇一組 alt「${group.alt}」`;
                if (seen.has(group.alt)) errors.push(`${label}：同一個 alt 的項目必須相鄰`);
                seen.add(group.alt);
                if (group.end === group.start) errors.push(`${label}：至少 2 項`);
                for (let i = group.start; i <= group.end; i++) {
                    const where = `DAY ${day.day} 第 ${i + 1} 項`;
                    if (day.items[i].type !== 'spot') errors.push(`${where}：擇一組（alt）的成員只能是 spot`);
                    if (i > group.start && day.items[i].time) errors.push(`${where}：擇一組只有第一項可寫 time（共用時間）`);
                }
            });
        });

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

    // ───────── 路線與交通時間（docs/DESIGN.md 第 15 節；編輯器、公開頁面、測試共用）─────────

    const DEFAULT_ROUTING = { trafficFactor: 1.25, maxLegMinutes: 180 };

    // 座標字串「經度,緯度」（各 5 位小數）；路線服務的請求網址也用這個格式
    const formatCoord = p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`;

    // 路段快取 key：起終點座標字串，「經度,緯度>經度,緯度」
    function legKey(from, to) {
        return `${formatCoord(from)}>${formatCoord(to)}`;
    }

    // 某一天的路段：同一天內依順序相鄰的地圖標記兩兩一段（backup 不算，標記規則同 getMapPoints）；
    // closeLoop 的回程段（最後一個標記 → 第一個）也算。
    // 擇一組的成員視為同一站：前一站 → 每個成員、每個成員 → 下一站各一段（分岔再合流），成員之間不連線；
    // fromAlt／toAlt 是起點／終點所屬的擇一組 alt（沒有就 null），要並列「同一組的多條路徑」時用它們歸類。
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
                fromAlt: a.alt, toAlt: b.alt,
                from, to, key: legKey(from, to),
                rowIndex, needsRow, closeLoop
            });
        };
        // 站：相鄰、同一擇一組的標記併成一站，其餘一個標記一站
        const stops = [];
        points.forEach(p => {
            const last = stops[stops.length - 1];
            if (p.alt && last && last[0].alt === p.alt) last.push(p);
            else stops.push([p]);
        });
        for (let i = 0; i + 1 < stops.length; i++) stops[i].forEach(a => stops[i + 1].forEach(b => make(a, b, false)));
        if (day.closeLoop && stops.length > 1) stops[stops.length - 1].forEach(a => stops[0].forEach(b => make(a, b, true)));
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
        return `查詢・含路況緩衝 ×${factor}`;
    }

    // 「HH:MM - HH:MM」（後面可接說明文字）→ 分鐘區間；「17:10 後」「12:15」等不完整時間回傳 null
    function parseTimeRange(time) {
        const m = typeof time === 'string' && /^\s*(\d{1,2}):(\d{2})\s*[-–—~]\s*(\d{1,2}):(\d{2})(?!\d)/.exec(time);
        if (!m) return null;
        const start = +m[1] * 60 + +m[2], end = +m[3] * 60 + +m[4];
        return end >= start ? { start, end } : null;
    }

    // 路段快取的一筆是否可用：distance 與 duration 都是有限數字（getLegSchedule 與公開頁面的 dayRoutes 共用這一個判斷）
    const isUsableLeg = c => !!c && [c.distance, c.duration].every(v => typeof v === 'number' && Number.isFinite(v));

    // 每一段的排定時間與查詢時間（公開頁面的紅字與編輯器的警告列表共用這一個判斷）。
    // 回傳 [{ leg, legIndex, scheduled, needed, short }]，順序同 getLegs：
    //   scheduled：排定時間（分）。有綁定交通列：該列 time 的完整區間長度；沒有交通列：前一項結束到後一項開始之差；
    //             time 不是完整區間（「15:30 後」等）、多個交通列未綁定、closeLoop 回程都是 null。duration 欄位只是備註，不參與。
    //   needed：查詢時間（分，含路況係數）；沒有路線快取時 null。
    //   short：兩者都有值且 scheduled < needed（排太緊）。
    // routes = { legs: { key: { distance, duration } } }，可為 undefined。
    function getLegSchedule(day, places, routes, site) {
        const cache = (routes && routes.legs) || {};
        const factor = getTrafficFactor(day, site);
        // 擇一組的成員沒有自己的 time：整組共用第一項的 time
        const groups = getAltGroups(day);
        const timeOf = index => {
            const group = groups.find(g => index >= g.start && index <= g.end);
            return day.items[group ? group.start : index].time;
        };
        return getLegs(day, places).map((leg, legIndex) => {
            const cached = cache[leg.key];
            const needed = isUsableLeg(cached) ? displayMinutes(cached.duration, factor) : null;
            let scheduled = null;
            if (!leg.closeLoop) {
                if (leg.rowIndex != null) {
                    const range = parseTimeRange(day.items[leg.rowIndex].time);
                    if (range) scheduled = range.end - range.start;
                } else if (leg.needsRow) {
                    const prev = parseTimeRange(timeOf(leg.fromItemIndex));
                    const next = parseTimeRange(timeOf(leg.toItemIndex));
                    if (prev && next) scheduled = next.start - prev.end;
                }
            }
            return { leg, legIndex, scheduled, needed, short: scheduled != null && needed != null && scheduled < needed };
        });
    }

    // 「排太緊」警告列表（編輯器顯示，不擋發布），由 getLegSchedule 判斷
    function getTimeWarnings(day, places, routes, site) {
        const factor = getTrafficFactor(day, site);
        const nameOf = id => (places[id] && places[id].name) || id;
        return getLegSchedule(day, places, routes, site).filter(s => s.short).map(({ leg, legIndex, scheduled, needed }) => ({
            legKey: leg.key, legIndex, scheduled, needed,
            message: `DAY ${day.day} 第 ${legIndex + 1} 段（${nameOf(leg.fromId)} → ${nameOf(leg.toId)}）：排定 ${scheduled} 分，至少需要${formatDuration(needed)}（${formatFactorNote(factor)}）`
        }));
    }

    Trip.model = {
        getContact, getMapPoints, getAltGroups, validate, forEachPlaceRef, lacksCoords, CARD_TYPES, ROW_TYPES,
        DEFAULT_ROUTING, formatCoord, legKey, getLegs, getTrafficFactor, displayMinutes,
        formatDuration, formatDistance, formatLeg, formatFactorNote, parseTimeRange, isUsableLeg, getLegSchedule, getTimeWarnings
    };
    if (typeof module !== 'undefined') module.exports = Trip.model;
})(typeof window !== 'undefined' ? window : globalThis);
