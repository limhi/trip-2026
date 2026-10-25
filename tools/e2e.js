#!/usr/bin/env node
/*
 * 瀏覽器端到端測試（Playwright）：實際開頁面、點彈窗、展開地圖，確認行為沒壞。
 *   node tools/e2e.js
 *
 * 需求：Node、Playwright（npm 套件）、Chromium。
 * 這個專案的雲端沙箱用法：
 *   PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright \
 *   CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
 *   node tools/e2e.js
 *
 * 可選環境變數
 *   MARKED_JS     本機 marked@12.0.2 的 marked.min.js（npm install marked@12.0.2）。
 *                 沒給的話只測 verify.html 的「轉換失敗備援」，不測正常轉換。
 *   TAILWIND_CSS  本機用 tailwindcss@3.4.17 編譯好的 CSS。給了才會量導覽列在各種寬度下有沒有溢出。
 *                 （沙箱連不到 Tailwind CDN，不給的話頁面沒有樣式，只能測行為，不能測版面。）
 *
 * 做法：自己起一個 Node 靜態伺服器（不用 python／pkill），放行本機請求、中止所有外部請求，
 * 並在頁面載入前用 addInitScript 放一個假的 window.L（Leaflet）。
 * 不要改成「route 回傳假的 leaflet.js」：頁面有 SRI integrity，內容不符會被瀏覽器擋掉，
 * 結果地圖按鈕被程式整個移除，測試會以為地圖壞了。
 * 它不測：真實的 Font Awesome 圖示、Leaflet 真實地圖、Tailwind 真實外觀（要請人在真實裝置看）。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch (e) { console.error('找不到 Playwright。請 npm install playwright，或設定 PLAYWRIGHT_MODULE=<路徑>。\n', e.message); process.exit(2); }

// ───────── 載入資料（用來算「應該要看到什麼」）─────────
const ctx = { window: {}, console }; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['data/places.js', 'data/trip.js', 'js/model.js']) vm.runInContext(read(f), ctx, { filename: f });
const { TRIP, TRIP_PLACES: PLACES } = ctx.window;
const model = ctx.window.Trip.model;
const gctx = { window: {} }; vm.createContext(gctx); vm.runInContext(read('reference/guides.js'), gctx);
const GUIDES = gctx.window.TRIP_GUIDES;
const JARGON = /places\.js|trip\.js|data\/places|專案資料|專案座標|專案行程/;

// ───────── 靜態伺服器 ─────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});

// 假的 Leaflet：記錄標記數與路線點數，供測試檢查
const LEAFLET_STUB = () => {
    const chain = { addTo() { return this; }, bindPopup() { return this; } };
    window.__map = { markers: 0, poly: null };
    Object.defineProperty(window, 'L', {
        configurable: true, set() {},
        get() {
            return {
                map() { return { fitBounds() {}, invalidateSize() {} }; },
                tileLayer() { return chain; }, divIcon(o) { return o; },
                marker() { window.__map.markers++; return chain; },
                polyline(pts) { window.__map.poly = pts; return chain; },
                control: { scale() { return chain; } }
            };
        }
    });
};

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
// 每個測試區塊獨立執行：出例外就記成一項失敗並繼續，不要讓一個壞掉的項目擋住其他結果
async function guard(label, fn) {
    try { await fn(); }
    catch (e) { check(label + ' 執行時發生例外', false, String((e && e.message) || e).split('\n')[0]); }
}

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
    const markedJs = process.env.MARKED_JS && fs.existsSync(process.env.MARKED_JS) ? fs.readFileSync(process.env.MARKED_JS, 'utf8') : null;
    const tailwindCss = process.env.TAILWIND_CSS && fs.existsSync(process.env.TAILWIND_CSS) ? fs.readFileSync(process.env.TAILWIND_CSS, 'utf8') : null;

    async function newPage(opts = {}) {
        const page = await browser.newPage({ viewport: opts.viewport || { width: 390, height: 800 } });
        page.errors = [];
        page.on('pageerror', e => page.errors.push(String(e)));
        if (opts.stubLeaflet !== false) await page.addInitScript(LEAFLET_STUB);
        await page.route('**/*', route => {
            const url = route.request().url();
            if (url.startsWith(origin) || url.startsWith('file://')) return route.continue();
            if (markedJs && /marked@12\.0\.2\/marked\.min\.js/.test(url)) return route.fulfill({ contentType: 'text/javascript', body: markedJs });
            return route.abort();
        });
        return page;
    }
    async function openIndex(page, url) {
        await page.goto(url || origin + '/index.html');
        if (tailwindCss) {
            await page.addStyleTag({ content: tailwindCss + '\n.fa-solid,.fa-brands{display:inline-block;width:1.1em;height:1em}' });
        }
        await page.waitForSelector('[data-day]');
    }

    // ───────── T1 首頁基本 ─────────
    await guard('T1', async () => {
        const p = await newPage();
        await openIndex(p);
        const info = await p.evaluate(() => ({
            days: document.querySelectorAll('[data-day]').length,
            banner: !!document.querySelector('body > div.bg-rose-600'),
            version: (document.querySelector('[aria-label="網頁版本"]') || {}).textContent || '',
            footerLink: (() => { const a = document.querySelector('footer a[href="verify.html"]'); return a ? { target: a.target, rel: a.rel } : null; })(),
            hotels: document.querySelectorAll('#hotels [data-place]').length
        }));
        check('T1 首頁無 JS 錯誤', p.errors.length === 0, p.errors.join(' | '));
        check('T1 沒有紅色資料錯誤提示列', !info.banner);
        check(`T1 顯示 ${TRIP.days.length} 天行程`, info.days === TRIP.days.length, `實際 ${info.days}`);
        check('T1 版本號與資料一致', info.version.replace(/\s+/g, '').includes(TRIP.site.version.number) && info.version.includes(TRIP.site.version.date), info.version.trim());
        check('T1 頁尾連結在新分頁開啟 verify.html', info.footerLink && info.footerLink.target === '_blank' && /noopener/.test(info.footerLink.rel), JSON.stringify(info.footerLink));
        check(`T1 住宿區 ${TRIP.hotels.length} 張卡片可點`, info.hotels === TRIP.hotels.length, `實際 ${info.hotels}`);
        await p.close();
    });

    // ───────── T2 每個有彈窗的地點 ─────────
    await guard('T2', async () => {
        const p = await newPage();
        await openIndex(p);
        const ids = await p.$$eval('[data-place]', els => [...new Set(els.map(e => e.dataset.place))]);
        const hiddenTexts = [];
        Object.values(GUIDES).forEach(g => ['highlights', 'kidTips', 'ticketing', 'transport', 'cautions', 'conflicts'].forEach(k => (g[k] || []).forEach(i => { if (i.hidden) hiddenTexts.push(i.t); })));
        let bad = [];
        for (const id of ids) {
            const place = PLACES[id];
            await p.locator(`[data-place="${id}"]:visible`).first().click();
            await p.waitForTimeout(150);
            const m = await p.evaluate(() => ({
                title: document.getElementById('contact-modal-title').textContent,
                open: !document.getElementById('contact-modal').hidden,
                parking: !document.getElementById('contact-parking').classList.contains('hidden'),
                parkingItems: document.querySelectorAll('#contact-parking-list li').length,
                guide: !document.getElementById('contact-guide').classList.contains('hidden'),
                guideText: document.getElementById('contact-guide').textContent,
                actions: [...document.querySelectorAll('#contact-actions a')].map(a => a.getAttribute('href')),
                booking: !document.getElementById('booking-details').classList.contains('hidden')
            }));
            const wantParking = [].concat(place.parking || []).length;
            if (!m.open) bad.push(`${id}：彈窗沒開`);
            if (m.title !== place.name) bad.push(`${id}：標題「${m.title}」≠「${place.name}」`);
            if (m.parking !== (wantParking > 0) || m.parkingItems !== wantParking) bad.push(`${id}：停車區塊與資料不符（${m.parkingItems}/${wantParking}）`);
            if (m.guide !== !!GUIDES[id]) bad.push(`${id}：攻略顯示 ${m.guide}，資料${GUIDES[id] ? '有' : '沒有'}攻略`);
            if (JARGON.test(m.guideText)) bad.push(`${id}：攻略含開發用語`);
            hiddenTexts.forEach(t => { if (m.guideText.includes(t)) bad.push(`${id}：顯示了 hidden 的項目`); });
            if (!m.actions.some(h => h && h.includes('google.com/maps'))) bad.push(`${id}：沒有導航按鈕`);
            if (m.booking !== (place.infoType === '住宿資訊')) bad.push(`${id}：訂房區塊顯示不對`);
            await p.keyboard.press('Escape');
            const closed = await p.evaluate(() => document.getElementById('contact-modal').hidden);
            if (!closed) bad.push(`${id}：Esc 沒有關閉彈窗`);
        }
        check(`T2 ${ids.length} 個地點彈窗正確（標題、停車、攻略、導航、訂房、Esc）`, bad.length === 0, bad.slice(0, 6).join('；'));
        check('T2 彈窗過程無 JS 錯誤', p.errors.length === 0, p.errors.join(' | '));
        await p.close();
    });

    // ───────── T3 每天地圖 ─────────
    await guard('T3', async () => {
        const p = await newPage();
        await openIndex(p);
        let bad = [];
        for (const day of TRIP.days) {
            const points = model.getMapPoints(day, PLACES);
            const wantPoly = points.filter(x => !x.excludeFromRoute).length + (day.closeLoop && points.filter(x => !x.excludeFromRoute).length > 1 ? 1 : 0);
            await p.evaluate(() => { window.__map.markers = 0; window.__map.poly = null; });
            await p.locator(`#day-${day.day} .map-toggle-button`).click();
            await p.waitForTimeout(150);
            const m = await p.evaluate(d => ({
                open: !document.getElementById(`day-map-panel-${d}`).hidden,
                markers: window.__map.markers, poly: window.__map.poly ? window.__map.poly.length : -1,
                label: document.querySelector(`#day-${d} .map-toggle-button span`).textContent
            }), day.day);
            if (!m.open) bad.push(`DAY ${day.day}：面板沒展開`);
            if (m.markers !== points.length) bad.push(`DAY ${day.day}：標記 ${m.markers}，應為 ${points.length}`);
            if (m.poly !== wantPoly) bad.push(`DAY ${day.day}：路線點 ${m.poly}，應為 ${wantPoly}`);
            if (m.label !== '收合地圖') bad.push(`DAY ${day.day}：按鈕文字不對`);
            await p.locator(`#day-${day.day} .map-toggle-button`).click();
            const closed = await p.evaluate(d => document.getElementById(`day-map-panel-${d}`).hidden, day.day);
            if (!closed) bad.push(`DAY ${day.day}：再按一次沒有收合`);
        }
        check(`T3 ${TRIP.days.length} 天地圖：標記數、路線連線、展開／收合`, bad.length === 0, bad.join('；'));
        check('T3 地圖操作無 JS 錯誤', p.errors.length === 0, p.errors.join(' | '));
        await p.close();
    });

    // ───────── T4 打錯地點 id 要出現紅色提示列 ─────────
    await guard('T4', async () => {
        const p = await newPage();
        await p.route('**/data/trip.js', async route => {
            const res = await route.fetch();
            await route.fulfill({ response: res, body: (await res.text()).replace("place: 'qixingtan'", "place: 'qixingtann'") });
        });
        await openIndex(p);
        const banner = await p.evaluate(() => { const b = document.querySelector('body > div.bg-rose-600'); return b ? b.textContent : ''; });
        check('T4 打錯 place id 會顯示紅色提示列並指出 id', banner.includes('qixingtann'), banner.slice(0, 80));
        await p.close();
    });

    // ───────── T5 file:// 開啟 ─────────
    await guard('T5', async () => {
        const p = await newPage();
        await openIndex(p, 'file://' + path.join(root, 'index.html'));
        const days = await p.$$eval('[data-day]', e => e.length);
        check('T5 雙擊（file://）開啟無 JS 錯誤且行程完整', p.errors.length === 0 && days === TRIP.days.length, `錯誤 ${p.errors.length}、天數 ${days}`);
        // 攻略是動態載入的 <script>：file:// 下也要能載入並顯示（挑一個確定有攻略的地點）
        const guideId = Object.keys(GUIDES).find(id => PLACES[id] && PLACES[id].infoType);
        await p.locator(`[data-place="${guideId}"]:visible`).first().click();
        await p.waitForFunction(() => !document.getElementById('contact-guide').classList.contains('hidden'), null, { timeout: 4000 }).catch(() => {});
        const guide = await p.evaluate(() => !document.getElementById('contact-guide').classList.contains('hidden'));
        check('T5 file:// 下攻略也能動態載入並顯示', guide, '地點：' + guideId);
        await p.close();
    });

    // ───────── T6 verify.html ─────────
    await guard('T6', async () => {
        const md = read('verify.md');
        const qCount = (md.match(/^### Q\d+｜/gm) || []).length;
        const telCount = (md.match(/\(tel:/g) || []).length;
        const p = await newPage({ stubLeaflet: false });
        await p.goto(origin + '/verify.html');
        await p.waitForTimeout(600);
        if (markedJs) {
            const info = await p.evaluate(() => ({
                q: document.querySelectorAll('h3[id^="q"]').length,
                tel: document.querySelectorAll('#content a[href^="tel:"]').length,
                extNotBlank: [...document.querySelectorAll('#content a[href^="http"]')].filter(a => a.target !== '_blank').length,
                overflowX: document.documentElement.scrollWidth > innerWidth
            }));
            check(`T6 verify.html 轉出 ${qCount} 個題目標題（可用 #q 錨點）`, info.q === qCount, `實際 ${info.q}`);
            check(`T6 撥號連結 ${telCount} 個、外部連結都在新分頁`, info.tel === telCount && info.extNotBlank === 0, `tel ${info.tel}、非新分頁 ${info.extNotBlank}`);
            if (qCount >= 2) {
                await p.click('a[href="#q2"]');
                await p.waitForTimeout(250);
                const near = await p.evaluate(() => { const el = document.getElementById('q2'); return !!el && Math.abs(el.getBoundingClientRect().top) < 120; });
                check('T6 點總覽表的題號會跳到該題', near);
            }
            if (tailwindCss) check('T6 verify.html 在手機寬度沒有橫向溢出', !info.overflowX);
        } else {
            const status = await p.textContent('#status');
            check('T6 marked 載入失敗時顯示備援文字（未提供 MARKED_JS，只測備援）', /轉換工具載入失敗/.test(status), status.slice(0, 40));
        }
        check('T6 verify.html 無 JS 錯誤', p.errors.length === 0, p.errors.join(' | '));
        await p.close();
    });

    // ───────── T7 導覽列各寬度（需要 TAILWIND_CSS）─────────
    await guard('T7', async () => {
        if (!tailwindCss) return;
        const bad = [];
        for (const w of [360, 375, 414, 768, 1280]) {
            const p = await newPage({ viewport: { width: w, height: 800 } });
            await openIndex(p);
            await p.waitForTimeout(200);
            const m = await p.evaluate(() => {
                const v = document.querySelector('[aria-label="網頁版本"]').getBoundingClientRect();
                return { overflow: document.documentElement.scrollWidth > innerWidth, right: Math.round(v.right), navH: Math.round(document.querySelector('nav').getBoundingClientRect().height) };
            });
            if (m.overflow) bad.push(`${w}px：橫向溢出`);
            if (m.right > w - 8) bad.push(`${w}px：版本號右緣 ${m.right} 太靠邊`);
            await p.close();
        }
        check('T7 導覽列在 360／375／414／768／1280px 沒有溢出', bad.length === 0, bad.join('；'));
    });

    await browser.close();
    server.close();

    const failed = results.filter(r => !r.ok);
    results.forEach(r => console.log(`${r.ok ? '✓' : '✗'} ${r.name}${!r.ok && r.detail ? '\n    ' + r.detail : ''}`));
    console.log(`\n${failed.length ? '✗ ' + failed.length + ' 項失敗' : '✓ 全部通過'}（${results.length} 項）` + (tailwindCss ? '' : '；未提供 TAILWIND_CSS，沒有測版面'));
    process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('測試執行失敗：', e); try { server.close(); } catch (_) {} process.exit(2); });
