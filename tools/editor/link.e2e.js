#!/usr/bin/env node
// 真正編輯器原值連動；只使用暫存複本與假的路線，不存檔、不發布。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepoCopy, cleanup } = require('./test-helpers');
const { createServer } = require('./server');
const M = require('../../js/model');
const cache = require('../routing/cache');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const root = makeRepoCopy();
    const trip = JSON.parse(fs.readFileSync(path.join(root, 'data/trip.json'), 'utf8'));
    const places = JSON.parse(fs.readFileSync(path.join(root, 'data/places.json'), 'utf8'));
    const firstMove = trip.days[0].items.findIndex(it => it.type === 'move');
    const target = trip.days[0].items.findIndex(it => it.time === '09:40 - 11:20');
    assert.ok(target > firstMove);
    const route = M.getLegs(trip.days[0], places).find(leg => leg.rowIndex === firstMove);
    const legs = {};
    for (const day of trip.days) for (const leg of M.getLegs(day, places)) legs[leg.key] = {
        distance: 1000, duration: 1800, geometry: '', provider: 'test', computedAt: '2026-11-01'
    };
    legs[route.key].duration = 95 * 60 / M.getTrafficFactor(trip.days[0], trip.site);
    cache.write(root, { profile: 'driving', legs });
    let routeCalls = 0;
    const server = createServer({ root, provider: { route: async () => { routeCalls++; throw Error('禁止真實路線'); } } });
    let browser;
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
        await page.goto(origin);
        if (process.env.TAILWIND_CSS) await page.addStyleTag({ content: fs.readFileSync(process.env.TAILWIND_CSS, 'utf8') });
        const item = page.locator(`[data-item][data-di="0"][data-ii="${target}"]`);
        const move = page.locator(`[data-item][data-di="0"][data-ii="${firstMove}"] [data-time]`);
        await item.locator('[data-row]').click();
        assert.equal(await item.locator('[data-f="start"]').inputValue(), '09:40');
        const link = item.locator('[data-act="pendlink"][data-field="start"]');
        await link.click({ timeout: 3000 });
        await page.waitForFunction(() => document.querySelector('#status').textContent.includes('暫時套用中'));
        assert.equal(await move.textContent(), '07:50 - 09:40');
        assert.equal(await item.locator('[data-f="end"]').inputValue(), '11:20');
        const preview = page.frameLocator('#preview');
        await preview.getByText('07:50 - 09:40', { exact: true }).first().waitFor();
        assert.equal(await page.locator('#save').isDisabled(), true);
        await page.locator('#publish').click();
        assert.match(await page.locator('#toast').textContent(), /確認或還原/);
        await item.locator('[data-f="title"]').fill('不應寫入');
        assert.notEqual(await item.locator('[data-f="title"]').inputValue(), '不應寫入');
        await item.locator('[data-act="trialrevert"]:visible').click();
        assert.equal(await move.textContent(), '07:10 - 09:00');
        await preview.getByText('07:10 - 09:00', { exact: true }).first().waitFor();
        assert.equal(await page.locator('#save').isDisabled(), true);
        await item.locator('[data-act="pendlink"][data-field="start"]').click();
        await item.locator('[data-act="trialconfirm"]:visible').click();
        assert.equal(await move.textContent(), '07:50 - 09:40');
        assert.equal(await page.locator('#save').isEnabled(), true);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'data/trip.json'), 'utf8')), trip);
        assert.equal(routeCalls, 0);
        assert.deepEqual(errors, []);
        console.log('原值 09:40 連動、清單／預覽、確認／還原與試算保護：通過');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
        cleanup(root);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
