// 發布流程（spec 4.5）：驗證 → 檢查 → 版本號 → commit → push 到 main。
// 全部同步執行；任一步失敗就丟出帶 status 與 steps 的錯誤，不重試、不 --force。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { isDeepStrictEqual } = require('util');
const buildData = require('../build-data');
const store = require('./store');
const cache = require('../routing/cache');
const model = require('../../js/model');

const ADD_FILES = ['data/trip.json', 'data/places.json', 'data/trip.js', 'data/places.js', 'data/routes.json', 'data/routes.js', 'data/routes-geo.js'];
const pad = n => String(n).padStart(2, '0');

function run(cmd, args, cwd, opts = {}) {
    const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, ...opts });
    return { ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}${r.error ? r.error.message : ''}`.trim() };
}
const gitRun = (root, ...args) => run('git', args, root);

const currentBranch = root => { const r = gitRun(root, 'rev-parse', '--abbrev-ref', 'HEAD'); return r.ok ? r.output : ''; };
const readJson = (root, f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

function nextVersion(trip, now) {
    const m = /^v(\d+)\.(\d+)$/.exec(trip.site.version.number);
    const d = now();
    return { number: `v${m[1]}.${+m[2] + 1}`, date: `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}` };
}

// 與 HEAD 版本比對：哪幾天、哪些地點、住宿區、其他網站設定有異動（site.version 不算）
function summarize(oldData, newData) {
    const same = isDeepStrictEqual;
    const days = [];
    newData.trip.days.forEach((day, i) => {
        const old = oldData.trip.days[i];
        if (same(old, day)) return;
        const a = old ? old.items.map(x => JSON.stringify(x)) : [], b = day.items.map(x => JSON.stringify(x));
        const added = b.filter(k => !a.includes(k)).length, removed = a.filter(k => !b.includes(k)).length;
        days.push({ day: day.day, note: added || removed ? `新增或修改 ${added}、移除或修改 ${removed} 項` : '項目順序或日設定有變' });
    });
    const places = [];
    for (const id of new Set([...Object.keys(oldData.places), ...Object.keys(newData.places)])) {
        const o = oldData.places[id], n = newData.places[id];
        if (!o) places.push({ id, name: n.name, kind: 'added' });
        else if (!n) places.push({ id, name: o.name, kind: 'removed' });
        else if (!same(o, n)) places.push({ id, name: n.name, kind: 'modified' });
    }
    const rest = trip => { const { days: _d, hotels: _h, ...r } = trip; return { ...r, site: { ...r.site, version: null } }; };
    return {
        days, places,
        hotels: !same(oldData.trip.hotels, newData.trip.hotels),
        other: !same(rest(oldData.trip), rest(newData.trip))
    };
}

function headData(root) {
    const out = {};
    for (const t of buildData.TARGETS) {
        const r = gitRun(root, 'show', `HEAD:${t.json}`);
        if (!r.ok) return null;
        out[t.key] = JSON.parse(r.output);
    }
    return out;
}

const PLACE_VERB = { added: '新增', removed: '刪除', modified: '修改' };
function defaultMessage(next, changes) {
    const parts = [
        ...changes.days.map(d => `DAY ${d.day}`),
        ...changes.places.map(p => `${PLACE_VERB[p.kind]}「${p.name}」`),
        ...(changes.hotels ? ['住宿區'] : []),
        ...(changes.other ? ['網站設定'] : [])
    ];
    return `${next.number}：調整 ${parts.length ? parts.slice(0, 4).join('、') : '無異動'}`;
}

function plan(root, { now = () => new Date() } = {}) {
    const disk = { trip: readJson(root, 'data/trip.json'), places: readJson(root, 'data/places.json') };
    const head = headData(root);
    const changes = summarize(head || { trip: { days: [], hotels: [], site: {} }, places: {} }, disk);
    const next = nextVersion(disk.trip, now);
    const branch = currentBranch(root);
    let missingRoutes = [];
    try { missingRoutes = cache.missingKeys(disk.trip, disk.places, readJson(root, 'data/routes.json')); } catch { /* 沒有快取檔：check.js 會處理 */ }
    return {
        branch, onMain: branch === 'main',
        version: { current: disk.trip.site.version, next },
        changes,
        hasChanges: !!(changes.days.length || changes.places.length || changes.hotels || changes.other),
        message: defaultMessage(next, changes),
        missingRoutes,
        files: ADD_FILES.filter(f => fs.existsSync(path.join(root, f)))
    };
}

// body = { trip, places, message }：trip／places 是編輯器目前的內容，用來確認都已存檔
function publish(root, body, { now = () => new Date() } = {}) {
    const steps = [];
    const fail = (status, name, output, message = output) => {
        steps.push({ name, ok: false, output });
        throw Object.assign(new Error(message), { status, steps });
    };
    const pass = (name, output = '') => steps.push({ name, ok: true, output });
    const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
    const runCheck = name => {
        const r = run(process.execPath, [path.join(root, 'tools', 'check.js')], root);
        if (!r.ok) fail(422, name, r.output, `tools/check.js 沒有通過，已停止（細節見輸出）`);
        pass(name, r.output);
    };

    if (!isObj(body) || !isObj(body.trip) || !isObj(body.places)) fail(400, '請求', '', '請求需要 trip 與 places（編輯器目前的內容，用來確認已存檔）');
    const message = typeof body.message === 'string' ? body.message : '';
    if (!message.trim()) fail(400, '請求', '', '需要 commit 訊息');

    const branch = currentBranch(root);
    if (branch !== 'main') fail(409, '分支', `目前在 ${branch || '未知分支'}`, `只能在 main 分支發布，目前在「${branch || '未知分支'}」`);
    pass('分支', 'main');

    // 1. 磁碟上的 JSON 要與編輯器內容一致
    const disk = { trip: readJson(root, 'data/trip.json'), places: readJson(root, 'data/places.json') };
    if (!isDeepStrictEqual(disk.trip, body.trip) || !isDeepStrictEqual(disk.places, body.places)) {
        fail(409, '確認已存檔', '', '編輯器有未存檔的修改，請先存檔再發布');
    }
    pass('確認已存檔');

    // 2. 資料驗證
    const errors = model.validate(disk.trip, disk.places);
    if (errors.length) fail(422, '資料驗證', errors.join('\n'), `資料驗證有 ${errors.length} 個問題，已停止`);
    pass('資料驗證');

    // 3. check.js
    runCheck('node tools/check.js');

    // 4. 版本號 +1，重新產生 data/*.js，再檢查一次
    const next = nextVersion(disk.trip, now);
    disk.trip.site.version = next;
    let routes;
    try { routes = readJson(root, 'data/routes.json'); } catch { routes = undefined; }
    try {
        buildData.writeAtomic(root, { 'data/trip.json': store.serialize(disk.trip), ...buildData.buildFrom({ ...disk, routes }) });
    } catch (e) { fail(500, '更新版本號', e.message); }
    pass('更新版本號', `${next.number}（${next.date}）`);
    runCheck('node tools/check.js（版本號更新後）');

    // 5. commit（只提交發布清單內的檔案）
    const files = ADD_FILES.filter(f => fs.existsSync(path.join(root, f)));
    const add = gitRun(root, 'add', '--', ...files);
    if (!add.ok) fail(500, 'git add', add.output);
    const commit = gitRun(root, 'commit', '--cleanup=whitespace', '-m', message, '--', ...files);
    if (!commit.ok) fail(500, 'git commit', commit.output);
    pass('git commit', commit.output);
    const sha = gitRun(root, 'rev-parse', 'HEAD').output;

    // 6. push（失敗只回報，不重試、不 --force）
    const push = run('git', ['push', 'origin', 'main'], root, { timeout: 120000 });
    if (!push.ok) fail(502, 'git push origin main', push.output, `push 失敗：本機 commit ${sha.slice(0, 7)} 已保留，沒有重試也沒有強制推送。${push.output}`);
    pass('git push origin main', push.output);

    return { ok: true, version: next, commit: sha, steps };
}

module.exports = { plan, publish, summarize, ADD_FILES };
