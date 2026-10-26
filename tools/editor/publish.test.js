const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const publisher = require('./publish');
const buildData = require('../build-data');
const store = require('./store');
const { makeRepoCopy, cleanup } = require('./test-helpers');

const NOW = () => new Date(2026, 10, 3, 9, 0, 0); // 2026/11/03

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
const readJson = (root, f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

// 暫存 repo + 暫存 bare remote（絕不碰真的 repo）
function makePublishRepo(t) {
    const root = makeRepoCopy();
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-remote-'));
    git(remote, 'init', '-q', '--bare', '-b', 'main');
    git(root, 'config', 'user.name', 'tester');
    git(root, 'config', 'user.email', 'tester@example.com');
    git(root, 'remote', 'add', 'origin', remote);
    git(root, 'push', '-q', '-u', 'origin', 'main');
    t.after(() => { cleanup(root); cleanup(remote); });
    return { root, remote };
}

// 模擬「已存檔」：改 trip／places、寫入磁碟（含產生檔），回傳可當 publish body 的內容
function saveEdit(root, edit) {
    const d = store.load(root);
    edit(d);
    store.save(root, d);
    return { trip: d.trip, places: d.places };
}
const diskBody = root => ({ trip: readJson(root, 'data/trip.json'), places: readJson(root, 'data/places.json') });
const commitCount = root => Number(git(root, 'rev-list', '--count', 'HEAD'));

test('plan：回報分支、下一個版本號（小版 +1、日期用當天）與預設 commit 訊息', t => {
    const { root } = makePublishRepo(t);
    const cur = readJson(root, 'data/trip.json').site.version.number;
    const [major, minor] = cur.slice(1).split('.').map(Number);
    const plan = publisher.plan(root, { now: NOW });
    assert.equal(plan.branch, 'main');
    assert.equal(plan.onMain, true);
    assert.equal(plan.version.current.number, cur);
    assert.deepEqual(plan.version.next, { number: `v${major}.${minor + 1}`, date: '2026/11/03' });
    assert.equal(plan.hasChanges, false);
    assert.match(plan.message, new RegExp(`^v${major}\\.${minor + 1}：`));
});

test('plan：與 HEAD 比對出哪幾天、哪些地點、住宿區有異動，並寫進預設訊息', t => {
    const { root } = makePublishRepo(t);
    const placeId = Object.keys(readJson(root, 'data/places.json'))[0];
    saveEdit(root, d => {
        d.trip.days[1].items.pop();
        d.places[placeId].name = '改過的名字';
        d.places.brand_new = { name: '新地點' };
        d.trip.hotels[0].note = '改過';
    });
    const plan = publisher.plan(root, { now: NOW });
    assert.equal(plan.hasChanges, true);
    assert.deepEqual(plan.changes.days.map(x => x.day), [2]);
    assert.deepEqual(plan.changes.places.map(x => [x.id, x.kind]).sort(), [[placeId, 'modified'], ['brand_new', 'added']].sort());
    assert.equal(plan.changes.hotels, true);
    assert.match(plan.message, /DAY 2/);
    assert.match(plan.message, /新地點/);
    assert.doesNotMatch(plan.message, /Co-Authored|Claude/i);
});

test('plan：缺少路線快取的路段只警告，不擋', t => {
    const { root } = makePublishRepo(t);
    const empty = { ...readJson(root, 'data/routes.json'), legs: {} };
    buildData.writeAtomic(root, { 'data/routes.json': JSON.stringify(empty, null, 2) + '\n', ...buildData.buildRoutes(empty) });
    const plan = publisher.plan(root, { now: NOW });
    assert.ok(plan.missingRoutes.length > 0);
});

test('publish 成功：新增一筆 commit（訊息原樣、無 AI 署名）、版本號 +1、產生檔同步、遠端收到 push', t => {
    const { root, remote } = makePublishRepo(t);
    const before = commitCount(root);
    const cur = readJson(root, 'data/trip.json').site.version.number;
    const [major, minor] = cur.slice(1).split('.').map(Number);
    const body = saveEdit(root, d => { d.trip.site.documentTitle = '發布測試標題'; });

    const result = publisher.publish(root, { ...body, message: '調整標題\n\n第二段說明' }, { now: NOW });

    assert.equal(result.version.number, `v${major}.${minor + 1}`);
    assert.equal(commitCount(root), before + 1);
    assert.equal(git(root, 'log', '-1', '--format=%B'), '調整標題\n\n第二段說明');
    assert.doesNotMatch(git(root, 'log', '-1', '--format=%B'), /Co-Authored|Claude|Generated with/i);
    const trip = readJson(root, 'data/trip.json');
    assert.deepEqual(trip.site.version, { number: `v${major}.${minor + 1}`, date: '2026/11/03' });
    assert.equal(trip.site.documentTitle, '發布測試標題');
    assert.match(fs.readFileSync(path.join(root, 'data/trip.js'), 'utf8'), new RegExp(`"number": "v${major}\\.${minor + 1}"`));
    execFileSync(process.execPath, ['tools/check.js'], { cwd: root, stdio: 'pipe' }); // 同步且通過
    assert.equal(git(root, 'status', '--porcelain', '--', 'data'), '');
    assert.equal(git(remote, 'rev-parse', 'main'), git(root, 'rev-parse', 'HEAD'));
    assert.deepEqual(result.steps.map(s => s.ok), result.steps.map(() => true));
    assert.ok(result.steps.some(s => /push/.test(s.name)));
});

function assertRejected(root, body, status, pattern, opts) {
    const before = commitCount(root);
    const head = git(root, 'rev-parse', 'HEAD');
    assert.throws(() => publisher.publish(root, body, { now: NOW, ...opts }), e => {
        assert.equal(e.status, status);
        if (pattern) assert.match(e.message, pattern);
        assert.ok(Array.isArray(e.steps));
        return true;
    });
    assert.equal(commitCount(root), before);
    assert.equal(git(root, 'rev-parse', 'HEAD'), head);
}

test('publish 拒絕：驗證有錯誤，且不 commit、不改版本號', t => {
    const { root } = makePublishRepo(t);
    const body = saveEdit(root, d => { d.trip.days[0].items[0].place = 'no-such-place'; });
    const ver = readJson(root, 'data/trip.json').site.version;
    assertRejected(root, { ...body, message: 'x' }, 422, /驗證/);
    assert.deepEqual(readJson(root, 'data/trip.json').site.version, ver);
});

test('publish 拒絕：記憶體內容與磁碟不同（有未存檔）', t => {
    const { root } = makePublishRepo(t);
    const body = diskBody(root);
    body.trip.site.documentTitle = '還沒存檔';
    assertRejected(root, { ...body, message: 'x' }, 409, /未存檔/);
});

test('publish 拒絕：路線快取草稿與磁碟不同（算了還沒存檔）；相同則放行', t => {
    const { root } = makePublishRepo(t);
    const disk = readJson(root, 'data/routes.json');
    const key = [...require('../routing/cache').usedKeys(readJson(root, 'data/trip.json'), readJson(root, 'data/places.json'))][0];
    const draft = JSON.parse(JSON.stringify(disk));
    draft.legs[key] = { distance: 1000, duration: 60, geometry: 'abc' }; // 算好了，但還沒存檔
    assertRejected(root, { ...diskBody(root), message: 'x' }, 409, /路線/, { routes: draft });
    const same = publisher.publish(root, { ...diskBody(root), message: 'ok' }, { now: NOW, routes: JSON.parse(JSON.stringify(disk)) });
    assert.equal(same.ok, true);
});

test('publish 拒絕：tools/check.js 失敗（產生檔與 JSON 不同步）', t => {
    const { root } = makePublishRepo(t);
    const body = diskBody(root);
    fs.appendFileSync(path.join(root, 'data/trip.js'), '// 手改\n');
    assertRejected(root, { ...body, message: 'x' }, 422, /check\.js/);
});

test('publish 拒絕：不在 main 回 409', t => {
    const { root } = makePublishRepo(t);
    git(root, 'checkout', '-q', '-b', 'feature');
    assertRejected(root, { ...diskBody(root), message: 'x' }, 409, /main/);
    assert.equal(publisher.plan(root, { now: NOW }).onMain, false);
});

test('publish 拒絕：commit 訊息是空的回 400；沒帶 trip／places 回 400', t => {
    const { root } = makePublishRepo(t);
    assertRejected(root, { ...diskBody(root), message: '   ' }, 400, /訊息/);
    assertRejected(root, { message: 'x' }, 400, /trip/);
});

function cloneAndPush(remote) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-other-'));
    git(dir, 'clone', '-q', remote, 'w');
    const w = path.join(dir, 'w');
    git(w, 'config', 'user.name', 'other');
    git(w, 'config', 'user.email', 'other@example.com');
    fs.writeFileSync(path.join(w, 'other.txt'), 'x\n');
    git(w, 'add', 'other.txt');
    git(w, 'commit', '-q', '-m', 'other');
    git(w, 'push', '-q', 'origin', 'main');
    return dir;
}

