const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/model');
const day = () => ({ day: 1, items: [
    { type: 'spot', title: '起點', time: '08:00' },
    { type: 'move', time: '08:00 - 08:00' },
    { type: 'spot', title: '甲', alt: 'a', time: '09:00 - 10:00' },
    { type: 'spot', title: '乙', alt: 'a' },
    { type: 'spot', title: '終點', time: '10:30 - 11:00' },
    { type: 'notice', title: '提醒' }
] });
const errors = d => model.validate({ days: [d] }, {});
test('必要時間：邊界、共用區間、零長度移動與提醒', () => {
    const d = day();
    assert.deepEqual(errors(d), []);
    d.items[2].time = '17:10 後';
    assert.match(errors(d).join('\n'), /DAY 1 第 3 項.*時間/);
    for (const value of ['', '09:00', '25:00 - 26:00', '09:99 - 10:00', '11:00 - 10:00']) {
        d.items[2].time = value;
        assert.match(errors(d).join('\n'), /DAY 1 第 3 項.*時間/);
    }
});
