// node --test tools/editor/places-logic.test.js
// 地點庫編輯的純邏輯（不碰 DOM）。測試縫：placeRefs、checkId、renameId、deletePlace、suggestId、newPlace、parking 轉換。
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./public/places-logic');

const trip = () => ({
    days: [
        { day: 1, stay: { place: 'inn' }, items: [{ type: 'spot', place: 'a' }, { type: 'move', text: 'x' }, { type: 'spot', place: 'inn' }] },
        { day: 2, items: [{ type: 'waypoint', place: 'a' }] }
    ],
    hotels: [{ place: 'inn', region: 'r' }, { place: 'b' }]
});
const places = () => ({ a: { name: 'A' }, inn: { name: '民宿' }, b: { name: 'B' }, c: { name: 'C' } });

test('placeRefs：列出住宿、行程項目、住宿區的引用位置', () => {
    assert.deepEqual(L.placeRefs(trip(), 'inn'), ['DAY 1 住宿', 'DAY 1 第 3 項', '住宿區第 1 間']);
    assert.deepEqual(L.placeRefs(trip(), 'a'), ['DAY 1 第 1 項', 'DAY 2 第 1 項']);
});

test('placeRefs：沒被引用回傳空陣列', () => {
    assert.deepEqual(L.placeRefs(trip(), 'c'), []);
});

test('checkId：格式只能是小寫英文、數字、連字號', () => {
    assert.equal(L.checkId(places(), 'new-1'), null);
    for (const bad of ['', 'Abc', 'a_b', 'a b', '中文']) assert.match(L.checkId(places(), bad), /小寫英文/);
});

test('checkId：與現有 id 重複會拒絕，但自己的 id 可以通過（exceptId）', () => {
    assert.match(L.checkId(places(), 'a'), /已存在/);
    assert.equal(L.checkId(places(), 'a', 'a'), null);
});

test('renameId：更新所有引用，並保留 places 的 key 順序', () => {
    const t = trip(), p = places();
    const res = L.renameId(t, p, 'inn', 'new-inn');
    assert.deepEqual(res, { ok: true, count: 3 });
    assert.deepEqual(Object.keys(p), ['a', 'new-inn', 'b', 'c']);
    assert.equal(p['new-inn'].name, '民宿');
    assert.equal(t.days[0].stay.place, 'new-inn');
    assert.equal(t.days[0].items[2].place, 'new-inn');
    assert.equal(t.hotels[0].place, 'new-inn');
    assert.equal(t.days[0].items[0].place, 'a');
    assert.deepEqual(L.placeRefs(t, 'inn'), []);
});

test('renameId：就地修改同一個 places 物件（草稿的參考不會失效）', () => {
    const p = places(), ref = p;
    L.renameId(trip(), p, 'c', 'd');
    assert.equal(p, ref);
    assert.ok('d' in ref && !('c' in ref));
});

test('renameId：新 id 不合法或重複時回錯誤，且完全不改動資料', () => {
    const t = trip(), p = places();
    const before = JSON.stringify({ t, p });
    assert.match(L.renameId(t, p, 'a', 'Bad Id').error, /小寫英文/);
    assert.match(L.renameId(t, p, 'a', 'b').error, /已存在/);
    assert.equal(JSON.stringify({ t, p }), before);
});

test('renameId：id 沒變時什麼都不做', () => {
    assert.deepEqual(L.renameId(trip(), places(), 'a', 'a'), { ok: true, count: 0 });
});

test('deletePlace：被引用時拒絕並列出引用位置，資料不動', () => {
    const p = places();
    const res = L.deletePlace(trip(), p, 'inn');
    assert.deepEqual(res, { ok: false, refs: ['DAY 1 住宿', 'DAY 1 第 3 項', '住宿區第 1 間'] });
    assert.ok('inn' in p);
});

test('deletePlace：沒被引用時刪除', () => {
    const p = places();
    assert.deepEqual(L.deletePlace(trip(), p, 'c'), { ok: true });
    assert.deepEqual(Object.keys(p), ['a', 'inn', 'b']);
});

test('suggestId：英文名稱轉 slug', () => {
    assert.equal(L.suggestId('Hualien Station!', {}), 'hualien-station');
    assert.equal(L.suggestId('  A__B  c ', {}), 'a-b-c');
});

test('suggestId：已存在就加流水號', () => {
    assert.equal(L.suggestId('A', { a: {} }), 'a-2');
    assert.equal(L.suggestId('A', { a: {}, 'a-2': {} }), 'a-3');
});

test('suggestId：沒有可用英數字（例如純中文）時用 place 當底', () => {
    assert.equal(L.suggestId('七星潭', {}), 'place');
    assert.equal(L.suggestId('七星潭', { place: {} }), 'place-2');
});

test('parkingFromText：一行一段，多行存陣列、單行存字串、空白存空字串', () => {
    assert.deepEqual(L.parkingFromText('a\n\n b \n'), ['a', 'b']);
    assert.equal(L.parkingFromText('只有一行'), '只有一行');
    assert.equal(L.parkingFromText(' \n '), '');
});

test('parkingToText：字串、陣列、沒有值', () => {
    assert.equal(L.parkingToText(['a', 'b']), 'a\nb');
    assert.equal(L.parkingToText('x'), 'x');
    assert.equal(L.parkingToText(undefined), '');
});

test('newPlace：建立最小地點並放到最後（key 順序），回傳 id', () => {
    const p = places();
    const id = L.newPlace(p, '七星潭');
    assert.equal(id, 'place');
    assert.deepEqual(p.place, { name: '七星潭', mapType: 'attraction' });
    assert.equal(Object.keys(p).pop(), 'place');
});
