const test = require('node:test');
const assert = require('node:assert/strict');
const trip = require('../data/trip.json');
const places = require('../data/places.json');
const routes = require('../data/routes.json');
const model = require('../js/model');

test('六天已確認的邊界、提醒、擇一組與路線均保留', () => {
    assert.deepEqual(trip.site.version, { number: 'v2.8', date: '2026/11/02' });
    assert.deepEqual(trip.days.map(d => { const b = model.getDayBoundaries(d); return [b.departure, b.end]; }), [
        ['07:10', '17:15'], ['08:30', '18:30'], ['07:30', '17:00'],
        ['08:30', '18:30'], ['09:30', '18:30'], ['08:16', '15:33']
    ]);
    for (const day of trip.days) for (const item of day.items) if (item.type === 'notice') assert.equal(item.time, undefined);
    for (const [day, place] of [[1, 'nanao-rest'], [3, 'greener-bnb'], [4, 'pingtung-farmhouse']]) {
        assert.ok(trip.days[day].items.some(i => i.type === 'notice' && i.place === place));
        assert.ok(model.getMapPoints(trip.days[day], places).some(p => p.id === place));
    }
    assert.equal(trip.days[3].items.find(i => i.title === '暫定終點').time, '18:30');
    assert.equal(trip.days[3].items.find(i => i.place === 'dapo-pond').time, '12:14 - 13:54');
    assert.equal(trip.days[3].items.find(i => i.place === 'brown-boulevard').alt, 'chishang');
    assert.equal(trip.days[5].items.find(i => i.place === 'taichung-end').time, '15:03 - 15:33');
    const keys = new Set(trip.days.flatMap(day => model.getLegs(day, places).map(leg => leg.key)));
    assert.equal(keys.size, 23);
    for (const key of keys) assert.ok(routes.legs[key], `缺少路線 ${key}`);
});
