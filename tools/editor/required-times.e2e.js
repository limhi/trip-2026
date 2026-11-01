// 真實編輯器、暫存 repo；不發布也不連外。
const assert = require('node:assert/strict');
const { makeRepoCopy, cleanup, openEditorBrowser } = require('./test-helpers');
const { createServer } = require('./server');
const store = require('./store');
(async () => {
    const root = makeRepoCopy();
    const data = store.load(root);
    data.trip.days[0].items[0].time = '17:10 後';
    store.save(root, data);
    const server = createServer({ root, provider: { route: async () => { throw Error('禁止連外'); } } });
    let browser;
    try {
        const opened = await openEditorBrowser(server);
        browser = opened.browser;
        const { page, errors } = opened;
        await page.locator('#status').filter({ hasText: '已存檔' }).waitFor();
        await page.locator('body').getByText(/DAY 1 第 1 項.*時間/).first().waitFor();
        await page.locator('#publish').click();
        await page.locator('#modal-body').getByText(/DAY 1 第 1 項.*時間/).first().waitFor();
        assert.equal(await page.locator('#m-ok').isDisabled(), true);
        assert.equal(store.load(root).trip.days[0].items[0].time, '17:10 後');
        assert.deepEqual(errors, []);
        console.log('✓ 缺時間草稿可載入，編輯器與發布視窗指出位置並禁止發布');
    } finally {
        if (browser) await browser.close();
        await new Promise(r => server.close(r));
        cleanup(root);
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