test('push 失敗（non-fast-forward）：回錯誤、不重試、不 --force、本機 commit 保留', t => {
    const { root, remote } = makePublishRepo(t);
    const other = cloneAndPush(remote); // 另一個人先推了一筆
    t.after(() => cleanup(other));
    const remoteHead = git(remote, 'rev-parse', 'main');

    const before = commitCount(root);
    const body = saveEdit(root, d => { d.trip.site.documentTitle = '會被擋的發布'; });
    assert.throws(() => publisher.publish(root, { ...body, message: '會推不上去' }, { now: NOW }), e => {
        assert.equal(e.status, 502);
        const last = e.steps[e.steps.length - 1];
        assert.match(last.name, /push/);
        assert.equal(last.ok, false);
        assert.match(last.output, /rejected|non-fast-forward|fetch first/);
        return true;
    });
    assert.equal(commitCount(root), before + 1);
    assert.equal(git(root, 'log', '-1', '--format=%s'), '會推不上去');
    assert.equal(git(remote, 'rev-parse', 'main'), remoteHead);
});

test('HTTP：GET /api/publish/plan 與 POST /api/publish', async t => {
    const { root, remote } = makePublishRepo(t);
    const { createServer } = require('./server');
    const server = createServer({ root });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (p, method, body) => fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })
        .then(async r => ({ status: r.status, body: await r.json() }));

    const plan = await call('/api/publish/plan', 'GET');
    assert.equal(plan.status, 200);
    assert.equal(plan.body.branch, 'main');

    const body = saveEdit(root, d => { d.trip.site.documentTitle = '透過 HTTP 發布'; });
    const bad = await call('/api/publish', 'POST', { ...body, message: '' });
    assert.equal(bad.status, 400);
    assert.ok(Array.isArray(bad.body.steps));
    const ok = await call('/api/publish', 'POST', { ...body, message: 'HTTP 發布' });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.steps.length >= 5);
    assert.equal(git(remote, 'log', '-1', '--format=%s', 'main'), 'HTTP 發布');
});
