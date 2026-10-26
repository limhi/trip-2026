/*
 * 住宿區編輯的純邏輯（不碰 DOM，瀏覽器與 node:test 共用）。
 * 函式都就地修改傳入的 trip（草稿的物件參考要保持不變）。
 */
(function (root) {
    // 地點庫裡分類為住宿的地點，依地點庫順序
    function hotelPlaces(places) {
        return Object.entries(places).filter(([, p]) => p.mapType === 'hotel').map(([id, p]) => ({ id, name: p.name }));
    }

    // 新增住宿到最後。優先選還沒被住宿區使用的住宿地點，沒有就用第一個。
    // 沒有任何住宿地點回 { ok: false, error }，不改動 trip
    function addHotel(trip, places) {
        const candidates = hotelPlaces(places);
        if (!candidates.length) return { ok: false, error: '地點庫裡還沒有分類為「住宿」的地點，請先到「地點庫」新增並把地圖分類設為住宿' };
        const used = new Set(trip.hotels.map(h => h.place));
        const pick = candidates.find(c => !used.has(c.id)) || candidates[0];
        trip.hotels.push({ place: pick.id, region: '', status: '', features: [], nights: '', price: '' });
        return { ok: true, index: trip.hotels.length - 1 };
    }

    function removeHotel(trip, index) {
        trip.hotels.splice(index, 1);
    }

    // dir：-1 上移、1 下移；到頭了回 false 且不改動
    function moveHotel(trip, index, dir) {
        const to = index + dir, list = trip.hotels;
        if (to < 0 || to >= list.length) return false;
        list.splice(to, 0, list.splice(index, 1)[0]);
        return true;
    }

    const featuresFromText = text => String(text).split('\n').map(s => s.trim()).filter(Boolean);
    const featuresToText = features => (features || []).join('\n');

    const api = { hotelPlaces, addHotel, removeHotel, moveHotel, featuresFromText, featuresToText };
    root.HotelsLogic = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
