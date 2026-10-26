/*
 * 地點庫編輯的純邏輯（不碰 DOM，瀏覽器與 node:test 共用）。
 * id 規則：格式 ^[a-z0-9-]+$、不得重複；改 id 同步更新引用；被引用不能刪。
 * 函式都就地修改傳入的 places／trip（草稿的物件參考要保持不變）。
 */
(function (root) {
    const M = (root.Trip && root.Trip.model) || require('../../../js/model');
    const ID_RE = /^[a-z0-9-]+$/;

    // 引用地點的位置（遍歷規則在 js/model.js 的 forEachPlaceRef）
    function placeRefs(trip, id) {
        const refs = [];
        M.forEachPlaceRef(trip, (refId, label) => { if (refId === id) refs.push(label); });
        return refs;
    }

    // 回傳錯誤文字；通過回傳 null。exceptId：改 id 時自己原本的 id 不算重複
    function checkId(places, id, exceptId) {
        if (!ID_RE.test(id)) return '新 id 只能用小寫英文、數字、連字號';
        if (id !== exceptId && Object.prototype.hasOwnProperty.call(places, id)) return `id「${id}」已存在`;
        return null;
    }

    // 改 id：places 的 key 位置不變，所有引用同步更新。回傳 { ok: true, count } 或 { error }
    function renameId(trip, places, oldId, newId) {
        if (oldId === newId) return { ok: true, count: 0 };
        const error = checkId(places, newId, oldId);
        if (error) return { error };
        const entries = Object.entries(places);
        Object.keys(places).forEach(k => delete places[k]);
        entries.forEach(([k, v]) => { places[k === oldId ? newId : k] = v; });
        let count = 0;
        M.forEachPlaceRef(trip, (id, label, owner) => { if (id === oldId) { owner.place = newId; count++; } });
        return { ok: true, count };
    }

    // 刪除：被引用就拒絕並回傳引用位置
    function deletePlace(trip, places, id) {
        const refs = placeRefs(trip, id);
        if (refs.length) return { ok: false, refs };
        delete places[id];
        return { ok: true };
    }

    // 由名稱建議 id：英數字轉小寫 slug；中文名稱沒有英數字就用 place；重複加 -2、-3…
    function suggestId(name, places) {
        const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'place';
        let id = base, n = 2;
        while (Object.prototype.hasOwnProperty.call(places, id)) id = `${base}-${n++}`;
        return id;
    }

    // 新增最小地點到最後，回傳 id（未指定 id 時由名稱建議）
    function newPlace(places, name, id) {
        const key = id || suggestId(name, places);
        places[key] = { name, mapType: 'attraction' };
        return key;
    }

    // parking：多行存陣列、單行存字串、空白存空字串（setPath 會把空字串當作刪除欄位）
    function parkingFromText(text) {
        const lines = String(text).split('\n').map(s => s.trim()).filter(Boolean);
        return lines.length > 1 ? lines : (lines[0] || '');
    }
    const parkingToText = parking => (parking ? [].concat(parking).join('\n') : '');

    const api = { ID_RE, placeRefs, checkId, renameId, deletePlace, suggestId, newPlace, parkingFromText, parkingToText };
    root.PlacesLogic = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
