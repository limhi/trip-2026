const test = require('node:test');
const assert = require('node:assert/strict');
const { textWarnings } = require('./check-text');

// 兩天的小行程：a 排在 11/15（日），b 排在 11/16（一）
const trip = (items1 = [], items2 = []) => ({
    days: [
        { day: 1, date: '11/15（日）', items: [{ type: 'waypoint', time: '08:00', place: 'home' }, ...items1, { type: 'stay', time: '17:00', place: 'a' }] },
        { day: 2, date: '11/16（一）', items: [{ type: 'waypoint', time: '08:30', place: 'a' }, ...items2, { type: 'stay', time: '18:00', place: 'b' }] },
    ],
});
const places = { home: { name: '家' }, a: { name: '甲' }, b: { name: '乙' } };
const guide = t => ({ highlights: [{ t }] });

test('沒有重複數字與日期錯誤時沒有警告', () => {
    const t = trip([{ type: 'spot', time: '09:00 - 10:00', place: 'a', desc: '建議停留約 1 小時（官網）；13:30 場次，13:20 前報到。11/15 是週日。明天 08:30 退房。' }]);
    assert.deepEqual(textWarnings(t, places, { a: guide('建議停留約 30～40 分鐘；距車站車程約 10 分鐘；11/15 為週日。') }), []);
});

test('說明文字寫了可由時間表推得的數字會警告', () => {
    for (const desc of ['停留約 50 分鐘，只看入口', '停留壓縮為約 1 小時 40 分', '請在天黑前結束，回程約 40 分鐘', '離開後約 30 分鐘到志學', '行程排約 1 小時', '行程 11:30 到達']) {
        const w = textWarnings(trip([{ type: 'spot', time: '09:00 - 10:00', place: 'a', desc }]), places);
        assert.equal(w.length, 1, desc);
        assert.match(w[0], /DAY 1 第 2 項.*時間表/);
    }
});

test('「車程約」只查移動列', () => {
    const w = textWarnings(trip([{ type: 'move', time: '08:00 - 09:00', text: '家 ➔ 甲', note: '車程約 55min（推估）' }]), places);
    assert.equal(w.length, 1);
    assert.deepEqual(textWarnings(trip([{ type: 'spot', time: '09:00 - 10:00', place: 'a', desc: '下交流道後車程約 7 分鐘' }]), places), []);
});

test('攻略寫了行程的停留或抵達時間會警告；沒排入行程的地點不查', () => {
    const w = textWarnings(trip(), places, { a: guide('行程只排 13:50–15:10（約 80 分鐘）'), c: guide('行程排約 70 分鐘') });
    assert.equal(w.length, 1);
    assert.match(w[0], /攻略 a\.highlights/);
});

test('攻略與停車說明提到的日期不是該地點排定的那天會警告', () => {
    const w = textWarnings(trip(), { ...places, b: { name: '乙', parking: ['11/15 可能客滿'] } }, { b: guide('11/15 可能已收割；行程當天為週日') });
    assert.equal(w.length, 3);
    assert.ok(w.some(x => /攻略 b.*提到 11\/15.*排在 11\/16/.test(x)));
    assert.ok(w.some(x => /行程當天為週日.*排在週一/.test(x)));
    assert.ok(w.some(x => /地點 b 的交通與停車/.test(x)));
    // 行程以外的日期（例如保養期間 2026/11/15、12/01）不查
    assert.deepEqual(textWarnings(trip(), places, { b: guide('官方節目表 2026/11/15–12/24 適用；11/30 前免費') }), []);
});

test('日期與星期不符會警告', () => {
    const w = textWarnings(trip([{ type: 'spot', time: '09:00 - 10:00', place: 'a', desc: '11/16 是週四，冰店公休' }]), places);
    assert.equal(w.length, 1);
    assert.match(w[0], /11\/16 是週一/);
});

test('「明天 HH:MM 退房」與隔天出發時間不符會警告', () => {
    const t = trip();
    t.days[0].items[1].desc = '明天 09:00 退房';
    const w = textWarnings(t, places);
    assert.equal(w.length, 1);
    assert.match(w[0], /DAY 2 的出發時間是 08:30/);
});
