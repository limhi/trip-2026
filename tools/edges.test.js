// node --test tools/edges.test.js：邊界連動與伸縮（js/model.js adjustSpotEdge／adjustMoveBuffer，純資料函式；規則見 docs/adr/0007）
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/model.js');

const spot = (place, time, extra) => ({ type: 'spot', place, time, ...extra });
const move = (time, extra) => ({ type: 'move', text: '路上', ...(time ? { time } : {}), ...extra });
const times = day => day.items.map(i => i.time);
// 0 景點A 09:00-10:00 | 1 移動 10:00-10:30 | 2 景點B 10:30-11:30 | 3 移動 11:30-12:00 | 4 景點C 12:00-13:00 | 5 移動 13:00-13:20 | 6 景點D 13:20-14:00
const dayOf = () => ({ day: 4, items: [
    spot('a', '09:00 - 10:00'), move('10:00 - 10:30'),
    spot('b', '10:30 - 11:30 午餐'), move('11:30 - 12:00'),
    spot('c', '12:00 - 13:00'), move('13:00 - 13:20'),
    spot('d', '13:20 - 14:00')
] });
const snapshot = day => JSON.stringify(day);

// ───────── 景點：連動 ─────────

test('連動：改結束邊 +15，後面整串平移、前面不動、本項開始不動、說明文字保留', () => {
    const day = dayOf();
    const r = model.adjustSpotEdge(day, 2, 'end', '11:45', 'link');
    assert.equal(r.ok, true);
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:45 午餐', '11:45 - 12:15', '12:15 - 13:15', '13:15 - 13:35', '13:35 - 14:15']);
});

test('連動：改結束邊 -10（縮短），後面整串往前', () => {
    const day = dayOf();
    assert.equal(model.adjustSpotEdge(day, 2, 'end', '11:20', 'link').ok, true);
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:20 午餐', '11:20 - 11:50', '11:50 - 12:50', '12:50 - 13:10', '13:10 - 13:50']);
});

test('連動：改開始邊 -20（提早），前面整串往前、後面不動、本項結束不動', () => {
    const day = dayOf();
    const r = model.adjustSpotEdge(day, 2, 'start', '10:10', 'link');
    assert.equal(r.ok, true);
    assert.deepEqual(times(day), ['08:40 - 09:40', '09:40 - 10:10', '10:10 - 11:30 午餐', '11:30 - 12:00', '12:00 - 13:00', '13:00 - 13:20', '13:20 - 14:00']);
});

test('連動：改開始邊 +10（延後、停留縮短），前面整串往後', () => {
    const day = dayOf();
    assert.equal(model.adjustSpotEdge(day, 2, 'start', '10:40', 'link').ok, true);
    assert.deepEqual(times(day), ['09:10 - 10:10', '10:10 - 10:40', '10:40 - 11:30 午餐', '11:30 - 12:00', '12:00 - 13:00', '13:00 - 13:20', '13:20 - 14:00']);
});

test('連動：newTime 也可傳分鐘數', () => {
    const day = dayOf();
    assert.equal(model.adjustSpotEdge(day, 2, 'end', 11 * 60 + 45, 'link').ok, true);
    assert.equal(day.items[2].time, '10:30 - 11:45 午餐');
});

test('回傳 changed 列出有變動的項目（含被改的項目自己）', () => {
    const day = dayOf();
    const r = model.adjustSpotEdge(day, 4, 'end', '13:10', 'link');
    assert.deepEqual(r.changed.map(c => c.index), [4, 5, 6]);
    assert.deepEqual(r.changed[1], { index: 5, from: '13:00 - 13:20', to: '13:10 - 13:30' });
});

// ───────── 景點：伸縮 ─────────

test('伸縮：結束邊 +15，移動長度不變地平移，下一個景點只動開始邊，更遠的不動、前面不動', () => {
    const day = dayOf();
    const r = model.adjustSpotEdge(day, 2, 'end', '11:45', 'stretch');
    assert.equal(r.ok, true);
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:45 午餐', '11:45 - 12:15', '12:15 - 13:00', '13:00 - 13:20', '13:20 - 14:00']);
});

test('伸縮：開始邊 -20，前一個移動平移、再前一個景點只動結束邊，更遠的不動', () => {
    const day = dayOf();
    assert.equal(model.adjustSpotEdge(day, 4, 'start', '11:40', 'stretch').ok, true);
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:10 午餐', '11:10 - 11:40', '11:40 - 13:00', '13:00 - 13:20', '13:20 - 14:00']);
});

test('伸縮：鄰近景點停留會 ≤ 0 時拒絕（reason stay），資料完全不變', () => {
    const day = dayOf();
    const before = snapshot(day);
    const r = model.adjustSpotEdge(day, 2, 'end', '12:40', 'stretch');   // 下一個景點 12:00-13:00，開始會到 13:10
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'stay');
    assert.equal(snapshot(day), before);
});

