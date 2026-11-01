// 真正編輯器試算回歸：只用暫存專案與受控路線，不存檔、不發布。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepoCopy, cleanup } = require('./test-helpers');
const { createServer } = require('./server');
const M = require('../../js/model');
const cache = require('../routing/cache');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function run({ incomplete = false, confirm = false, sameDay = false } = {}) {
    const root = makeRepoCopy();
    let browser, server, release;
    try {
        const file = path.join(root, 'data/trip.json');
        const trip = JSON.parse(fs.readFileSync(file, 'utf8'));
        const places = JSON.parse(fs.readFileSync(path.join(root, 'data/places.json'), 'utf8'));
        const ids = Object.keys(places).filter(id => places[id].lat && places[id].lng).slice(0, 4);
        trip.site.routing = { trafficFactor: 1 };
        const items = (a, b) => [
            { type: 'spot', place: a, time: '08:00 - 09:00' },
            { type: 'move', time: incomplete ? '17:10 後' : '09:00 - 09:20' },
            { type: 'spot', place: b, time: '10:00 - 11:00' }
        ];
        trip.days = [{ day: 1, date: '11/15', title: '試算', items: items(ids[0], ids[1]) }];
        if (!incomplete && !sameDay) trip.days.push({ day: 2, date: '11/16', title: '路線', items: items(ids[2], ids[3]) });
        fs.writeFileSync(file, JSON.stringify(trip, null, 2) + '\n', 'utf8');
        const routes = cache.empty();
        const pendingDay = sameDay ? 0 : 1;
        for (const [di, day] of trip.days.entries()) for (const leg of M.getLegs(day, places)) {
            if (incomplete || di !== pendingDay) routes.legs[leg.key] = { distance: 1000, duration: 1800, geometry: '', provider: 'test', computedAt: '2026-11-01' };
        }
        cache.write(root, routes);
        let started;
        const requested = new Promise(resolve => { started = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        server = createServer({ root, provider: { name: 'test', route: async () => {
            assert.equal(incomplete, false);
            started();
            await gate;
            return { distance: 1000, duration: 1800, geometry: '' };
        } } });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
        await page.goto(origin);
        if (process.env.TAILWIND_CSS) await page.addStyleTag({ content: fs.readFileSync(process.env.TAILWIND_CSS, 'utf8') });
        const rows = di => page.locator(`[data-item][data-di="${di}"] [data-time]`).allTextContents();
        const item = page.locator(`[data-item][data-di="0"][data-ii="${incomplete ? 1 : 0}"]`);
        if (!incomplete) await requested;
        await item.locator('[data-row]').click();
        await item.locator(`[data-act="pendlink"][data-field="${incomplete ? 'buffer' : 'end'}"]`).click();
        await page.waitForFunction(() => document.querySelector('#status').textContent.includes('暫時套用中'));
        if (incomplete) {
            assert.deepEqual(await rows(0), ['08:00 - 09:00', '17:10 後', '10:00 - 11:00']);
        } else {
            const trialRows = await rows(0);
            const response = page.waitForResponse(r => r.url().endsWith('/api/routes/compute'));
            release();
            await response;
            await page.waitForFunction(() => !document.querySelector('#pane-days').textContent.includes('計算中'));
            assert.deepEqual(await rows(0), trialRows, '路線結果不能改動進行中的試算');
        }
        await item.locator(`[data-act="trial${confirm ? 'confirm' : 'revert'}"]:visible`).click();
        if (!incomplete) {
            if (!sameDay) await page.locator('[data-day="1"] [data-act="daytoggle"]').click();
            assert.deepEqual(await rows(pendingDay), ['08:00 - 09:00', '09:00 - 09:30', '10:10 - 11:10'], '結束試算後必須同步已完成的路線');
            if (!sameDay) assert.deepEqual(await rows(0), confirm ? ['08:00 - 09:00', '09:00 - 09:30', '10:10 - 11:10'] : ['08:00 - 09:00', '09:00 - 09:20', '10:00 - 11:00']);
        }
        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), trip);
        assert.deepEqual(errors, []);
        console.log(`試算回歸通過：${incomplete ? '保留不完整時間' : `${sameDay ? '同日' : '他日'}路線延後同步／${confirm ? '確認' : '還原'}`}`);
    } finally {
        if (release) release();
        if (browser) await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
        cleanup(root);
    }
}
(async () => {
    if (process.argv.includes('--incomplete')) await run({ incomplete: true });
    else for (const sameDay of [false, true]) for (const confirm of [false, true]) await run({ sameDay, confirm });
})().catch(error => { console.error(error); process.exitCode = 1; });
