// 路線前端的計算流程（防抖、計算中／已算／失敗、不自動重試）：node --test tools/editor/routes-controller.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('./public/routes-controller');
const M = require('../../js/model');

const places = {
    a: { name: 'A', lat: 24.9722, lng: 121.4433 },
    b: { name: 'B', lat: 24.6718, lng: 121.804 },
    c: { name: 'C', lat: 24.7, lng: 121.7 }
};
const trip = { site: {}, days: [{ day: 1, items: [{ type: 'spot', place: 'a' }, { type: 'spot', place: 'b' }, { type: 'spot', place: 'c' }] }] };
const [ab, bc] = M.getLegs(trip.days[0], places).map(l => l.key);

// 假 timers：手動觸發
function fakeTimers() {
    const q = [];
    return {
        setTimeout: (fn, ms) => { q.push({ fn, ms }); return q.length; },
        clearTimeout: id => { if (q[id - 1]) q[id - 1].fn = null; },
        pending: () => q.filter(x => x.fn).length,
        fire: async () => { const x = q.filter(y => y.fn); q.length = 0; for (const y of x) await y.fn(); },
        q
    };
}

// 假 fetch：handler(path, body) → { results }；丟錯模擬斷線
function setup({ handler } = {}) {
    const requests = [];
    const timers = fakeTimers();
    const updates = [], computed = [];
    const fetchFn = async (path, init) => {
        const body = init && init.body ? JSON.parse(init.body) : undefined;
        requests.push({ path, body });
        const r = await handler(path, body);
        return { ok: true, status: 200, json: async () => r };
    };
    const ctl = create({
        data: () => ({ trip, places }), fetchFn, timers,
        onUpdate: () => updates.push(1), onComputed: () => computed.push(1)
    });
    return { ctl, requests, timers, updates, computed };
}
const okAll = (_p, body) => ({ results: Object.fromEntries(body.legs.map(l => [l.key, { status: 'ok', distance: 1000, duration: 600 }])) });

test('schedule：約 0.6 秒防抖，連續呼叫只留最後一次', () => {
    const { ctl, timers } = setup({ handler: okAll });
    ctl.schedule(); ctl.schedule(); ctl.schedule();
    assert.equal(timers.pending(), 1);
    assert.equal(timers.q[timers.q.length - 1].ms, 600);
});

test('防抖到期後只送沒有快取的段落，算完變成已算並通知預覽', async () => {
    const { ctl, timers, requests, computed } = setup({ handler: okAll });
    ctl.schedule();
    await timers.fire();
    assert.deepEqual(requests.map(r => r.path), ['/api/routes/compute']);
    assert.deepEqual(requests[0].body.legs.map(l => l.key), [ab, bc]);
    assert.equal(ctl.status(ab), 'ok');
    assert.deepEqual(ctl.known[ab], { distance: 1000, duration: 600 });
    assert.equal(computed.length, 1);

    // 再觸發一次：全部命中，不再送請求
    ctl.schedule();
    await timers.fire();
    assert.equal(requests.length, 1);
});

test('送出期間狀態是計算中，且不會重複送同一段', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const { ctl, requests } = setup({ handler: async (p, b) => { await gate; return okAll(p, b); } });
    const first = ctl.pass();
    await Promise.resolve();
    assert.equal(ctl.status(ab), 'computing');
    await ctl.pass();                       // 第二次：都在計算中，沒有東西要送
    assert.equal(requests.length, 1);
    release(); await first;
    assert.equal(ctl.status(ab), 'ok');
});

test('失敗：標示 failed 與錯誤，不自動重試；段落離開行程後再出現才會重試；重新計算可再試', async () => {
    let fail = true;
    const { ctl, requests } = setup({
        handler: (p, b) => fail
            ? { results: Object.fromEntries(b.legs.map(l => [l.key, { status: 'failed', error: '路線服務逾時', removed: true }])) }
            : okAll(p, b)
    });
    await ctl.pass();
    assert.equal(ctl.status(ab), 'failed');
    assert.equal(ctl.error(ab), '路線服務逾時');
    await ctl.pass();
    assert.equal(requests.length, 1, '同一段持續存在時不自動重試');

    trip.days[0].items.splice(1, 1);        // 拿掉 b：ab、bc 都消失
    await ctl.pass();                       // 這時只有新的 a→c 被送出
    assert.equal(ctl.status(ab), undefined);
    assert.equal(requests.length, 2);
    trip.days[0].items.splice(1, 0, { type: 'spot', place: 'b' });
    fail = false;
    await ctl.pass();
    assert.deepEqual(requests[2].body.legs.map(l => l.key), [ab, bc], '再出現的段落會重新送');
    assert.equal(ctl.status(ab), 'ok');
});

test('斷線（fetch 丟錯）：所有送出的段落標示失敗，並帶錯誤文字', async () => {
    const { ctl } = setup({ handler: () => { throw new Error('Failed to fetch'); } });
    await ctl.pass();
    assert.equal(ctl.status(ab), 'failed');
    assert.match(ctl.error(ab), /Failed to fetch/);
});

test('recompute 與 recomputeAll：打 recompute-all，忽略快取', async () => {
    const { ctl, requests } = setup({ handler: okAll });
    await ctl.pass();
    await ctl.recompute([ab]);
    assert.equal(requests[1].path, '/api/routes/recompute-all');
    assert.deepEqual(requests[1].body.legs.map(l => l.key), [ab]);
    assert.equal(requests[1].body.legs[0].from.lat, places.a.lat);
    await ctl.recomputeAll();
    assert.deepEqual(requests[2].body.legs.map(l => l.key), [ab, bc]);
});

test('重新計算失敗：舊結果從前端也移除，該段顯示「失敗」（公開頁面退回直線）並通知預覽更新', async () => {
    let failing = false;
    const handler = (_p, body) => failing
        ? { results: Object.fromEntries(body.legs.map(l => [l.key, { status: 'failed', error: '路線服務逾時', removed: true }])) }
        : okAll(_p, body);
    const { ctl, computed } = setup({ handler });
    await ctl.pass();
    assert.equal(ctl.status(ab), 'ok');
    const before = computed.length;
    failing = true;
    await ctl.recompute([ab]);
    assert.equal(ctl.known[ab], undefined);
    assert.equal(ctl.status(ab), 'failed');
    assert.equal(ctl.error(ab), '路線服務逾時');
    assert.equal(ctl.status(bc), 'ok', '其他段落不受影響');
    assert.equal(computed.length, before + 1);
});

test('load：從伺服器草稿同步已算的段落，清掉舊的失敗標記', async () => {
    const { ctl } = setup({ handler: () => ({ legs: { [ab]: { distance: 5, duration: 6 } } }) });
    await ctl.load();
    assert.deepEqual(ctl.known, { [ab]: { distance: 5, duration: 6 } });
});
