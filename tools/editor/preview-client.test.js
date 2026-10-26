const test = require('node:test');
const assert = require('node:assert/strict');
const { create, PREVIEW_URL } = require('./public/preview');

// 假的 iframe、fetch、計時器：只驗證行為（送出時機、重新整理、捲動位置），不碰真正的瀏覽器
function setup({ fetchOk = true } = {}) {
    const loadHandlers = [];
    const calls = { posts: [], reloads: 0, scrolls: [], jumps: [], status: [] };
    const days = new Set([1, 2, 3]);
    const frame = {
        src: '', style: {},
        addEventListener: (ev, fn) => ev === 'load' && loadHandlers.push(fn),
        contentWindow: { scrollY: 480, location: { reload: () => { calls.reloads++; } }, scrollTo: (x, y) => calls.scrolls.push(y) },
        contentDocument: { getElementById: id => days.has(Number(id.replace('day-', ''))) ? { scrollIntoView: () => calls.jumps.push(id) } : null }
    };
    const pending = [];
    const timers = {
        setTimeout: (fn, ms) => { const h = { fn, ms, cancelled: false }; pending.push(h); return h; },
        clearTimeout: h => { if (h) h.cancelled = true; }
    };
    const fetchFn = async (url, init) => { calls.posts.push({ url, body: JSON.parse(init.body) }); return { ok: fetchOk, statusText: 'bad', json: async () => ({ error: '伺服器拒絕' }) }; };
    const ctl = create({ frame, onStatus: s => calls.status.push(s), fetchFn, timers });
    const fire = async () => { for (const h of pending.splice(0)) if (!h.cancelled) await h.fn(); };
    const load = () => loadHandlers.forEach(fn => fn());
    return { frame, calls, ctl, fire, load, pending };
}

test('連續修改只送最後一份草稿，延遲 350ms', async () => {
    const { ctl, calls, fire, pending } = setup();
    ctl.sendDraft({ n: 1 }); ctl.sendDraft({ n: 2 }); ctl.sendDraft({ n: 3 });
    assert.equal(pending.filter(h => !h.cancelled).length, 1);
    assert.equal(pending.at(-1).ms, 350);
    await fire();
    assert.deepEqual(calls.posts.map(p => p.body), [{ n: 3 }]);
    assert.equal(calls.posts[0].url, '/api/draft');
});

test('送出後重新整理 iframe，載入完成時還原捲動位置', async () => {
    const { ctl, calls, fire, load, frame } = setup();
    ctl.start();
    assert.equal(frame.src, PREVIEW_URL);
    ctl.sendDraft({}); await fire();
    assert.equal(calls.reloads, 1);
    load();
    assert.deepEqual(calls.scrolls, [480]);
});

test('scrollToDay：頁面已載入就立刻捲到該天，不重複捲', () => {
    const { ctl, calls, load, frame } = setup();
    frame.src = PREVIEW_URL;
    ctl.scrollToDay(2);
    assert.deepEqual(calls.jumps, ['day-2']);
    load(); // 之後的載入不會再跳一次
    assert.deepEqual(calls.jumps, ['day-2']);
});

test('scrollToDay：找不到該天時等頁面載入後再捲', () => {
    const { ctl, calls, load } = setup();
    ctl.scrollToDay(9);
    assert.deepEqual(calls.jumps, []);
    load();
    assert.deepEqual(calls.scrolls, [480]); // 沒有該天，退回還原捲動
});

test('伺服器拒絕草稿：不重新整理，顯示錯誤', async () => {
    const { ctl, calls, fire } = setup({ fetchOk: false });
    ctl.sendDraft({}); await fire();
    assert.equal(calls.reloads, 0);
    assert.match(calls.status.at(-1), /預覽更新失敗：伺服器拒絕/);
});

test('setWidth：手機、平板、桌面；未知值丟錯', () => {
    const { ctl, frame } = setup();
    ctl.setWidth('phone'); assert.equal(frame.style.width, '390px');
    ctl.setWidth('tablet'); assert.equal(frame.style.width, '768px');
    ctl.setWidth('desktop'); assert.equal(frame.style.width, '100%');
    assert.throws(() => ctl.setWidth('watch'));
});
