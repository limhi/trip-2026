const test = require('node:test');
const assert = require('node:assert/strict');
const trip = require('../data/trip.json');
const places = require('../data/places.json');
const routes = require('../data/routes.json');
const model = require('../js/model');

test('六天已確認的邊界、提醒、擇一組與路線均保留', () => {
    assert.deepEqual(trip.site.version, { number: 'v2.9', date: '2026/11/02' });
    assert.deepEqual(trip.days.map(d => { const b = model.getDayBoundaries(d); return [b.departure, b.end]; }), [
        ['07:20', '17:30'], ['08:30', '19:20'], ['08:30', '17:30'],
        ['09:00', '17:44'], ['09:30', '15:09'], ['08:16', '15:08']
    ]);
    for (const day of trip.days) for (const item of day.items) if (item.type === 'notice') assert.equal(item.time, undefined);
    for (const [day, place] of [[1, 'nanao-rest'], [4, 'pingtung-farmhouse']]) {
        assert.ok(trip.days[day].items.some(i => i.type === 'notice' && i.place === place));
        assert.ok(model.getMapPoints(trip.days[day], places).some(p => p.id === place));
    }
    // DAY4 的住宿提醒已補上明確入住時間，從待決定的 notice 改成 stay
    assert.ok(trip.days[3].items.some(i => i.type === 'stay' && i.place === 'greener-bnb'));
    assert.ok(model.getMapPoints(trip.days[3], places).some(p => p.id === 'greener-bnb'));
    assert.equal(trip.days[3].items.find(i => i.place === 'dapo-pond').time, '13:10 - 14:40');
    assert.equal(trip.days[3].items.find(i => i.place === 'brown-boulevard').alt, 'chishang');
    assert.equal(trip.days[5].items.find(i => i.place === 'taichung-end').time, '14:38 - 15:08');
    const keys = new Set(trip.days.flatMap(day => model.getLegs(day, places).map(leg => leg.key)));
    assert.equal(keys.size, 26);
    for (const key of keys) assert.ok(routes.legs[key], `缺少路線 ${key}`);
});
