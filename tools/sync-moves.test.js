// node --test tools/sync-moves.test.js：補齊缺的移動列（tools/sync-moves.js 的 syncTrip 與 CLI）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { syncTrip } = require('./sync-moves');

const P = {
    a: { name: 'A館', lat: 24.1, lng: 121.1 },
    b: { name: 'B館', lat: 24.2, lng: 121.2 },
    c: { name: 'C館', lat: 24.3, lng: 121.3 }
};
const spot = (place, time) => ({ type: 'spot', place, time });
const mk = items => ({ days: [{ day: 1, items }] });

test('既有移動列的時間與其他欄位完全不動（反向：舊規則會把 00:00 - 00:00 改成 10:00 - 10:40）', () => {
    const trip = mk([spot('a', '09:00 - 10:00'), { type: 'move', time: '00:00 - 00:00', text: '路上', note: '備註' }, spot('b', '10:40 - 11:00')]);
    const before = JSON.stringify(trip);
    const r = syncTrip(trip, P);
    assert.equal(JSON.stringify(trip), before);
    assert.equal(r.added, 0);
});

test('缺的移動列被補在兩站之間（由後往前插，多個缺口都正確），只有 type 與 text，不寫 time', () => {
    const trip = mk([spot('a', '09:00 - 10:00'), spot('b', '10:30 - 11:00'), spot('c', '12:00 - 13:00')]);
    const r = syncTrip(trip, P);
    const items = trip.days[0].items;
    assert.deepEqual(items.map(i => i.type), ['spot', 'move', 'spot', 'move', 'spot']);
    assert.deepEqual(items[1], { type: 'move', text: 'A館 ➔ B館' });
    assert.deepEqual(items[3], { type: 'move', text: 'B館 ➔ C館' });
    assert.equal(r.added, 2);
});

test('已齊全：沒有任何變動、可重複執行', () => {
    const trip = mk([spot('a', '09:00 - 10:00'), { type: 'move', time: '10:00 - 10:30', text: 'x' }, spot('b', '10:30 - 11:00')]);
    const before = JSON.stringify(trip);
    const r = syncTrip(trip, P);
    assert.equal(JSON.stringify(trip), before);
    assert.equal(r.added, 0);
    syncTrip(trip, P);
    assert.equal(JSON.stringify(trip), before);
});

test('不刪任何項目（多個移動列只警告）', () => {
    const trip = mk([spot('a', '09:00 - 10:00'), spot('b'), { type: 'move', text: 'm1' }, { type: 'move', text: 'm2' }, spot('c', '12:00 - 13:00')]);
    const r = syncTrip(trip, P);
    const items = trip.days[0].items;
    assert.deepEqual(items[1], { type: 'move', text: 'A館 ➔ B館' });
    assert.equal(items.length, 6);
    assert.ok(r.warnings.some(w => w.type === 'multiple'));
});

function tmpRoot(trip) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-moves-'));
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, 'data/trip.json'), JSON.stringify(trip, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'data/places.json'), JSON.stringify(P, null, 2) + '\n');
    return root;
}
const cli = (root, ...args) => spawnSync('node', [path.join(__dirname, 'sync-moves.js'), '--root', root, ...args], { encoding: 'utf8' });

test('CLI：寫入後再執行檔案不變；--dry-run 不寫檔', () => {
    const root = tmpRoot(mk([spot('a', '09:00 - 10:00'), spot('b', '10:30 - 11:00')]));
    const f = path.join(root, 'data/trip.json');
    const orig = fs.readFileSync(f, 'utf8');
    const d = cli(root, '--dry-run');
    assert.equal(d.status, 0);
    assert.equal(fs.readFileSync(f, 'utf8'), orig);
    assert.match(d.stdout, /補上 1/);
    const w = cli(root);
    assert.equal(w.status, 0);
    assert.match(w.stdout, /build-data/);
    const after = fs.readFileSync(f, 'utf8');
    assert.notEqual(after, orig);
    assert.ok(after.endsWith('}\n'));
    cli(root);
    assert.equal(fs.readFileSync(f, 'utf8'), after);
});
