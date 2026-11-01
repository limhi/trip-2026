// 測試用：把 repo 複製到暫存目錄（含 git init），讓測試不會動到真的 data/
// 複本內的路線快取一律重設成空殼：真實 data/routes.json 有幾段會隨行程變動，測試不能依賴它
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const cache = require('../routing/cache');

const repoRoot = path.resolve(__dirname, '..', '..');
const SKIP = new Set(['.git', '.scratch', '.claude', 'node_modules']);

function makeRepoCopy() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-editor-'));
    fs.cpSync(repoRoot, dir, { recursive: true, filter: src => !SKIP.has(path.basename(src)) });
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    cache.write(dir, cache.empty());
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
    return dir;
}

const cleanup = dir => fs.rmSync(dir, { recursive: true, force: true });

// 連動／伸縮畫面共用的 Day 1 已知路線長度；呼叫者仍各自斷言操作結果。
function prepareEdgeFixture(root, firstTime) {
    const M = require('../../js/model');
    const trip = JSON.parse(fs.readFileSync(path.join(root, 'data/trip.json'), 'utf8'));
    const places = JSON.parse(fs.readFileSync(path.join(root, 'data/places.json'), 'utf8'));
    const firstMove = trip.days[0].items.findIndex(it => it.type === 'move');
    const target = trip.days[0].items.findIndex(it => it.time === '09:40 - 11:20');
    if (firstTime) {
        trip.days[0].items[0].time = firstTime;
        fs.writeFileSync(path.join(root, 'data/trip.json'), JSON.stringify(trip, null, 2) + '\n', 'utf8');
    }
    const route = M.getLegs(trip.days[0], places).find(leg => leg.rowIndex === firstMove);
    const legs = {};
    for (const day of trip.days) for (const leg of M.getLegs(day, places)) legs[leg.key] = {
        distance: 1000, duration: 1800, geometry: '', provider: 'test', computedAt: '2026-11-01'
    };
    legs[route.key].duration = 95 * 60 / M.getTrafficFactor(trip.days[0], trip.site);
    cache.write(root, { profile: 'driving', legs });
    let routeCalls = 0;
    const server = require('./server').createServer({ root, provider: { route: async () => { routeCalls++; throw Error('禁止真實路線'); } } });
    return { trip, firstMove, target, server, routeCalls: () => routeCalls };
}

// Playwright 延遲載入，Node 測試不需要瀏覽器套件。
async function openEditorBrowser(server) {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
        await page.goto(origin);
        if (process.env.TAILWIND_CSS) await page.addStyleTag({ content: fs.readFileSync(process.env.TAILWIND_CSS, 'utf8') });
        return { browser, page, errors };
    } catch (error) {
        await browser.close();
        throw error;
    }
}

module.exports = { makeRepoCopy, cleanup, repoRoot, prepareEdgeFixture, openEditorBrowser };
