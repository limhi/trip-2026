// node --test tools/editor/days-logic.test.js
// 每日行程編輯的純邏輯（不碰 DOM）。測試縫：moveItem、stepItem、changeType、setPath、itemErrors、newItem。
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./public/days-logic');
const M = require('../../js/model');

const trip = () => ({
    days: [
        { day: 1, items: [{ type: 'move', text: 'a' }, { type: 'spot', place: 'x' }, { type: 'move', text: 'c' }] },
        { day: 2, items: [{ type: 'move', text: 'd' }, { type: 'spot', place: 'y' }] },
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
    L.changeType(item, 'move');
    assert.deepEqual(item, { type: 'move', time: '09:00' });
});

test('changeType：waypoint 保留 place、text，丟掉 tag／desc', () => {
    const item = { type: 'spot', tag: 't', place: 'x', desc: 'd' };
    L.changeType(item, 'waypoint');
    assert.deepEqual(item, { type: 'waypoint', place: 'x' });
});

test('changeType：move 保留 note，轉 spot 則丟掉', () => {
    const item = { type: 'spot', time: '1', text: 't', note: '1h' };
    L.changeType(item, 'move');
    assert.deepEqual(item, { type: 'move', time: '1', text: 't', note: '1h' });
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

test('類型選單沒有 drive', () => {
    assert.equal('drive' in L.TYPES, false);
    assert.ok(L.TYPES.move);
});

test('newItem：各類型給出可通過驗證的最小項目', () => {
    assert.deepEqual(L.newItem('move', ['p1']), { type: 'move', text: '新項目' });
    assert.deepEqual(L.newItem('waypoint', ['p1']), { type: 'waypoint', place: 'p1' });
    assert.deepEqual(L.newItem('brief', ['p1']), { type: 'brief', title: '新項目' });
    assert.deepEqual(L.newItem('spot', ['p1']), { type: 'spot', tag: '新項目', title: '新項目' });
});

test('TYPES 涵蓋 model 認得的全部類型', () => {
    const M = require('../../js/model');
    for (const t of [...M.CARD_TYPES, ...M.ROW_TYPES, 'brief', 'waypoint']) assert.ok(L.TYPES[t], t);
});

// ---- 擇一組：併成／移出（只改 alt 與 time，驗證結果用 js/model.js） ----
const Model = require('../../js/model');
const altPlaces = { x: { name: 'X', lat: 1, lng: 1 }, y: { name: 'Y', lat: 2, lng: 2 }, z: { name: 'Z', lat: 3, lng: 3 } };
const dayOf = items => ({ day: 1, items });
const spot = (place, extra) => Object.assign({ type: 'spot', place }, extra);
const errorsOf = day => Model.validate({ days: [day] }, altPlaces);
const alts = day => day.items.map(i => i.alt || '-');

test('canJoinAlt：只有 spot 且相鄰有 spot 才能併；已在組內不能再併', () => {
    const d = dayOf([{ type: 'move', text: 'a' }, spot('x'), spot('y', { alt: 'g' }), spot('z', { alt: 'g' })]);
    assert.equal(L.canJoinAlt(d, 0), false);   // 不是 spot
    assert.equal(L.canJoinAlt(d, 1), true);    // 下一項是 spot
    assert.equal(L.canJoinAlt(d, 2), false);   // 已在組內
    assert.equal(L.canJoinAlt(dayOf([{ type: 'move' }, spot('x'), { type: 'meal', title: 'm' }]), 1), false);
});

test('joinAlt：與前一個 spot 併成新組，驗證通過', () => {
    const d = dayOf([spot('x'), spot('y')]);
    assert.equal(L.joinAlt(d, 1), true);
    assert.equal(d.items[0].alt, d.items[1].alt);
    assert.ok(d.items[0].alt);
    assert.deepEqual(errorsOf(d), []);
});

test('joinAlt：前一項不是 spot 時改與下一個 spot 併；兩邊都不行回傳 false 且不改資料', () => {
    const d = dayOf([{ type: 'move', text: 'a' }, spot('x'), spot('y')]);
    assert.equal(L.joinAlt(d, 1), true);
    assert.deepEqual(alts(d).map(a => a === '-' ? 0 : 1), [0, 1, 1]);
    const e = dayOf([{ type: 'move', text: 'a' }, spot('x'), { type: 'meal', title: 'm' }]);
    assert.equal(L.joinAlt(e, 1), false);
    assert.equal(e.items[1].alt, undefined);
});

test('joinAlt：加入既有擇一組（沿用該組 alt，不另開新組）', () => {
    const d = dayOf([spot('x', { alt: 'g', time: '12:00 - 13:00' }), spot('y', { alt: 'g' }), spot('z')]);
    L.joinAlt(d, 2);
    assert.deepEqual(alts(d), ['g', 'g', 'g']);
    assert.deepEqual(errorsOf(d), []);
});

test('joinAlt：共用時間只留在組內第一項，其他成員的 time 被清掉', () => {
    const d = dayOf([spot('x'), spot('y', { time: '12:20 - 14:00' })]);
    L.joinAlt(d, 1);
    assert.equal(d.items[0].time, '12:20 - 14:00');   // 第一項沒時間時，取成員裡的時間
    assert.equal(d.items[1].time, undefined);
    const e = dayOf([spot('x', { time: '10:00 - 11:00' }), spot('y', { time: '12:00 - 13:00' })]);
    L.joinAlt(e, 1);
    assert.equal(e.items[0].time, '10:00 - 13:00');   // 都是完整區間：取聯集（最早開始到最晚結束）
    assert.equal(e.items[1].time, undefined);
    assert.deepEqual(errorsOf(e), []);
});

test('joinAlt：Day 4 的例子，12:20 - 13:00 與 13:10 - 14:00 併成一組 → 12:20 - 14:00', () => {
    const d = dayOf([spot('x', { time: '12:20 - 13:00' }), spot('y', { time: '13:10 - 14:00' })]);
    L.joinAlt(d, 1);
    assert.equal(d.items[0].time, '12:20 - 14:00');
    assert.equal(d.items[1].time, undefined);
});

test('joinAlt：只有一個成員有完整區間時，保留它的原文（含後面的說明）', () => {
    const d = dayOf([spot('x'), spot('y', { time: '12:20 - 14:00 午餐前' })]);
    L.joinAlt(d, 1);
    assert.equal(d.items[0].time, '12:20 - 14:00 午餐前');
});

test('joinAlt：有成員的時間不是完整區間，改保留第一個有時間的成員的原文，不亂湊', () => {
    const d = dayOf([spot('x', { time: '17:10 後' }), spot('y', { time: '12:00 - 13:00' })]);
    L.joinAlt(d, 1);
    assert.equal(d.items[0].time, '17:10 後');
    assert.equal(d.items[1].time, undefined);
    const e = dayOf([spot('x', { time: '12:00 - 13:00' }), spot('y', { time: '17:10 後' })]);
    L.joinAlt(e, 1);
    assert.equal(e.items[0].time, '12:00 - 13:00');
});

test('joinAlt：加入既有擇一組時，共用時間與新成員的時間取聯集', () => {
    const d = dayOf([spot('x', { alt: 'g', time: '12:00 - 13:00' }), spot('y', { alt: 'g' }), spot('z', { time: '13:30 - 15:00' })]);
    L.joinAlt(d, 2);
    assert.equal(d.items[0].time, '12:00 - 15:00');
    assert.equal(d.items[2].time, undefined);
});

test('joinAlt：同一天已有的 alt 名稱不會被新組重複使用', () => {
    const d = dayOf([spot('x', { alt: 'alt1' }), spot('y', { alt: 'alt1' }), { type: 'move', text: 'm' }, spot('x'), spot('y')]);
    L.joinAlt(d, 4);
    assert.notEqual(d.items[3].alt, 'alt1');
    assert.deepEqual(errorsOf(d), []);
});

test('leaveAlt：兩項的組移出一項，整組解除', () => {
    const d = dayOf([spot('x', { alt: 'g', time: '12:00 - 13:00' }), spot('y', { alt: 'g' })]);
    assert.equal(L.leaveAlt(d, 1), true);
    assert.deepEqual(alts(d), ['-', '-']);
    assert.equal(d.items[0].time, '12:00 - 13:00');
    assert.deepEqual(errorsOf(d), []);
});

test('leaveAlt：移出第一項，共用時間交給新的第一項', () => {
    const d = dayOf([spot('x', { alt: 'g', time: '12:00 - 13:00' }), spot('y', { alt: 'g' }), spot('z', { alt: 'g' })]);
    L.leaveAlt(d, 0);
    assert.deepEqual(alts(d), ['-', 'g', 'g']);
    assert.equal(d.items[0].time, undefined);
    assert.equal(d.items[1].time, '12:00 - 13:00');
    assert.deepEqual(errorsOf(d), []);
});

test('leaveAlt：移出中間成員，該項移到組外，其餘成員仍相鄰', () => {
    const d = dayOf([spot('x', { alt: 'g' }), spot('y', { alt: 'g' }), spot('z', { alt: 'g' })]);
    L.leaveAlt(d, 1);
    assert.deepEqual(d.items.map(i => i.place), ['x', 'z', 'y']);
    assert.deepEqual(alts(d), ['g', 'g', '-']);
    assert.deepEqual(errorsOf(d), []);
});

test('leaveAlt：兩項的組移出第一項，共用時間交給留下的那一項，離開的項目不帶時間', () => {
    const d = dayOf([spot('x', { alt: 'g', time: '12:00 - 13:00' }), spot('y', { alt: 'g' })]);
    assert.equal(L.leaveAlt(d, 0), true);
    assert.deepEqual(alts(d), ['-', '-']);
    assert.equal(d.items[0].time, undefined);
    assert.equal(d.items[1].time, '12:00 - 13:00');
    assert.deepEqual(errorsOf(d), []);
});

test('leaveAlt：三項的組移出最後一項，共用時間留在第一項', () => {
    const d = dayOf([spot('x', { alt: 'g', time: '12:00 - 13:00' }), spot('y', { alt: 'g' }), spot('z', { alt: 'g' })]);
    L.leaveAlt(d, 2);
    assert.deepEqual(alts(d), ['g', 'g', '-']);
    assert.deepEqual(d.items.map(i => i.time), ['12:00 - 13:00', undefined, undefined]);
    assert.deepEqual(errorsOf(d), []);
});

test('leaveAlt：三項的組移出中間成員，共用時間仍留在第一項', () => {
    const d = dayOf([spot('x', { alt: 'g', time: '12:00 - 13:00' }), spot('y', { alt: 'g' }), spot('z', { alt: 'g' })]);
    L.leaveAlt(d, 1);
    assert.deepEqual(d.items.map(i => i.place), ['x', 'z', 'y']);
    assert.deepEqual(d.items.map(i => i.time), ['12:00 - 13:00', undefined, undefined]);
    assert.deepEqual(errorsOf(d), []);
});

test('leaveAlt：三項的組移出第一項，離開的項目沒有時間，新的第一項接手', () => {
    const d = dayOf([spot('x', { alt: 'g', time: '12:00 - 13:00' }), spot('y', { alt: 'g' }), spot('z', { alt: 'g' })]);
    L.leaveAlt(d, 0);
    assert.deepEqual(d.items.map(i => i.time), [undefined, '12:00 - 13:00', undefined]);
});

test('leaveAlt：不在組內的項目不動', () => {
    const d = dayOf([spot('x'), spot('y')]);
    assert.equal(L.leaveAlt(d, 0), false);
    assert.deepEqual(alts(d), ['-', '-']);
});

test('changeType：spot 改成其他類型會清掉 alt，spot 之間保留', () => {
    const it = spot('x', { alt: 'g' });
    L.changeType(it, 'spot');
    assert.equal(it.alt, 'g');
    L.changeType(it, 'meal');
    assert.equal(it.alt, undefined);
});

test('擇一組成員被移開相鄰位置時，驗證回報「必須相鄰」', () => {
    const d = dayOf([spot('x', { alt: 'g' }), spot('y', { alt: 'g' })]);
    L.stepItem({ days: [d] }, 0, 1, 1);   // 已是最後一天最後一項，不動
    d.items.splice(1, 0, { type: 'move', text: 'm' });
    assert.ok(errorsOf(d).some(e => e.includes('必須相鄰')));
});

test('altPosition：回傳項目在擇一組裡是首／中／尾，不在組內為 null', () => {
    const d = dayOf([spot('x'), spot('y', { alt: 'g' }), spot('z', { alt: 'g' })]);
    assert.equal(L.altPosition(d, 0), null);
    assert.equal(L.altPosition(d, 1), 'first');
    assert.equal(L.altPosition(d, 2), 'last');
    const e = dayOf([spot('x', { alt: 'g' }), spot('y', { alt: 'g' }), spot('z', { alt: 'g' })]);
    assert.equal(L.altPosition(e, 1), 'middle');
});

test('stayHint：spot／meal 有完整區間時回傳停留時間，隨時間改動變化', () => {
    const day = { day: 1, items: [{ type: 'spot', place: 'x', time: '09:00 - 10:40' }, { type: 'meal', title: 'm', time: '12:00 - 12:45' }] };
    assert.equal(L.stayHint(day, 0), '停留 1 小時 40 分');
    assert.equal(L.stayHint(day, 1), '停留 45 分');
    day.items[0].time = '09:00 - 11:00';
    assert.equal(L.stayHint(day, 0), '停留 2 小時');
});

test('stayHint：不完整、結束 ≤ 開始、沒時間都沒有提示', () => {
    const mk = time => ({ day: 1, items: [{ type: 'spot', place: 'x', time }] });
    for (const t of ['17:10 後', '09:00', '10:00 - 09:00', '10:00 - 10:00', '', undefined]) assert.equal(L.stayHint(mk(t), 0), '', String(t));
});

test('stayHint：只有 spot／meal 顯示，其他類型不顯示', () => {
    for (const type of ['move', 'stay', 'end', 'notice', 'brief']) {
        assert.equal(L.stayHint({ day: 1, items: [{ type, time: '09:00 - 10:00' }] }, 0), '', type);
    }
});

test('stayHint：擇一組只在持有共用時間的第一成員顯示一次，不寫入資料', () => {
    const day = { day: 1, items: [
        { type: 'spot', place: 'a', alt: 'alt1', time: '09:00 - 11:00' },
        { type: 'spot', place: 'b', alt: 'alt1' },
        { type: 'spot', place: 'c', time: '12:00 - 13:00' }
    ] };
    const before = JSON.stringify(day);
    assert.deepEqual([0, 1, 2].map(i => L.stayHint(day, i)), ['停留 2 小時', '', '停留 1 小時']);
    assert.equal(JSON.stringify(day), before);
    day.items[1].time = '09:00 - 12:00';   // 非第一成員即使有 time 也不顯示
    assert.equal(L.stayHint(day, 1), '');
});

// ---- 時間連動（ADR 0007）：改結束／整天第一項的開始 → 後面整天平移；移動列時間唯讀、由查詢長度決定 ----
const SP = {
    a: { name: 'A館', lat: 24.1, lng: 121.1 },
    b: { name: 'B館', lat: 24.2, lng: 121.2 },
    c: { name: 'C館', lat: 24.3, lng: 121.3 },
    d: { name: 'D館', lat: 24.4, lng: 121.4 }
};
const sp = (place, time, extra) => ({ type: 'spot', place, time, ...extra });
const mv = (time, text) => ({ type: 'move', text: text || '路上', ...(time ? { time } : {}) });
const timesOf = day => day.items.map(i => i.time);
const routesOf = pairs => ({ legs: Object.fromEntries(pairs.map(([f, t, sec]) => [M.legKey(SP[f], SP[t]), { distance: 1000, duration: sec }])) });
const SITE = { routing: { trafficFactor: 1 } };
const threeDay = () => dayOf([sp('a', '09:00 - 10:00'), mv('10:00 - 10:30'), sp('b', '10:30 - 11:30 午餐'), mv('11:30 - 12:00'), sp('c', '12:00 - 13:00')]);

test('timeParts：完整區間拆成 開始／結束／後註；其他回傳 null', () => {
    assert.deepEqual(L.timeParts('10:30 - 11:30 午餐'), { start: '10:30', end: '11:30', tail: '午餐' });
    assert.deepEqual(L.timeParts('9:00-10:00'), { start: '09:00', end: '10:00', tail: '' });
    assert.equal(L.timeParts('15:30 後'), null);
    assert.equal(L.timeParts(undefined), null);
});

test('isFirstTimed：整天第一個有完整時間的項目才是；前面不完整時間的不算', () => {
    const day = dayOf([{ type: 'notice', tag: 't', title: 't' }, sp('a', '15:30 後'), sp('b', '09:00 - 10:00'), mv('10:00 - 10:30'), sp('c', '10:30 - 11:00')]);
    assert.deepEqual([0, 1, 2, 3, 4].map(i => L.isFirstTimed(day, i)), [false, false, true, false, false]);
});

test('改中間景點的結束 +15：後面整天（移動列與景點）平移 15，各長度不變，前面不動', () => {
    const day = threeDay();
    const r = L.setItemTime(day, 2, 'end', '11:45');
    assert.equal(r.ok, true);
    assert.deepEqual(timesOf(day), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:45 午餐', '11:45 - 12:15', '12:15 - 13:15']);
});

test('改結束 −30（縮短停留）：後面往前平移', () => {
    const day = threeDay();
    L.setItemTime(day, 0, 'end', '09:30');
    assert.deepEqual(timesOf(day), ['09:00 - 09:30', '09:30 - 10:00', '10:00 - 11:00 午餐', '11:00 - 11:30', '11:30 - 12:30']);
});

test('改中間項目的開始：不接受（開始 = 前一個結束 + 移動長度，由系統算）', () => {
    const day = threeDay();
    const before = JSON.stringify(day);
    assert.equal(L.setItemTime(day, 2, 'start', '10:45').ok, false);
    assert.equal(JSON.stringify(day), before);
});

test('整天第一個完整時間項目的開始可改：它整項平移，後面整天跟著平移', () => {
    const day = threeDay();
    const r = L.setItemTime(day, 0, 'start', '08:30');
    assert.equal(r.ok, true);
    assert.deepEqual(timesOf(day), ['08:30 - 09:30', '09:30 - 10:00', '10:00 - 11:00 午餐', '11:00 - 11:30', '11:30 - 12:30']);
});

test('整天第一個完整時間項目是移動列（出發時間）：開始也能改，整天平移', () => {
    const day = dayOf([{ type: 'waypoint', place: 'a' }, mv('07:30 - 09:20'), sp('b', '10:00 - 12:10')]);
    assert.equal(L.isFirstTimed(day, 1), true);
    L.setItemTime(day, 1, 'start', '08:00');
    assert.deepEqual(timesOf(day).slice(1), ['08:00 - 09:50', '10:30 - 12:40']);
});

test('不完整時間（15:30 後）不被平移；其後的完整時間照常平移', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), mv('10:00 - 10:30'), { type: 'stay', title: '住', time: '15:30 後' }, sp('c', '16:00 - 17:00')]);
    L.setItemTime(day, 0, 'end', '10:20');
    assert.deepEqual(timesOf(day), ['09:00 - 10:20', '10:20 - 10:50', '15:30 後', '16:20 - 17:20']);
});

