const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model');
const L = require('./editor/public/days-logic');

const fixture = () => ({ day: 1, items: [
    { type: 'spot', title: '前站', time: '09:00 - 10:00' },
    { type: 'notice', title: '提醒', time: '15:00 - 16:00', desc: '17:00 再決定' },
    { type: 'spot', title: '後站', time: '10:00 - 11:00' }
] });

test('舊提醒的時間不參與銜接、連動或整天重排，文案保留', () => {
    const day = fixture();
    assert.deepEqual(M.getContinuityWarnings(day), []);
    M.cascadeDay(day, 0, 15);
    assert.equal(day.items[1].time, '15:00 - 16:00');
    assert.equal(day.items[2].time, '10:15 - 11:15');
    M.rescheduleDay(day, {}, undefined, {});
    assert.equal(day.items[1].time, '15:00 - 16:00');
    assert.equal(day.items[2].time, '10:00 - 11:00');
    assert.equal(day.items[1].desc, '17:00 再決定');
});

test('連動與伸縮略過提醒，改提醒時間被拒絕', () => {
    for (const mode of ['link', 'stretch']) {
        const day = fixture();
        assert.equal(L.setItemTime(day, 0, 'end', '10:15', mode).ok, true);
        assert.equal(day.items[1].time, '15:00 - 16:00');
        assert.equal(day.items[2].time, mode === 'link' ? '10:15 - 11:15' : '10:15 - 11:00');
        const before = structuredClone(day);
        assert.equal(L.setItemTime(day, 1, 'time', '16:00 - 17:00').ok, false);
        assert.deepEqual(day, before);
    }
});

test('改為提醒移除時間，保留地點和閱讀內容，改回景點不恢復舊時間', () => {
    const item = { type: 'spot', time: '09:00 - 10:00', title: '休息', desc: '17:00 再決定', place: 'rest' };
    L.changeType(item, 'notice');
    assert.deepEqual(item, { type: 'notice', title: '休息', desc: '17:00 再決定', place: 'rest' });
    assert.equal(L.TYPES.notice.fields.includes('time'), false);
    L.changeType(item, 'spot');
    assert.equal(item.time, undefined);
});

test('移動轉為提醒保留可讀文字與備註，不把舊時間加進文案', () => {
    const item = { type: 'move', time: '09:00 - 10:00', text: '前往住宿', note: '12:00 再決定', buffer: 5 };
    L.changeType(item, 'notice');
    assert.deepEqual(item, { type: 'notice', title: '前往住宿', desc: '12:00 再決定' });
});
