// 「還原到上次發布」：node --test tools/editor/discard.test.js
// 全部在暫存 git repo 內進行（makeRepoCopy），不動真的 data/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const discard = require('./discard');
const { createServer } = require('./server');
const cache = require('../routing/cache');
const { makeRepoCopy, cleanup } = require('./test-helpers');

const FAKE_LEG = { distance: 1, duration: 2, geometry: 'g', provider: 'fake', computedAt: '2026-10-26' };
const read = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const status = root => git(root, 'status', '--porcelain', '--', 'data/');
const backups = root => {
    const dir = path.join(root, '.git', 'editor-backups');
    return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
};
let seq = 0;

// 模擬「存檔但沒發布」：改一天的標題，並多一段路線快取（routes.json 與兩個產生檔都會變）
function dirty(root) {
    const f = path.join(root, 'data/trip.json');
    const trip = JSON.parse(fs.readFileSync(f, 'utf8'));
    trip.days[0].title += `（改${++seq}）`;
    fs.writeFileSync(f, JSON.stringify(trip, null, 2) + '\n');
    const routes = cache.read(root);
    routes.legs[`121.${String(seq).padStart(5, '0')},24.00000>121.10000,24.10000`] = FAKE_LEG;
    cache.write(root, routes);
}
const repo = t => { const root = makeRepoCopy(); t.after(() => cleanup(root)); return root; };

test('plan：沒有異動時 hasChanges 是 false，files 是空的', t => {
    const root = repo(t);
    const p = discard.plan(root);
    assert.equal(p.hasChanges, false);
    assert.deepEqual(p.files, []);
    assert.equal(p.branch, 'main');
});

test('plan：列出有異動的檔案與異動摘要（哪一天、路線幾段）', t => {
    const root = repo(t);
    dirty(root);
    const p = discard.plan(root);
    assert.equal(p.hasChanges, true);
    assert.deepEqual(p.files.sort(), ['data/routes-geo.js', 'data/routes.js', 'data/routes.json', 'data/trip.json']);
    assert.deepEqual(p.changes.days.map(d => d.day), [1]);
    assert.equal(p.changes.routes.added, 1);
});

test('plan：磁碟上的 JSON 壞掉時仍能回報有異動（changes 為 null），好讓使用者還原', t => {
    const root = repo(t);
    fs.writeFileSync(path.join(root, 'data/trip.json'), '{ 壞掉');
    const p = discard.plan(root);
    assert.equal(p.hasChanges, true);
    assert.equal(p.changes, null);
});

test('run：把 data 底下的檔案還原成 HEAD，逐位元組相同，git status 乾淨', t => {
    const root = repo(t);
    const before = Object.fromEntries(discard.FILES.map(f => [f, read(root, f)]));
    dirty(root);
    assert.notEqual(read(root, 'data/trip.json'), before['data/trip.json']);
    const res = discard.run(root);
    assert.equal(res.ok, true);
    for (const f of discard.FILES) assert.equal(read(root, f), before[f], f);
    assert.equal(status(root), '');
});

test('run：先把修改存成 patch 備份（放在 .git/editor-backups/），而且 patch 能把修改套回來', t => {
    const root = repo(t);
    dirty(root);
    const changed = read(root, 'data/trip.json');
    const res = discard.run(root);
    assert.equal(backups(root).length, 1);
    assert.equal(path.basename(res.backup), backups(root)[0]);
    assert.equal(res.recoverable, true);
    assert.match(res.applyCommand, /git apply/);
    git(root, 'apply', res.backup);
    assert.equal(read(root, 'data/trip.json'), changed);
});

test('run：沒有異動時回 409，也不產生備份', t => {
    const root = repo(t);
    assert.throws(() => discard.run(root), e => e.status === 409 && /沒有/.test(e.message));
    assert.deepEqual(backups(root), []);
});

test('run：已經 git add 的修改（暫存區）也一併還原', t => {
    const root = repo(t);
    dirty(root);
    git(root, 'add', 'data/');
    discard.run(root);
    assert.equal(status(root), '');
});