test('結束輸入到一半（不是 H:MM）或早於開始：不改任何資料', () => {
    const day = threeDay();
    const before = JSON.stringify(day);
    ['1', '10:3', '10:', 'abc', '25:00', '08:59'].forEach(v => assert.equal(L.setItemTime(day, 0, 'end', v).ok, false, v));
    assert.equal(JSON.stringify(day), before);
});

test('平移超出當天：整個修改不套用（反向：不會出現 24:30）', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), mv('10:00 - 10:30'), sp('b', '23:00 - 23:50')]);
    const before = JSON.stringify(day);
    const r = L.setItemTime(day, 0, 'end', '10:30');
    assert.equal(r.ok, false);
    assert.equal(JSON.stringify(day), before);
});

test('後註（tail）只改文字，不連動', () => {
    const day = threeDay();
    L.setItemTime(day, 2, 'tail', '晚到');
    assert.equal(day.items[2].time, '10:30 - 11:30 晚到');
    assert.equal(day.items[3].time, '11:30 - 12:00');
    L.setItemTime(day, 2, 'tail', '');
    assert.equal(day.items[2].time, '10:30 - 11:30');
});

test('整串 time（不完整或尚無時間的項目）：直接寫入，空字串刪除欄位，不連動', () => {
    const day = dayOf([sp('a', '15:30 後'), sp('b', '09:00 - 10:00'), mv('10:00 - 10:30'), sp('c', '10:30 - 11:00')]);
    L.setItemTime(day, 0, 'time', '16:00 後');
    assert.equal(day.items[0].time, '16:00 後');
    L.setItemTime(day, 0, 'time', '');
    assert.equal('time' in day.items[0], false);
    assert.deepEqual(timesOf(day).slice(1), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:00']);
});

test('擇一組：改組共用時間的結束，組後面平移一次；成員沒有 time', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), mv('10:00 - 10:20'), sp('b', '10:20 - 11:20', { alt: 'x' }), sp('c', undefined, { alt: 'x' }), mv('11:20 - 11:40'), sp('d', '11:40 - 12:30')]);
    L.setItemTime(day, 2, 'end', '11:30');
    assert.deepEqual(timesOf(day), ['09:00 - 10:00', '10:00 - 10:20', '10:20 - 11:30', undefined, '11:30 - 11:50', '11:50 - 12:40']);
});

