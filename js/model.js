/*
 * 資料處理（不碰 DOM）：把 data/places.json 與 data/trip.json（網頁載入的是產生檔 places.js／trip.js）組合成頁面需要的資料，並檢查資料是否打錯。
 */
(function (root) {
    const Trip = root.Trip = root.Trip || {};

    const CARD_TYPES = ['spot', 'meal', 'stay', 'end', 'notice'];
    const ROW_TYPES = ['move'];
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

    // 項目所屬的擇一組（{ alt, start, end }）；不在任何擇一組內回傳 undefined。三處「項目屬於哪個擇一組」共用這一個查找
    function getAltGroupAt(day, index) {
        return getAltGroups(day).find(g => index >= g.start && index <= g.end);
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
                if ('duration' in item) errors.push(`${where}：項目的 duration 已改名為 note，請改用 note`);
                if (item.type === 'drive') errors.push(`${where}：項目類型 drive 已移除，請改用 move`);
                else if (!ALL_TYPES.includes(item.type)) errors.push(`${where}：不認得的類型「${item.type}」`);
                if ('buffer' in item) {
                    if (item.type !== 'move') errors.push(`${where}：buffer（緩衝）只能用在 move`);
                    else if (!Number.isInteger(item.buffer)) errors.push(`${where}：buffer（緩衝）必須是整數分鐘`);
                }
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
    // rowIndex：兩標記之間恰好一個 move 時是該項目的索引，否則 null；
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

    // 停留時間（分）：time 是完整區間且結束晚於開始才有值，否則 null（不完整、相等、跨午夜）。公開頁面與編輯器共用
    function getStayMinutes(time) {
        const range = parseTimeRange(time);
        return range && range.end > range.start ? range.end - range.start : null;
    }

    // 100 → 「1 小時 40 分」、45 → 「45 分」（formatDuration 的寫法，不帶「約」）
    function formatStay(minutes) {
        return formatDuration(minutes).replace(/^約 /, '');
    }

    // 項目的停留時間文字「停留 1 小時 40 分」：只有 spot／meal，且時間是完整區間、結束晚於開始才有，否則空字串。公開頁面與編輯器共用
    function getStayLabel(item) {
        const minutes = item && (item.type === 'spot' || item.type === 'meal') ? getStayMinutes(item.time) : null;
        return minutes == null ? '' : `停留 ${formatStay(minutes)}`;
    }

    // 路段快取的一筆是否可用：distance 與 duration 都是有限數字（getLegSchedule 與公開頁面的 dayRoutes 共用這一個判斷）
    const isUsableLeg = c => !!c && [c.distance, c.duration].every(v => typeof v === 'number' && Number.isFinite(v));

    // 每一段的排定時間與查詢時間（公開頁面的紅字與編輯器的警告列表共用這一個判斷）。
    // 回傳 [{ leg, legIndex, scheduled, needed, short }]，順序同 getLegs：
    //   scheduled：排定時間（分）。有綁定交通列：該列 time 的完整區間長度；沒有交通列：前一項結束到後一項開始之差；
    //             time 不是完整區間（「15:30 後」等）、多個交通列未綁定、closeLoop 回程都是 null。note 欄位只是備註，不參與。
    //   needed：查詢時間（分，含路況係數）；沒有路線快取時 null。
    //   short：兩者都有值且 scheduled < needed（排太緊）。
    // routes = { legs: { key: { distance, duration } } }，可為 undefined。
    function getLegSchedule(day, places, routes, site) {
        const cache = (routes && routes.legs) || {};
        const factor = getTrafficFactor(day, site);
        // 擇一組的成員沒有自己的 time：整組共用第一項的 time
        const timeOf = index => {
            const group = getAltGroupAt(day, index);
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

    const pad2 = n => String(n).padStart(2, '0');
    const formatClock = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

    // 移動列補齊與警告（純函式，不修改輸入；規則見 docs/adr/0007）。相鄰標記的定義與 getLegs 的連接列一致
    // （有座標、非 backup、非 map:false；擇一組視為同一站）。這裡不看任何時間：時間由 cascadeDay／fitMoves 依查詢長度決定。
    // 兩站之間：恰好一個交通列（ROW_TYPES）→ 列入 moves；沒有 → 列入 missing；多個 → 只警告。
    // 回傳 {
    //   moves:   [{ index, fromItemIndex, toItemIndex, fromId, toId }]   index 是既有移動列在 day.items 的索引
    //   missing: [{ fromItemIndex, toItemIndex, fromId, toId, insertIndex, text }]
    //            insertIndex ＝前一站最後一員的索引 + 1（依原陣列索引計；一次插入多個時由後往前插）；text 預設「前一站 ➔ 下一站」
    //   warnings:[{ type: 'multiple'|'extra', index | indexes, message }]
    //            multiple：一段內有多個交通列（indexes）；extra：不在任何兩站之間的交通列（index）
    // }
    function deriveMoves(day, places) {
        const points = getMapPoints(day, places).filter(p => !p.excludeFromRoute);
        const stops = [];
        points.forEach(p => {
            const last = stops[stops.length - 1];
            if (p.alt && last && last[0].alt === p.alt) last.push(p);
            else stops.push([p]);
        });
        const nameOf = id => (places[id] && places[id].name) || id;
        const stopName = stop => stop.map(p => nameOf(p.id)).join('／');
        const result = { moves: [], missing: [], warnings: [] };
        const inGap = new Set();
        for (let i = 0; i + 1 < stops.length; i++) {
            const a = stops[i], b = stops[i + 1];
            const fromItemIndex = a[a.length - 1].itemIndex, toItemIndex = b[0].itemIndex;
            const rows = [];
            for (let k = fromItemIndex + 1; k < toItemIndex; k++) if (ROW_TYPES.includes(day.items[k].type)) rows.push(k);
            rows.forEach(k => inGap.add(k));
            if (rows.length > 1) {
                result.warnings.push({ type: 'multiple', indexes: rows, message: `DAY ${day.day}（${stopName(a)} → ${stopName(b)}）：兩站之間有 ${rows.length} 個移動列，請只留一個` });
                continue;
            }
            const info = { fromItemIndex, toItemIndex, fromId: a[a.length - 1].id, toId: b[0].id };
            if (rows.length === 1) result.moves.push({ index: rows[0], ...info });
            else result.missing.push({ ...info, insertIndex: fromItemIndex + 1, text: `${stopName(a)} ➔ ${stopName(b)}` });
        }
        day.items.forEach((item, index) => {
            if (ROW_TYPES.includes(item.type) && !inGap.has(index)) {
                result.warnings.push({ type: 'extra', index, message: `DAY ${day.day} 第 ${index + 1} 項：這個移動列不在任何兩個地圖標記之間` });
            }
        });
        return result;
    }

    // 套用 deriveMoves 的結果（就地修改 day）：在缺移動列處補一列 { type: 'move', text }（不寫 time；fill = false 時不補，輸入中不能動到列數）；只補不刪。
    // r 是同一天的 deriveMoves(day, places) 結果；回傳 { added: [{ ...missing 項, item }] }（item 是補上的那個物件，呼叫端可接著用 fitMoves 算時間）。編輯器與 tools/sync-moves.js 共用
    function applyMoves(day, r, fill = true) {
        const out = { added: [] };
        if (!fill) return out;
        r.missing.slice().sort((a, b) => b.insertIndex - a.insertIndex).forEach(s => {   // 由後往前插，前面的索引才不會位移
            const item = { type: 'move', text: s.text };
            day.items.splice(s.insertIndex, 0, item);
            out.added.push({ ...s, item });
        });
        return out;
    }

    // ───────── 移動列長度、連動、整天重排（docs/adr/0007；編輯器、CLI、測試共用）─────────

    // 移動列長度（分）= 查詢時間（四捨五入（原始秒數 ÷ 60 × 係數））+ item.buffer（整數分、可為負、缺值視為 0）。
    // leg 是該移動列綁定路段的快取 { distance, duration }；沒有可用的查詢結果回 null
    function getMoveMinutes(item, leg, factor) {
        if (!isUsableLeg(leg)) return null;
        return displayMinutes(leg.duration, factor) + ((item && item.buffer) || 0);
    }

    // 同上，但由一天的資料找綁定路段（getLegs 的 rowIndex；兩標記之間恰好一個 move 才綁定）。
    // 該項目不是移動列、沒有綁定路段、沒有可用的快取都回 null
    function getMoveMinutesAt(day, index, places, routes, site) {
        const item = day.items[index];
        if (!item || !ROW_TYPES.includes(item.type)) return null;
        const cache = (routes && routes.legs) || {};
        const leg = getLegs(day, places).find(l => l.rowIndex === index && isUsableLeg(cache[l.key]));
        return leg ? getMoveMinutes(item, cache[leg.key], getTrafficFactor(day, site)) : null;
    }

    // 把 time 改寫成 start–end 分鐘，區間後面的說明文字保留（time 不是完整區間就沒有說明文字）；格式「HH:MM - HH:MM」
    function setTimeRange(time, start, end) {
        const m = /^\s*(\d{1,2}):(\d{2})\s*[-–—~]\s*(\d{1,2}):(\d{2})(?!\d)/.exec(time || '');
        return `${formatClock(start)} - ${formatClock(end)}${m ? time.slice(m[0].length) : ''}`;
    }

    const DAY_END = 24 * 60 - 1;

    // 連動（就地修改 day）：第 index 項的結束時間變了 delta 分鐘（可為負；呼叫端已改好該項自己的 time），
    // 把它後面所有完整區間項目整段平移 delta 分，停留與移動長度不變；前面的項目不動。
    // 不完整時間（「15:30 後」、未填、跨午夜、結束 ≤ 開始）不動；擇一組視為同一站：index 在組內時從組之後開始，成員沒有 time 自然不動。
    // 平移後超出 00:00–23:59 的項目不動並警告。
    // 回傳 { changed: [{ index, from, to }], warnings: [{ type: 'overflow', index, message }] }
    function cascadeDay(day, index, delta) {
        const out = { changed: [], warnings: [] };
        if (!delta) return out;
        const group = getAltGroupAt(day, index);
        for (let i = (group ? group.end : index) + 1; i < day.items.length; i++) {
            const item = day.items[i], range = parseTimeRange(item.time);
            if (!range) continue;
            const start = range.start + delta, end = range.end + delta;
            if (start < 0 || end > DAY_END) {
                out.warnings.push({ type: 'overflow', index: i, message: `DAY ${day.day} 第 ${i + 1} 項：平移 ${delta} 分後超出當天，時間未更動` });
                continue;
            }
            const to = setTimeRange(item.time, start, end);
            out.changed.push({ index: i, from: item.time, to });
            item.time = to;
        }
        return out;
    }

    // ───────── 邊界連動與伸縮（docs/adr/0007）─────────
    // 單位（unit）= 一個項目，擇一組整組算一個（時間在第一員，index 取組內任一員都行）。
    // moveEdge 是共同核心：改單位 u 的某一邊（side 'start'／'end'）到 value（分鐘），整個操作先算好再一次套用，任何一步不合就整個不套用。
    //   link：結束邊 → 後面所有完整區間單位平移 delta；開始邊 → 前面所有完整區間單位平移 delta（delta = 新值 − 舊值）。
    //   stretch：鄰近單位若是移動就整個平移 delta，再外一個（或鄰近本身不是移動時）單位由靠近的那一邊吸收 delta；更遠的不動。
    // 不完整時間的單位不平移、不吸收。回傳 { ok, reason, message, changed: [{ index, from, to }] }；
    // reason：'stay'（停留 ≤ 0）、'length'（移動長度 < 0）、'overflow'（超出 00:00–23:59）、'incomplete'、'invalid-time'、'not-move'、'invalid'
    function getEdgeUnits(day) {
        const units = [];
        for (let i = 0; i < day.items.length; i++) {
            const group = getAltGroupAt(day, i);
            const carrier = group ? group.start : i;
            units.push({ carrier, range: parseTimeRange(day.items[carrier].time), isMove: ROW_TYPES.includes(day.items[carrier].type) });
            if (group) i = group.end;
        }
        return units;
    }

    function parseClockValue(v) {
        if (Number.isInteger(v) && v >= 0 && v <= DAY_END) return v;
        const m = typeof v === 'string' && /^\s*(\d{1,2}):(\d{2})\s*$/.exec(v);
        const minutes = m ? +m[1] * 60 + +m[2] : null;
        return m && +m[1] < 24 && +m[2] < 60 && minutes <= DAY_END ? minutes : null;
    }

    function moveEdge(day, unitIndex, side, value, mode) {
        const fail = (reason, message) => ({ ok: false, reason, message: `DAY ${day.day}：${message}`, changed: [] });
        const units = getEdgeUnits(day);
        const u = units[unitIndex];
        if (!u || !u.range) return fail('incomplete', '這個項目沒有完整的時間區間，不能調整');
        const delta = value - u.range[side];
        const plan = new Map();   // 單位索引 → 新區間
        const rangeOf = k => (plan.get(k) || units[k].range);
        plan.set(unitIndex, side === 'end' ? { start: u.range.start, end: value } : { start: value, end: u.range.end });
        const shift = (k, d) => { if (units[k] && units[k].range) plan.set(k, { start: units[k].range.start + d, end: units[k].range.end + d }); };
        const absorb = (k, nearSide, d) => { if (units[k] && units[k].range) plan.set(k, { ...units[k].range, [nearSide]: units[k].range[nearSide] + d }); };
        if (mode === 'link') {
            if (side === 'end') for (let k = unitIndex + 1; k < units.length; k++) shift(k, delta);
            else for (let k = 0; k < unitIndex; k++) shift(k, delta);
        } else {
            const dir = side === 'end' ? 1 : -1;
            const near = unitIndex + dir;
            if (units[near] && units[near].range) {
                let absorber = near;
                if (units[near].isMove) { shift(near, delta); absorber = near + dir; }
                absorb(absorber, side === 'end' ? 'start' : 'end', delta);
            }
        }
        for (const [k, r] of plan) {
            const index = units[k].carrier;
            const len = r.end - r.start;
            if (r.start < 0 || r.end > DAY_END) return fail('overflow', `第 ${index + 1} 項平移後超出當天（00:00–23:59），操作未套用`);
            if (units[k].isMove ? len < 0 : len <= 0) {
                return units[k].isMove ? fail('length', `第 ${index + 1} 項移動長度會小於 0，操作未套用`) : fail('stay', `第 ${index + 1} 項停留會小於或等於 0，操作未套用`);
            }
        }
        const changed = [];
        for (const [k, r] of plan) {
            const item = day.items[units[k].carrier];
            const to = setTimeRange(item.time, r.start, r.end);
            if (to !== item.time) { changed.push({ index: units[k].carrier, from: item.time, to }); item.time = to; }
        }
        changed.sort((a, b) => a.index - b.index);
        return { ok: true, reason: null, message: '', changed };
    }

    const unitIndexOf = (day, index) => getEdgeUnits(day).findIndex(u => u.carrier === index || (getAltGroupAt(day, index) || {}).start === u.carrier);

    // 景點邊界調整（就地修改 day）：把第 index 項（擇一組取組內任一員）的 side（'start'｜'end'）改成 newTime（'HH:MM' 或分鐘數），mode 'link'｜'stretch'
    function adjustSpotEdge(day, index, side, newTime, mode) {
        const bad = message => ({ ok: false, reason: 'invalid', message: `DAY ${day.day}：${message}`, changed: [] });
        if (!day.items[index]) return bad('沒有這個項目');
        if (side !== 'start' && side !== 'end') return bad('side 只能是 start 或 end');
        if (mode !== 'link' && mode !== 'stretch') return bad('mode 只能是 link 或 stretch');
        const value = parseClockValue(newTime);
        if (value == null) return { ok: false, reason: 'invalid-time', message: `DAY ${day.day}：時間格式不正確（HH:MM，00:00–23:59）`, changed: [] };
        return moveEdge(day, unitIndexOf(day, index), side, value, mode);
    }

    // 移動緩衝調整（就地修改 day）：第 index 項（必須是移動列）的總緩衝改成 buffer（整數分，0 不寫入），
    // direction 'forward'（開始邊動，前面跟著動）｜'back'（結束邊動，後面跟著動），mode 'link'｜'stretch'。
    // 移動沒有完整時間時只存緩衝、不動任何時間。被拒絕時 buffer 與時間都不變
    function adjustMoveBuffer(day, index, buffer, direction, mode) {
        const bad = (reason, message) => ({ ok: false, reason, message: `DAY ${day.day}：${message}`, changed: [] });
        const item = day.items[index];
        if (!item || !ROW_TYPES.includes(item.type)) return bad('not-move', '這個項目不是移動列');
        if (!Number.isInteger(buffer)) return bad('invalid', '緩衝必須是整數分鐘');
        if (direction !== 'forward' && direction !== 'back') return bad('invalid', 'direction 只能是 forward 或 back');
        if (mode !== 'link' && mode !== 'stretch') return bad('invalid', 'mode 只能是 link 或 stretch');
        const diff = buffer - (item.buffer || 0);
        const range = parseTimeRange(item.time);
        let result = { ok: true, reason: null, message: '', changed: [] };
        if (range) {
            const side = direction === 'back' ? 'end' : 'start';
            result = moveEdge(day, unitIndexOf(day, index), side, direction === 'back' ? range.end + diff : range.start - diff, mode);
            if (!result.ok) return result;
        }
        if (buffer) item.buffer = buffer; else delete item.buffer;
        return result;
    }

    // 依查詢結果調整移動列（就地修改 day）：只處理 want(item, legKey) 為真的移動列（擇一組同一列綁多條路段時只處理一次，路段 key 取第一條）。
    // 長度 = getMoveMinutesAt（查詢 + buffer，不小於 0）；沒有查詢結果的列不動。
    //   - 列有完整時間：開始不變、結束改成開始 + 長度，後面所有項目平移長度的差值（cascadeDay）。
    //   - 列沒有完整時間（剛補出的列）：前一站（擇一組用共用時間框）有完整結束才算：開始 = 前一站結束、結束 = 開始 + 長度，
    //     之後第一個完整時間項目的開始 = 這列結束（後面整段平移，不留空檔也不重複推）。
    // 由前往後處理；超出 00:00–23:59 的列不動並警告。回傳 { changed: [{ index, from, to }], warnings }
    function fitMoves(day, places, routes, site, want) {
        const out = { changed: [], warnings: [] };
        const seen = new Set();
        const record = (index, from, to) => out.changed.push({ index, from, to });
        getLegs(day, places).forEach(leg => {
            const i = leg.rowIndex;
            if (i == null || leg.closeLoop || seen.has(i)) return;
            seen.add(i);
            const item = day.items[i];
            if (!want(item, leg.key)) return;
            const minutes = getMoveMinutesAt(day, i, places, routes, site);
            if (minutes == null) return;
            const length = Math.max(0, minutes);
            const range = parseTimeRange(item.time);
            let start, delta;
            if (range) {
                start = range.start;
                delta = length - (range.end - range.start);
            } else {
                const group = getAltGroupAt(day, leg.fromItemIndex);
                const prev = parseTimeRange(day.items[group ? group.start : leg.fromItemIndex].time);
                if (!prev) return;
                start = prev.end;
                const next = day.items.slice(i + 1).map(x => parseTimeRange(x.time)).find(Boolean);
                delta = next ? start + length - next.start : 0;
            }
            if (start + length > DAY_END) {
                out.warnings.push({ type: 'overflow', index: i, message: `DAY ${day.day} 第 ${i + 1} 項：移動 ${length} 分後超出當天，時間未更動` });
                return;
            }
            const to = setTimeRange(item.time, start, start + length);
            if (to !== item.time) { record(i, item.time, to); item.time = to; }
            const r = cascadeDay(day, i, delta);
            r.changed.forEach(c => out.changed.push(c));
            r.warnings.forEach(w => out.warnings.push(w));
        });
        return out;
    }

    // 整天重排（就地修改 day）：以第一個完整區間項目的開始時間為起點，依序排後面所有完整區間項目：
    // 景點等項目的停留（結束 − 開始）不變；移動列長度 = getMoveMinutesAt（查詢 + buffer），沒有查詢結果就沿用現有長度並警告。
    // 不完整時間的項目不動、不佔時間；擇一組成員沒有 time，整組共用第一項的時間框。可重複執行（第二次 changed 為空）。
    // 超出 00:00–23:59 的項目不動並警告（之後的項目仍接在原本的游標上）。
    // 回傳 { changed: [{ index, from, to }], warnings: [{ type: 'no-route' | 'overflow', index, message }] }
    function rescheduleDay(day, places, routes, site) {
        const out = { changed: [], warnings: [] };
        let cursor = null;
        day.items.forEach((item, i) => {
            const range = parseTimeRange(item.time);
            if (!range) return;
            if (cursor == null) cursor = range.start;
            let length = range.end - range.start;
            if (ROW_TYPES.includes(item.type)) {
                const minutes = getMoveMinutesAt(day, i, places, routes, site);
                if (minutes != null) length = Math.max(0, minutes);
                else out.warnings.push({ type: 'no-route', index: i, message: `DAY ${day.day} 第 ${i + 1} 項：沒有可用的路線查詢結果（路段還沒算，或這列不在兩個地圖標記之間），沿用現有移動時間` });
            }
            const start = cursor, end = cursor + length;
            if (end > DAY_END) {
                out.warnings.push({ type: 'overflow', index: i, message: `DAY ${day.day} 第 ${i + 1} 項：重排後超出當天，時間未更動` });
                return;
            }
            const to = setTimeRange(item.time, start, end);
            if (to !== item.time) { out.changed.push({ index: i, from: item.time, to }); item.time = to; }
            cursor = end;
        });
        return out;
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
        getContact, getMapPoints, getAltGroups, getAltGroupAt, validate, forEachPlaceRef, lacksCoords, CARD_TYPES, ROW_TYPES,
        DEFAULT_ROUTING, formatCoord, legKey, getLegs, getTrafficFactor, displayMinutes,
        formatDuration, formatDistance, formatLeg, formatFactorNote, parseTimeRange, getStayMinutes, formatStay, getStayLabel, isUsableLeg, getLegSchedule, getTimeWarnings, deriveMoves, applyMoves,
        getMoveMinutes, getMoveMinutesAt, cascadeDay, fitMoves, setTimeRange, rescheduleDay,
        adjustSpotEdge, adjustMoveBuffer
    };
    if (typeof module !== 'undefined') module.exports = Trip.model;
})(typeof window !== 'undefined' ? window : globalThis);
