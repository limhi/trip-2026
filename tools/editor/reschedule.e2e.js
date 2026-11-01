// 真實編輯器的整天重排：暫存專案、受控路線，禁止真實發布。
// PLAYWRIGHT_MODULE=/path/to/playwright PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tools/editor/reschedule.e2e.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('./server');
const { makeRepoCopy, cleanup } = require('./test-helpers');
const cache = require('../routing/cache');
const M = require('../../js/model');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const root = makeRepoCopy();
    let browser, server;
    try {
        const file = path.join(root, 'data/trip.json');
        const trip = JSON.parse(fs.readFileSync(file, 'utf8'));
        const places = JSON.parse(fs.readFileSync(path.join(root, 'data/places.json'), 'utf8'));
        const ids = Object.keys(places).filter(id => places[id].lat && places[id].lng).slice(0, 2);
        trip.days = [{ day: 1, date: '11/15', title: '重排測試', items: [
            { type: 'spot', place: ids[0], time: '09:00 - 10:00', desc: '12:00 僅作文字' },
            { type: 'spot', place: ids[1], time: '10:40 - 11:25', note: '原始資料' }
        ] }];
        fs.writeFileSync(file, JSON.stringify(trip, null, 2) + '\n');
        const routes = cache.empty();
        for (const leg of M.getLegs(trip.days[0], places)) routes.legs[leg.key] = { distance: 1000, duration: 1200, geometry: '??', fetchedAt: '2026-11-01T00:00:00Z' };
        cache.write(root, routes);
        let providerCalls = 0;
        server = createServer({ root, provider: { name: 'fake', route: async () => { providerCalls++; throw Error('測試不查詢外部路線'); } } });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        const forbidden = [];
        page.on('request', r => { if (/\/api\/(data|publish)/.test(r.url()) && r.method() !== 'GET') forbidden.push(r.url()); });
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        if (process.env.TAILWIND_CSS) await page.addStyleTag({ content: fs.readFileSync(process.env.TAILWIND_CSS, 'utf8') });
        const times = () => page.locator('#pane-days [data-time]').allTextContents();
        await page.waitForFunction(() => document.querySelectorAll('#pane-days [data-time]').length === 2);
        assert.deepEqual(await times(), ['09:00 - 10:00', '10:40 - 11:25']);
        await page.locator('[data-act="dayresched"]').click();
        await page.waitForFunction(() => document.querySelector('#status').textContent.includes('暫時套用'), null, { timeout: 2000 });
        assert.deepEqual(await times(), ['09:00 - 10:00', '10:00 - 10:25', '10:25 - 11:10']);
        await page.waitForFunction(() => {
            const doc = document.querySelector('#preview').contentDocument;
            return doc && doc.body && doc.body.textContent.includes('10:25 - 11:10');
        });
        assert.equal(await page.locator('#save').isDisabled(), true);
        await page.locator('#publish').click();
        assert.equal(await page.locator('#modal').isVisible(), false);
        await page.locator('#restoreMenu summary').click();
        assert.equal(await page.locator('#restoreMenu').getAttribute('open'), null);
        await page.locator('[data-tab="places"]').click();
        assert.equal(await page.locator('#pane-days').isVisible(), true);
        await page.locator('[data-act="del"]').first().click();
        assert.equal((await times()).length, 3);
        await page.locator('[data-trialbar="reschedule"] [data-act="trialrevert"]').click();
        assert.deepEqual(await times(), ['09:00 - 10:00', '10:40 - 11:25']);
        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), trip);
        await page.locator('[data-act="dayresched"]').click();
        await page.locator('[data-trialbar="reschedule"] [data-act="trialconfirm"]').click();
        assert.equal(await page.locator('#save').isEnabled(), true);
        const confirmed = await times();
        await page.locator('[data-act="dayresched"]').click();
        assert.deepEqual(await times(), confirmed);
        await page.locator('[data-trialbar="reschedule"] [data-act="trialconfirm"]').click();
        assert.deepEqual(await times(), confirmed);
        assert.deepEqual(forbidden, []);
        assert.equal(providerCalls, 0);
        assert.deepEqual(errors, []);
        console.log('整天重排 Playwright：載入保留、清單與真正預覽、操作限制、完整還原、確認與冪等性通過');
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
        cleanup(root);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