test('伸縮：鄰近景點停留剛好剩 1 分可以，剩 0 拒絕', () => {
    const ok = dayOf();
    assert.equal(model.adjustSpotEdge(ok, 2, 'end', '12:29', 'stretch').ok, true);   // 開始 12:59、結束 13:00
    const bad = dayOf();
    assert.equal(model.adjustSpotEdge(bad, 2, 'end', '12:30', 'stretch').reason, 'stay');
});

test('伸縮：沒有下一個項目（整天最後一項）結束邊可直接改，只有本項變動', () => {
    const day = dayOf();
    assert.equal(model.adjustSpotEdge(day, 6, 'end', '14:30', 'stretch').ok, true);
    assert.equal(day.items[6].time, '13:20 - 14:30');
    assert.equal(day.items[5].time, '13:00 - 13:20');
});

// ───────── 拒絕 ─────────

test('被改的景點停留會 ≤ 0 時拒絕（結束 ≤ 開始、開始 ≥ 結束）', () => {
    for (const [side, t] of [['end', '10:30'], ['end', '10:00'], ['start', '11:30'], ['start', '11:45']]) {
        const day = dayOf();
        const before = snapshot(day);
        const r = model.adjustSpotEdge(day, 2, side, t, 'link');
        assert.equal(r.ok, false, `${side} ${t}`);
        assert.equal(r.reason, 'stay');
        assert.equal(snapshot(day), before);
    }
});

test('連動平移後超出 00:00–23:59：整個操作拒絕（reason overflow），本項也不改', () => {
    const ok = dayOf();
    assert.equal(model.adjustSpotEdge(ok, 2, 'end', '20:00', 'link').ok, true);   // 後面最晚 14:00 + 8:30 = 22:30，可
    const day = dayOf();
    const before = snapshot(day);
    const r = model.adjustSpotEdge(day, 2, 'end', '23:00', 'link');   // 14:00 + 11:30 > 23:59
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'overflow');
    assert.equal(snapshot(day), before);
});

test('連動往前平移超出 00:00：拒絕', () => {
    const day = dayOf();
    const before = snapshot(day);
    const r = model.adjustSpotEdge(day, 2, 'start', '00:30', 'link');   // 前面 09:00 要往前 10 小時
    assert.equal(r.reason, 'overflow');
    assert.equal(snapshot(day), before);
});

test('時間格式錯誤、項目沒有完整時間都拒絕', () => {
    const day = dayOf();
    const before = snapshot(day);
    assert.equal(model.adjustSpotEdge(day, 2, 'end', '25:99', 'link').reason, 'invalid-time');
    assert.equal(model.adjustSpotEdge(day, 2, 'end', 'abc', 'link').reason, 'invalid-time');
    assert.equal(model.adjustSpotEdge(day, 9, 'end', '12:00', 'link').ok, false);
    const inc = { day: 1, items: [spot('a', '15:30 後')] };
    assert.equal(model.adjustSpotEdge(inc, 0, 'end', '16:00', 'link').reason, 'incomplete');
    assert.equal(inc.items[0].time, '15:30 後');
    assert.equal(snapshot(day), before);
});

// ───────── 不完整時間、擇一組 ─────────

test('連動：不完整時間的項目不平移，其餘照平移', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:00'), move('10:00 - 10:30'), spot('b', '15:30 後'), move('11:00 - 11:30'), spot('c', '11:30 - 12:00')] };
    assert.equal(model.adjustSpotEdge(day, 0, 'end', '10:10', 'link').ok, true);
    assert.deepEqual(times(day), ['09:00 - 10:10', '10:10 - 10:40', '15:30 後', '11:10 - 11:40', '11:40 - 12:10']);
});

test('連動：改開始邊時，前面不完整時間的項目不平移', () => {
    const day = { day: 1, items: [spot('a', '15:30 後'), move('10:00 - 10:30'), spot('b', '10:30 - 11:30')] };
    assert.equal(model.adjustSpotEdge(day, 2, 'start', '10:20', 'link').ok, true);
    assert.deepEqual(times(day), ['15:30 後', '09:50 - 10:20', '10:20 - 11:30']);
});

test('伸縮：鄰近是不完整時間的移動則不動、也沒有景點吸收', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:00'), move(), spot('b', '10:30 - 11:30')] };
    assert.equal(model.adjustSpotEdge(day, 0, 'end', '10:10', 'stretch').ok, true);
    assert.deepEqual(times(day), ['09:00 - 10:10', undefined, '10:30 - 11:30']);
});

