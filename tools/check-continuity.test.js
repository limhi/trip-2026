const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { makeRepoCopy, cleanup } = require('./editor/test-helpers');
const store = require('./editor/store');

test('CLI：所有完整時間的空檔與重疊只警告，不改原始行程且成功結束', t => {
    const root = makeRepoCopy();
    t.after(() => cleanup(root));
    const data = store.load(root);
    data.trip.days[0].items = [
        { type: 'brief', time: '08:00 - 09:00', title: '提醒' },
        { type: 'brief', time: '09:40 - 10:00', text: '資訊' },
        { type: 'notice', time: '17:10 後', title: '彈性' },
        { type: 'stay', time: '09:50 - 11:00', title: '住宿' },
        { type: 'brief', time: '11:00 - 12:00', title: '相接' }
    ];
    store.save(root, data);
    const before = fs.readFileSync(path.join(root, 'data/trip.json'), 'utf8');
    const r = spawnSync(process.execPath, ['tools/check.js'], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /DAY 1 第 1 項（提醒）09:00 → 第 2 項（資訊）09:40：空檔 40分/);
    assert.match(r.stdout, /DAY 1 第 2 項（資訊）10:00 → 第 4 項（住宿）09:50：重疊 10分/);
    assert.doesNotMatch(r.stdout, /第 4 項（住宿）11:00 →/);
    assert.equal(fs.readFileSync(path.join(root, 'data/trip.json'), 'utf8'), before);
});

test('CLI：擇一組只比較一次，不跨天或解析文案時間', t => {
    const root = makeRepoCopy();
    t.after(() => cleanup(root));
    const data = store.load(root);
    data.trip.days.forEach(day => { day.items = []; });
    data.trip.days[0].items = [
        { type: 'brief', time: '08:00 - 09:00', title: '前站' },
        { type: 'spot', alt: 'choice', time: '09:10 - 10:00', title: '擇一甲' },
        { type: 'spot', alt: 'choice', title: '擇一乙' },
        { type: 'brief', time: '10:00 - 11:00', text: '相接資訊' }
    ];
    data.trip.days[1].items = [{ type: 'notice', time: '15:00 - 16:00', title: '隔日' }];
    store.save(root, data);
    const run = () => spawnSync(process.execPath, ['tools/check.js'], { cwd: root, encoding: 'utf8' });
    const first = run();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const warnings = s => s.split('\n').filter(l => /：空檔|：重疊/.test(l));
    assert.deepEqual(warnings(first.stdout), ['警告： DAY 1 第 1 項（前站）09:00 → 第 2 項（擇一甲）09:10：空檔 10分']);
    const edited = store.load(root);
    edited.trip.days[0].items[1].desc = '00:01 出發、23:50 回來';
    edited.trip.days[0].items[1].note = '16:00';
    edited.trip.days[0].items[3].text = '相接資訊（05:00 出發）';
    store.save(root, edited);
    const second = run();
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.deepEqual(warnings(second.stdout), warnings(first.stdout));
    assert.equal(store.load(root).trip.days[0].items[1].time, '09:10 - 10:00');
});
