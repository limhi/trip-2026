#!/usr/bin/env node
/*
 * 補齊缺的移動列（只需要 Node）：
 *   node tools/sync-moves.js [--dry-run] [--root <專案根目錄>] [--reschedule <day>]
 * 對 data/trip.json 每天套用 Trip.model.deriveMoves／applyMoves（規則見 docs/adr/0007）：
 *   - 兩站之間缺移動列 → 補上 { type: 'move', text }（不寫 time；時間由編輯器依路線查詢長度連動，或整天重排決定）
 *   - 只補不刪；多個移動列、不在兩站之間的移動列只警告；既有移動列的時間不動
 * --reschedule <day>：對那一天先補缺的移動列、再整天重排（起點 = 第一個完整區間項目的開始；停留不變；移動列 = data/routes.json 的查詢時間 + 緩衝；
 *   沒有查詢結果沿用現有長度並警告；補出的列沒有查詢結果時留空並警告）。可重複執行；天不存在或不是整數會報錯並以非 0 結束。
 * 已齊全時 data/trip.json 不變。寫入後請執行 node tools/build-data.js。--dry-run 只印不寫。
 */
const fs = require('fs');
const path = require('path');
const model = require('../js/model.js');
const { rescheduleDay } = require('./editor/public/days-logic.js');

// 就地修改 trip；回傳 { added, warnings, changes }（changes 是給人看的逐條說明）
function syncTrip(trip, places) {
    const out = { added: 0, warnings: [], changes: [] };
    for (const day of trip.days) {
        const r = model.deriveMoves(day, places);
        model.applyMoves(day, r);
        for (const m of r.missing) {
            out.changes.push(`DAY ${day.day} 補上移動列：${m.text}`);
            out.added++;
        }
        out.warnings.push(...r.warnings);
    }
    return out;
}

// 對指定那一天補缺的移動列再整天重排（就地修改 trip；其他天不動）。邏輯與編輯器的「整天重排」按鈕相同（DaysLogic.rescheduleDay）。
// routes 是 data/routes.json 的內容（路線查詢快取）；day 不是整數或不存在就丟錯。回傳 { added, changed, warnings }
function rescheduleTrip(trip, places, routes, dayNo) {
    const day = Number.isInteger(dayNo) ? trip.days.find(d => d.day === dayNo) : null;
    if (!day) throw new Error(`DAY 必須是存在的整數天數（1–${trip.days.length}），收到：${dayNo}`);
    return rescheduleDay(day, places, { routes, site: trip.site });
}

function main(argv) {
    const dry = argv.includes('--dry-run');
    const i = argv.indexOf('--root');
    const root = i >= 0 ? path.resolve(argv[i + 1]) : path.resolve(__dirname, '..');
    const ri = argv.indexOf('--reschedule');
    const read = f => fs.readFileSync(path.join(root, f), 'utf8');
    const trip = JSON.parse(read('data/trip.json'));
    const places = JSON.parse(read('data/places.json'));
    const before = JSON.stringify(trip, null, 2) + '\n';
    if (ri >= 0) {
        const arg = argv[ri + 1];
        const dayNo = /^\d+$/.test(arg || '') ? Number(arg) : NaN;
        let routes = { legs: {} };
        try { routes = JSON.parse(read('data/routes.json')); } catch (e) { /* 沒有快取：移動列沒有查詢結果，會警告 */ }
        let r;
        try { r = rescheduleTrip(trip, places, routes, dayNo); } catch (e) { console.error(e.message); process.exit(1); }
        r.warnings.forEach(w => console.log('警告：', w.message));
        console.log(`${dry ? '（dry-run，未寫檔）' : ''}DAY ${dayNo}：補上 ${r.added} 個移動列、${r.changed} 項時間更新、警告 ${r.warnings.length} 則`);
    } else {
        const r = syncTrip(trip, places);
        r.changes.forEach(c => console.log('·', c));
        r.warnings.forEach(w => console.log('警告：', w.message));
        console.log(`${dry ? '（dry-run，未寫檔）' : ''}補上 ${r.added} 個移動列、警告 ${r.warnings.length} 則`);
    }
    const after = JSON.stringify(trip, null, 2) + '\n';
    if (after === before || dry) return;
    fs.writeFileSync(path.join(root, 'data/trip.json'), after, 'utf8');
    console.log('已寫入 data/trip.json；請執行 node tools/build-data.js 產生資料檔');
}

module.exports = { syncTrip, rescheduleTrip };

if (require.main === module) main(process.argv.slice(2));