const altDay = () => ({ day: 1, items: [
    spot('a', '09:00 - 10:00'), move('10:00 - 10:20'),
    spot('b', '10:20 - 11:20', { alt: 'g' }), spot('c', undefined, { alt: 'g' }),
    move('11:20 - 11:40'), spot('d', '11:40 - 12:40')
] });

test('擇一組：改組內任一成員的結束邊，視為同一站（共用時間框），後面從組之後平移', () => {
    const day = altDay();
    assert.equal(model.adjustSpotEdge(day, 3, 'end', '11:50', 'link').ok, true);   // 第二成員沒有 time，改的是共用時間框
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:00 - 10:20', '10:20 - 11:50', undefined, '11:50 - 12:10', '12:10 - 13:10']);
});

test('擇一組：改組的開始邊，伸縮時前一個移動與景點照做', () => {
    const day = altDay();
    assert.equal(model.adjustSpotEdge(day, 2, 'start', '10:30', 'stretch').ok, true);
    assert.deepEqual(times(day), ['09:00 - 10:10', '10:10 - 10:30', '10:30 - 11:20', undefined, '11:20 - 11:40', '11:40 - 12:40']);
});

test('擇一組在伸縮的另一側被當成一個景點吸收', () => {
    const day = altDay();
    assert.equal(model.adjustSpotEdge(day, 0, 'end', '10:10', 'stretch').ok, true);
    assert.deepEqual(times(day), ['09:00 - 10:10', '10:10 - 10:30', '10:30 - 11:20', undefined, '11:20 - 11:40', '11:40 - 12:40']);
});

// ───────── 移動緩衝 ─────────

test('緩衝向後（連動）：結束邊動，後面整串平移，存成總緩衝', () => {
    const day = dayOf();
    const r = model.adjustMoveBuffer(day, 3, 10, 'back', 'link');   // 移動 30 → 40 分
    assert.equal(r.ok, true);
    assert.equal(day.items[3].buffer, 10);
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:30 午餐', '11:30 - 12:10', '12:10 - 13:10', '13:10 - 13:30', '13:30 - 14:10']);
});

test('緩衝向前（連動）：開始邊動，前面整串平移（往前），結束邊不動', () => {
    const day = dayOf();
    assert.equal(model.adjustMoveBuffer(day, 3, 10, 'forward', 'link').ok, true);
    assert.equal(day.items[3].buffer, 10);
    assert.deepEqual(times(day), ['08:50 - 09:50', '09:50 - 10:20', '10:20 - 11:20 午餐', '11:20 - 12:00', '12:00 - 13:00', '13:00 - 13:20', '13:20 - 14:00']);
});

test('緩衝以「與原本 buffer 的差」計算：原本 +10 改成 +15 只多 5 分', () => {
    const day = dayOf();
    day.items[3].buffer = 10;
    day.items[3].time = '11:30 - 12:10';
    ['12:10 - 13:10', '13:10 - 13:30', '13:30 - 14:10'].forEach((t, k) => { day.items[4 + k].time = t; });
    assert.equal(model.adjustMoveBuffer(day, 3, 15, 'back', 'link').ok, true);
    assert.equal(day.items[3].buffer, 15);
    assert.equal(day.items[3].time, '11:30 - 12:15');
    assert.equal(day.items[4].time, '12:15 - 13:15');
});

test('緩衝設回 0：不寫入 buffer 欄位', () => {
    const day = dayOf();
    day.items[3].buffer = 10;
    day.items[3].time = '11:30 - 12:10';
    assert.equal(model.adjustMoveBuffer(day, 3, 0, 'back', 'link').ok, true);
    assert.equal('buffer' in day.items[3], false);
    assert.equal(day.items[3].time, '11:30 - 12:00');
});

test('緩衝伸縮向後：下一個景點吸收（開始邊動），更遠的不動', () => {
    const day = dayOf();
    assert.equal(model.adjustMoveBuffer(day, 3, 10, 'back', 'stretch').ok, true);
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:30 午餐', '11:30 - 12:10', '12:10 - 13:00', '13:00 - 13:20', '13:20 - 14:00']);
});

test('緩衝伸縮向前：前一個景點吸收（結束邊動），更遠的不動', () => {
    const day = dayOf();
    assert.equal(model.adjustMoveBuffer(day, 3, 10, 'forward', 'stretch').ok, true);
    assert.equal(day.items[3].buffer, 10);
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:20 午餐', '11:20 - 12:00', '12:00 - 13:00', '13:00 - 13:20', '13:20 - 14:00']);
});

test('緩衝負值（縮短移動）伸縮：鄰近景點變長', () => {
    const day = dayOf();
    assert.equal(model.adjustMoveBuffer(day, 3, -10, 'back', 'stretch').ok, true);
    assert.deepEqual(times(day).slice(3, 5), ['11:30 - 11:50', '11:50 - 13:00']);
});

