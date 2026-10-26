// node --test tools/editor/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const store = require('./store');
const { makeRepoCopy, cleanup } = require('./test-helpers');

const read = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');
const check = root => execFileSync('node', ['tools/check.js'], { cwd: root, stdio: 'pipe' });

function withRepo(fn) {
    return async t => {
        const root = makeRepoCopy();
        t.after(() => cleanup(root));
        await fn(root, t);
    };
}

test('load：回傳兩份 JSON 與 mtimes', withRepo(root => {
    const d = store.load(root);
    assert.ok(d.trip.site.version.number);
    assert.ok(Object.keys(d.places).length > 0);
    assert.equal(typeof d.mtimes.trip, 'number');
    assert.equal(typeof d.mtimes.places, 'number');
}));

test('save：改一個欄位後 JSON 內容正確、格式固定，data/*.js 同步，check.js 通過', withRepo(root => {
    const d = store.load(root);
    const firstId = Object.keys(d.places)[0];
    d.places[firstId].name = '改過的名稱「測試」';
    const res = store.save(root, d);
    assert.deepEqual(Object.keys(res.mtimes), ['trip', 'places']);

    const text = read(root, 'data/places.json');
    assert.equal(text, JSON.stringify(JSON.parse(text), null, 2) + '\n');
    assert.ok(!text.includes('\r'));
    assert.notEqual(text.charCodeAt(0), 0xFEFF);
    assert.equal(JSON.parse(text)[firstId].name, '改過的名稱「測試」');
    assert.deepEqual(Object.keys(JSON.parse(text)), Object.keys(d.places), 'key 順序保留');
    assert.ok(read(root, 'data/places.js').includes('改過的名稱「測試」'));
    check(root); // 結束碼非 0 會丟錯
}));

test('save：成功後回傳的 mtimes 可以直接再存一次', withRepo(root => {
    const d = store.load(root);
    const res = store.save(root, d);
    store.save(root, { ...d, mtimes: res.mtimes });
}));

test('save：磁碟檔案比 mtimes 新時丟 409 且不寫入', withRepo(root => {
    const d = store.load(root);
    const before = { trip: read(root, 'data/trip.json'), places: read(root, 'data/places.json'), js: read(root, 'data/trip.js') };
    // 外部程式改了 trip.json
    const external = JSON.parse(before.trip);
    external.site.documentTitle = '外部修改';
    fs.writeFileSync(path.join(root, 'data/trip.json'), JSON.stringify(external, null, 2) + '\n');
    const externalText = read(root, 'data/trip.json');
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(root, 'data/trip.json'), future, future);

    d.places[Object.keys(d.places)[0]].name = '編輯器的修改';
    assert.throws(() => store.save(root, d), e => e.status === 409 && /trip/.test(e.message));
    assert.equal(read(root, 'data/trip.json'), externalText);
    assert.equal(read(root, 'data/places.json'), before.places);
    assert.equal(read(root, 'data/trip.js'), before.js);
}));

test('save：產生 data/*.js 失敗時不留下半套檔案', withRepo(root => {
    const d = store.load(root);
    const files = ['data/trip.json', 'data/places.json', 'data/trip.js', 'data/places.js'];
    const before = files.map(f => read(root, f));
    d.trip.site.documentTitle = '不該被寫入';
    const boom = () => { throw new Error('build 失敗'); };
    assert.throws(() => store.save(root, d, { buildFrom: boom }), /build 失敗/);
    assert.deepEqual(files.map(f => read(root, f)), before);
    assert.deepEqual(fs.readdirSync(path.join(root, 'data')).filter(f => f.endsWith('.tmp')), []);
}));

test('save：寫入途中失敗（rename 前）不留下暫存檔與半套檔案', withRepo(root => {
    const d = store.load(root);
    const files = ['data/trip.json', 'data/places.json', 'data/trip.js', 'data/places.js'];
    const before = files.map(f => read(root, f));
    d.trip.site.documentTitle = '不該被寫入';
    // 讓最後一個暫存檔無法建立（前面已建好的要被清掉）：同名目錄佔位
    fs.mkdirSync(path.join(root, 'data/places.json.tmp'));
    assert.throws(() => store.save(root, d));
    fs.rmdirSync(path.join(root, 'data/places.json.tmp'));
    assert.deepEqual(files.map(f => read(root, f)), before);
    assert.deepEqual(fs.readdirSync(path.join(root, 'data')).filter(f => f.endsWith('.tmp')), []);
}));

test('save：body 缺欄位丟 400', withRepo(root => {
    assert.throws(() => store.save(root, { trip: {}, places: {} }), e => e.status === 400);
    assert.throws(() => store.save(root, { trip: {}, mtimes: { trip: 1, places: 1 } }), e => e.status === 400);
}));

test('save：mtimes 缺值或不是數字時丟 400，不能繞過衝突檢查', withRepo(root => {
    const d = store.load(root);
    for (const mtimes of [{}, { trip: d.mtimes.trip }, { trip: '1', places: '1' }, { trip: null, places: null }]) {
        assert.throws(() => store.save(root, { ...d, mtimes }), e => e.status === 400, JSON.stringify(mtimes));
    }
}));

test('save：只有 places.json 被外部改過也回 409', withRepo(root => {
    const d = store.load(root);
    const file = path.join(root, 'data/places.json');
    const later = new Date(Date.now() + 5000); fs.utimesSync(file, later, later);
    assert.throws(() => store.save(root, d), e => e.status === 409 && /places/.test(e.message));
}));

test('save：寫入順序是 JSON 在前、data/*.js 在後', withRepo((root, t) => {
    const d = store.load(root);
    const buildData = require('../build-data');
    const stub = t.mock.method(buildData, 'writeAtomic', () => {});
    store.save(root, d);
    assert.deepEqual(Object.keys(stub.mock.calls[0].arguments[1]), ['data/trip.json', 'data/places.json', 'data/trip.js', 'data/places.js']);
}));
