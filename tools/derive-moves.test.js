// node --test tools/derive-moves.test.js：移動列推導（js/model.js 的 deriveMoves，純函式）
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
const view = r => r.moves.map(m => [m.index, m.time, m.changed]);

test('一般情況：移動列時間 = 前一站結束到下一站開始', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:30'), move('00:00 - 00:00'), spot('b', '11:15 - 12:00')] };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(view(r), [[1, '10:30 - 11:15', true]]);
    assert.equal(r.moves[0].fromId, 'a');
    assert.equal(r.moves[0].toId, 'b');
    assert.deepEqual(r.missing, []);
    assert.deepEqual(r.warnings, []);
});

test('已經一致的移動列 changed 為 false', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:30'), { type: 'move', time: '10:30 - 11:15' }, spot('b', '11:15 - 12:00')] };
    assert.deepEqual(view(model.deriveMoves(day, P)), [[1, '10:30 - 11:15', false]]);
});

test('擇一組：前一站用組的共用結束、下一站用組的共用開始', () => {
    const day = { day: 1, items: [
        spot('a', '09:00 - 10:00'), move('x'),
        spot('b', '10:30 - 12:00', { alt: 'g' }), spot('c', undefined, { alt: 'g' }),
        move('y'), spot('d', '13:00 - 14:00')
    ] };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(view(r), [[1, '10:00 - 10:30', true], [4, '12:00 - 13:00', true]]);
    assert.equal(r.moves[1].fromId, 'c');   // 組的最後一員（實際相鄰的那一項）
    assert.deepEqual(r.warnings, []);
});

test('一端不是完整區間：保留現有 time，不報警告', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:00'), move('10:00 - 10:20'), spot('b', '15:30 後')] };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(view(r), [[1, '10:00 - 10:20', false]]);
    assert.deepEqual(r.warnings, []);
    const noTime = { day: 1, items: [spot('a', '09:00 - 10:00'), move(undefined), spot('b')] };
    assert.deepEqual(view(model.deriveMoves(noTime, P)), [[1, null, false]]);
});

test('重疊：應有時間為 null 並回報 overlap 警告', () => {
    const day = { day: 3, items: [spot('a', '09:00 - 10:30'), move('10:30 - 11:00'), spot('b', '10:00 - 11:00')] };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(view(r), [[1, null, true]]);
    assert.equal(r.warnings.length, 1);
    assert.equal(r.warnings[0].type, 'overlap');
    assert.equal(r.warnings[0].index, 1);
    assert.match(r.warnings[0].message, /DAY 3/);
});

test('兩標記之間多個移動列：不推導，回報 multiple 警告', () => {
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

test('缺移動列：列出相鄰標記、插入位置與預設文字', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:00'), { type: 'notice', title: 'x' }, spot('b', '11:00 - 12:00'), spot('c', '12:30 - 13:00')] };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(r.moves, []);
    assert.deepEqual(r.missing, [
        { fromItemIndex: 0, toItemIndex: 2, fromId: 'a', toId: 'b', insertIndex: 1, text: 'A館 ➔ B館', time: '10:00 - 11:00' },
        { fromItemIndex: 2, toItemIndex: 3, fromId: 'b', toId: 'c', insertIndex: 3, text: 'B館 ➔ C館', time: '12:00 - 12:30' }
    ]);
});

test('缺移動列但一端不完整：time 為 null；重疊也警告', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:00'), spot('b', '15:30 後'), spot('c', '15:00 - 16:00')] };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(r.missing.map(m => m.time), [null, null]);
    const ov = { day: 1, items: [spot('a', '09:00 - 10:00'), spot('b', '09:30 - 10:00')] };
    const r2 = model.deriveMoves(ov, P);
    assert.deepEqual(r2.missing.map(m => m.time), [null]);
    assert.deepEqual(r2.warnings.map(w => w.type), ['overlap']);
});

test('缺列：擇一組用成員名稱串接，插入在組的最後一員之後', () => {
    const day = { day: 1, items: [
        spot('a', '09:00 - 10:00', { alt: 'g' }), spot('b', undefined, { alt: 'g' }), spot('c', '11:00 - 12:00')
    ] };
    const r = model.deriveMoves(day, P);
    assert.equal(r.missing.length, 1);
    assert.equal(r.missing[0].insertIndex, 2);
    assert.equal(r.missing[0].text, 'A館／B館 ➔ C館');
    assert.equal(r.missing[0].time, '10:00 - 11:00');
});

test('backup、map:false、沒有座標的項目不算標記，與 getLegs 的連接列一致', () => {
    const items = [spot('a', '09:00 - 10:00'), spot('b', '10:00 - 11:00', { backup: true }), spot('c', '10:00 - 11:00', { map: false }),
        spot('nocoord', '10:00 - 11:00'), move('?'), spot('d', '12:00 - 13:00')];
    const day = { day: 1, items };
    const r = model.deriveMoves(day, P);
    assert.deepEqual(view(r), [[4, '10:00 - 12:00', true]]);
    const legs = model.getLegs(day, P);
    assert.deepEqual(legs.map(l => [l.fromItemIndex, l.toItemIndex, l.rowIndex]), [[0, 5, 4]]);
    const noRow = { day: 1, items: items.filter(i => i.type !== 'move') };
    assert.equal(model.getLegs(noRow, P)[0].needsRow, true);
    assert.equal(model.deriveMoves(noRow, P).missing.length, 1);
});

test('不修改輸入', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:30'), move('x'), spot('b', '11:15 - 12:00'), spot('c', '13:00 - 14:00')] };
    const before = JSON.stringify(day);
    model.deriveMoves(day, P);
    assert.equal(JSON.stringify(day), before);
});

test('真實行程資料：每個移動列都與前後標記一致，沒有缺列與警告', () => {
    const trip = require('../data/trip.json'), places = require('../data/places.json');
    for (const day of trip.days) {
        const r = model.deriveMoves(day, places);
        assert.deepEqual(r.moves.filter(m => m.changed).map(m => [day.day, m.index]), [], `DAY ${day.day} 移動列時間與推導值不同`);
        assert.deepEqual(r.missing.map(m => [day.day, m.text]), [], `DAY ${day.day} 缺移動列`);
        assert.deepEqual(r.warnings.map(w => w.message), []);
    }
});
