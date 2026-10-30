// node --test tools/editor/days-logic.test.js
// 每日行程編輯的純邏輯（不碰 DOM）。測試縫：moveItem、stepItem、changeType、setPath、itemErrors、newItem。
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./public/days-logic');

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

// ---- syncMoves：套用 model.deriveMoves（時間連動、補列，只補不刪） ----
const SP = {
    a: { name: 'A館', lat: 24.1, lng: 121.1 },
    b: { name: 'B館', lat: 24.2, lng: 121.2 },
    c: { name: 'C館', lat: 24.3, lng: 121.3 },
    d: { name: 'D館', lat: 24.4, lng: 121.4 }
};
const sp = (place, time, extra) => ({ type: 'spot', place, time, ...extra });
const mv = (time, text) => ({ type: 'move', time, text: text || '路上' });

test('syncMoves：改景點結束時間，後一個移動列的開始時間跟著變；改開始時間，前一個移動列的結束時間跟著變', () => {
    const day = dayOf([sp('a', '09:00 - 10:30'), mv('10:30 - 11:00'), sp('b', '11:00 - 12:00')]);
    day.items[0].time = '09:00 - 10:45';
    assert.equal(L.syncMoves(day, SP), true);
    assert.equal(day.items[1].time, '10:45 - 11:00');
    day.items[2].time = '11:20 - 12:00';
    assert.equal(L.syncMoves(day, SP), true);
    assert.equal(day.items[1].time, '10:45 - 11:20');
});

test('syncMoves：已經一致就回傳 false 且資料不變', () => {
    const day = dayOf([sp('a', '09:00 - 10:30'), mv('10:30 - 11:00'), sp('b', '11:00 - 12:00')]);
    const before = JSON.stringify(day);
    assert.equal(L.syncMoves(day, SP), false);
    assert.equal(JSON.stringify(day), before);
});

test('syncMoves：擇一組前後的移動列共用時間框', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), mv(undefined), sp('b', '11:00 - 12:30', { alt: 'x' }), sp('c', undefined, { alt: 'x' }), mv(undefined), sp('d', '13:00 - 14:00')]);
    L.syncMoves(day, SP);
    assert.equal(day.items[1].time, '10:00 - 11:00');
    assert.equal(day.items[4].time, '12:30 - 13:00');
});

test('syncMoves：相鄰標記之間缺移動列就補，文字「前一站 ➔ 下一站」，時間一併推導；多處缺列也插在正確位置', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), sp('b', '10:30 - 11:00'), sp('c', '11:20 - 12:00')]);
    assert.equal(L.syncMoves(day, SP), true);
    assert.deepEqual(day.items.map(i => i.type), ['spot', 'move', 'spot', 'move', 'spot']);
    assert.deepEqual([day.items[1].text, day.items[1].time], ['A館 ➔ B館', '10:00 - 10:30']);
    assert.deepEqual([day.items[3].text, day.items[3].time], ['B館 ➔ C館', '11:00 - 11:20']);
    assert.equal(L.syncMoves(day, SP), false);   // 補完後穩定，不會一直補
});

test('syncMoves：缺列且一端不完整時補列但不寫 time', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), sp('b', '11:00 後')]);
    L.syncMoves(day, SP);
    assert.equal(day.items.length, 3);
    assert.equal('time' in day.items[1], false);
});

test('syncMoves：只補不刪，刪掉景點後留下的移動列與其文字都保留', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), mv('10:00 - 10:30', '去B'), sp('b', '10:30 - 11:00'), mv('11:00 - 11:20', '去C'), sp('c', '11:20 - 12:00')]);
    day.items.splice(2, 1);   // 刪掉 b：兩個移動列相鄰在 a、c 之間
    L.syncMoves(day, SP);
    assert.equal(day.items.length, 4);
    assert.deepEqual(day.items.filter(i => i.type === 'move').map(i => i.text), ['去B', '去C']);
});

test('syncMoves：一端不是完整區間時保留移動列現有時間', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), mv('10:00 - 10:30'), sp('b', '10:30 後')]);
    assert.equal(L.syncMoves(day, SP), false);
    assert.equal(day.items[1].time, '10:00 - 10:30');
});

test('syncMoves：重疊時清空移動列時間，並可由 moveWarnings 取得警告', () => {
    const day = dayOf([sp('a', '09:00 - 11:00'), mv('11:00 - 11:30'), sp('b', '10:30 - 12:00')]);
    assert.equal(L.syncMoves(day, SP), true);
    assert.equal('time' in day.items[1], false);
    assert.deepEqual(L.moveWarnings(day, SP).map(w => w.type), ['overlap']);
});

test('moveWarnings：多餘與重複的移動列各出警告，且 syncMoves 不刪也不改', () => {
    const day = dayOf([mv('08:00 - 09:00'), sp('a', '09:00 - 10:00'), mv('00:00 - 00:00'), mv('01:00 - 02:00'), sp('b', '10:30 - 11:00')]);
    const before = JSON.stringify(day);
    assert.equal(L.syncMoves(day, SP), false);
    assert.equal(JSON.stringify(day), before);
    assert.deepEqual(L.moveWarnings(day, SP).map(w => w.type).sort(), ['extra', 'multiple']);
});

test('syncMoves：非移動列的項目（景點、用餐、提醒）一律不被改動', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), { type: 'meal', tag: 't', title: 'm', time: '12:00' }, { type: 'notice', tag: 'n', title: 'n' }, mv('x'), sp('b', '11:00 - 12:00')]);
    const snap = JSON.stringify([0, 1, 2, 4].map(i => day.items[i]));
    L.syncMoves(day, SP);
    assert.equal(JSON.stringify([0, 1, 2, 4].map(i => day.items[i])), snap);
});

test('syncMoves：fill = false 只連動時間、不補列（輸入中不改列數）', () => {
    const day = dayOf([sp('a', '09:00 - 10:00'), sp('b', '10:30 - 11:00'), sp('c', '11:20 - 12:00')]);
    assert.equal(L.syncMoves(day, SP, false), false);
    assert.equal(day.items.length, 3);
});

// ---- 緩衝 buffer（ticket 02）：只在 move，整數分鐘，0 不寫入 ----
test('move 的欄位表含 buffer；其他類型沒有', () => {
    assert.ok(L.TYPES.move.fields.includes('buffer'));
    assert.ok(!L.TYPES.spot.fields.includes('buffer'));
});

test('changeType：move 保留 buffer，轉 spot 則丟掉', () => {
    const item = { type: 'move', time: '1', text: 't', buffer: -10 };
    L.changeType(item, 'move');
    assert.equal(item.buffer, -10);
    L.changeType(item, 'spot');
    assert.deepEqual(item, { type: 'spot', time: '1' });
});

test('validate：buffer 只能在 move 且必須是整數', () => {
    const errs = items => Model.validate({ days: [dayOf(items)] }, altPlaces);
    const mv = buffer => ({ type: 'move', text: 'm', buffer });
    assert.deepEqual(errs([spot('x'), mv(-15), spot('y')]), []);
    assert.deepEqual(errs([spot('x'), mv(20), spot('y')]), []);
    assert.ok(errs([spot('x'), mv(1.5), spot('y')]).some(e => e.startsWith('DAY 1 第 2 項：') && e.includes('buffer')));
    assert.ok(errs([spot('x'), mv('10'), spot('y')]).some(e => e.includes('buffer')));
    assert.ok(errs([spot('x', { buffer: 10 })]).some(e => e.startsWith('DAY 1 第 1 項：') && e.includes('buffer')));
});
