// 真實編輯器與預覽；僅使用暫存資料和受控路線。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepoCopy, cleanup, openEditorBrowser } = require('./test-helpers');
const { createServer } = require('./server');
const M = require('../../js/model');
const cache = require('../routing/cache');

(async () => {
    const root = makeRepoCopy();
    let browser, server;
    try {
        const file = path.join(root, 'data/trip.json');
        const trip = JSON.parse(fs.readFileSync(file, 'utf8'));
        const places = JSON.parse(fs.readFileSync(path.join(root, 'data/places.json'), 'utf8'));
        const ids = Object.keys(places).filter(id => places[id].lat && places[id].lng).slice(0, 4);
        trip.days = [{ day: 1, date: '11/15', title: '邊界試算', items: [
            { type: 'waypoint', place: ids[0], time: '08:00' },
            { type: 'move', time: '08:00 - 08:30', buffer: 5 },
            { type: 'spot', place: ids[1], alt: 'a', time: '09:00 - 10:00' },
            { type: 'spot', place: ids[2], alt: 'a' },
            { type: 'stay', place: ids[3], time: '17:00' },
            { type: 'notice', title: '晚間提醒' }
        ] }, { day: 2, date: '11/16', title: '完整區間邊界', items: [
            { type: 'spot', title: '起點區間', time: '08:00 - 09:00' },
            { type: 'spot', title: '終點區間', time: '10:00 - 11:00' }
        ] }];
        fs.writeFileSync(file, JSON.stringify(trip, null, 2) + '\n');
        const routes = cache.empty();
        for (const leg of M.getLegs(trip.days[0], places)) routes.legs[leg.key] = { distance: 1000, duration: 1200, geometry: '', provider: 'test', computedAt: '2026-11-02' };
        cache.write(root, routes);
        server = createServer({ root, provider: { async route() { throw Error('禁止外部路線'); } } });
        const opened = await openEditorBrowser(server);
        browser = opened.browser;
        const { page, errors } = opened;
        page.setDefaultTimeout(10000);
        await page.locator('[data-day="0"] [data-act="daycfg"]').click();
        const field = name => page.locator(`[data-boundary="${name}"]`);
        const link = name => page.locator(`[data-act="boundarylink"][data-field="${name}"]`);
        const rows = () => page.locator('[data-item][data-di="0"] [data-time]').allTextContents();
        assert.equal(await field('departure').inputValue(), '08:00');
        assert.equal(await field('end').inputValue(), '17:00');
        await field('departure').fill('08:20');
        await link('departure').click();
        assert.deepEqual(await rows(), ['08:20', '08:20 - 08:50', '09:20 - 10:20', '', '17:20', '']);
        assert.equal(await field('end').inputValue(), '17:20');
        assert.equal(await page.locator('#save').isDisabled(), true);
        await page.frameLocator('#preview').getByText('09:20 - 10:20', { exact: true }).first().waitFor();
        await page.frameLocator('#preview').getByText('每日出發 08:20・每日結束 17:20', { exact: true }).waitFor();
        await page.locator('[data-trialbar="departure"] [data-act="trialrevert"]').click();
        assert.deepEqual(await rows(), ['08:00', '08:00 - 08:30', '09:00 - 10:00', '', '17:00', '']);
        assert.equal(await field('end').inputValue(), '17:00');
        await field('end').fill('16:40');
        await link('end').click();
        assert.deepEqual(await rows(), ['07:40', '07:40 - 08:10', '08:40 - 09:40', '', '16:40', '']);
        assert.equal(await field('departure').inputValue(), '07:40');
        await page.locator('#publish').click();
        assert.equal(await page.locator('#modal').isVisible(), false);
        await page.locator('[data-df="title"]').fill('不應套用');
        assert.equal(await page.locator('[data-df="title"]').inputValue(), '邊界試算');
        await page.locator('[data-trialbar="end"] [data-act="trialconfirm"]').click();
        assert.equal(await page.locator('#save').isEnabled(), true);
        const accepted = await rows();
        await field('departure').fill('23:59');
        await link('departure').click();
        assert.deepEqual(await rows(), accepted);
        await page.locator('#toast').filter({ hasText: '超出當天' }).waitFor();
        assert.equal(await field('departure').inputValue(), '07:40');
        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), trip);
        await page.locator('[data-act="selectday"][data-tabday="2"]').click();
        const secondDay = page.locator('[data-day="1"]');
        const first = secondDay.locator('[data-item]').nth(0);
        await first.locator('[data-row]').click();
        assert.equal(await first.locator('[data-f="start"]').getAttribute('readonly'), '');
        assert.equal(await first.locator('[data-f="end"]').getAttribute('readonly'), null);
        assert.equal(await first.locator('[data-act="pendstretch"][data-field="start"]').count(), 0);
        assert.equal(await first.locator('[data-act="pendstretch"][data-field="end"]').count(), 1);
        const last = secondDay.locator('[data-item]').nth(1);
        await last.locator('[data-row]').click();
        assert.equal(await last.locator('[data-f="start"]').getAttribute('readonly'), null);
        assert.equal(await last.locator('[data-f="end"]').getAttribute('readonly'), '');
        assert.equal(await last.locator('[data-act="pendstretch"][data-field="start"]').count(), 1);
        assert.equal(await last.locator('[data-act="pendstretch"][data-field="end"]').count(), 0);
        assert.deepEqual(errors, []);
        console.log('✓ 每日邊界：出發連動、真正預覽、另一端同步、存檔保護與完整還原');
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
        cleanup(root);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
