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
            items: day === 6
                ? [{ type: 'spot', title: `第 ${day} 天的景點` }]
                : (day <= 2
                    // 完整起訖區間：不管之後被拖到哪個位置（開頭/中間/結尾）都合法，不會因為挪動位置而觸發驗證錯誤
                    ? [{ type: 'spot', title: `第 ${day} 天的景點`, time: '09:00 - 09:30' }, { type: 'spot', title: `項目${day}-2`, time: '09:30 - 10:00' }]
                    : [{ type: 'spot', title: `第 ${day} 天的景點`, time: '09:00' }])
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
        // （先跑這段：還原後資料會回到初始狀態，下面的拖曳測試才能照初始順序斷言）
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

        // 04：標籤顯示驗證錯誤提示——DAY6 缺少邊界時間，標籤要出現錯誤提示；其餘天沒有錯誤，維持一般樣式
        const errClass = /(text-rose|border-rose|bg-rose)/;
        const tabClass = n => tab(n).getAttribute('class');
        await page.locator('[data-act="errtoggle"]').click();
        await page.locator('#errbar li').filter({ hasText: /DAY 6 第 1 項/ }).waitFor();
        assert.match(await tabClass(6), errClass, 'DAY6 標籤應該顯示錯誤提示');
        for (const n of [1, 2, 3, 4, 5]) assert.doesNotMatch(await tabClass(n), errClass, `DAY${n} 標籤不應該顯示錯誤提示`);
        await page.locator('[data-act="errtoggle"]').click(); // 收起錯誤清單；下面拖曳測試可能暫時產生新的驗證警告，收起避免清單文字跟項目文字重複

        // 修正：切到 DAY6，在「日設定」補上每日出發時間（這個只有單一項目的天，出發＝結束＝同一項），錯誤提示要即時消失，不用重新整理
        await tab(6).click();
        await page.locator('[data-act="daycfg"]').click();
        await page.locator('[data-boundary="departure"]').fill('09:00');
        await page.locator('[data-act="boundarylink"][data-field="departure"]').click();
        await page.locator('#errbar').filter({ hasText: '資料驗證通過' }).waitFor();
        assert.doesNotMatch(await tabClass(6), errClass, '修正後 DAY6 標籤的錯誤提示應該即時消失');
        await page.locator('[data-trialbar="departure"] [data-act="trialconfirm"]').click();

        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), trip);
        assert.deepEqual(errors, []);
        console.log('✓ 標籤列與單天視圖：切換只顯示選中天、標籤樣式、localStorage 記錄與退回 DAY1、窄視窗水平捲動、暫時套用期間鎖定切換標籤、標籤錯誤提示即時更新');

        // 拖曳：同一天內排序（既有行為，單天視圖下應該不受影響）、跨天搬到 DAY N 標籤
        await page.setViewportSize({ width: 1280, height: 900 });
        const row = text => page.locator('[data-row]', { hasText: text });
        const sums = async () => (await page.locator('[data-sum]').allTextContents()).map(t => t.replace(/^⚠\s*/, ''));

        // 回到 DAY1：目前項目順序是 [第 1 天的景點, 項目1-2]
        await tab(1).click();
        await row('第 1 天的景點').waitFor();
        assert.deepEqual(await sums(), ['第 1 天的景點', '項目1-2']);

        // 同一天內拖曳排序：把「項目1-2」拖到「第 1 天的景點」上方，變成 [項目1-2, 第 1 天的景點]
        await row('項目1-2').dragTo(row('第 1 天的景點'), { targetPosition: { x: 10, y: 2 } });
        assert.deepEqual(await sums(), ['項目1-2', '第 1 天的景點']);

        // 跨天（往後，1→2）：把「第 1 天的景點」拖到 DAY2 標籤上放開＝搬到 DAY2 開頭；afterMove 會自動切到 DAY2
        await row('第 1 天的景點').dragTo(tab(2));
        await row('第 2 天的景點').waitFor();
        assert.match(await tab(2).getAttribute('class'), /border-blue-600/);
        assert.deepEqual(await sums(), ['第 1 天的景點', '第 2 天的景點', '項目2-2']);
        assert.equal(await row('第 1 天的景點').count(), 1, '搬到 DAY2 開頭，應該只剩這一個');

        await tab(1).click();
        assert.deepEqual(await sums(), ['項目1-2'], 'DAY1 應該少了被搬走的項目');
        assert.equal(await row('第 1 天的景點').count(), 0, 'DAY1 不應該再看到被搬走的項目');

        // 跨天（往前，2→1）：把「項目2-2」拖到 DAY1 標籤上放開＝搬到 DAY1 結尾；afterMove 會自動切回 DAY1
        await tab(2).click();
        await row('第 2 天的景點').waitFor();
        await row('項目2-2').dragTo(tab(1));
        await row('項目1-2').waitFor();
        assert.match(await tab(1).getAttribute('class'), /border-blue-600/);
        assert.deepEqual(await sums(), ['項目1-2', '項目2-2']);

        await tab(2).click();
        assert.deepEqual(await sums(), ['第 1 天的景點', '第 2 天的景點'], 'DAY2 應該少了被搬走的項目');
        assert.equal(await row('項目2-2').count(), 0, 'DAY2 不應該再看到被搬走的項目');

        assert.deepEqual(errors, []);
        console.log('✓ 拖曳到 DAY N 標籤：同一天內排序不變、跨天往前搬到開頭、往後搬到結尾、原本那天少了該項目');
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
        cleanup(root);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