test('run：只動資料檔；其他檔案（例如 verify.md）的修改原封不動', t => {
    const root = repo(t);
    fs.appendFileSync(path.join(root, 'verify.md'), '\n手改一行\n');
    dirty(root);
    discard.run(root);
    assert.match(read(root, 'verify.md'), /手改一行/);
    assert.equal(git(root, 'status', '--porcelain').trim(), 'M verify.md');
});

test('run：任何分支都允許（還原成目前分支的 HEAD）', t => {
    const root = repo(t);
    git(root, 'checkout', '-q', '-b', 'feat');
    dirty(root);
    assert.equal(discard.plan(root).branch, 'feat');
    assert.equal(discard.run(root).ok, true);
    assert.equal(status(root), '');
});

test('run：備份只留最近 20 份，刪掉最舊的', t => {
    const root = repo(t);
    let n = 0;
    const now = () => new Date(2026, 9, 26, 10, 0, n++);
    const names = [];
    for (let i = 0; i < 22; i++) { dirty(root); names.push(path.basename(discard.run(root, { now }).backup)); }
    const left = backups(root);
    assert.equal(left.length, 20);
    assert.deepEqual(left, names.slice(2));
});

test('run：備份寫不進去就不還原（修改還在）', t => {
    const root = repo(t);
    dirty(root);
    fs.writeFileSync(path.join(root, '.git', 'editor-backups'), '擋住目錄');   // 讓 mkdir 失敗
    const changed = read(root, 'data/trip.json');
    assert.throws(() => discard.run(root), e => e.status === 500 && /備份/.test(e.message));
    assert.equal(read(root, 'data/trip.json'), changed);
});

// ───── HTTP API ─────
async function withServer(t) {
    const root = repo(t);
    const provider = { name: 'fake', route: async () => ({ distance: 111, duration: 222, geometry: 'geo' }) };
    const server = createServer({ root, provider });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => server.close());
    return { root, base: `http://127.0.0.1:${server.address().port}` };
}
const call = (base, p, method, headers = {}, body) => fetch(base + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) })
    .then(async r => ({ status: r.status, body: await r.json() }));
const OK = { 'x-requested-with': 'trip-editor' };

test('GET /api/discard/plan 與 POST /api/discard：還原後，記憶體裡算好但沒存檔的路線也一併回到 HEAD', async t => {
    const { root, base } = await withServer(t);
    const headRoutes = (await call(base, '/api/routes', 'GET')).body;
    assert.equal(headRoutes.unsaved, false);

    // 編輯器算了一段新路線（只在記憶體草稿），同時磁碟上也有已存檔的修改
    const from = { lat: 24.0, lng: 121.0 }, to = { lat: 24.1, lng: 121.1 };
    const key = require('../../js/model').legKey(from, to);
    const computed = await call(base, '/api/routes/compute', 'POST', {}, { legs: [{ key, from, to }] });
    assert.equal(computed.body.results[key].status, 'ok');
    assert.equal((await call(base, '/api/routes', 'GET')).body.unsaved, true);
    dirty(root);

    const plan = await call(base, '/api/discard/plan', 'GET');
    assert.equal(plan.status, 200);
    assert.equal(plan.body.hasChanges, true);

    const res = await call(base, '/api/discard', 'POST', OK);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(status(root), '');
    assert.deepEqual((await call(base, '/api/routes', 'GET')).body, headRoutes);   // 沒有那一段，也不再是「未存檔」
    assert.equal((await call(base, '/api/discard/plan', 'GET')).body.hasChanges, false);
});

test('POST /api/discard：沒有 X-Requested-With 標頭回 403，不還原（避免其他網頁用表單或 no-cors 請求觸發）', async t => {
    const { root, base } = await withServer(t);
    dirty(root);
    const res = await call(base, '/api/discard', 'POST');
    assert.equal(res.status, 403);
    assert.notEqual(status(root), '');
    assert.deepEqual(backups(root), []);
});

test('POST /api/discard：沒有異動時回 409', async t => {
    const { base } = await withServer(t);
    const res = await call(base, '/api/discard', 'POST', OK);
    assert.equal(res.status, 409);
});
