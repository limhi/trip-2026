/*
 * 文字與時間表的一致性警告（tools/check.js 使用；只警告，不擋發布）。
 *
 * 規則：停留多久、車程多久、幾點到，只寫在項目的 time／buffer（時間表）；
 * 說明文字與攻略不重複寫這些數字，否則時間表一改就不一致。見 docs/DESIGN.md 第 16 節。
 *
 *   1. 行程說明（desc／note／text／title）與已排入行程地點的攻略，出現可由時間表推得的數字
 *   2. 攻略、停車說明提到的行程日期（11/15–11/20）不是該地點排定的那天；
 *      任何文字的「11/DD 是週X」「行程當天為週X」與實際星期不符
 *   3. 「明天 HH:MM 退房」與隔天的出發時間不符
 */
const model = require('../js/model');

const SECTION_KEYS = ['highlights', 'kidTips', 'ticketing', 'transport', 'cautions', 'conflicts'];
const ITEM_KEYS = ['title', 'text', 'desc', 'note'];

// 可由時間表推得的數字。「建議停留約…」是外部建議，不算
const DERIVED = [
    /行程(?:目前)?只?排(?:約|\s*\d)/,
    /行程[^，。；]{0,8}\d{1,2}:\d{2}(?!\s*場次)/,   // 「排 14:00 場次」是場次，不算
    /(?<!建議)停留(?:壓縮為)?約\s*\d/,
    /只留約\s*\d/,
    /回程約\s*\d/,
    /離開後約\s*\d/,
];
const DERIVED_MOVE = /車程約\s*\d/;   // 只查移動列：攻略裡的「車程約」多半是外部資訊

const short = s => (s.length > 36 ? s.slice(0, 36) + '…' : s);

function textWarnings(trip, places = {}, guides = {}) {
    const out = [];
    // 日期（幾號）→ 星期；地點 → 排定的日期
    const weekday = new Map(), placeDates = new Map();
    for (const day of trip.days) {
        const m = /(\d{1,2})\/(\d{1,2})（(.)）/.exec(day.date || '');
        if (!m) continue;
        weekday.set(+m[2], m[3]);
        for (const item of day.items) {
            if (!item.place) continue;
            if (!placeDates.has(item.place)) placeDates.set(item.place, new Set());
            placeDates.get(item.place).add(+m[2]);
        }
    }
    const tripDates = [...weekday.keys()];
    const isTripDate = d => tripDates.includes(d);

    const checkWeekday = (where, text) => {
        for (const m of text.matchAll(/(?<![\d/])11\/(\d{1,2})(?!\d)\s*(?:（|\()?(?:是|為)?\s*週([一二三四五六日])/g)) {
            const w = weekday.get(+m[1]);
            if (w && w !== m[2]) out.push(`${where}：寫「11/${m[1]}…週${m[2]}」，但 11/${m[1]} 是週${w}：${short(text)}`);
        }
    };
    // 攻略、停車說明：這個地點相關的文字只該提到它排定的日期
    const checkPlaceText = (where, id, text) => {
        const dates = placeDates.get(id);
        for (const m of text.matchAll(/(?<![\d/])11\/(\d{1,2})(?!\d)/g)) {
            if (isTripDate(+m[1]) && !dates.has(+m[1])) out.push(`${where}：提到 11/${m[1]}，但這個地點排在 ${[...dates].map(d => '11/' + d).join('、')}：${short(text)}`);
        }
        const m = /行程當天(?:為|是)週([一二三四五六日])/.exec(text);
        if (m && ![...dates].some(d => weekday.get(d) === m[1])) out.push(`${where}：寫「行程當天為週${m[1]}」，但這個地點排在${[...dates].map(d => '週' + weekday.get(d)).join('、')}：${short(text)}`);
        checkWeekday(where, text);
    };

    // 1、2、3：行程項目
    trip.days.forEach((day, di) => {
        day.items.forEach((item, i) => {
            const where = `DAY ${day.day} 第 ${i + 1} 項（${model.itemLabel(item, places)}）`;
            for (const k of ITEM_KEYS) {
                const text = item[k];
                if (typeof text !== 'string') continue;
                if (DERIVED.some(r => r.test(text)) || (item.type === 'move' && DERIVED_MOVE.test(text))) out.push(`${where}：${k} 寫了可由時間表推得的數字（停留、車程、抵達時間請只留在時間表）：${short(text)}`);
                checkWeekday(where, text);
                const m = /明天\s*(\d{1,2}:\d{2})\s*退房/.exec(text);
                const next = trip.days[di + 1];
                if (m && next) {
                    const dep = model.getDayBoundaries(next).departure;
                    if (dep && dep !== m[1]) out.push(`${where}：寫「明天 ${m[1]} 退房」，但 DAY ${next.day} 的出發時間是 ${dep}`);
                }
            }
        });
    });

    // 1、2：已排入行程地點的攻略（沒排的地點頁面點不到，不查）
    for (const [id, g] of Object.entries(guides)) {
        if (!placeDates.has(id)) continue;
        for (const k of SECTION_KEYS) for (const item of g[k] || []) {
            if (item.hidden || typeof item.t !== 'string') continue;
            const where = `攻略 ${id}.${k}`;
            if (DERIVED.some(r => r.test(item.t))) out.push(`${where}：寫了可由時間表推得的數字（請改成不含數字的說法）：${short(item.t)}`);
            checkPlaceText(where, id, item.t);
        }
    }
    // 2：停車說明
    for (const [id, place] of Object.entries(places)) {
        if (!placeDates.has(id)) continue;
        for (const text of place.parking || []) if (typeof text === 'string') checkPlaceText(`地點 ${id} 的交通與停車`, id, text);
    }
    return out;
}

module.exports = { textWarnings };
