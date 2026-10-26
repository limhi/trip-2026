// 路線前端的純邏輯（不碰 DOM）：node --test tools/editor/routes-logic.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./public/routes-logic');
const M = require('../../js/model');

const places = {
    a: { name: 'A 點', lat: 24.9722, lng: 121.4433 },
    b: { name: 'B 點', lat: 24.6718, lng: 121.804 },
    c: { name: 'C 點', lat: 24.7, lng: 121.7 },
    nocoord: { name: '沒座標' }
};
const day = (items, extra) => ({ day: 1, items, ...extra });
const trip = { site: {}, days: [day([{ type: 'spot', place: 'a' }, { type: 'drive', text: '開車' }, { type: 'spot', place: 'b' }, { type: 'spot', place: 'c' }])] };
const [ab, bc] = M.getLegs(trip.days[0], places);

test('pendingLegs：只挑快取沒有的段落，並排除計算中／已失敗的', () => {
    assert.deepEqual(R.pendingLegs(trip, places, {}, new Set()).map(l => l.key), [ab.key, bc.key]);
    assert.deepEqual(R.pendingLegs(trip, places, { [ab.key]: { distance: 1, duration: 1 } }, new Set()).map(l => l.key), [bc.key]);
    assert.deepEqual(R.pendingLegs(trip, places, {}, new Set([ab.key])).map(l => l.key), [bc.key]);
});

test('pendingLegs：改順序後，只有新出現的段落需要計算', () => {
    const known = { [ab.key]: { distance: 1, duration: 1 }, [bc.key]: { distance: 1, duration: 1 } };
    const reordered = { site: {}, days: [day([{ type: 'spot', place: 'a' }, { type: 'spot', place: 'c' }, { type: 'spot', place: 'b' }])] };
    const pending = R.pendingLegs(reordered, places, known, new Set());
    assert.deepEqual(pending.map(l => l.key), [M.legKey(places.a, places.c), M.legKey(places.c, places.b)]);
    assert.ok(pending[0].from && pending[0].to, '帶座標給伺服器');
});

test('pendingLegs：跨天重複的同一段只送一次', () => {
    const two = { site: {}, days: [trip.days[0], { ...trip.days[0], day: 2 }] };
    assert.equal(R.pendingLegs(two, places, {}, new Set()).length, 2);
});

test('legKeys：目前行程用到的所有 key', () => {
    assert.deepEqual([...R.legKeys(trip, places)], [ab.key, bc.key]);
});

test('dayTotals：已算的段落加總顯示分鐘與公尺；未算的計入 missing', () => {
    const known = { [ab.key]: { distance: 10000, duration: 3000 } }; // 50 分 × 1.25 = 63
    const t = R.dayTotals(trip.days[0], places, known, { routing: { trafficFactor: 1.25 } });
    assert.deepEqual(t, { minutes: 63, meters: 10000, count: 2, missing: 1 });
});

test('dayTotals：用當天係數覆寫', () => {
    const known = { [ab.key]: { distance: 10000, duration: 3000 }, [bc.key]: { distance: 5000, duration: 600 } };
    const d = { ...trip.days[0], trafficFactor: 1 };
    assert.deepEqual(R.dayTotals(d, places, known, {}), { minutes: 60, meters: 15000, count: 2, missing: 0 });
});

test('legText：顯示時間、距離，超過門檻標紅（以顯示分鐘判斷）', () => {
    const e = { distance: 75323, duration: 4334 };
    const ok = R.legText(e, 1.25, 180);
    assert.equal(ok.text, M.formatLeg(e, 1.25));
    assert.equal(ok.minutes, 90);
    assert.equal(ok.over, false);
    assert.equal(R.legText(e, 1.25, 90).over, false, '剛好等於門檻不算超過');
    assert.equal(R.legText(e, 1.25, 89).over, true);
    assert.equal(R.legText(e, 2, 120).over, true, '係數改變，判斷跟著變');
});

test('missingCoords：有地點但沒座標的項目（map:false 與找不到地點的不算）', () => {
    const t = { days: [day([
        { type: 'spot', place: 'a' },
        { type: 'spot', place: 'nocoord' },
        { type: 'spot', place: 'nocoord', map: false },
        { type: 'spot', place: 'ghost' },
        { type: 'drive', text: 'x' }
    ])] };
    assert.deepEqual(R.missingCoords(t, places), [{ day: 1, itemIndex: 1, placeId: 'nocoord', name: '沒座標' }]);
});

test('numberOrDelete：欄位輸入轉數字；空白代表刪除；非數字回 undefined（忽略）', () => {
    assert.equal(R.parseNumberInput('1.5'), 1.5);
    assert.equal(R.parseNumberInput(' 180 '), 180);
    assert.equal(R.parseNumberInput(''), null);
    assert.equal(R.parseNumberInput('abc'), undefined);
});
