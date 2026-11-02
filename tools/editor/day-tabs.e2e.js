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
            items: [{ type: 'spot', title: `第 ${day} 天的景點` }]
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

        // 暫時套用中（整天重排）：切換標籤被擋，提示文案與既有「暫時套用中」規則一致；確認／還原後恢復可切換
        await tab(1).click();
        await page.getByText('第 1 天的景點').waitFor();
        await page.locator('[data-act="dayresched"]').click();
        await page.waitForFunction(() => document.querySelector('#status').textContent.includes('暫時套用中'));
        await tab(2).click();
        assert.equal(await page.getByText('第 1 天的景點').count(), 1, '暫時套用中切換標籤應該被擋下，畫面仍留在原本那天');
        assert.equal(await page.getByText('第 2 天的景點').count(), 0);
        assert.match(await tab(1).getAttribute('class'), /border-blue-600/);
        await page.locator('#toast').filter({ hasText: /確認|還原/ }).waitFor();

        await page.locator('[data-act="trialrevert"]:visible').click();
        await page.waitForFunction(() => !document.querySelector('#status').textContent.includes('暫時套用中'));
        await tab(2).click();
        await page.getByText('第 2 天的景點').waitFor();
        assert.match(await tab(2).getAttribute('class'), /border-blue-600/);

        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), trip);
        assert.deepEqual(errors, []);
        console.log('✓ 標籤列與單天視圖：切換只顯示選中天、標籤樣式、localStorage 記錄與退回 DAY1、窄視窗水平捲動、暫時套用期間鎖定切換標籤');
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
        cleanup(root);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
