#!/usr/bin/env node
// 真正編輯器原值連動；只使用暫存複本與假的路線，不存檔、不發布。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepoCopy, cleanup, prepareEdgeFixture, openEditorBrowser } = require('./test-helpers');

(async () => {
    const root = makeRepoCopy();
    const { trip, firstMove, target, server, routeCalls } = prepareEdgeFixture(root);
    assert.ok(target > firstMove);
    let browser;
    try {
        const session = await openEditorBrowser(server);
        browser = session.browser;
        const { page, errors } = session;
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
        assert.equal(routeCalls(), 0);
        assert.deepEqual(errors, []);
        console.log('原值 09:40 連動、清單／預覽、確認／還原與試算保護：通過');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
        cleanup(root);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
