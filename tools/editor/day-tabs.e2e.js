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
            items: [{ type: 'spot', title: `第 ${day} 天的景點` }, { type: 'spot', title: `項目${day}-2` }]
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

        // 拖曳：同一天內排序（既有行為，單天視圖下應該不受影響）、跨天搬到 DAY N 標籤
        await page.setViewportSize({ width: 1280, height: 900 });
        const row = text => page.locator('[data-row]', { hasText: text });
        const sums = async () => (await page.locator('[data-sum]').allTextContents()).map(t => t.replace(/^⚠\s*/, ''));

        // 回到 DAY1：目前項目順序是 [第 1 天的景點, 項目1-2]
        await tab(1).click();
        await page.getByText('第 1 天的景點').waitFor();
        assert.deepEqual(await sums(), ['第 1 天的景點', '項目1-2']);

        // 同一天內拖曳排序：把「項目1-2」拖到「第 1 天的景點」上方，變成 [項目1-2, 第 1 天的景點]
        await row('項目1-2').dragTo(row('第 1 天的景點'), { targetPosition: { x: 10, y: 2 } });
        assert.deepEqual(await sums(), ['項目1-2', '第 1 天的景點']);

        // 跨天（往後，1→2）：把「第 1 天的景點」拖到 DAY2 標籤上放開＝搬到 DAY2 開頭；afterMove 會自動切到 DAY2
        await row('第 1 天的景點').dragTo(tab(2));
        await page.getByText('第 2 天的景點').waitFor();
        assert.match(await tab(2).getAttribute('class'), /border-blue-600/);
        assert.deepEqual(await sums(), ['第 1 天的景點', '第 2 天的景點', '項目2-2']);
        assert.equal(await page.getByText('第 1 天的景點').count(), 1, '搬到 DAY2 開頭，應該只剩這一個');

        await tab(1).click();
        assert.deepEqual(await sums(), ['項目1-2'], 'DAY1 應該少了被搬走的項目');
        assert.equal(await page.getByText('第 1 天的景點').count(), 0, 'DAY1 不應該再看到被搬走的項目');

        // 跨天（往前，2→1）：把「項目2-2」拖到 DAY1 標籤上放開＝搬到 DAY1 結尾；afterMove 會自動切回 DAY1
        await tab(2).click();
        await page.getByText('第 2 天的景點').waitFor();
        await row('項目2-2').dragTo(tab(1));
        await page.getByText('項目1-2').waitFor();
        assert.match(await tab(1).getAttribute('class'), /border-blue-600/);
        assert.deepEqual(await sums(), ['項目1-2', '項目2-2']);

        await tab(2).click();
        assert.deepEqual(await sums(), ['第 1 天的景點', '第 2 天的景點'], 'DAY2 應該少了被搬走的項目');
        assert.equal(await page.getByText('項目2-2').count(), 0, 'DAY2 不應該再看到被搬走的項目');

        assert.deepEqual(errors, []);
        console.log('✓ 拖曳到 DAY N 標籤：同一天內排序不變、跨天往前搬到開頭、往後搬到結尾、原本那天少了該項目');

        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), trip, '沒有存檔，磁碟上的資料不應該被改動');
        assert.deepEqual(errors, []);
        console.log('✓ 標籤列與單天視圖：切換只顯示選中天、標籤樣式、localStorage 記錄與退回 DAY1、窄視窗水平捲動');
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
        cleanup(root);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
