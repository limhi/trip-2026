/*
 * 每日行程編輯的純邏輯（不碰 DOM，瀏覽器與 node:test 共用）。
 * 驗證與地圖編號不在這裡，一律用 js/model.js。
 */
(function (root) {
    const COMMON = ['map', 'numbered'];
    const CARD = ['tag', 'time', 'place', 'title', 'desc', ...COMMON];

    // 每種項目類型可填的欄位（與 docs/DESIGN.md 4.2 一致）；label／chip 給畫面用
    const TYPES = {
        drive:    { label: '交通',   chip: 'bg-slate-700 text-white',         fields: ['time', 'text', 'duration'] },
        move:     { label: '移動',   chip: 'bg-slate-200 text-slate-800',     fields: ['time', 'text', 'duration'] },
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
        Object.keys(item).forEach(k => { if (!keep.includes(k)) delete item[k]; });
        return item;
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

    const api = { TYPES, moveItem, stepItem, changeType, newItem, getPath, setPath, itemErrors, dayErrors };
    root.DaysLogic = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