test('緩衝伸縮：鄰近景點停留會 ≤ 0 → 拒絕，buffer 與時間都不變', () => {
    const day = dayOf();
    const before = snapshot(day);
    const r = model.adjustMoveBuffer(day, 3, 60, 'back', 'stretch');   // 下一個景點 12:00-13:00，開始會到 13:00
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'stay');
    assert.equal(snapshot(day), before);
});

test('緩衝讓移動長度 < 0 → 拒絕（reason length）', () => {
    const day = dayOf();
    const before = snapshot(day);
    assert.equal(model.adjustMoveBuffer(day, 3, -31, 'back', 'link').reason, 'length');
    assert.equal(snapshot(day), before);
    assert.equal(model.adjustMoveBuffer(day, 3, -30, 'back', 'link').ok, true);   // 剛好 0 分可以
});

test('緩衝連動超出一天 → 拒絕', () => {
    const day = dayOf();
    const before = snapshot(day);
    assert.equal(model.adjustMoveBuffer(day, 3, 600, 'back', 'link').reason, 'overflow');
    assert.equal(snapshot(day), before);
});

test('緩衝：不是移動列、緩衝不是整數、方向或模式不認得 → 拒絕', () => {
    const day = dayOf();
    const before = snapshot(day);
    assert.equal(model.adjustMoveBuffer(day, 2, 5, 'back', 'link').reason, 'not-move');
    assert.equal(model.adjustMoveBuffer(day, 3, 2.5, 'back', 'link').ok, false);
    assert.equal(model.adjustMoveBuffer(day, 3, 5, 'sideways', 'link').ok, false);
    assert.equal(model.adjustMoveBuffer(day, 3, 5, 'back', 'weird').ok, false);
    assert.equal(snapshot(day), before);
});

test('緩衝：移動列沒有完整時間時只存緩衝，不平移任何項目', () => {
    const day = { day: 1, items: [spot('a', '09:00 - 10:00'), move(), spot('b', '10:30 - 11:30')] };
    assert.equal(model.adjustMoveBuffer(day, 1, 10, 'back', 'link').ok, true);
    assert.equal(day.items[1].buffer, 10);
    assert.deepEqual(times(day), ['09:00 - 10:00', undefined, '10:30 - 11:30']);
});

// ───────── 時間軸維持接得起來 ─────────

test('任一連動／伸縮操作之後，每個結束 = 下一個開始', () => {
    const joined = day => day.items.every((it, i) => {
        const a = model.parseTimeRange(it.time), b = model.parseTimeRange((day.items[i + 1] || {}).time);
        return !a || !b || a.end === b.start;
    });
    const ops = [
        d => model.adjustSpotEdge(d, 2, 'end', '11:45', 'link'), d => model.adjustSpotEdge(d, 2, 'start', '10:10', 'link'),
        d => model.adjustSpotEdge(d, 4, 'end', '13:20', 'stretch'), d => model.adjustSpotEdge(d, 4, 'start', '11:40', 'stretch'),
        d => model.adjustMoveBuffer(d, 3, 10, 'back', 'link'), d => model.adjustMoveBuffer(d, 3, 10, 'forward', 'link'),
        d => model.adjustMoveBuffer(d, 5, -5, 'back', 'stretch'), d => model.adjustMoveBuffer(d, 5, 5, 'forward', 'stretch')
    ];
    ops.forEach((op, k) => { const d = dayOf(); assert.equal(op(d).ok, true, `op ${k}`); assert.ok(joined(d), `op ${k}`); });
});

test('adjustSpotEdge：無效 side／mode／不存在的 index 一律拒絕且資料不變', () => {
    const day = dayOf();
    const before = snapshot(day);
    for (const [index, side, mode] of [[9, 'end', 'link'], [-1, 'end', 'link'], [2, 'middle', 'link'], [2, undefined, 'link'], [2, 'end', 'wrap'], [2, 'end', undefined]]) {
        const r = model.adjustSpotEdge(day, index, side, '12:00', mode);
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'invalid');
        assert.deepEqual(r.changed, []);
        assert.equal(snapshot(day), before);
    }
});

test('moveEdge：單位索引超出範圍回 invalid（不是 incomplete），資料不變', () => {
    const day = dayOf();
    const before = snapshot(day);
    assert.equal(model.moveEdge(day, 99, 'end', 700, 'link').reason, 'invalid');
    assert.equal(model.moveEdge(day, -1, 'end', 700, 'link').reason, 'invalid');
    assert.equal(snapshot(day), before);
    const inc = { day: 1, items: [spot('a', '15:30 後')] };
    assert.equal(model.moveEdge(inc, 0, 'end', 960, 'link').reason, 'incomplete');
});
