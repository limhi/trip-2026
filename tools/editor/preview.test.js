const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { createServer } = require('./server');
const { makeRepoCopy, cleanup } = require('./test-helpers');

async function withServer(t) {
    const root = makeRepoCopy();
    const server = createServer({ root });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => { server.close(); cleanup(root); });
    return { root, base: `http://127.0.0.1:${server.address().port}`, port: server.address().port };
}
const text = async (base, p) => { const r = await fetch(base + p); return { status: r.status, type: r.headers.get('content-type'), body: await r.text() }; };
const postDraft = (base, body) => fetch(base + '/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const loadData = async base => (await fetch(base + '/api/data')).json();
const rawStatus = (port, p) => new Promise(res => http.get({ host: '127.0.0.1', port, path: p }, x => { x.resume(); res(x.statusCode); }));

test('沒有草稿時，/preview/* 回磁碟檔', async t => {
    const { base, root } = await withServer(t);
    for (const f of ['index.html', 'data/trip.js', 'data/places.js', 'js/model.js']) {
        const r = await text(base, '/preview/' + f);
        assert.equal(r.status, 200, f);
        assert.equal(r.body, fs.readFileSync(path.join(root, f), 'utf8'), f);
    }
    assert.match((await text(base, '/preview/index.html')).type, /text\/html/);
    assert.match((await text(base, '/preview/data/trip.js')).type, /javascript/);
    assert.equal((await text(base, '/preview/')).body, fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
    assert.equal((await text(base, '/preview/no-such-file.js')).status, 404);
});

test('送草稿後，/preview/data/trip.js 與 places.js 回草稿內容，真檔不受影響', async t => {
    const { base, root } = await withServer(t);
    const d = await loadData(base);
    const diskTrip = fs.readFileSync(path.join(root, 'data/trip.js'), 'utf8');
    const diskPlaces = fs.readFileSync(path.join(root, 'data/places.js'), 'utf8');
    d.trip.site.documentTitle = '草稿標題 XYZ';
    const firstId = Object.keys(d.places)[0];
    d.places[firstId].name = '草稿地點 XYZ';

    const r = await postDraft(base, { trip: d.trip, places: d.places });
    assert.equal(r.status, 200);

    assert.match((await text(base, '/preview/data/trip.js')).body, /草稿標題 XYZ/);
    assert.match((await text(base, '/preview/data/places.js')).body, /草稿地點 XYZ/);
    // 其餘檔案仍回磁碟
    assert.equal((await text(base, '/preview/js/model.js')).body, fs.readFileSync(path.join(root, 'js/model.js'), 'utf8'));
    // 真檔不受影響
    assert.equal(fs.readFileSync(path.join(root, 'data/trip.js'), 'utf8'), diskTrip);
    assert.equal(fs.readFileSync(path.join(root, 'data/places.js'), 'utf8'), diskPlaces);
});

test('草稿用與存檔相同的產生器格式（與 build-data 輸出逐字相同）', async t => {
    const { base } = await withServer(t);
    const d = await loadData(base);
    d.trip.site.documentTitle = '格式檢查';
    await postDraft(base, { trip: d.trip, places: d.places });
    const expected = require('../build-data').buildFrom({ trip: d.trip, places: d.places });
    assert.equal((await text(base, '/preview/data/trip.js')).body, expected['data/trip.js']);
    assert.equal((await text(base, '/preview/data/places.js')).body, expected['data/places.js']);
});

test('草稿不寫入磁碟：git status 沒有變化', async t => {
    const { base, root } = await withServer(t);
    const d = await loadData(base);
    d.trip.site.documentTitle = '不該落地';
    await postDraft(base, { trip: d.trip, places: d.places });
    await text(base, '/preview/data/trip.js');
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root }).toString(), '');
});

test('後送的草稿取代先前的草稿', async t => {
    const { base } = await withServer(t);
    const d = await loadData(base);
    for (const title of ['第一版', '第二版']) {
        d.trip.site.documentTitle = title;
        await postDraft(base, { trip: d.trip, places: d.places });
    }
    const body = (await text(base, '/preview/data/trip.js')).body;
    assert.match(body, /第二版/);
    assert.doesNotMatch(body, /第一版/);
});

test('草稿格式錯誤回 400，且不影響既有預覽', async t => {
    const { base, root } = await withServer(t);
    for (const bad of [{}, { trip: {} }, { trip: [], places: {} }, { trip: {}, places: 'x' }]) {
        assert.equal((await postDraft(base, bad)).status, 400, JSON.stringify(bad));
    }
    const r = await fetch(base + '/api/draft', { method: 'POST', body: '{壞掉' });
    assert.equal(r.status, 400);
    assert.equal((await text(base, '/preview/data/trip.js')).body, fs.readFileSync(path.join(root, 'data/trip.js'), 'utf8'));
});

test('/preview 不能讀到 repo 以外、.git 或隱藏目錄', async t => {
    const { base, port } = await withServer(t);
    assert.equal(await rawStatus(port, '/preview/..%2ftools%2feditor%2fserver.js'), 404);
    assert.equal(await rawStatus(port, '/preview/%2e%2e/%2e%2e/etc/passwd'), 404);
    assert.equal((await text(base, '/preview/.git/HEAD')).status, 404);
    assert.equal((await text(base, '/preview/.git/config')).status, 404);
});
