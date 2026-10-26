// node --test tools/public-blocks.test.js：公開頁面的行程區塊（js/blocks.js、js/map.js 的 HTML 部分）套用路線快取後的樣子
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
function load() {
    const ctx = { window: {}, console }; vm.createContext(ctx);
    for (const f of ['js/model.js', 'js/route-view.js', 'js/blocks.js', 'js/map.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
    }
    return ctx.window.Trip;
}
const Trip = load();

const P = {
    a: { name: 'A 景點', lat: 24.1, lng: 121.1 },
    b: { name: 'B 景點', lat: 24.2, lng: 121.2 },
    c: { name: 'C 景點', lat: 24.3, lng: 121.3 }
};
const KEY_AB = '121.10000,24.10000>121.20000,24.20000';
const KEY_BC = '121.20000,24.20000>121.30000,24.30000';
const SITE = { routing: { trafficFactor: 1.25, maxLegMinutes: 180 } };
const card = place => ({ type: 'spot', tag: '景點', place });
const drive = extra => ({ type: 'drive', time: '08:00 - 09:00', text: '開車前往', ...extra });
const day = (items, extra) => ({ day: 1, date: '11/15', title: '測試', items, ...extra });
const CACHE = { legs: { [KEY_AB]: { distance: 75323, duration: 3900 }, [KEY_BC]: { distance: 20000, duration: 1200 } } };
const render = (d, routes) => Trip.blocks.dayCard(d, { places: P, routes, site: SITE }, '');
const count = (html, re) => (html.match(re) || []).length;

test('沒有快取（routes 為 undefined 或空）：沒有自動連接列、沒有總車程，交通列維持手寫', () => {
    const d = day([card('a'), drive({ duration: '約 1 小時' }), card('b'), card('c')]);
    for (const routes of [undefined, { legs: {} }]) {
        const html = render(d, routes);
        assert.equal(count(html, /auto-leg-row/g), 0);
        assert.equal(count(html, /day-drive-summary/g), 0);
        assert.ok(html.includes('(約 1 小時)'));
    }
});

test('綁定的交通列沒有 duration：顯示計算結果與係數說明；text 不變', () => {
    const html = render(day([card('a'), drive(), card('b')]), CACHE);
    assert.ok(html.includes('開車前往'));
    assert.ok(html.includes('(約 1 小時 21 分・75.3 km)'), html);
    assert.ok(html.includes('預估・含路況緩衝 ×1.25'));
});

test('綁定的交通列有手寫 duration：用手寫的，不顯示計算結果', () => {
    const html = render(day([card('a'), drive({ duration: '約 2 小時' }), card('b')]), CACHE);
    assert.ok(html.includes('(約 2 小時)'));
    assert.equal(count(html, /auto-leg-duration/g), 0);
});

test('move 列也一樣：沒有 duration 才顯示計算結果', () => {
    const html = render(day([card('a'), { type: 'move', time: '09:00', text: '移動' }, card('b')]), CACHE);
    assert.ok(html.includes('(約 1 小時 21 分・75.3 km)'));
});

test('兩個標記之間沒有交通列：在前一個標記後補唯讀連接列「車程約 …（自動）」', () => {
    const html = render(day([card('a'), card('b'), card('c')]), CACHE);
    assert.equal(count(html, /class="[^"]*auto-leg-row/g), 2);
    assert.ok(html.includes('車程約 1 小時 21 分・75.3 km（自動）'));
    assert.ok(html.includes('車程約 25 分・20.0 km（自動）'));
    // 位置：A 之後、B 之前
    const iA = html.indexOf('A 景點'), iRow = html.indexOf('auto-leg-row'), iB = html.indexOf('B 景點');
    assert.ok(iA < iRow && iRow < iB);
});

test('兩標記之間有沒有交通的項目（例如提醒卡）：連接列仍緊接在前一個標記之後', () => {
    const html = render(day([card('a'), { type: 'notice', tag: '提醒', title: '中間提醒' }, card('b')]), CACHE);
    const iA = html.indexOf('A 景點'), iRow = html.indexOf('auto-leg-row'), iNotice = html.indexOf('中間提醒'), iB = html.indexOf('B 景點');
    assert.ok(iA < iRow && iRow < iNotice && iNotice < iB);
});

test('連接列只在有快取時補；兩標記之間有多個交通列時不補也不綁定', () => {
    const partial = render(day([card('a'), card('b'), card('c')]), { legs: { [KEY_AB]: CACHE.legs[KEY_AB] } });
    assert.equal(count(partial, /class="[^"]*auto-leg-row/g), 1);
    const two = render(day([card('a'), drive(), drive({ text: '再開車' }), card('b')]), CACHE);
    assert.equal(count(two, /auto-leg-row/g), 0);
    assert.equal(count(two, /auto-leg-duration/g), 0);
    assert.ok(two.includes('總車程'));   // 路段仍計入當天總車程
});

test('closeLoop 的回程段不補連接列也不綁定', () => {
    const html = render(day([card('a'), card('b')], { closeLoop: true }), { legs: { ...CACHE.legs, '121.20000,24.20000>121.10000,24.10000': { distance: 1, duration: 60 } } });
    assert.equal(count(html, /class="[^"]*auto-leg-row/g), 1);
});

test('標題列：有快取時顯示總車程與總里程；缺段時標示部分路段未計算', () => {
    const full = render(day([card('a'), card('b'), card('c')]), CACHE);
    assert.ok(full.includes('總車程 約 1 小時 46 分・總里程 95.3 km'), full);
    assert.ok(!full.includes('部分路段未計算'));
    const part = render(day([card('a'), card('b'), card('c')]), { legs: { [KEY_AB]: CACHE.legs[KEY_AB] } });
    assert.ok(part.includes('部分路段未計算'));
});

test('mapPanelHtml：有快取時說明文字改為道路預估路線；沒有快取時維持原文字', () => {
    const d = day([card('a'), card('b')]);
    const plain = Trip.mapPanelHtml(d, P, { routes: undefined, site: SITE });
    const withRoutes = Trip.mapPanelHtml(d, P, { routes: CACHE, site: SITE });
    assert.ok(plain.includes('連線僅為順序示意'));
    assert.ok(!withRoutes.includes('連線僅為順序示意'));
    assert.ok(withRoutes.includes('實際請以導航為準'));
    assert.ok(withRoutes.includes('×1.25'));
    assert.equal(Trip.mapPanelHtml(d, P), plain);
});
