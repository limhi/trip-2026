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

module.exports = { makeRepoCopy, cleanup, repoRoot };
