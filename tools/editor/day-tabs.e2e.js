// 真實編輯器：「每日行程」分頁的標籤列與單天視圖（骨架）。只用暫存複本，不存檔、不發布。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepoCopy, cleanup, openEditorBrowser } = require('./test-helpers');
const { createServer } = require('./server');

const STORAGE_KEY = 'tripEditor:selectedDay';

(async () => {
    const root = makeRepoCopy();
    let browser, server;
    try {
        const file = path.join(root, 'data/trip.json');
        const trip = JSON.parse(fs.readFileSync(file, 'utf8'));
        trip.days = [1, 2, 3, 4, 5, 6].map(day => ({
            day, date: `11/${14 + day}`, title: `第 ${day} 天標題`,
            items: [{ type: 'spot', title: `第 ${day} 天的景點`, ...(day === 2 ? {} : { time: '09:00' }) }]
        }));
        fs.writeFileSync(file, JSON.stringify(trip, null, 2) + '\n', 'utf8');
        server = createServer({ root, provider: { async route() { throw Error('禁止外部路線'); } } });
        const opened = await openEditorBrowser(server);
        browser = opened.browser;
        const { page, errors } = opened;
        page.setDefaultTimeout(10000);

        const tab = n => page.locator(`[data-act="selectday"][data-tabday="${n}"]`);
        const storedDay = () => page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
        // reload() 會清掉 openEditorBrowser 注入的 Tailwind CSS，這裡重新整理後補注入一次
        const reload = async () => {
            await page.reload();
            if (process.env.TAILWIND_CSS) await page.addStyleTag({ content: fs.readFileSync(process.env.TAILWIND_CSS, 'utf8') });
        };

        // 沒有 localStorage 記錄：載入時退回 DAY1，畫面只看得到 DAY1 的項目
        await page.locator('#status').filter({ hasText: /已存檔|有未存檔/ }).waitFor();
        await page.getByText('第 1 天的景點').waitFor();
        for (const n of [2, 3, 4, 5, 6]) assert.equal(await page.getByText(`第 ${n} 天的景點`).count(), 0, `DAY${n} 的項目不應該在畫面上`);
        assert.match(await tab(1).getAttribute('class'), /border-blue-600/);
        assert.doesNotMatch(await tab(2).getAttribute('class'), /border-blue-600/);

        // 切換到 DAY3：只看得到 DAY3 的項目，DAY1 的項目不再出現；標籤樣式也換成選中
        await tab(3).click();
        await page.getByText('第 3 天的景點').waitFor();
        assert.equal(await page.getByText('第 1 天的景點').count(), 0);
        for (const n of [1, 2, 4, 5, 6]) assert.equal(await page.getByText(`第 ${n} 天的景點`).count(), 0);
        assert.match(await tab(3).getAttribute('class'), /border-blue-600/);
        assert.doesNotMatch(await tab(1).getAttribute('class'), /border-blue-600/);

        // 每次切換都立刻更新 localStorage
        assert.equal(await storedDay(), '3');
        await tab(5).click();
        await page.getByText('第 5 天的景點').waitFor();
        assert.equal(await storedDay(), '5');

        // 重新整理頁面：回到上次選中的 DAY5
        await reload();
        await page.getByText('第 5 天的景點').waitFor();
        assert.equal(await page.getByText('第 1 天的景點').count(), 0);
        assert.match(await tab(5).getAttribute('class'), /border-blue-600/);

        // localStorage 記錄的天已經不存在：退回 DAY1
        await page.evaluate(key => localStorage.setItem(key, '99'), STORAGE_KEY);
        await reload();
        await page.getByText('第 1 天的景點').waitFor();
        assert.match(await tab(1).getAttribute('class'), /border-blue-600/);

        // 清掉 localStorage：退回 DAY1
        await tab(4).click();
        await page.getByText('第 4 天的景點').waitFor();
        await page.evaluate(() => localStorage.clear());
        await reload();
        await page.getByText('第 1 天的景點').waitFor();
        assert.match(await tab(1).getAttribute('class'), /border-blue-600/);

        // 窄視窗：標籤列水平捲動，不換行、不跳動版面高度（實際版面寬度要靠真正的 Tailwind CSS 才能驗證）
        if (process.env.TAILWIND_CSS) {
            await page.setViewportSize({ width: 360, height: 700 });
            const tabbar = page.locator('[data-tabbar]');
            const [scrollWidth, clientWidth, overflowX, flexWrap] = await tabbar.evaluate(el => [el.scrollWidth, el.clientWidth, getComputedStyle(el).overflowX, getComputedStyle(el).flexWrap]);
            assert.ok(scrollWidth > clientWidth, `標籤列應該超出可視寬度才需要捲動（scrollWidth=${scrollWidth}, clientWidth=${clientWidth}）`);
            assert.equal(overflowX, 'auto');
            assert.notEqual(flexWrap, 'wrap');
            const tops = await Promise.all([1, 2, 3, 4, 5, 6].map(async n => (await tab(n).boundingBox()).y));
            assert.ok(tops.every(y => Math.abs(y - tops[0]) < 1), '標籤不應該換行，所有標籤的垂直位置應該相同');
        }

        // 04：標籤顯示驗證錯誤提示——DAY2 缺少邊界時間，標籤要出現錯誤提示；其餘天沒有錯誤，維持一般樣式
        const errClass = /(text-rose|border-rose|bg-rose)/;
        const tabClass = n => tab(n).getAttribute('class');
        await page.locator('[data-act="errtoggle"]').click();
        await page.locator('#errbar li').filter({ hasText: /DAY 2 第 1 項/ }).waitFor();
        assert.match(await tabClass(2), errClass, 'DAY2 標籤應該顯示錯誤提示');
        for (const n of [1, 3, 4, 5, 6]) assert.doesNotMatch(await tabClass(n), errClass, `DAY${n} 標籤不應該顯示錯誤提示`);

        // 修正：在「日設定」補上每日出發時間（這個只有單一項目的天，出發＝結束＝同一項），錯誤提示要即時消失，不用重新整理
        await tab(2).click();
        await page.locator('[data-act="daycfg"]').click();
        await page.locator('[data-boundary="departure"]').fill('09:00');
        await page.locator('[data-act="boundarylink"][data-field="departure"]').click();
        await page.locator('#errbar').filter({ hasText: '資料驗證通過' }).waitFor();
        assert.doesNotMatch(await tabClass(2), errClass, '修正後 DAY2 標籤的錯誤提示應該即時消失');
        await page.locator('[data-trialbar="departure"] [data-act="trialconfirm"]').click();

        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), trip);
        assert.deepEqual(errors, []);
        console.log('✓ 標籤列與單天視圖：切換只顯示選中天、標籤樣式、localStorage 記錄與退回 DAY1、窄視窗水平捲動、標籤錯誤提示即時更新');
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
        cleanup(root);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
