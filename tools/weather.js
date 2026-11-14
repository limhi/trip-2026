#!/usr/bin/env node
/*
 * 每日天氣提醒卡更新（2026/11/15–11/20 旅程期間，由本機 crontab 每天早上執行）：
 *   node tools/weather.js            抓氣象署一週縣市預報 → 改寫天氣卡標題 → 檢查 → 版本 +1 → commit → push main
 *   node tools/weather.js --dry-run  只印出會改成什麼，不寫檔
 *
 * 只改每天那張 { type: 'notice', tag: '天氣' } 的 title，其他內容一概不碰（說明文字是人寫的條件式提醒）。
 * 以下情況直接放棄、不發布：旅程已結束、不在 main、工作目錄有未提交的修改、抓不到或解析不了預報、
 * 找不到天氣卡、check.js 沒通過。使用者已授權這支腳本自動 push（只限天氣卡標題，到 11/20 為止）。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const TRIP_FILE = path.join(root, 'data', 'trip.json');
const LAST_DAY = '2026-11-20';
const COUNTY = { 宜蘭: '10002', 花蓮: '10015', 台東: '10014', 屏東: '10013', 雲林: '10009', 台中: '66' };
// 每天經過的縣市（依行程順序；最後一個是當晚所在地，會加上晚上的預報）
const DAY_COUNTIES = { 1: ['宜蘭'], 2: ['宜蘭', '花蓮'], 3: ['花蓮'], 4: ['花蓮', '台東'], 5: ['台東', '屏東'], 6: ['屏東', '雲林', '台中'] };
const url = code => `https://www.cwa.gov.tw/V8/C/W/County/MOD/Week/${code}_Week_PC.html`;

// 解析氣象署一週預報表格 → { pub: '11/14 05:00', days: { '11/15': { day, dayT, night, nightT } } }
function parseWeek(html) {
    const pub = (/發布時間：\s*([\d/]+ [\d:]+)/.exec(html) || [])[1];
    const dates = [...html.matchAll(/<th scope="col"[^>]*>\s*(\d{1,2}\/\d{1,2})\s*<br>/g)].map(m => m[1]);
    const rows = html.split(/<tr class="/).slice(1).map(r => r.split('</tr>')[0]);   // 只取這一列，後面沒有 class 的列（體感溫度）不算
    const pick = name => {
        const r = rows.find(x => x.startsWith(name + '"'));
        if (!r) return null;
        return {
            w: [...r.matchAll(/<img[^>]*title="([^"]+)"/g)].map(m => m[1]),
            t: [...r.matchAll(/tem-C is-active">\s*(-?\d+)\s*-\s*(-?\d+)\s*</g)].map(m => `${m[1]}–${m[2]}`),
        };
    };
    const day = pick('day'), night = pick('night');
    if (!pub || !dates.length || !day || !night) throw new Error('預報頁面格式不符（找不到發布時間、日期或白天／晚上兩列）');
    for (const r of [day, night]) if (r.w.length !== dates.length || r.t.length !== dates.length) throw new Error('預報頁面格式不符（欄位數與日期數不同）');
    const days = {};
    dates.forEach((d, i) => { days[d] = { day: day.w[i], dayT: day.t[i], night: night.w[i], nightT: night.t[i] }; });
    return { pub, days };
}

// 一天的標題；任一縣市沒有那天的預報（日期已過）就回傳 null
function buildTitle(date, counties, forecasts) {
    const parts = [];
    for (const [i, name] of counties.entries()) {
        const f = forecasts[name] && forecasts[name].days[date];
        if (!f) return null;
        parts.push(`${name} ${f.day} ${f.dayT}°C` + (i === counties.length - 1 ? `，晚上${f.night} ${f.nightT}°C` : ''));
    }
    return `${parts.join(' ➔ ')}（氣象署 ${forecasts[counties[0]].pub} 預報）`;
}

// 改寫 trip 裡的天氣卡標題；回傳有變動的清單。每天必須恰好一張天氣卡
function applyTitles(trip, forecasts) {
    const changes = [];
    for (const day of trip.days) {
        const counties = DAY_COUNTIES[day.day];
        const date = (/^(\d{1,2}\/\d{1,2})/.exec(day.date || '') || [])[1];
        if (!counties || !date) throw new Error(`DAY ${day.day}：沒有對應的縣市設定或日期`);
        const cards = day.items.filter(i => i.type === 'notice' && i.tag === '天氣');
        if (cards.length !== 1) throw new Error(`DAY ${day.day}：天氣卡應該恰好 1 張，實際 ${cards.length} 張`);
        const title = buildTitle(date, counties, forecasts);
        if (title && title !== cards[0].title) { changes.push({ day: day.day, from: cards[0].title, to: title }); cards[0].title = title; }
    }
    return changes;
}

const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return { iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, slash: `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}` }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

async function fetchWeek(code) {
    const res = await fetch(url(code), { headers: { 'User-Agent': 'Mozilla/5.0', Referer: `https://www.cwa.gov.tw/V8/C/W/County/County.html?CID=${code}` }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseWeek(await res.text());
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const now = today();
    console.log(`[${new Date().toLocaleString('sv')}] 天氣卡更新${dryRun ? '（dry-run）' : ''}`);
    if (now.iso > LAST_DAY) { console.log('旅程已結束，不更新（可以把 crontab 這一行刪掉）'); return; }
    if (!dryRun) {
        if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') throw new Error('不在 main 分支');
        if (git('status', '--porcelain')) throw new Error('工作目錄有未提交的修改，為了不混進別的變更，這次不更新');
        git('pull', '--ff-only', '--quiet', 'origin', 'main');
    }

    const forecasts = {};
    for (const [name, code] of Object.entries(COUNTY)) {
        try { forecasts[name] = await fetchWeek(code); }
        catch (e) { await sleep(5000); try { forecasts[name] = await fetchWeek(code); } catch (e2) { throw new Error(`抓不到${name}的預報：${e2.message}`); } }
        await sleep(2000);
    }

    const trip = JSON.parse(fs.readFileSync(TRIP_FILE, 'utf8'));
    const changes = applyTitles(trip, forecasts);
    changes.forEach(c => console.log(`DAY ${c.day}：${c.to}`));
    if (!changes.length) { console.log('預報沒有變化，不更新'); return; }
    if (dryRun) return;

    const m = /^v(\d+)\.(\d+)$/.exec(trip.site.version.number);
    if (!m) throw new Error('版本號格式不符');
    trip.site.version = { number: `v${m[1]}.${+m[2] + 1}`, date: now.slash };
    fs.writeFileSync(TRIP_FILE, JSON.stringify(trip, null, 2) + '\n');
    try {
        execFileSync(process.execPath, [path.join(root, 'tools', 'build-data.js')], { cwd: root, stdio: 'ignore' });
        execFileSync(process.execPath, [path.join(root, 'tools', 'check.js')], { cwd: root, stdio: 'ignore' });
    } catch (e) {
        git('checkout', '--', 'data');
        throw new Error('build-data 或 check.js 沒通過，已還原 data/，沒有發布');
    }
    git('add', 'data');
    git('commit', '--quiet', '-m', `${trip.site.version.number}：更新天氣提醒卡（氣象署 ${forecasts[Object.keys(COUNTY)[0]].pub} 預報）`);
    git('push', '--quiet', 'origin', 'HEAD:main');
    console.log(`已發布 ${trip.site.version.number}`);
}

if (require.main === module) main().catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });

module.exports = { parseWeek, buildTitle, applyTitles };
