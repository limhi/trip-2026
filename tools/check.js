#!/usr/bin/env node
/*
 * 一鍵檢查（只需要 Node，不需要安裝套件）：
 *   node tools/check.js
 *
 * 檢查項目
 *   0. data/*.js 與 data/*.json 同步（tools/build-data.js 重新產生的結果要與檔案完全相同）
 *   1. data/places.js、data/trip.js 能載入，且 Trip.model.validate() 沒有問題
 *   2. 座標落在台灣範圍內、有地圖標記的地點都有座標
 *   3. reference/guides.js：每個景點 id 都在 places.js 裡；來源編號存在；顯示的文字沒有開發用語
 *   4. reference/guides.md 與 guides.js 的文字沒有偏離（guides.js 的每一句都要出現在 guides.md）
 *   5. verify.md：題號連續、總覽表與題目一致、狀態統計正確、每題都有選項
 *   6. 所有受版控檔案：UTF-8、無 BOM、無 U+FFFD、無 CRLF
 *   7. 版本號格式
 * 有任何問題會列出並以非 0 結束。這不能取代瀏覽器實測（見 docs/DESIGN.md 的「驗證方法」）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const problems = [];
const fail = msg => problems.push(msg);
const info = [];

// ───────── 0. 產生檔與資料來源同步 ─────────
let generated = {};
try { generated = require('./build-data').build(); }
catch (e) { fail(`無法由 data/*.json 產生資料檔：${e.message}`); }
for (const [f, expected] of Object.entries(generated)) {
    let actual = null;
    try { actual = read(f); } catch (e) { fail(`${f} 讀不到：${e.message}（請執行 node tools/build-data.js）`); continue; }
    if (actual !== expected) fail(`${f} 與 JSON 資料來源不同步：請執行 node tools/build-data.js（不要手改產生檔）`);
}

// ───────── 1. 載入資料並執行頁面使用的同一套檢查 ─────────
const ctx = { window: {}, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['data/places.js', 'data/trip.js', 'js/model.js']) {
    try { vm.runInContext(read(f), ctx, { filename: f }); }
    catch (e) { fail(`${f} 無法載入：${e.message}`); }
}
const TRIP = ctx.window.TRIP, PLACES = ctx.window.TRIP_PLACES, model = ctx.window.Trip && ctx.window.Trip.model;
if (TRIP && PLACES && model) {
    model.validate(TRIP, PLACES).forEach(e => fail(`資料檢查：${e}`));
    info.push(`行程 ${TRIP.days.length} 天、地點 ${Object.keys(PLACES).length} 個、住宿 ${TRIP.hotels.length} 間`);

    // ───────── 2. 座標 ─────────
    for (const [id, p] of Object.entries(PLACES)) {
        if (p.lat == null && p.lng == null) continue;
        if (p.lat == null || p.lng == null) { fail(`${id}：只有 lat 或 lng 其中一個`); continue; }
        if (!(p.lat > 21.8 && p.lat < 25.4 && p.lng > 119.9 && p.lng < 122.1)) fail(`${id}：座標 ${p.lat},${p.lng} 不在台灣範圍內（可能打錯或顛倒）`);
    }
    // 版本號
    const v = TRIP.site && TRIP.site.version;
    if (!v || !/^v\d+\.\d+$/.test(v.number) || !/^\d{4}\/\d{2}\/\d{2}$/.test(v.date)) fail('site.version 格式應為 { number: "v1.5", date: "2026/10/17" }');
    else info.push(`版本 ${v.number} · ${v.date}`);
}

// ───────── 3. guides.js ─────────
let guides = null;
try {
    const g = { window: {} };
    vm.createContext(g);
    vm.runInContext(read('reference/guides.js'), g, { filename: 'reference/guides.js' });
    guides = g.window.TRIP_GUIDES;
} catch (e) { fail(`reference/guides.js 無法載入：${e.message}`); }
const SECTION_KEYS = ['highlights', 'kidTips', 'ticketing', 'transport', 'cautions', 'conflicts'];
const JARGON = /places\.js|trip\.js|data\/places|專案資料|專案座標|專案行程/;
if (guides && PLACES) {
    info.push(`攻略 ${Object.keys(guides).length} 個景點`);
    for (const [id, g] of Object.entries(guides)) {
        if (!PLACES[id]) fail(`guides.js：「${id}」不在 data/places.js`);
        const srcNums = new Set((g.sources || []).map(s => s.n));
        for (const k of SECTION_KEYS) {
            for (const item of g[k] || []) {
                if (typeof item.t !== 'string' || !item.t) fail(`guides.js ${id}.${k}：有項目沒有文字 t`);
                (item.src || []).forEach(n => { if (!srcNums.has(n)) fail(`guides.js ${id}.${k}：引用了不存在的來源 [${n}]`); });
                if (!item.hidden && JARGON.test(item.t || '')) fail(`guides.js ${id}.${k}：顯示文字含開發用語：${item.t.slice(0, 40)}…`);
            }
        }
    }
    // ───────── 4. guides.js 與 guides.md 同步 ─────────
    const md = read('reference/guides.md');
    let drift = 0;
    for (const [id, g] of Object.entries(guides)) {
        for (const k of SECTION_KEYS) for (const item of g[k] || []) {
            if (item.t && !md.includes(item.t)) { if (drift++ < 5) fail(`guides.md 與 guides.js 不同步（${id}.${k}）：${item.t.slice(0, 40)}…`); }
        }
    }
    if (drift > 5) fail(`…另外還有 ${drift - 5} 句不同步`);
}

// ───────── 5. verify.md ─────────
if (fs.existsSync(path.join(root, 'verify.md'))) {
    const v = read('verify.md');
    const heads = [...v.matchAll(/^### Q(\d+)｜/gm)].map(m => +m[1]);
    const rows = [...v.matchAll(/^\| \[Q(\d+)\]\(#q\d+\) \|.*\| (⏳|✅) \|$/gm)].map(m => ({ n: +m[1], s: m[2] }));
    if (!heads.length) fail('verify.md 找不到任何題目（### Q1｜…）');
    heads.forEach((n, i) => { if (n !== i + 1) fail(`verify.md 題號不連續：第 ${i + 1} 個題目是 Q${n}`); });
    if (rows.length !== heads.length) fail(`verify.md 總覽表有 ${rows.length} 列，但有 ${heads.length} 個題目`);
    // 狀態：總覽表、題目內文、統計行要一致
    heads.forEach((n, i) => {
        const start = v.indexOf(`### Q${n}｜`);
        const end = i + 1 < heads.length ? v.indexOf(`### Q${heads[i + 1]}｜`) : v.indexOf('\n---\n', start);
        const block = v.slice(start, end < 0 ? undefined : end);
        const blockDone = block.includes('✅ 已確認');
        const row = rows.find(r => r.n === n);
        if (row && (row.s === '✅') !== blockDone) fail(`verify.md Q${n}：總覽表與題目內文的狀態不一致`);
        if (!/\n\*\*選項\*\*\n\n1\. /.test(block)) fail(`verify.md Q${n}：沒有編號選項`);
    });
    const done = rows.filter(r => r.s === '✅').length;
    const m = v.match(/共 (\d+) 題：(\d+) 題已確認 ✅、(\d+) 題待確認 ⏳/);
    const allPending = v.match(/共 (\d+) 題，全部 ⏳ 待確認/);
    if (m) { if (+m[1] !== heads.length || +m[2] !== done || +m[3] !== heads.length - done) fail(`verify.md 開頭統計（${m[0]}）與實際（共 ${heads.length}、已確認 ${done}）不符`); }
    else if (allPending) { if (done !== 0) fail('verify.md 開頭寫「全部待確認」，但已有題目標成 ✅'); }
    else fail('verify.md 找不到開頭的題數統計行');
    info.push(`確認清單 ${heads.length} 題，已確認 ${done}、待確認 ${heads.length - done}`);
}

// ───────── 6. 編碼 ─────────
let files = [];
try { files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean); } catch (e) { /* 沒有 git 就略過 */ }
const TEXT = /\.(md|js|html|css|json|txt)$/;
for (const f of files.filter(f => TEXT.test(f))) {
    const buf = fs.readFileSync(path.join(root, f));
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) fail(`${f}：有 BOM（應為 UTF-8 無 BOM）`);
    if (buf.includes('\r\n')) fail(`${f}：含 CRLF 換行（應為 LF）`);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (text.includes('\uFFFD')) fail(`${f}：含 U+FFFD 取代字元（可能已經亂碼）`);
}
info.push(`編碼檢查 ${files.filter(f => TEXT.test(f)).length} 個檔案`);

// ───────── 結果 ─────────
info.forEach(l => console.log('·', l));
if (problems.length) {
    console.log(`\n✗ 發現 ${problems.length} 個問題：`);
    problems.forEach(p => console.log('  -', p));
    process.exit(1);
}
console.log('\n✓ 全部通過（這不包含瀏覽器實測，見 docs/DESIGN.md）');
