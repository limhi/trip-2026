const test = require('node:test');
const assert = require('node:assert/strict');
const trip = require('../data/trip.json');
const places = require('../data/places.json');
const routes = require('../data/routes.json');
const model = require('../js/model');

test('六天已確認的邊界、提醒、擇一組與路線均保留', () => {
    assert.match(trip.site.version.number, /^v\d+\.\d+$/);
    assert.deepEqual(trip.days.map(d => { const b = model.getDayBoundaries(d); return [b.departure, b.end]; }), [
        ['07:20', '17:30'], ['08:30', '17:30'], ['08:50', '17:30'],
        ['09:00', '17:04'], ['09:30', '20:04'], ['08:16', '16:19']
    ]);
    for (const day of trip.days) for (const item of day.items) if (item.type === 'notice') assert.equal(item.time, undefined);
    assert.ok(trip.days[1].items.some(i => i.type === 'notice' && i.place === 'nanao-rest'));
    assert.ok(model.getMapPoints(trip.days[1], places).some(p => p.id === 'nanao-rest'));
    // DAY5 的屏東民宿已有明確入住時間，從 notice 改成 stay
    assert.ok(trip.days[4].items.some(i => i.type === 'stay' && i.place === 'pingtung-farmhouse'));
    assert.ok(model.getMapPoints(trip.days[4], places).some(p => p.id === 'pingtung-farmhouse'));
    // DAY4 的住宿提醒已補上明確入住時間，從待決定的 notice 改成 stay
    assert.ok(trip.days[3].items.some(i => i.type === 'stay' && i.place === 'greener-bnb'));
    assert.ok(model.getMapPoints(trip.days[3], places).some(p => p.id === 'greener-bnb'));
    assert.equal(trip.days[3].items.find(i => i.place === 'dapo-pond').time, '13:10 - 14:40');
    assert.equal(trip.days[3].items.find(i => i.place === 'brown-boulevard').alt, 'chishang');
    assert.equal(trip.days[5].items.find(i => i.place === 'taichung-end').time, '15:49 - 16:19');
    const keys = new Set(trip.days.flatMap(day => model.getLegs(day, places).map(leg => leg.key)));
    assert.equal(keys.size, 28);
    for (const key of keys) assert.ok(routes.legs[key], `缺少路線 ${key}`);
});
