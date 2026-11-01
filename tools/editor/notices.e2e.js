// 真實編輯器與公開預覽；只寫暫存專案、受控路線，禁止外部請求與發布。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../../js/model');
const store = require('./store');
const cache = require('../routing/cache');
const build = require('../build-data');
const { makeRepoCopy, cleanup, openEditorBrowser } = require('./test-helpers');
const { createServer } = require('./server');

(async () => {
    const root = makeRepoCopy();
    let browser, server;
    try {
        const data = store.load(root);
        const [a, b, c] = Object.keys(data.places).filter(id => {
            const p = data.places[id];
            return p.lat != null && p.lng != null && p.infoType;
        });
        const day = data.trip.days[0];
        day.items = [
            { type: 'spot', place: a, title: '前站', time: '09:00 - 10:00' },
            { type: 'notice', place: b, title: '有地點提醒', time: '16:00 - 17:00', desc: '21:00 再決定' },
            { type: 'notice', title: '未定移動', time: '18:00 - 19:00', desc: '途中休息，20:00 僅備註' },
            { type: 'spot', place: c, title: '後站', time: '10:00 - 11:00' }
        ];
        // 刻意保留舊時間於磁碟，驗證載入沒有覆寫檔案。
        const original = JSON.stringify(data.trip, null, 2) + '\n';
        fs.writeFileSync(path.join(root, 'data/trip.json'), original, 'utf8');
        build.writeAtomic(root, build.buildFrom(data));
        const legs = {};
        for (const d of data.trip.days) for (const leg of M.getLegs(d, data.places)) legs[leg.key] = {
            distance: 1000, duration: 600, geometry: '', provider: 'test', computedAt: '2026-11-02'
        };
        cache.write(root, { profile: 'driving', legs });
        let calls = 0;
        server = createServer({ root, provider: { route: async () => { calls++; throw Error('禁止外部路線'); } } });
        const session = await openEditorBrowser(server);
        browser = session.browser;
        const { page, errors } = session;
        await page.locator('#status').filter({ hasText: '已存檔' }).waitFor();
        const item = ii => page.locator(`[data-item][data-di="0"][data-ii="${ii}"]`);
        await item(1).locator('[data-row]').click();
        assert.equal(await item(1).locator('[data-f="time"], [data-f="start"], [data-f="end"], [data-f="tail"]').count(), 0);
        assert.equal(await item(1).locator('[data-time]').textContent(), '');
        assert.equal(await item(2).locator('[data-time]').textContent(), '');
        assert.equal(fs.readFileSync(path.join(root, 'data/trip.json'), 'utf8'), original);
        const preview = page.frameLocator('#preview');
        await preview.getByText('有地點提醒', { exact: true }).waitFor();
        assert.equal(await preview.getByText('16:00 - 17:00', { exact: true }).count(), 0);
        assert.equal(await preview.locator('#day-1 .auto-leg-row').count(), 2);
        assert.equal(await preview.locator('#day-1 .map-number-badge').count(), 3);
        const card = preview.locator(`#day-1 [data-place="${b}"]`).filter({ hasText: '有地點提醒' });
        await card.click();
        await preview.locator('#contact-modal-title').getByText(data.places[b].name, { exact: true }).waitFor();
        assert.ok((await preview.locator('#contact-actions a').evaluateAll(links => links.map(a => a.href))).some(h => h.includes('google.com/maps') || h === data.places[b].navigationUrl));
        await page.locator('#preview').press('Escape');
        await item(0).locator('[data-row]').click();
        await item(0).locator('[data-f="end"]').fill('10:15');
        await item(0).locator('[data-act="pendlink"][data-field="end"]').click();
        await preview.getByText('10:15 - 11:15', { exact: true }).waitFor();
        assert.equal(await item(3).locator('[data-time]').textContent(), '10:15 - 11:15');
        assert.equal(await item(1).locator('[data-time]').textContent(), '');
        await item(0).locator('[data-act="trialconfirm"]:visible').click();
        await page.locator('#save').click();
        await page.locator('#status').filter({ hasText: '已存檔' }).waitFor();
        const saved = await (await page.request.get(new URL('/api/data', page.url()).href)).json();
        assert.equal(saved.trip.days[0].items.length, 4);
        assert.deepEqual(saved.trip.days[0].items.filter(i => i.type === 'notice'), [
            { type: 'notice', place: b, title: '有地點提醒', desc: '21:00 再決定' },
            { type: 'notice', title: '未定移動', desc: '途中休息，20:00 僅備註' }
        ]);
        assert.deepEqual(M.getLegs(saved.trip.days[0], saved.places).map(l => [l.fromId, l.toId]), [[a, b], [b, c]]);
        await page.reload();
        await item(3).locator('[data-time]').filter({ hasText: '10:15 - 11:15' }).waitFor();
        assert.equal(await page.locator('[data-item][data-di="0"]').count(), 4);
        assert.equal(calls, 0);
        assert.deepEqual(errors, []);
        console.log('提醒無時間、連動略過、公開預覽／聯絡導航／路段保留、存取草稿：通過');
    } finally {
        if (browser) await browser.close();
        if (server && server.listening) await new Promise(resolve => server.close(resolve));
        cleanup(root);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
