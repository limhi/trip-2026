// 還原到上次發布（docs/DESIGN.md 第 14.9 節）：把資料檔退回目前分支的 HEAD。
// 一定先把修改存成 patch 備份（.git/editor-backups/，留最近 20 份）再還原；備份寫不進去就不還原。
// 只動 ADD_FILES 這 7 個資料檔，成套還原，其他檔案（verify.md 等）不碰。全部同步執行。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { httpError } = require('./store');
const { summarize, headData, ADD_FILES: FILES } = require('./publish');
const buildData = require('../build-data');

const KEEP = 20;
const pad = n => String(n).padStart(2, '0');

function git(root, ...args) {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return { ok: r.status === 0, stdout: r.stdout || '', output: `${r.stdout || ''}${r.stderr || ''}${r.error ? r.error.message : ''}`.trim() };
}

const lines = s => s.split('\n').map(l => l.trim()).filter(Boolean);
const inHead = (root, f) => git(root, 'cat-file', '-e', `HEAD:${f}`).ok;
const readJson = (root, f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

// HEAD 裡有的資料檔，其中與 HEAD 不同（含暫存區）的
function changedFiles(root) {
    const tracked = FILES.filter(f => inHead(root, f));
    const diff = tracked.length ? git(root, 'diff', '--name-only', 'HEAD', '--', ...tracked) : { stdout: '' };
    return { tracked, changed: lines(diff.stdout) };
}

function plan(root) {
    const branch = git(root, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim();
    const { changed } = changedFiles(root);
    let changes = null;
    try {
        const head = headData(root);
        const disk = { trip: readJson(root, 'data/trip.json'), places: readJson(root, 'data/places.json') };
        try { disk.routes = readJson(root, buildData.ROUTES_JSON); } catch { /* 沒有快取檔就當沒有路線 */ }
        if (head) changes = summarize(head, disk);
    } catch { /* JSON 壞掉：不列摘要，仍然可以還原 */ }
    return { branch, hasChanges: changed.length > 0, files: changed, changes, keep: KEEP };
}

function backupDir(root) {
    const rel = git(root, 'rev-parse', '--git-path', 'editor-backups').stdout.trim();
    return path.resolve(root, rel);
}

// 備份名稱依時間排序；超過 KEEP 份就刪最舊的
function pruneBackups(dir) {
    const names = fs.readdirSync(dir).filter(n => n.endsWith('.patch')).sort();
    for (const n of names.slice(0, Math.max(0, names.length - KEEP))) fs.rmSync(path.join(dir, n), { force: true });
}

function run(root, { now = () => new Date() } = {}) {
    const { tracked, changed } = changedFiles(root);
    if (!changed.length) throw httpError(409, '沒有可還原的異動：資料檔與 HEAD 相同');

    // 1. 備份：先寫好、確認非空才往下做
    const patch = git(root, 'diff', 'HEAD', '--', ...changed);
    if (!patch.ok || !patch.stdout) throw httpError(500, `無法建立備份，沒有還原：${patch.output || 'patch 是空的'}`);
    const d = now();
    const name = `discard-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.patch`;
    const dir = backupDir(root);
    const backup = path.join(dir, name);
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(backup, patch.stdout);
    } catch (e) {
        throw httpError(500, `無法寫入備份，沒有還原：${e.message}`);
    }

    // 2. 還原（工作目錄與暫存區一起）
    const restore = git(root, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked);
    if (!restore.ok) throw httpError(500, `備份已存成 ${backup}，但還原失敗：${restore.output}`);
    pruneBackups(dir);

    // 3. 確認備份真的能套回來，使用者才有退路
    const recoverable = git(root, 'apply', '--check', backup).ok;
    return {
        ok: true, restored: changed, backup, recoverable,
        applyCommand: `git apply "${backup}"`
    };
}

module.exports = { plan, run, FILES, KEEP };
