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
for (const f of ['data/places.js', 'data/trip.js', 'data/routes.js', 'js/model.js']) vm.runInContext(read(f), ctx, { filename: f });
const { TRIP, TRIP_PLACES: PLACES, TRIP_ROUTES: REAL_ROUTES } = ctx.window;
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

// 假的 Leaflet：記錄標記數、路線點數，以及最近一張地圖的路線圖層（layerGroup）內容，供測試檢查。
// 路段中點的「時間・距離」標示是 className 為 map-leg-label-icon 的標記，不算進 markers。
const LEAFLET_STUB = () => {
    const chain = { addTo() { return this; }, bindPopup() { return this; } };
    window.__map = { markers: 0, poly: null, group: null };
    const layer = (kind, a, o) => {
        const l = { kind, a, o, bindPopup() { return l; }, addTo(target) { if (target && target.layers) target.layers.push(l); return l; } };
        return l;
    };
    Object.defineProperty(window, 'L', {
        configurable: true, set() {},
        get() {
            return {
                map() { return { fitBounds() {}, invalidateSize() {} }; },
                tileLayer() { return chain; }, divIcon(o) { return o; },
                marker(latlng, o) {
                    const isLabel = !!(o && o.icon && o.icon.className === 'map-leg-label-icon');
                    if (!isLabel) window.__map.markers++;
                    return layer(isLabel ? 'label' : 'marker', latlng, o);
                },
                polyline(pts, o) { window.__map.poly = pts; return layer('polyline', pts, o); },
                layerGroup() {
                    const g = { layers: [], addTo() { window.__map.group = g; return g; }, clearLayers() { g.layers.length = 0; } };
                    return g;
                },
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
        const geoRequests = [];
        p.on('request', r => { if (/\/data\/routes-geo\.js/.test(r.url())) geoRequests.push(r.url()); });
        // 這項測的是「沒有路線快取」的退回行為，不依賴 repo 目前實際的快取內容
        await p.route('**/data/routes.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.TRIP_ROUTES = { legs: {} };' }));
        await openIndex(p);
        let bad = [];
        for (const day of TRIP.days) {
            const points = model.getMapPoints(day, PLACES);
            // 有擇一組的天沒有快取時逐段畫虛線（分岔再合流），最後一次畫的是 2 點的一段；其餘天是單一條連線
            const wantPoly = model.getAltGroups(day).length ? 2
                : points.filter(x => !x.excludeFromRoute).length + (day.closeLoop && points.filter(x => !x.excludeFromRoute).length > 1 ? 1 : 0);
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
        const extra = await p.evaluate(() => ({ auto: document.querySelectorAll('.auto-leg-row, .auto-leg-duration, .day-drive-summary').length, labels: window.__map.group ? window.__map.group.layers.filter(l => l.kind === 'label').length : 0 }));
        check('T3 路線快取是空殼時：沒有自動連接列、總車程、時間標示，也不載入 routes-geo.js（與沒有這個功能時相同）', extra.auto === 0 && extra.labels === 0 && geoRequests.length === 0, `元素 ${extra.auto}、標示 ${extra.labels}、geo 請求 ${geoRequests.length}`);
        check('T3 地圖操作無 JS 錯誤', p.errors.length === 0, p.errors.join(' | '));
        await p.close();
    });

    // ───────── T8 路線快取（假資料）：道路路線、時間標示、自動連接列、總車程 ─────────
    // 用手造的假快取（不是 repo 的 data/routes*.js，也不呼叫真實路線服務）：
    // 每個路段一筆；第一天的第一段 150 分原始時間（×1.25 後超過門檻）；有 2 段以上的第一天缺最後一段；
    // 路線座標是起點、偏移的中間點、終點。
    const FACTOR = day => day.trafficFactor || (TRIP.site.routing && TRIP.site.routing.trafficFactor) || 1.25;
    const MAX_MIN = (TRIP.site.routing && TRIP.site.routing.maxLegMinutes) || 180;
    const dayLegs = TRIP.days.map(d => model.getLegs(d, PLACES));
    const fakeLegs = {}, fakeGeo = {};
    const encodeLine = pts => {
        let pl = 0, pg = 0, out = '';
        const enc = n => { let v = n < 0 ? ~(n << 1) : n << 1, t = ''; while (v >= 0x20) { t += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return t + String.fromCharCode(v + 63); };
        for (const [la, ln] of pts) { const a = Math.round(la * 1e5), b = Math.round(ln * 1e5); out += enc(a - pl) + enc(b - pg); pl = a; pg = b; }
        return out;
    };
    let seq = 0, partialDay = -1;
    dayLegs.forEach((legs, di) => {
        legs.forEach((leg, li) => {
            if (partialDay < 0 && legs.length >= 2 && li === legs.length - 1) { partialDay = di; return; }
            fakeLegs[leg.key] = { distance: 20000 + 1500 * seq, duration: di === 0 && li === 0 ? 9000 : 1800 + 300 * (seq % 4) };
            fakeGeo[leg.key] = encodeLine([[leg.from.lat, leg.from.lng], [(leg.from.lat + leg.to.lat) / 2 + 0.01, (leg.from.lng + leg.to.lng) / 2], [leg.to.lat, leg.to.lng]]);
            seq++;
        });
    });
    const ROUTES_JS = 'window.TRIP_ROUTES = ' + JSON.stringify({ legs: fakeLegs }) + ';';
    const GEO_JS = 'window.TRIP_ROUTES_GEO = ' + JSON.stringify(fakeGeo) + ';';
    // 獨立算法（不用 model 的格式函式）
    const mins = (d, leg) => Math.round(fakeLegs[leg.key].duration / 60 * FACTOR(d));
    const hm = m => (m >= 60 ? Math.floor(m / 60) + ' 小時' + (m % 60 ? ' ' + (m % 60) + ' 分' : '') : m + ' 分');
    async function routesPage(opts = {}) {
        const p = await newPage(opts);
        p.geoRequests = [];
        p.on('request', r => { if (/\/data\/routes-geo\.js/.test(r.url())) p.geoRequests.push(r.url()); });
        await p.route('**/data/routes.js', r => r.fulfill({ contentType: 'text/javascript', body: ROUTES_JS }));
        if (opts.geoFail) await p.route('**/data/routes-geo.js', r => r.abort());
        else await p.route('**/data/routes-geo.js', r => r.fulfill({ contentType: 'text/javascript', body: GEO_JS }));
        return p;
    }
    const mapLayers = p => p.evaluate(() => window.__map.group.layers.map(l => ({
        kind: l.kind, n: l.kind === 'polyline' ? l.a.length : 0, dashed: !!(l.o && l.o.dashArray), color: l.o && l.o.color,
        html: l.kind === 'label' ? l.o.icon.html : ''
    })));
    const waitSolid = p => p.waitForFunction(() => window.__map.group && window.__map.group !== window.__prevGroup && window.__map.group.layers.some(l => l.kind === 'polyline' && !(l.o && l.o.dashArray)), null, { timeout: 4000 }).catch(() => {});

    await guard('T8', async () => {
        check('T8 假快取有效：有一段超過門檻、有一天缺一段、有需要補連接列的路段',
            dayLegs.some((ls, i) => ls.some(l => fakeLegs[l.key] && mins(TRIP.days[i], l) > MAX_MIN)) && partialDay >= 0 && dayLegs.some(ls => ls.some(l => l.needsRow && fakeLegs[l.key])), `partialDay=${partialDay}`);
        const p = await routesPage();
        await openIndex(p);
        check('T8 首頁載入時沒有請求 routes-geo.js', p.geoRequests.length === 0, `請求 ${p.geoRequests.length}`);
        const bad = [];
        for (let di = 0; di < TRIP.days.length; di++) {
            const day = TRIP.days[di], legs = dayLegs[di];
            const cached = legs.filter(l => fakeLegs[l.key]);
            const dom = await p.evaluate(s => {
                const el = document.querySelector(s);
                const sum = el.querySelector('.day-drive-summary');
                return { summary: sum ? sum.textContent : null, autoRows: el.querySelectorAll('.auto-leg-row').length, autoDur: el.querySelectorAll('.auto-leg-duration').length,
                    autoRowText: [...el.querySelectorAll('.auto-leg-row')].map(r => r.textContent) };
            }, `#day-${day.day}`);
            // 有擇一組的天：連接列只出現一條、總車程取較長的路徑，這些由 route-view 與 blocks 的單元測試與 T11 驗證
            if (model.getAltGroups(day).length) continue;
            const wantAuto = cached.filter(l => l.needsRow).length;
            const wantDur = cached.filter(l => l.rowIndex != null).length;   // duration 只是備註，不再隱藏查詢時間
            if (dom.autoRows !== wantAuto) bad.push(`DAY ${day.day}：自動連接列 ${dom.autoRows}，應為 ${wantAuto}`);
            if (dom.autoDur !== wantDur) bad.push(`DAY ${day.day}：算出的交通列時間 ${dom.autoDur}，應為 ${wantDur}`);
            if (cached.length === 0) { if (dom.summary !== null) bad.push(`DAY ${day.day}：沒有快取卻有總車程`); continue; }
            const totalMin = cached.reduce((s, l) => s + mins(day, l), 0), totalKm = (cached.reduce((s, l) => s + fakeLegs[l.key].distance, 0) / 1000).toFixed(1);
            const partial = cached.length < legs.length;
            if (!dom.summary || !dom.summary.includes(`總車程 約 ${hm(totalMin)}・總里程 ${totalKm} km`)) bad.push(`DAY ${day.day}：總車程文字不對「${dom.summary}」，應含 ${hm(totalMin)}・${totalKm} km`);
            if (dom.summary && dom.summary.includes('部分路段未計算') !== partial) bad.push(`DAY ${day.day}：「部分路段未計算」應為 ${partial}`);
            const firstAuto = cached.find(l => l.needsRow);
            if (firstAuto && !dom.autoRowText.some(t => t.includes(`車程約 ${hm(mins(day, firstAuto))}・`) && t.includes('（自動）'))) bad.push(`DAY ${day.day}：連接列文字不對`);
        }
        check('T8 每天：自動連接列數、算出的交通列時間、總車程與里程、「部分路段未計算」', bad.length === 0, bad.slice(0, 5).join('；'));

        const bad2 = [];
        let firstExpand = true;
        for (let di = 0; di < TRIP.days.length; di++) {
            const day = TRIP.days[di], legs = dayLegs[di];
            const cached = legs.filter(l => fakeLegs[l.key]);
            await p.evaluate(() => { window.__prevGroup = window.__map.group; });
            await p.locator(`#day-${day.day} .map-toggle-button`).click();
            if (cached.length) {
                await waitSolid(p);
                if (firstExpand) { firstExpand = false; check('T8 第一次展開地圖後才請求 routes-geo.js（只請求一次）', p.geoRequests.length === 1, `請求 ${p.geoRequests.length}`); }
            }
            const layers = await mapLayers(p);
            const lines = layers.filter(l => l.kind === 'polyline'), labels = layers.filter(l => l.kind === 'label');
            if (!cached.length) {
                if (labels.length) bad2.push(`DAY ${day.day}：沒有快取卻有時間標示`);
                continue;
            }
            const solid = lines.filter(l => !l.dashed), dashed = lines.filter(l => l.dashed);
            if (lines.length !== legs.length) bad2.push(`DAY ${day.day}：路線 ${lines.length} 條，應為 ${legs.length}`);
            if (solid.length !== cached.length || solid.some(l => l.n !== 3)) bad2.push(`DAY ${day.day}：道路路線 ${solid.length} 條（點數 ${solid.map(l => l.n)}），應為 ${cached.length} 條各 3 點`);
            if (dashed.length !== legs.length - cached.length) bad2.push(`DAY ${day.day}：虛線 ${dashed.length} 條，應為 ${legs.length - cached.length}`);
            if (labels.length !== cached.length) bad2.push(`DAY ${day.day}：時間標示 ${labels.length} 個，應為 ${cached.length}`);
            const wantRed = cached.filter(l => mins(day, l) > MAX_MIN).length;
            if (solid.filter(l => l.color === '#dc2626').length !== wantRed || labels.filter(l => /map-leg-label-over/.test(l.html)).length !== wantRed) bad2.push(`DAY ${day.day}：紅色段落應為 ${wantRed} 段`);
            cached.forEach(l => { if (!labels.some(x => x.html.includes(`約 ${hm(mins(day, l))}・${(fakeLegs[l.key].distance / 1000).toFixed(1)} km`))) bad2.push(`DAY ${day.day}：找不到標示「${hm(mins(day, l))}」`); });
            const note = await p.evaluate(d => document.querySelector(`#day-map-panel-${d} p:last-child`).textContent, day.day);
            if (!note.includes('實際請以導航為準') || !note.includes('×' + FACTOR(day))) bad2.push(`DAY ${day.day}：地圖說明文字沒有更新「${note.slice(0, 40)}」`);
        }
        check('T8 每天地圖：道路路線取代虛線、缺段仍畫虛線、中點時間距離標示、超過門檻紅色、說明文字', bad2.length === 0, bad2.slice(0, 5).join('；'));
        const banner = await p.evaluate(() => !!document.querySelector('body > div.bg-rose-600'));
        check('T8 有快取時沒有 JS 錯誤、沒有紅色提示列', p.errors.length === 0 && !banner, p.errors.join(' | '));
        await p.close();
    });

    // ───────── T9 routes-geo.js 載入失敗：靜默退回虛線，時間標示仍在 ─────────
    await guard('T9', async () => {
        const p = await routesPage({ geoFail: true });
        await openIndex(p);
        const di = dayLegs.findIndex(ls => ls.some(l => fakeLegs[l.key]));
        const day = TRIP.days[di], cached = dayLegs[di].filter(l => fakeLegs[l.key]);
        await p.locator(`#day-${day.day} .map-toggle-button`).click();
        await p.waitForTimeout(500);
        const layers = await mapLayers(p);
        const lines = layers.filter(l => l.kind === 'polyline'), labels = layers.filter(l => l.kind === 'label');
        const banner = await p.evaluate(() => !!document.querySelector('body > div.bg-rose-600'));
        check('T9 geo 載入失敗：全部退回虛線、時間標示仍在、沒有錯誤也沒有紅色提示列', lines.length > 0 && lines.every(l => l.dashed) && labels.length === cached.length && p.errors.length === 0 && !banner,
            `虛線 ${lines.filter(l => l.dashed).length}/${lines.length}、標示 ${labels.length}、錯誤 ${p.errors.join(' | ')}`);
        await p.close();
    });

    // ───────── T10 file:// 開啟有快取的頁面：routes-geo.js 也能動態載入 ─────────
    await guard('T10', async () => {
        const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'trip-e2e-'));
        try {
            for (const f of ['index.html', 'css', 'js', 'data', 'reference']) fs.cpSync(path.join(root, f), path.join(tmp, f), { recursive: true });
            fs.writeFileSync(path.join(tmp, 'data/routes.js'), ROUTES_JS);
            fs.writeFileSync(path.join(tmp, 'data/routes-geo.js'), GEO_JS);
            const p = await newPage();
            await openIndex(p, 'file://' + path.join(tmp, 'index.html'));
            const di = dayLegs.findIndex(ls => ls.some(l => fakeLegs[l.key]));
            await p.locator(`#day-${TRIP.days[di].day} .map-toggle-button`).click();
            await waitSolid(p);
            const layers = await mapLayers(p);
            check('T10 file:// 下 routes-geo.js 也能動態載入並畫出道路路線，且無 JS 錯誤', layers.some(l => l.kind === 'polyline' && !l.dashed) && p.errors.length === 0, p.errors.join(' | '));
            await p.close();
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    });

    // ───────── T11 擇一組（假資料：把第一組相鄰的兩個 spot 改成擇一組）─────────
    await guard('T11', async () => {
        const MUTATE = `;(function(){ for (const d of window.TRIP.days) for (let i = 0; i + 1 < d.items.length; i++) {
            const a = d.items[i], b = d.items[i + 1];
            if (a.type === 'spot' && b.type === 'spot') { a.alt = 'e2e'; b.alt = 'e2e'; delete b.time; return; } } })();`;
        for (const width of [1280, 375]) {
            const p = await newPage({ viewport: { width, height: 900 } });
            await p.route('**/data/trip.js', async route => {
                const res = await route.fetch();
                await route.fulfill({ response: res, body: (await res.text()) + MUTATE });
            });
            await openIndex(p);
            const info = await p.evaluate(() => {
                const g = document.querySelector('[data-alt-group]');
                const cards = g ? [...g.querySelectorAll('.grid > div')] : [];
                const r = cards.map(c => c.getBoundingClientRect());
                return {
                    found: !!g, n: cards.length, banner: !!document.querySelector('body > div.bg-rose-600'),
                    sideBySide: r.length === 2 && Math.abs(r[0].top - r[1].top) < 2,
                    overflowX: document.documentElement.scrollWidth > window.innerWidth
                };
            });
            check(`T11 ${width}px：擇一組有渲染出來（2 張卡）、無 JS 錯誤、無紅色提示列`, info.found && info.n === 2 && !info.banner && p.errors.length === 0, JSON.stringify(info) + p.errors.join(' | '));
            if (tailwindCss) check(`T11 ${width}px：${width >= 768 ? '成員並排' : '成員堆疊'}、沒有橫向溢出`, info.sideBySide === (width >= 768) && !info.overflowX, JSON.stringify(info));
            await p.close();
        }
    });

    // ───────── T12 真實資料＋真實快取：有擇一組的天，組前與組後各一條連接列、各路徑查詢時間與「排定不足」──────────
    // 期望值由 model.getLegSchedule 對同一份快取算出（不寫死任何天的數字）；T8 對有擇一組的天直接略過，T3 只看沒有快取的退回行為，這項補上
    const altDays = TRIP.days.filter(d => model.getAltGroups(d).length);
    // 擇一組前後的路段，依「組前」「組後」歸成一列（一列並列多條路徑），只收有快取的
    const altSlots = (day, routes) => {
        const slots = new Map();
        model.getLegSchedule(day, PLACES, routes, TRIP.site).forEach(sc => {
            if (!(sc.leg.fromAlt || sc.leg.toAlt) || sc.needed == null) return;
            const key = sc.leg.fromAlt ? 'after:' + sc.leg.fromAlt : 'before:' + sc.leg.toAlt;
            if (!slots.has(key)) slots.set(key, []);
            slots.get(key).push(sc);
        });
        return [...slots.values()];
    };
    // 開頁面後比對該天的畫面與期望，回傳問題清單（空陣列代表一致）
    const altProblems = async (p, day, slots) => {
        const dom = await p.evaluate(sel => {
            const el = document.querySelector(sel);
            const holders = [...new Set([...el.querySelectorAll('.leg-path')].map(x => x.parentElement))];
            const sum = el.querySelector('.day-drive-summary');
            return {
                holders: holders.map(h => [...h.querySelectorAll('.leg-path')].map(x => ({ text: x.textContent, short: !!x.querySelector('.leg-short') }))),
                summary: sum ? sum.textContent : ''
            };
        }, `#day-${day.day}`);
        const bad = [];
        if (dom.holders.length !== slots.length) bad.push(`連接列 ${dom.holders.length} 條，應為 ${slots.length} 條（組前、組後各一）`);
        slots.forEach((paths, i) => {
            const got = dom.holders[i] || [];
            if (got.length !== paths.length) bad.push(`第 ${i + 1} 條連接列路徑 ${got.length}，應為 ${paths.length}`);
            paths.forEach((sc, j) => {
                const g = got[j];
                if (!g) return;
                if (!g.text.includes(`查詢 約 ${hm(sc.needed)}`)) bad.push(`第 ${i + 1} 條第 ${j + 1} 路徑沒有查詢時間「約 ${hm(sc.needed)}」：${g.text.slice(0, 60)}`);
                if (g.short !== sc.short) bad.push(`第 ${i + 1} 條第 ${j + 1} 路徑「排定不足」應為 ${sc.short}，實際 ${g.short}`);
                if (g.short && !g.text.includes('⚠ 排定不足')) bad.push(`第 ${i + 1} 條第 ${j + 1} 路徑紅字沒有「⚠ 排定不足」文字`);
            });
        });
        if (slots.length && !dom.summary.includes('（含擇一組取較長）')) bad.push(`總車程沒有「（含擇一組取較長）」：${dom.summary.slice(0, 60)}`);
        return bad;
    };
    await guard('T12', async () => {
        check('T12 前提：repo 有擇一組的天，且組前、組後都有路線快取', altDays.length > 0 && altDays.every(d => altSlots(d, REAL_ROUTES).length >= 2), `擇一組的天 ${altDays.length}`);
        const p = await newPage();
        await openIndex(p);
        for (const day of altDays) {
            const slots = altSlots(day, REAL_ROUTES);
            check(`T12 DAY ${day.day} 真實快取：組前、組後各一條連接列、每條路徑有查詢時間、「排定不足」只在不足的路徑、總車程取較長`, (await altProblems(p, day, slots)).length === 0, (await altProblems(p, day, slots)).slice(0, 3).join('；'));
            // 反向：期望值被改錯時，這個比對一定要抓得到（證明斷言不是空的）
            const flipped = slots.map((ps, i) => i === 0 ? ps.map((sc, j) => j === 0 ? { ...sc, short: !sc.short } : sc) : ps);
            const shifted = slots.map((ps, i) => i === 0 ? ps.map((sc, j) => j === 0 ? { ...sc, needed: sc.needed + 7 } : sc) : ps);
            check(`T12 DAY ${day.day} 反向：期望的「排定不足」被翻轉、或查詢時間被改掉，比對都會失敗`, (await altProblems(p, day, flipped)).length > 0 && (await altProblems(p, day, shifted)).length > 0 && (await altProblems(p, day, slots.slice(1))).length > 0);
        }
        check('T12 真實資料頁面無 JS 錯誤、沒有紅色提示列', p.errors.length === 0 && !(await p.evaluate(() => !!document.querySelector('body > div.bg-rose-600'))), p.errors.join(' | '));
        await p.close();

        // 改過的快取：組前第一條路徑拉到極長（一定不足）、第二條縮到極短（一定足夠），確認紅字落在對的路徑上
        const day = altDays[0];
        const mutated = JSON.parse(JSON.stringify(REAL_ROUTES));
        const before = altSlots(day, REAL_ROUTES)[0];
        mutated.legs[before[0].leg.key].duration = 4 * 3600;
        mutated.legs[before[1].leg.key].duration = 60;
        const want = altSlots(day, mutated);
        check('T12 前提：改過的快取讓組前恰好一條路徑不足（第一條）、另一條足夠', want[0].length === before.length && want[0][0].short === true && want[0][1].short === false, JSON.stringify(want[0].map(x => [x.scheduled, x.needed, x.short])));
        const q = await newPage();
        await q.route('**/data/routes.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.TRIP_ROUTES = ' + JSON.stringify(mutated) + ';' }));
        await openIndex(q);
        const bad = await altProblems(q, day, want);
        check(`T12 DAY ${day.day} 改過的快取：不足的那條路徑帶紅字，另一條沒有`, bad.length === 0, bad.slice(0, 3).join('；'));
        await q.close();
    });

    // ───────── T4 打錯地點 id 要出現紅色提示列 ─────────
    await guard('T4', async () => {
        const p = await newPage();
        await p.route('**/data/trip.js', async route => {
            const res = await route.fetch();
            await route.fulfill({ response: res, body: (await res.text()).replace(/(["']?place["']?\s*:\s*["'])qixingtan(["'])/, '$1qixingtann$2') });
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