// ---- syncMoves：結構改動後補移動列、更新受影響移動列的長度（只動「路段變了」的列） ----

test('moveKeys：移動列（物件）對應到綁定路段的 key', () => {
    const day = threeDay();
    const keys = L.moveKeys(day, SP);
    assert.equal(keys.get(day.items[1]), M.legKey(SP.a, SP.b));
    assert.equal(keys.get(day.items[3]), M.legKey(SP.b, SP.c));
});

test('syncMoves：缺移動列就補（文字「前一站 ➔ 下一站」），有查詢結果時時間 = 前一站結束 + 長度，後面整段平移', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), sp('b', '10:00 - 11:00'), sp('c', '11:30 - 12:00')]);
    const r = L.syncMoves(day, SP, { routes: routesOf([['a', 'b', 1200], ['b', 'c', 900]]), site: SITE, before: new Map() });
    assert.equal(r.added, 2);
    assert.deepEqual(day.items.map(i => i.type), ['spot', 'move', 'spot', 'move', 'spot']);
    assert.equal(day.items[1].text, 'A館 ➔ B館');
    assert.deepEqual(timesOf(day), ['09:00 - 10:00', '10:00 - 10:20', '10:20 - 11:20', '11:20 - 11:35', '11:35 - 12:05']);
    const again = L.syncMoves(day, SP, { routes: routesOf([['a', 'b', 1200], ['b', 'c', 900]]), site: SITE, before: L.moveKeys(day, SP) });
    assert.deepEqual([again.added, again.changed.length], [0, 0]);   // 補完後穩定
});

