const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWeek, buildTitle, applyTitles } = require('./weather');

const cell = (w, lo, hi) => `<td><span class="signal"><img src="/x.svg" alt="${w}" title="${w}"></span><p><span class="tem-C is-active">${lo} - ${hi}</span><span class="tem-F is-hidden">68 - 75</span></p></td>`;
const page = (pub, dates, day, night) => `<!-- <caption>發布時間：${pub}</caption> -->
<thead><tr><th scope="row">宜蘭縣</th>${dates.map(d => `<th scope="col" class="holiday">${d}<br>星期日</th>`).join('')}</tr></thead>
<tbody><tr class="day"><th scope="row">白天</th>${day.map(c => cell(...c)).join('')}</tr>
<tr class="night"><th scope="row">晚上</th>${night.map(c => cell(...c)).join('')}</tr>
<tr><th>體感溫度</th>${dates.map(() => '<td><span class="tem-C is-active">22 - 29</span></td>').join('')}</tr></tbody>`;
const html = page('11/14 05:00', ['11/15', '11/16'], [['陰短暫陣雨', 20, 24], ['晴時多雲', 21, 27]], [['陰天', 20, 22], ['多雲', 19, 21]]);

test('parseWeek：取出發布時間與每天白天／晚上的天氣和溫度', () => {
    assert.deepEqual(parseWeek(html), {
        pub: '11/14 05:00',
        days: { '11/15': { day: '陰短暫陣雨', dayT: '20–24', night: '陰天', nightT: '20–22' }, '11/16': { day: '晴時多雲', dayT: '21–27', night: '多雲', nightT: '19–21' } },
    });
});

test('parseWeek：格式不符就丟錯，不產生半套資料', () => {
    assert.throws(() => parseWeek('<html>403 Forbidden</html>'), /格式不符/);
    assert.throws(() => parseWeek(html.replace('<tr class="night">', '<tr class="other">')), /格式不符/);
    assert.throws(() => parseWeek(page('11/14 05:00', ['11/15', '11/16'], [['陰天', 20, 24]], [['陰天', 20, 22], ['多雲', 19, 21]])), /欄位數/);
});

test('buildTitle：多個縣市用箭頭連接，最後一個加晚上；缺那天的預報回傳 null', () => {
    const a = parseWeek(html), b = parseWeek(page('11/14 05:00', ['11/15', '11/16'], [['多雲', 22, 26], ['晴時多雲', 21, 25]], [['多雲', 21, 23], ['多雲', 21, 23]]));
    assert.equal(buildTitle('11/16', ['宜蘭', '花蓮'], { 宜蘭: a, 花蓮: b }), '宜蘭 晴時多雲 21–27°C ➔ 花蓮 晴時多雲 21–25°C，晚上多雲 21–23°C（氣象署 11/14 05:00 預報）');
    assert.equal(buildTitle('11/14', ['宜蘭'], { 宜蘭: a }), null);
});

test('applyTitles：只改天氣卡的標題；日期已過的那天不動；天氣卡不是恰好一張就丟錯', () => {
    const f = parseWeek(html);
    const forecasts = { 宜蘭: f, 花蓮: f, 台東: f, 屏東: f, 雲林: f, 台中: f };
    const mk = () => ({ days: [1, 2, 3, 4, 5, 6].map(n => ({ day: n, date: `11/${14 + n}（日）`, items: [{ type: 'waypoint', time: '08:00', place: 'x' }, { type: 'notice', tag: '天氣', title: '舊', desc: '提醒' }, { type: 'notice', tag: '找吃的', title: '別的提醒' }] })) });
    const trip = mk();
    const changes = applyTitles(trip, forecasts);
    assert.deepEqual(changes.map(c => c.day), [1, 2]);            // 預報只有 11/15、11/16
    assert.equal(trip.days[0].items[1].title, '宜蘭 陰短暫陣雨 20–24°C，晚上陰天 20–22°C（氣象署 11/14 05:00 預報）');
    assert.equal(trip.days[0].items[1].desc, '提醒');
    assert.equal(trip.days[0].items[2].title, '別的提醒');
    assert.equal(trip.days[2].items[1].title, '舊');
    assert.deepEqual(applyTitles(trip, forecasts), []);            // 再跑一次沒有變化
    const bad = mk(); bad.days[3].items.splice(1, 1);
    assert.throws(() => applyTitles(bad, forecasts), /DAY 4：天氣卡應該恰好 1 張/);
});
