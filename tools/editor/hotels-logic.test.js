// node --test tools/editor/hotels-logic.test.js
// 住宿區編輯的純邏輯（不碰 DOM）。測試縫：hotelPlaces、addHotel、removeHotel、moveHotel、features 文字轉換。
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./public/hotels-logic');

const places = () => ({
    a: { name: '景點', mapType: 'attraction' },
    inn1: { name: '民宿一', mapType: 'hotel' },
    inn2: { name: '民宿二', mapType: 'hotel' },
    f: { name: '餐廳', mapType: 'food' }
});
const trip = () => ({ hotels: [{ place: 'inn1', region: 'r1' }, { place: 'inn2', region: 'r2' }, { place: 'inn1', region: 'r3' }] });
const regions = t => t.hotels.map(h => h.region);

test('hotelPlaces：只列分類為住宿的地點，保留地點庫順序', () => {
    assert.deepEqual(L.hotelPlaces(places()), [{ id: 'inn1', name: '民宿一' }, { id: 'inn2', name: '民宿二' }]);
});

test('hotelPlaces：沒有住宿地點回空陣列', () => {
    assert.deepEqual(L.hotelPlaces({ a: { name: 'A', mapType: 'attraction' } }), []);
});

test('addHotel：加到最後，欄位齊全；優先選還沒被住宿區使用的住宿地點', () => {
    const t = { hotels: [{ place: 'inn1' }] };
    const res = L.addHotel(t, places());
    assert.deepEqual(res, { ok: true, index: 1 });
    assert.deepEqual(t.hotels[1], { place: 'inn2', region: '', status: '', features: [], nights: '', price: '' });
});

test('addHotel：住宿地點都用過了就用第一個', () => {
    const t = trip();
    L.addHotel(t, places());
    assert.equal(t.hotels[3].place, 'inn1');
});

test('addHotel：沒有任何住宿地點時回錯誤且不改動 trip', () => {
    const t = { hotels: [] };
    const res = L.addHotel(t, { a: { name: 'A', mapType: 'attraction' } });
    assert.equal(res.ok, false);
    assert.match(res.error, /住宿/);
    assert.deepEqual(t.hotels, []);
});

test('removeHotel：刪除指定位置', () => {
    const t = trip();
    L.removeHotel(t, 1);
    assert.deepEqual(regions(t), ['r1', 'r3']);
});

test('moveHotel：上移、下移', () => {
    const t = trip();
    assert.equal(L.moveHotel(t, 1, -1), true);
    assert.deepEqual(regions(t), ['r2', 'r1', 'r3']);
    assert.equal(L.moveHotel(t, 1, 1), true);
    assert.deepEqual(regions(t), ['r2', 'r3', 'r1']);
});

test('moveHotel：第一個不能上移、最後一個不能下移，回 false 且不改動', () => {
    const t = trip();
    assert.equal(L.moveHotel(t, 0, -1), false);
    assert.equal(L.moveHotel(t, 2, 1), false);
    assert.deepEqual(regions(t), ['r1', 'r2', 'r3']);
});

test('featuresFromText：一行一項，去掉空行與前後空白', () => {
    assert.deepEqual(L.featuresFromText('甲\n  乙  \n\n   \n丙\n'), ['甲', '乙', '丙']);
    assert.deepEqual(L.featuresFromText(''), []);
});

test('featuresToText：陣列轉成一行一項，缺值為空字串', () => {
    assert.equal(L.featuresToText(['甲', '乙']), '甲\n乙');
    assert.equal(L.featuresToText(undefined), '');
});