test('syncMoves：沒有查詢結果時補列但不寫 time，也不動其他項目', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), sp('b', '10:30 - 11:00')]);
    const r = L.syncMoves(day, SP, { before: new Map() });
    assert.equal(r.added, 1);
    assert.equal('time' in day.items[1], false);
    assert.deepEqual([day.items[0].time, day.items[2].time], ['09:00 - 10:00', '10:30 - 11:00']);
});

test('syncMoves：只處理路段變了的既有列；沒變的列（長度與查詢不同）一個字都不動', () => {
    const day = threeDay();
    const before = L.moveKeys(day, SP);
    const routes = routesOf([['a', 'b', 3600], ['b', 'c', 3600], ['a', 'c', 1200]]);   // 查詢都比排定長
    assert.deepEqual(L.syncMoves(day, SP, { routes, site: SITE, before }).changed, []);
    assert.deepEqual(timesOf(day), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:30 午餐', '11:30 - 12:00', '12:00 - 13:00']);
});

test('syncMoves：換地點（路段變了）後，該移動列改成新長度，後面平移；有補列也一併處理', () => {
    const day = threeDay();
    const before = L.moveKeys(day, SP);
    day.items[2].place = 'd';   // a→b 變成 a→d
    L.syncMoves(day, SP, { routes: routesOf([['a', 'd', 2400], ['d', 'c', 1800]]), site: SITE, before });
    assert.deepEqual(timesOf(day), ['09:00 - 10:00', '10:00 - 10:40', '10:40 - 11:40 午餐', '11:40 - 12:10', '12:10 - 13:10']);
});

test('syncMoves：刪除項目後只補不刪（留下的多個移動列只警告，時間不動）', () => {
    const day = threeDay();
    const before = L.moveKeys(day, SP);
    day.items.splice(2, 1);
    L.syncMoves(day, SP, { routes: routesOf([['a', 'c', 600]]), site: SITE, before });
    assert.equal(day.items.length, 4);
    assert.deepEqual(L.moveWarnings(day, SP).map(w => w.type), ['multiple']);
    assert.deepEqual([day.items[1].time, day.items[2].time], ['10:00 - 10:30', '11:30 - 12:00']);
});

test('syncMoves：fill = false 不補列（輸入中不改列數）', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), sp('b', '10:30 - 11:00')]);
    const r = L.syncMoves(day, SP, { before: new Map(), fill: false });
    assert.equal(r.added, 0);
    assert.equal(day.items.length, 2);
});

test('moveWarnings：多餘與重複的移動列各出警告，且 syncMoves 不刪也不改', () => {
    const day = dayOf([mv('08:00 - 09:00'), sp('a', '09:00 - 10:00'), mv('00:00 - 00:00'), mv('01:00 - 02:00'), sp('b', '10:30 - 11:00')]);
    const before = JSON.stringify(day);
    assert.equal(L.syncMoves(day, SP, { before: L.moveKeys(day, SP) }).added, 0);
    assert.equal(JSON.stringify(day), before);
    assert.deepEqual(L.moveWarnings(day, SP).map(w => w.type).sort(), ['extra', 'multiple']);
});

test('載入資料不會改任何時間：只有 setItemTime／syncMoves 才會動時間，純讀取（stayHint、moveWarnings、moveKeys）不動', () => {
    const day = threeDay();
    const before = JSON.stringify(day);
    day.items.forEach((_, i) => L.stayHint(day, i));
    L.moveWarnings(day, SP);
    L.moveKeys(day, SP);
    assert.equal(JSON.stringify(day), before);
});
