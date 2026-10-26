// node --test tools/editor/discard-client.test.js
// 還原視窗的純邏輯（不碰 DOM）。測試縫：describe。
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./public/discard');

const plan = (over = {}) => ({
    branch: 'main', hasChanges: true, keep: 20,
    files: ['data/trip.json', 'data/trip.js'],
    changes: { days: [{ day: 4, note: '新增或修改 0、移除或修改 3 項' }], places: [], routes: { added: 0, removed: 4, changed: 0 }, hotels: false, other: false },
    ...over
});

test('describe：沒有異動時 empty 為 true', () => {
    assert.equal(D.describe(plan({ hasChanges: false, files: [] }), { dirty: false }).empty, true);
});

test('describe：列出會被丟掉的內容（沿用發布視窗的異動摘要）與檔案', () => {
    const d = D.describe(plan(), { dirty: false });
    assert.equal(d.empty, false);
    assert.deepEqual(d.lines.map(l => l.label), ['DAY 4', '路線']);
    assert.deepEqual(d.files, ['data/trip.json', 'data/trip.js']);
});

test('describe：編輯器裡有未存檔的修改時，提醒會一併丟掉', () => {
    assert.equal(D.describe(plan(), { dirty: true }).dropsDraft, true);
    assert.equal(D.describe(plan(), { dirty: false }).dropsDraft, false);
});

test('describe：JSON 壞掉（changes 為 null）時用一行說明，不當掉', () => {
    const d = D.describe(plan({ changes: null }), { dirty: false });
    assert.equal(d.lines.length, 1);
    assert.match(d.lines[0].text, /無法解析/);
});
