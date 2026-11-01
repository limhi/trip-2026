// 真實編輯器操作；僅暫存 repo、本機 bare remote 與 fake provider。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { makeRepoCopy, cleanup } = require('./test-helpers');
const { createServer } = require('./server');
const store = require('./store');

async function main() {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const root = makeRepoCopy();
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-continuity-remote-'));
    const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
    git(remote, 'init', '-q', '--bare', '-b', 'main');
    git(root, 'config', 'user.name', 'tester');
    git(root, 'config', 'user.email', 'tester@example.com');
    git(root, 'remote', 'add', 'origin', remote);
    git(root, 'push', '-q', '-u', 'origin', 'main');
    const original = structuredClone(store.load(root).trip.days[0].items.map(i => i.time));
    let providerCalls = 0;
    const server = createServer({ root, provider: { name: 'test', async route() { providerCalls++; throw new Error('測試不查詢外部路線'); } } });
    let browser;
    try {
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        const base = `http://127.0.0.1:${server.address().port}`;
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => {
            if (route.request().url().startsWith(base)) return route.continue();
            if (route.request().url().includes('cdn.tailwindcss.com')) {
                const css = process.env.TAILWIND_CSS ? fs.readFileSync(process.env.TAILWIND_CSS, 'utf8') : '.hidden{display:none}.flex{display:flex}';
                return route.fulfill({ contentType: 'text/javascript', body: `const style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.append(style);` });
            }
            return route.abort();
        });
        await page.goto(base);
        await page.locator('#status').filter({ hasText: '已存檔' }).waitFor();
        const warning = page.locator('#routebar li').filter({ hasText: /DAY 1.*09:00.*09:40：空檔 40分/ });
        await warning.waitFor({ timeout: 3000 });
        assert.deepEqual(store.load(root).trip.days[0].items.map(i => i.time), original);
        const item = page.locator('[data-item][data-di="0"][data-ii="2"]');
        await item.locator('[data-row]').click();
        await item.locator('[data-f="desc"]').fill('文案時間 00:01，僅修改說明');
        await page.locator('#save').click();
        await page.locator('#status').filter({ hasText: '已存檔' }).waitFor();
        await warning.waitFor();
        assert.deepEqual(store.load(root).trip.days[0].items.map(i => i.time), original);
        await page.locator('#publish').click();
        await page.locator('#modal-body p').filter({ hasText: /DAY 1.*09:00.*09:40：空檔 40分/ }).waitFor({ timeout: 3000 });
        assert.equal(await page.locator('#m-ok').isEnabled(), true);
        await page.locator('#m-ok').click();
        await page.locator('#publog').filter({ hasText: /已發布 v/ }).waitFor({ timeout: 15000 });
        assert.deepEqual(store.load(root).trip.days[0].items.map(i => i.time), original);
        assert.equal(git(remote, 'rev-parse', 'main'), git(root, 'rev-parse', 'HEAD'));
        assert.deepEqual(errors, []);
        console.log(`✓ 編輯器載入／存檔／發布可見 40 分空檔；時間保留；本機發布成功（fake provider ${providerCalls} 次）`);
    } finally {
        if (browser) await browser.close();
        await new Promise(r => server.close(r));
        cleanup(root); cleanup(remote);
    }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
