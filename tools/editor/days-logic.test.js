// node --test tools/editor/days-logic.test.js
// 每日行程編輯的純邏輯（不碰 DOM）。測試縫：moveItem、stepItem、changeType、setPath、itemErrors、newItem。
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./public/days-logic');

const trip = () => ({
    days: [
        { day: 1, items: [{ type: 'drive', text: 'a' }, { type: 'spot', place: 'x' }, { type: 'move', text: 'c' }] },
        { day: 2, items: [{ type: 'drive', text: 'd' }, { type: 'spot', place: 'y' }] },
        { day: 3, items: [] }
    ]
});
const texts = day => day.items.map(i => i.text || i.place);

test('moveItem：同一天往後移，插入位置以搬動前的陣列計算', () => {
    const t = trip();
    L.moveItem(t, 0, 0, 0, 3);
    assert.deepEqual(texts(t.days[0]), ['x', 'c', 'a']);
});

test('moveItem：同一天往前移', () => {
    const t = trip();
    L.moveItem(t, 0, 2, 0, 0);
    assert.deepEqual(texts(t.days[0]), ['c', 'a', 'x']);
});

test('moveItem：跨天，來源少一項、目的多一項，回傳新位置', () => {
    const t = trip();
    const pos = L.moveItem(t, 0, 1, 1, 1);
    assert.deepEqual(texts(t.days[0]), ['a', 'c']);
    assert.deepEqual(texts(t.days[1]), ['d', 'x', 'y']);
    assert.deepEqual(pos, { di: 1, ii: 1 });
});

test('moveItem：搬到空的一天', () => {
    const t = trip();
    L.moveItem(t, 1, 0, 2, 0);
    assert.deepEqual(texts(t.days[2]), ['d']);
    assert.equal(t.days[1].items.length, 1);
});

test('stepItem：上移一格；第一項上移會跨到前一天的最後', () => {
    const t = trip();
    assert.deepEqual(L.stepItem(t, 0, 1, -1), { di: 0, ii: 0 });
    assert.deepEqual(texts(t.days[0]), ['x', 'a', 'c']);
    assert.deepEqual(L.stepItem(t, 1, 0, -1), { di: 0, ii: 3 });
    assert.deepEqual(texts(t.days[0]), ['x', 'a', 'c', 'd']);
});

test('stepItem：下移一格；最後一項下移會跨到後一天的最前', () => {
    const t = trip();
    assert.deepEqual(L.stepItem(t, 0, 0, 1), { di: 0, ii: 1 });
    assert.deepEqual(texts(t.days[0]), ['x', 'a', 'c']);
    assert.deepEqual(L.stepItem(t, 0, 2, 1), { di: 1, ii: 0 });
    assert.deepEqual(texts(t.days[1]), ['c', 'd', 'y']);
});

test('stepItem：第一天第一項上移、最後一天最後一項下移，什麼都不做並回傳 null', () => {
    const t = trip();
    assert.equal(L.stepItem(t, 0, 0, -1), null);
    assert.equal(L.stepItem(t, 2, 0, 1), null);
    t.days[2].items.push({ type: 'end', title: 'z' });
    assert.equal(L.stepItem(t, 2, 0, 1), null);
    assert.equal(t.days[2].items.length, 1);
});

test('changeType：清掉不屬於新類型的欄位，保留共通欄位', () => {
    const item = { type: 'spot', tag: 't', time: '09:00', place: 'x', title: 'T', desc: 'd', map: false, numbered: false };
    L.changeType(item, 'drive');
    assert.deepEqual(item, { type: 'drive', time: '09:00' });
});

test('changeType：waypoint 保留 place、text，丟掉 tag／desc', () => {
    const item = { type: 'spot', tag: 't', place: 'x', desc: 'd' };
    L.changeType(item, 'waypoint');
    assert.deepEqual(item, { type: 'waypoint', place: 'x' });
});

test('changeType：drive 轉 move 保留 duration，轉 spot 則丟掉', () => {
    const item = { type: 'drive', time: '1', text: 't', duration: '1h' };
    L.changeType(item, 'move');
    assert.deepEqual(item, { type: 'move', time: '1', text: 't', duration: '1h' });
    L.changeType(item, 'spot');
    assert.deepEqual(item, { type: 'spot', time: '1' });
});

test('setPath：空字串刪除欄位，並清掉變空的父物件', () => {
    const day = { stay: { place: 'h', note: 'n' } };
    L.setPath(day, 'stay.note', '');
    assert.deepEqual(day, { stay: { place: 'h' } });
    L.setPath(day, 'stay.place', '');
    assert.deepEqual(day, {});
});

test('setPath：路徑不存在時建立中間物件', () => {
    const day = {};
    L.setPath(day, 'badge.text', '自家');
    assert.deepEqual(day, { badge: { text: '自家' } });
});

test('itemErrors：只挑出該天該項的驗證訊息（第 1 項不會誤抓第 10 項）', () => {
    const errors = ['DAY 1 第 1 項：a', 'DAY 1 第 10 項：b', 'DAY 2 第 1 項：c', 'DAY 1 住宿：d'];
    assert.deepEqual(L.itemErrors(errors, 1, 0), ['DAY 1 第 1 項：a']);
    assert.deepEqual(L.itemErrors(errors, 1, 9), ['DAY 1 第 10 項：b']);
    assert.deepEqual(L.dayErrors(errors, 1), ['DAY 1 第 1 項：a', 'DAY 1 第 10 項：b', 'DAY 1 住宿：d']);
});

test('newItem：各類型給出可通過驗證的最小項目', () => {
    assert.deepEqual(L.newItem('drive', ['p1']), { type: 'drive', text: '新項目' });
    assert.deepEqual(L.newItem('waypoint', ['p1']), { type: 'waypoint', place: 'p1' });
    assert.deepEqual(L.newItem('brief', ['p1']), { type: 'brief', title: '新項目' });
    assert.deepEqual(L.newItem('spot', ['p1']), { type: 'spot', tag: '新項目', title: '新項目' });
});

test('TYPES 涵蓋 model 認得的全部類型', () => {
    const M = require('../../js/model');
    for (const t of [...M.CARD_TYPES, ...M.ROW_TYPES, 'brief', 'waypoint']) assert.ok(L.TYPES[t], t);
});
