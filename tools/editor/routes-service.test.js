// 路線服務（草稿快取、呼叫 provider）：node --test tools/editor/routes-service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoutesService } = require('./routes-service');
const { legKey } = require('../../js/model');
const { makeRepoCopy, cleanup } = require('./test-helpers');

const A = { lat: 24.9722, lng: 121.4433 };
const B = { lat: 24.6718, lng: 121.804 };
const C = { lat: 24.7, lng: 121.7 };
const leg = (from, to) => ({ key: legKey(from, to), from, to });

// 假 provider：記下被呼叫的路段 key；failKeys 內的路段會丟錯
function fakeProvider({ failKeys = [] } = {}) {
    const calls = [];
    return {
        calls,
        name: 'fake',
        route: async (from, to) => {
            const key = legKey(from, to);
            calls.push(key);
            if (failKeys.includes(key)) throw new Error('路線服務連線失敗：測試');
            return { distance: 1000, duration: 600, geometry: 'abc' };
        }
    };
}

function setup(t, providerOpts) {
    const root = makeRepoCopy();
    t.after(() => cleanup(root));
    const provider = fakeProvider(providerOpts);
    const changes = [];
    const svc = createRoutesService({ root, provider, onChange: () => changes.push(1) });
    return { root, provider, svc, changes };
}

test('compute：沒有快取的段落送去計算，快取命中的不重算', async t => {
    const { svc, provider } = setup(t);
    const ab = leg(A, B), bc = leg(B, C);
    const first = await svc.compute({ legs: [ab] });
    assert.equal(first.results[ab.key].status, 'ok');
    assert.equal(first.results[ab.key].duration, 600);
    assert.equal(first.results[ab.key].distance, 1000);
    assert.deepEqual(provider.calls, [ab.key]);

    // 順序改變：多一段 bc，ab 命中快取
    const second = await svc.compute({ legs: [ab, bc] });
    assert.equal(second.results[ab.key].status, 'cached');
    assert.equal(second.results[bc.key].status, 'ok');
    assert.deepEqual(provider.calls, [ab.key, bc.key]);
});

test('compute：結果進入記憶體草稿（含 provider 與日期），並通知 onChange', async t => {
    const { svc, changes } = setup(t);
    const ab = leg(A, B);
    await svc.compute({ legs: [ab] });
    const entry = svc.draft().legs[ab.key];
    assert.equal(entry.geometry, 'abc');
    assert.equal(entry.provider, 'fake');
    assert.match(entry.computedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(changes.length, 1);
});

test('compute：provider 失敗回 failed 與錯誤，草稿保持原狀', async t => {
    const ab = leg(A, B), bc = leg(B, C);
    const { svc, changes } = setup(t, { failKeys: [bc.key] });
    await svc.compute({ legs: [ab] });
    const before = JSON.stringify(svc.draft());
    changes.length = 0;
    const r = await svc.compute({ legs: [bc] });
    assert.equal(r.results[bc.key].status, 'failed');
    assert.match(r.results[bc.key].error, /連線失敗/);
    assert.equal(JSON.stringify(svc.draft()), before);
    assert.equal(changes.length, 0, '沒有任何成功就不用通知預覽');
});

test('compute：同一批裡一段失敗不影響其他段落', async t => {
    const ab = leg(A, B), bc = leg(B, C);
    const { svc } = setup(t, { failKeys: [ab.key] });
    const r = await svc.compute({ legs: [ab, bc] });
    assert.equal(r.results[ab.key].status, 'failed');
    assert.equal(r.results[bc.key].status, 'ok');
});

test('recomputeAll：忽略快取，全部重新計算；失敗時保留舊值', async t => {
    const ab = leg(A, B), bc = leg(B, C);
    const { svc, provider } = setup(t);
    await svc.compute({ legs: [ab, bc] });
    provider.calls.length = 0;
    const r = await svc.recomputeAll({ legs: [ab, bc] });
    assert.deepEqual(provider.calls, [ab.key, bc.key]);
    assert.equal(r.results[ab.key].status, 'ok');

});

test('recomputeAll／重新計算失敗：該段從草稿移除（退回直線，不再畫舊路線）並通知預覽，其他段落保留', async t => {
    const ab = leg(A, B), bc = leg(B, C);
    const { svc, changes } = setup(t, { failKeys: [ab.key] });
    svc.draft().legs[ab.key] = { distance: 5, duration: 6, geometry: 'old' };
    svc.draft().legs[bc.key] = { distance: 7, duration: 8, geometry: 'keep' };
    const f = await svc.recomputeAll({ legs: [ab] });
    assert.equal(f.results[ab.key].status, 'failed');
    assert.equal(svc.draft().legs[ab.key], undefined);
    assert.equal(svc.draft().legs[bc.key].geometry, 'keep');
    assert.equal(svc.summary().legs[ab.key], undefined);
    assert.equal(changes.length, 1, '草稿變動了，預覽要重新產生');
});

test('compute：重複的 key 只算一次；key 與座標對不上或格式錯誤回 400', async t => {
    const ab = leg(A, B);
    const { svc, provider } = setup(t);
    await svc.compute({ legs: [ab, ab] });
    assert.deepEqual(provider.calls, [ab.key]);
    await assert.rejects(svc.compute({ legs: [{ ...ab, key: 'x' }] }), e => e.status === 400);
    await assert.rejects(svc.compute({ legs: [{ key: ab.key, from: A }] }), e => e.status === 400);
    await assert.rejects(svc.compute({}), e => e.status === 400);
});

test('summary：只含 distance 與 duration（不含 geometry），並回報草稿是否與磁碟不同', async t => {
    const ab = leg(A, B);
    const { svc } = setup(t);
    assert.equal(svc.summary().unsaved, false, '剛載入時與磁碟相同');
    await svc.compute({ legs: [ab] });
    assert.deepEqual(svc.summary(), { legs: { [ab.key]: { distance: 1000, duration: 600 } }, unsaved: true });
});

test('draft：一開始是磁碟上的 routes.json', t => {
    const { svc } = setup(t);
    assert.deepEqual(svc.draft(), { profile: 'driving', legs: {} });
});
