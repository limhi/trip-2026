// node --test tools/editor/publish-client.test.js
// 發布視窗的純邏輯（不碰 DOM）。測試縫：blockers、changeLines。
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('./public/publish');

const plan = (over = {}) => ({
    onMain: true, hasChanges: true, branch: 'main',
    changes: { days: [], places: [], routes: { added: 0, removed: 0, changed: 0 }, hotels: false, other: false }, missingRoutes: [], ...over
});

test('blockers：驗證錯誤、未存檔、不在 main 都擋下', () => {
    assert.deepEqual(P.blockers(plan(), { dirty: false, errors: [] }), []);
    assert.match(P.blockers(plan(), { dirty: false, errors: ['a', 'b'] })[0], /2 個問題/);
    assert.match(P.blockers(plan(), { dirty: true, errors: [] })[0], /未存檔/);
    assert.match(P.blockers(plan({ onMain: false, branch: 'feat' }), { dirty: false, errors: [] })[0], /feat/);
});

test('blockers：與 HEAD 相同、缺少路線快取不擋（只是警告）', () => {
    assert.deepEqual(P.blockers(plan({ hasChanges: false, missingRoutes: ['k'] }), { dirty: false, errors: [] }), []);
});

test('changeLines：天、地點、住宿區、其他設定各一行', () => {
    const lines = P.changeLines({
        days: [{ day: 2, note: '項目順序或日設定有變' }],
        places: [{ id: 'a', name: '甲', kind: 'added' }, { id: 'b', name: '乙', kind: 'removed' }, { id: 'c', name: '丙', kind: 'modified' }],
        routes: { added: 0, removed: 0, changed: 0 },
        hotels: true, other: true
    });
    assert.deepEqual(lines.map(l => l.label), ['DAY 2', '地點', '地點', '地點', '住宿區', '網站設定']);
    assert.deepEqual(lines.slice(1, 4).map(l => l.text), ['新增「甲」', '刪除「乙」', '修改「丙」']);
});

test('changeLines：路線快取有異動時列出新增／移除／重算的段落數', () => {
    const lines = P.changeLines({ days: [], places: [], hotels: false, other: false, routes: { added: 3, removed: 1, changed: 2 } });
    assert.deepEqual(lines, [{ label: '路線', text: '新增 3、移除 1、重算 2 段' }]);
});
