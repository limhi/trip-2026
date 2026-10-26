// node --test tools/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const { render, HEADER, TARGETS } = require('./build-data');

// vm 內的物件 prototype 與本 realm 不同，經 JSON 轉回本 realm 再比對
const load = src => { const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(src, ctx); return JSON.parse(JSON.stringify(ctx.window)); };

// 刻意用非字母序的 key，驗證順序被保留
const sample = { site: { z: 1, a: '中文「引號」\'單引號\'', n: null }, list: [{ b: 2, a: 1 }, 'x'], b: true };

test('產生的檔案載入後與來源 deep-equal，且 key 順序相同', () => {
    const win = load(render('TRIP', sample));
    assert.deepEqual(win.TRIP, sample);
    assert.equal(JSON.stringify(win.TRIP), JSON.stringify(sample));
});

test('window 名稱依參數決定', () => {
    assert.deepEqual(load(render('TRIP_PLACES', sample)).TRIP_PLACES, sample);
});

test('格式：固定檔頭、縮排 4 空格、LF、無 BOM、結尾換行', () => {
    const out = render('TRIP', sample);
    assert.ok(out.startsWith(HEADER));
    assert.match(HEADER, /本檔由 tools\/build-data\.js 從 \*\.json 產生，請勿手改/);
    assert.ok(out.includes('\n    "site": {\n        "z": 1,'));
    assert.ok(out.endsWith('};\n'));
    assert.ok(!out.includes('\r'));
    assert.notEqual(out.charCodeAt(0), 0xFEFF);
});

test('真實資料：data/*.json 經產生器載入後與來源相同', () => {
    const fs = require('fs'), path = require('path');
    for (const { json, name } of TARGETS) {
        const src = JSON.parse(fs.readFileSync(path.join(__dirname, '..', json), 'utf8'));
        const win = load(render(name, src));
        assert.equal(JSON.stringify(win[name]), JSON.stringify(src), json);
    }
});

test('重複執行輸出相同', () => {
    assert.equal(render('TRIP', sample), render('TRIP', sample));
});
