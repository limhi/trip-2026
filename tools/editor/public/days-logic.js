/*
 * 每日行程編輯的純邏輯（不碰 DOM，瀏覽器與 node:test 共用）。
 * 驗證與地圖編號不在這裡，一律用 js/model.js。
 */
(function (root) {
    const M = (root.Trip && root.Trip.model) || require('../../../js/model');
    const COMMON = ['map', 'numbered'];
    const CARD = ['tag', 'time', 'place', 'title', 'desc', ...COMMON];

    // 每種項目類型可填的欄位（與 docs/DESIGN.md 4.2 一致）；label／chip 給畫面用
    const TYPES = {
        drive:    { label: '交通',   chip: 'bg-slate-700 text-white',         fields: ['time', 'text', 'note'] },
        move:     { label: '移動',   chip: 'bg-slate-200 text-slate-800',     fields: ['time', 'text', 'note'] },
        spot:     { label: '景點',   chip: 'bg-blue-100 text-blue-800',       fields: CARD },
        meal:     { label: '用餐',   chip: 'bg-amber-100 text-amber-800',     fields: CARD },
        stay:     { label: '住宿',   chip: 'bg-purple-100 text-purple-800',   fields: CARD },
        end:      { label: '結束',   chip: 'bg-emerald-100 text-emerald-800', fields: CARD },
        notice:   { label: '提醒',   chip: 'bg-orange-100 text-orange-800',   fields: CARD },
        brief:    { label: '資訊框', chip: 'bg-yellow-100 text-yellow-800',   fields: ['time', 'title', 'place', 'icon', 'desc', ...COMMON] },
        waypoint: { label: '起訖/休息點', chip: 'bg-sky-100 text-sky-800',    fields: ['place', 'text', 'mapName', 'backup', 'numbered'] }
    };

    // 把項目從 (fromDi, fromIi) 搬到 (toDi, toIi)；toIi 是以「搬動前」的陣列計算的插入位置。回傳新位置。
    function moveItem(trip, fromDi, fromIi, toDi, toIi) {
        const days = trip.days;
        const [item] = days[fromDi].items.splice(fromIi, 1);
        if (fromDi === toDi && fromIi < toIi) toIi--;
        days[toDi].items.splice(toIi, 0, item);
        return { di: toDi, ii: days[toDi].items.indexOf(item) };
    }

    // 上移（dir = -1）或下移（dir = 1）一格；到頂／底會跨到相鄰的天。最前或最後一天到盡頭回傳 null。
    function stepItem(trip, di, ii, dir) {
        const days = trip.days;
        if (dir < 0) {
            if (ii > 0) return moveItem(trip, di, ii, di, ii - 1);
            if (di > 0) return moveItem(trip, di, ii, di - 1, days[di - 1].items.length);
            return null;
        }
        if (ii < days[di].items.length - 1) return moveItem(trip, di, ii, di, ii + 2);
        if (di < days.length - 1) return moveItem(trip, di, ii, di + 1, 0);
        return null;
    }

    // 改類型：清掉不屬於新類型的欄位
    function changeType(item, type) {
        item.type = type;
        const keep = ['type', ...TYPES[type].fields];
        if (type === 'spot') keep.push('alt');   // 擇一組（alt）只有 spot 能用，改成其他類型就會被清掉
        Object.keys(item).forEach(k => { if (!keep.includes(k)) delete item[k]; });
        return item;
    }

    // ---- 擇一組（ADR 0006）：只改 alt 與 time，合法性由 model.validate 檢查 ----

    // 項目在擇一組裡的位置：'first'／'middle'／'last'；不在組內（或單獨一項）回傳 null。畫外框用
    function altPosition(day, ii) {
        const g = M.getAltGroupAt(day, ii);
        if (!g || g.end === g.start) return null;
        return ii === g.start ? 'first' : ii === g.end ? 'last' : 'middle';
    }

    // 可併成擇一組：是 spot、還不在組內，且前一項或後一項是 spot
    function canJoinAlt(day, ii) {
        const it = day.items[ii];
        if (!it || it.type !== 'spot' || it.alt) return false;
        const isSpot = i => day.items[i] && day.items[i].type === 'spot';
        return isSpot(ii - 1) || isSpot(ii + 1);
    }

    // 共用時間只留在組內第一項。所有有時間的成員都是完整區間時取聯集（最早開始到最晚結束）；
    // 只有一個成員有時間、或有成員的時間不是完整區間（「17:10 後」等）時，保留第一個有時間的成員的原文，不亂湊
    function normalizeAltTime(day, g) {
        const members = day.items.slice(g.start, g.end + 1);
        const timed = members.map(m => m.time).filter(Boolean);
        const ranges = timed.map(M.parseTimeRange);
        let time = timed[0];
        if (timed.length > 1 && ranges.every(Boolean)) {
            const clock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
            time = `${clock(Math.min(...ranges.map(r => r.start)))} - ${clock(Math.max(...ranges.map(r => r.end)))}`;
        }
        members.forEach(m => delete m.time);
        if (time) members[0].time = time;
    }

    // 併成擇一組：優先併入前一個 spot，否則併入後一個；鄰居已有 alt 就沿用，沒有就取當天沒用過的新名稱。成功回傳 true
    function joinAlt(day, ii) {
        if (!canJoinAlt(day, ii)) return false;
        const prev = day.items[ii - 1], next = day.items[ii + 1];
        const mate = prev && prev.type === 'spot' ? prev : next;
        if (!mate.alt) {
            const used = new Set(day.items.map(i => i.alt));
            let n = 1;
            while (used.has(`alt${n}`)) n++;
            mate.alt = `alt${n}`;
        }
        day.items[ii].alt = mate.alt;
        normalizeAltTime(day, M.getAltGroupAt(day, ii));
        return true;
    }

    // 移出擇一組：移掉 alt；剩不到 2 項整組解除。中間成員會被搬到組後面，避免把組切開。回傳是否有改動
    function leaveAlt(day, ii) {
        const g = M.getAltGroupAt(day, ii);
        const it = day.items[ii];
        if (!g || !it.alt) return false;
        const sharedTime = day.items[g.start].time;
        delete it.alt;
        if (ii > g.start && ii < g.end) {
            day.items.splice(ii, 1);
            day.items.splice(g.end, 0, it);   // 移除一項後，原 g.end 的位置就是組的後面
        }
        const wasFirst = ii === g.start;
        if (wasFirst) delete it.time;
        const rest = M.getAltGroups(day).find(x => x.alt === g.alt);
        if (rest && wasFirst && sharedTime) day.items[rest.start].time = sharedTime;   // 共用時間交給留下來的第一項（組解散時也是）
        if (rest && rest.end === rest.start) delete day.items[rest.start].alt;
        return true;
    }

    // 停留時間提示（唯讀，不寫入資料）：只有 spot／meal，time 是完整區間且結束晚於開始才有；
    // 擇一組的共用時間在第一成員，非第一成員不顯示。沒有提示回傳空字串
    function stayHint(day, ii) {
        const it = day.items[ii];
        const g = M.getAltGroupAt(day, ii);
        if (g && ii !== g.start) return '';
        return M.getStayLabel(it);
    }

    function newItem(type, placeIds) {
        if (type === 'drive' || type === 'move') return { type, text: '新項目' };
        if (type === 'waypoint') return { type, place: placeIds[0] };
        if (type === 'brief') return { type, title: '新項目' };
        return { type, tag: '新項目', title: '新項目' };
    }

    const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

    // 依 'a.b' 路徑設值；空值刪除欄位，並清掉變空的父物件
    function setPath(obj, path, value) {
        const keys = path.split('.');
        const chain = [obj];
        keys.slice(0, -1).forEach(k => {
            const cur = chain[chain.length - 1];
            if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
            chain.push(cur[k]);
        });
        const last = keys[keys.length - 1];
        if (value === '' || value == null) delete chain[chain.length - 1][last]; else chain[chain.length - 1][last] = value;
        for (let i = chain.length - 1; i > 0; i--) if (!Object.keys(chain[i]).length) delete chain[i - 1][keys[i - 1]];
    }

    // validate 回傳的字串開頭是「DAY n 第 k 項」或「DAY n 住宿」，由此對應回項目
    const itemErrors = (errors, dayNo, ii) => errors.filter(e => e.startsWith(`DAY ${dayNo} 第 ${ii + 1} 項：`));
    const dayErrors = (errors, dayNo) => errors.filter(e => e.startsWith(`DAY ${dayNo} `));

    const api = { TYPES, moveItem, stepItem, changeType, newItem, altPosition, canJoinAlt, joinAlt, leaveAlt, stayHint, getPath, setPath, itemErrors, dayErrors };
    root.DaysLogic = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
