#!/usr/bin/env node
/*
 * 移動列同步（只需要 Node）：
 *   node tools/sync-moves.js [--dry-run] [--root <專案根目錄>]
 * 對 data/trip.json 每天套用 Trip.model.deriveMoves（規則見 docs/adr/0007）：
 *   - 移動列時間與推導值不同 → 更新 time（應為空時刪除 time 欄位）
 *   - 兩站之間缺移動列 → 補上 { type: 'move', text, time }（只補不刪；多個移動列只警告）
 * 已一致時 data/trip.json 不變。寫入後請執行 node tools/build-data.js。--dry-run 只印不寫。
 */
const fs = require('fs');
const path = require('path');
const model = require('../js/model.js');

// 就地修改 trip；回傳 { updated, added, warnings, changes }（changes 是給人看的逐條說明）
function syncTrip(trip, places) {
    const out = { updated: 0, added: 0, warnings: [], changes: [] };
    for (const day of trip.days) {
        const r = model.deriveMoves(day, places);
        for (const m of r.moves) {
            if (!m.changed) continue;
            const item = day.items[m.index];
            out.changes.push(`DAY ${day.day} 第 ${m.index + 1} 項：${m.current == null ? '（無）' : m.current} → ${m.time == null ? '（清空）' : m.time}`);
            if (m.time == null) delete item.time; else item.time = m.time;
            out.updated++;
        }
        // insertIndex 依原陣列索引計，由後往前插
        for (const m of r.missing.slice().sort((a, b) => b.insertIndex - a.insertIndex)) {
            const item = { type: 'move', text: m.text };
            if (m.time != null) item.time = m.time;
            day.items.splice(m.insertIndex, 0, item);
            out.added++;
            out.changes.push(`DAY ${day.day} 補上移動列：${m.text}${m.time != null ? `（${m.time}）` : ''}`);
        }
        out.warnings.push(...r.warnings);
    }
    return out;
}

function main(argv) {
    const dry = argv.includes('--dry-run');
    const i = argv.indexOf('--root');
    const root = i >= 0 ? path.resolve(argv[i + 1]) : path.resolve(__dirname, '..');
    const tripFile = path.join(root, 'data/trip.json');
    const text = fs.readFileSync(tripFile, 'utf8');
    const trip = JSON.parse(text);
    const places = JSON.parse(fs.readFileSync(path.join(root, 'data/places.json'), 'utf8'));
    const r = syncTrip(trip, places);
    r.changes.forEach(c => console.log('·', c));
    r.warnings.forEach(w => console.log('警告：', w.message));
    console.log(`${dry ? '（dry-run，未寫檔）' : ''}更新 ${r.updated} 個移動列、補上 ${r.added} 個移動列、警告 ${r.warnings.length} 則`);
    if (!r.updated && !r.added) return;
    if (dry) return;
    fs.writeFileSync(tripFile, JSON.stringify(trip, null, 2) + '\n', 'utf8');
    console.log('已寫入 data/trip.json；請執行 node tools/build-data.js 產生資料檔');
}

module.exports = { syncTrip };

if (require.main === module) main(process.argv.slice(2));
