// node --test tools/derive-moves.test.js：移動列補齊與警告（js/model.js 的 deriveMoves／applyMoves；時間規則在 cascade.test.js）
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/model.js');

const P = {
    a: { name: 'A館', lat: 24.1, lng: 121.1 },
    b: { name: 'B館', lat: 24.2, lng: 121.2 },
    c: { name: 'C館', lat: 24.3, lng: 121.3 },
    d: { name: 'D館', lat: 24.4, lng: 121.4 },
    nocoord: { name: '沒座標' }
};
const spot = (place, time, extra) => ({ type: 'spot', place, time, ...extra });
const move = (time, extra) => ({ type: 'move', time, text: '路上', ...extra });
const view = r => r.moves.map(m => [m.index, m.fromId, m.toId]);

test('既有移動列：列出索引與前後站，不帶時間（時間由連動決定，不再反推）', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:30'), move('00:00 - 00:00'), spot('b', '11:15 - 12:00')] };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(view(r), [[1, 'a', 'b']]);
    assert.ok(!('time' in r.moves[0]) && !('changed' in r.moves[0]));
    assert.deepEqual(r.missing, []);
    assert.deepEqual(r.warnings, []);
});

test('擇一組：前一站用組的最後一員、下一站用組的第一員', () => {
    const day = { day: 1, items: [
        spot('a', '09:00 - 10:00'), move('x'),
        spot('b', '10:30 - 12:00', { alt: 'g' }), spot('c', undefined, { alt: 'g' }),
        move('y'), spot('d', '13:00 - 14:00')
    ] };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(view(r), [[1, 'a', 'b'], [4, 'c', 'd']]);
    assert.deepEqual(r.warnings, []);
});

test('時間不完整或前後時間重疊都不產生警告（不再檢查時間）', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:00'), move('10:00 - 10:20'), spot('b', '15:30 後')] };
    assert.deepEqual(model.deriveMoves(day, P).warnings, []);
    const ov = { day: 3, items: [spot('a', '09:00 - 10:30'), move('10:30 - 11:00'), spot('b', '10:00 - 11:00')] };
    assert.deepEqual(model.deriveMoves(ov, P).warnings, []);
    const ovMissing = { day: 1, items: [spot('a', '09:00 - 10:00'), spot('b', '09:30 - 10:00')] };
    assert.deepEqual(model.deriveMoves(ovMissing, P).warnings, []);
});

test('兩標記之間多個移動列：回報 multiple 警告', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:00'), move('1'), move('2'), spot('b', '11:00 - 12:00')] };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(r.moves, []);
    assert.deepEqual(r.missing, []);
    assert.deepEqual(r.warnings.map(w => [w.type, w.indexes]), [['multiple', [1, 2]]]);
});

test('不在任何兩標記之間的移動列：extra 警告', () => {
    const day = { day: 1, items: [move('1'), spot('a', '09:00 - 10:00'), move('2')] };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(r.warnings.map(w => [w.type, w.index]), [['extra', 0], ['extra', 2]]);
});

test('缺移動列：列出相鄰標記、插入位置與預設文字，不帶時間', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:00'), { type: 'notice', title: 'x' }, spot('b', '11:00 - 12:00'), spot('c', '12:30 - 13:00')] };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(r.moves, []);
    assert.deepEqual(r.missing, [
        { fromItemIndex: 0, toItemIndex: 2, fromId: 'a', toId: 'b', insertIndex: 1, text: 'A館 ➔ B館' },
        { fromItemIndex: 2, toItemIndex: 3, fromId: 'b', toId: 'c', insertIndex: 3, text: 'B館 ➔ C館' }
    ]);
});

test('缺列：擇一組用成員名稱串接，插入在組的最後一員之後', () => {
    const day = { day: 1, items: [
        spot('a', '09:00 - 10:00', { alt: 'g' }), spot('b', undefined, { alt: 'g' }), spot('c', '11:00 - 12:00')
    ] };
    const r = model.deriveMoves(day, P);
    assert.equal(r.missing.length, 1);
    assert.equal(r.missing[0].insertIndex, 2);
    assert.equal(r.missing[0].text, 'A館／B館 ➔ C館');
});

test('backup、map:false、沒有座標的項目不算標記，與 getLegs 的連接列一致', () => {
    const items = [spot('a', '09:00 - 10:00'), spot('b', '10:00 - 11:00', { backup: true }), spot('c', '10:00 - 11:00', { map: false }),
        spot('nocoord', '10:00 - 11:00'), move('?'), spot('d', '12:00 - 13:00')];
    const day = { day: 1, items };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(view(r), [[4, 'a', 'd']]);
    const legs = model.getLegs(day, P);
    assert.deepEqual(legs.map(l => [l.fromItemIndex, l.toItemIndex, l.rowIndex]), [[0, 5, 4]]);
    const noRow = { day: 1, items: items.filter(i => i.type !== 'move') };
    assert.equal(model.getLegs(noRow, P)[0].needsRow, true);
    assert.equal(model.deriveMoves(noRow, P).missing.length, 1);
});

test('deriveMoves 不修改輸入', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:30'), move('x'), spot('b', '11:15 - 12:00'), spot('c', '13:00 - 14:00')] };
    const before = JSON.stringify(day);
    model.deriveMoves(day, P);
    assert.equal(JSON.stringify(day), before);
});

// ───────── applyMoves：只補列，不寫任何時間 ─────────

test('applyMoves：缺列處補一列（由後往前插），只有 type 與 text，不寫 time，回傳補上的項目', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:00'), spot('b', '10:30 - 11:00'), spot('c', '12:00 - 13:00')] };
    const r = model.applyMoves(day, model.deriveMoves(day, P));
    assert.deepEqual(day.items.map(i => i.type), ['spot', 'move', 'spot', 'move', 'spot']);
    assert.deepEqual(day.items[1], { type: 'move', text: 'A館 ➔ B館' });
    assert.deepEqual(day.items[3], { type: 'move', text: 'B館 ➔ C館' });
    assert.deepEqual(r.added.map(a => a.item), [day.items[3], day.items[1]]);   // 同一個物件，供呼叫端接著算時間
    assert.deepEqual(day.items.filter(i => i.type === 'spot').map(i => i.time), ['09:00 - 10:00', '10:30 - 11:00', '12:00 - 13:00']);
});

test('applyMoves：既有移動列的時間完全不動（反向：舊規則會改成 10:30 - 11:15）', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:30'), move('00:00 - 00:00'), spot('b', '11:15 - 12:00')] };
    const r = model.applyMoves(day, model.deriveMoves(day, P));
    assert.equal(day.items[1].time, '00:00 - 00:00');
    assert.deepEqual(r.added, []);
});

test('applyMoves：fill = false 不補列', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:00'), spot('b', '10:30 - 11:00')] };
    assert.deepEqual(model.applyMoves(day, model.deriveMoves(day, P), false).added, []);
    assert.equal(day.items.length, 2);
});

test('真實行程資料：沒有缺列、多個、多餘的移動列（時間不再要求與前後標記一致）', () => {
    const trip = require('../data/trip.json'), places = require('../data/places.json');
    for (const day of trip.days) {
        const r = model.deriveMoves(day, places);
        assert.deepEqual(r.missing.map(m => [day.day, m.text]), [], `DAY ${day.day} 缺移動列`);
        assert.deepEqual(r.warnings.map(w => w.message), []);
    }
});
