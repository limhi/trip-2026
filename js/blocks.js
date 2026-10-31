/*
 * 區塊樣板：每一種行程區塊長什麼樣子都在這個檔案。
 * 想統一調整某類區塊的顏色，改下面的「顏色表」就會套用到所有天。
 */
(function (root) {
    const Trip = root.Trip = root.Trip || {};

    // ───────── 顏色表（Tailwind class）─────────
    const CARD_STYLES = {
        spot:   { box: 'bg-blue-50/70 border-blue-500',       tag: 'bg-blue-600',    time: 'text-blue-700' },
        meal:   { box: 'bg-amber-50/80 border-amber-500',     tag: 'bg-amber-600',   time: 'text-amber-800' },
        stay:   { box: 'bg-purple-50/70 border-purple-500',   tag: 'bg-purple-600',  time: 'text-purple-700' },
        end:    { box: 'bg-emerald-50/70 border-emerald-500', tag: 'bg-emerald-600', time: 'text-emerald-700' },
        notice: { box: 'bg-amber-50/70 border-amber-500',     tag: 'bg-amber-600',   time: 'text-amber-800' }
    };

    const DAY_THEMES = {
        blue: { header: 'bg-blue-600',    badge: 'bg-blue-700 text-blue-100' },
        end:  { header: 'bg-emerald-600', badge: 'bg-emerald-700 text-emerald-100' }
    };

    const NAV_TONES = {
        amber:   'text-amber-400 hover:text-amber-300 bg-amber-400/10',
        emerald: 'text-emerald-400 hover:text-emerald-300 bg-emerald-400/10'
    };

    // ───────── 共用小工具 ─────────
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));

    const CONTACT_HINT = '<div class="contact-card-hint"><span><i class="fa-solid fa-circle-info mr-1"></i>查看聯絡與導航</span><i class="fa-solid fa-chevron-right"></i></div>';

    // 有聯絡資訊的地點：卡片可點擊開啟彈窗
    function interactive(place, placeId) {
        if (!place || !place.infoType) return { cls: '', attrs: '', hint: '' };
        return {
            cls: ' interactive-info-card',
            attrs: ` data-place="${esc(placeId)}" tabindex="0" role="button" aria-label="查看${esc(place.name)}的聯絡與導航資訊"`,
            hint: CONTACT_HINT
        };
    }

    // 與地圖標記相同的編號圓點；point 為 Trip.model.getMapPoints 的結果，沒有編號就回傳空字串
    function numberBadge(point) {
        if (!point || point.number == null) return '';
        const types = Trip.MAP_TYPES;
        const style = (types && (types[point.type] || types.transport)) || { color: '#475569' };
        return `<span class="map-number-marker map-number-badge" style="background:${style.color}" title="地圖標記 ${point.label}">${point.label}</span>`;
    }

    // ───────── 行程區塊 ─────────
    // 起迄時間一律顯眼（深色、較大、粗體）；停留與各種長度用彩色標籤。所有長度文字都經 Trip.model.formatHM（X小時YY分）
    const TIME_CLS = 'text-sm md:text-base font-black text-slate-900 tabular-nums whitespace-nowrap';
    const CHIP_CLS = 'len-chip inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs md:text-sm font-bold whitespace-nowrap';
    const hm = (minutes, signed) => Trip.model.formatHM(minutes, signed);
    // 一個長度標籤：label 是名稱（查詢／預估／排定）；minutes 為 null 時顯示「—」
    const chip = (label, minutes, cls, flag = '', extraCls = '') => `<span class="${CHIP_CLS} ${cls} ${extraCls}"><span class="font-medium opacity-70">${label}</span>${flag}${esc(hm(minutes))}</span>`;

    // 移動的三種長度（各自標清楚名稱）：查詢 = 路線原始時間；預估 = 查詢 × 路況係數；排定 = 時間區間的長度（以資料 time 為準）。
    // 排定不足（排定 < 預估）與排定和「預估 + 緩衝」不一致都標紅加 ⚠（文字，不只靠顏色）；沒有路線查詢結果時查詢、預估顯示「—」並說明
    const queryChip = auto => chip('查詢', auto.query, 'bg-slate-200 text-slate-800');
    const estimateChip = (auto, needed) => chip('預估', needed, 'bg-amber-100 text-amber-900');
    const scheduledChip = auto => {
        const bad = auto.short || auto.mismatch;
        return chip('排定', auto.scheduled, bad ? 'bg-rose-100 text-rose-700 border border-rose-300' : 'bg-sky-100 text-sky-900', bad ? '⚠ ' : '', 'leg-scheduled');
    };
    const autoNote = auto => `<span class="auto-leg-note block text-[10px] font-medium text-slate-500 mt-1">${esc(auto.note)}</span>`;
    const shortText = auto => auto.short
        ? ` <span class="leg-short text-rose-600 font-extrabold block sm:inline">⚠ 排定不足（排定 ${esc(hm(auto.scheduled))} &lt; 預估 ${esc(hm(auto.needed))}）</span>` : '';
    const mismatchText = (auto, item) => auto.mismatch && !auto.short
        ? ` <span class="leg-mismatch text-rose-600 font-extrabold block sm:inline">⚠ 排定與預估不一致（預估 ${esc(hm(auto.needed))}、緩衝 ${esc(hm((item && item.buffer) || 0, true))}、排定 ${esc(hm(auto.scheduled))}）</span>` : '';
    const missingText = auto => auto.missing ? ' <span class="leg-missing text-slate-500 font-medium">（沒有路線查詢結果，查詢、預估無法顯示）</span>' : '';

    // 擇一組前後：同一列並列每條路徑的查詢與預估（「→ A 查詢 … 預估 …／→ B …」），共用一個排定時間；各路徑分別與同一個排定時間比對，不足的那條自己帶紅字
    const pathsHtml = auto => `<div class="leg-lengths flex flex-wrap items-center gap-x-3 gap-y-1.5">${auto.paths.map(p => `<span class="leg-path inline-flex flex-wrap items-center gap-1.5 font-bold text-slate-800">${esc(p.label)} <span class="auto-leg-duration inline-flex flex-wrap gap-1.5">${queryChip(p)}${estimateChip(p, p.needed)}</span>${shortText({ scheduled: auto.scheduled, needed: p.needed, short: p.short })}</span>`).join('')}${scheduledChip({ ...auto, short: false, mismatch: false })}</div>`;

    // 單一路徑：查詢、預估、排定三個標籤 + 說明文字；距離放在標籤後面
    const lengthsHtml = (auto, item) => auto.paths ? pathsHtml(auto)
        : `<div class="leg-lengths flex flex-wrap items-center gap-1.5"><span class="auto-leg-duration inline-flex flex-wrap gap-1.5">${queryChip(auto)}${estimateChip(auto, auto.needed)}</span>${scheduledChip(auto)}${auto.distance ? ` <span class="text-xs md:text-sm font-bold text-slate-600">${esc(auto.distance)}</span>` : ''}${bufferText(item)}${missingText(auto)}</div>${shortText(auto)}${mismatchText(auto, item)}`;

    // 緩衝非 0 時加標籤；只是標示，不改查詢與預估
    const bufferText = item => item && Number.isInteger(item.buffer) && item.buffer !== 0
        ? ` <span class="leg-buffer ${CHIP_CLS} bg-violet-100 text-violet-800"><span class="font-medium opacity-70">緩衝</span>${esc(hm(item.buffer, true))}</span>` : '';

    function moveRow(item, auto) {
        const note = item.note ? ` <span class="text-amber-700">(${esc(item.note)})</span>` : '';
        const lengths = auto ? lengthsHtml(auto, item) + autoNote(auto) : bufferText(item);
        return `<div class="p-3 rounded-xl bg-slate-50 text-xs md:text-sm border border-slate-200">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="${TIME_CLS}"><i class="fa-solid fa-route mr-1 text-slate-500"></i>${esc(item.time)}</span>
        <span class="font-bold text-slate-800">${esc(item.text)}${note}</span>
    </div>
    ${lengths ? `<div class="mt-1.5">${lengths}</div>` : ''}
</div>`;
    }

    // 兩個地圖標記之間沒有交通列時補的唯讀連接列（只在有路線快取時出現）
    function autoLegRow(auto) {
        return `<div class="auto-leg-row p-3 rounded-xl bg-slate-50 text-xs md:text-sm border border-dashed border-slate-300">
    <div class="font-bold text-slate-800"><i class="fa-solid fa-car text-amber-500 mr-1"></i>車程（自動）</div>
    <div class="mt-1.5">${auto.paths ? pathsHtml(auto) : lengthsHtml(auto, null)}${autoNote(auto)}</div>
</div>`;
    }

    // 停留時間只給 spot／meal：彩色標籤「停留 1小時40分」；沒有值回空字串
    function stayText(item) {
        const label = Trip.model.getStayLabel(item);
        return label ? `<span class="stay-chip ${CHIP_CLS} bg-emerald-100 text-emerald-800">${esc(label)}</span>` : '';
    }

    // 時間區間 + 停留標籤（卡片與擇一組外框共用）
    const timeHtml = item => item.time ? `<span class="flex flex-wrap items-center justify-end gap-x-2 gap-y-1"><span class="${TIME_CLS}">${esc(item.time)}</span>${stayText(item)}</span>` : '';

    function card(item, ctx, point) {
        const style = CARD_STYLES[item.type];
        const place = ctx.places[item.place];
        const click = interactive(place, item.place);
        const title = item.title || (place && place.name) || '';
        const time = timeHtml(item);
        const desc = item.desc ? `<p class="text-slate-700 text-xs md:text-sm mt-1 font-medium leading-relaxed">${esc(item.desc)}</p>` : '';
        return `<div class="p-4 rounded-xl ${style.box} border-l-8 shadow-sm${click.cls}"${click.attrs}>
    <div class="flex justify-between items-start gap-2 mb-1">
        <span class="flex items-center gap-2">${numberBadge(point)}<span class="text-xs font-black ${style.tag} text-white px-2 py-0.5 rounded">${esc(item.tag)}</span></span>
        ${time}
    </div>
    <h4 class="font-extrabold text-slate-900 text-base md:text-lg">${esc(title)}</h4>
    ${desc}${click.hint}
</div>`;
    }

    function brief(item, ctx, point) {
        const place = ctx.places[item.place];
        const click = interactive(place, item.place);
        const icon = item.icon || 'utensils';
        const desc = item.desc ? `<p class="text-slate-700 text-xs">${esc(item.desc)}</p>` : '';
        return `<div class="p-3 rounded-xl bg-amber-100/70 border border-amber-300 text-xs md:text-sm${click.cls}"${click.attrs}>
    <div class="flex justify-between font-extrabold text-amber-950 mb-0.5">
        <span class="flex items-center gap-1.5">${numberBadge(point)}<span class="text-sm md:text-base font-black tabular-nums"><i class="fa-solid fa-${esc(icon)} mr-1"></i> ${esc(item.time)}</span></span>
        <span>${esc(item.title)}</span>
    </div>
    ${desc}${click.hint}
</div>`;
    }

    // 起訖點／休息點等只有座標的項目：一列簡短文字，讓地圖上的每個編號在左邊都找得到對應
    function waypointRow(item, ctx, point) {
        if (!point || point.number == null) return '';    // 不編號的起點只出現在地圖
        const place = ctx.places[item.place];
        const click = interactive(place, item.place);
        const types = Trip.MAP_TYPES || {};
        const label = item.text || (types[point.type] || {}).label || '';
        const chevron = click.cls ? '<i class="fa-solid fa-chevron-right ml-auto text-sky-700"></i>' : '';
        return `<div class="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-dashed border-slate-300 text-xs md:text-sm${click.cls}"${click.attrs}>
    ${numberBadge(point)}
    <span class="font-bold text-slate-800">${esc(point.name)}</span>
    <span class="font-bold text-slate-500">${esc(label)}</span>
    ${chevron}
</div>`;
    }

    // point：該項目對應的地圖標記（沒有就是 undefined），用來顯示編號
    // auto：綁定到這個交通列的路線計算結果（沒有快取就是 undefined）
    function renderItem(item, ctx, point, auto) {
        if (item.type === 'move') return moveRow(item, auto);
        if (item.type === 'brief') return brief(item, ctx, point);
        if (item.type === 'waypoint') return waypointRow(item, ctx, point);
        if (CARD_STYLES[item.type]) return card(item, ctx, point);
        return '';
    }

    // 擇一組外框：上方標示「二選一」與共用時間；成員卡片手機堆疊、桌機（md 以上）並排
    function altGroup(first, members) {
        const timeBlock = timeHtml(first);
        return `<div class="alt-group rounded-2xl border-2 border-dashed border-slate-400 p-3 bg-slate-50/60" data-alt-group>
    <div class="flex justify-between items-center mb-2">
        <span class="text-xs font-black bg-slate-600 text-white px-2 py-0.5 rounded"><i class="fa-solid fa-code-branch mr-1"></i>二選一</span>
        ${timeBlock}
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
${members.filter(Boolean).join('\n')}
    </div>
</div>`;
    }

    // ───────── 每日卡片外框 ─────────
    function dayCard(day, ctx, mapPanelHtml) {
        const theme = DAY_THEMES[day.theme] || DAY_THEMES.blue;
        const pointByItem = {};
        Trip.model.getMapPoints(day, ctx.places).forEach(point => { pointByItem[point.itemIndex] = point; });
        // 路線快取：綁定的交通列顯示計算時間；沒有交通列的相鄰標記之間補連接列。沒有快取時兩者都是空的，畫面與沒有這個功能時相同
        const routeInfo = Trip.routeView.dayRoutes(day, ctx.places, ctx.routes, ctx.site);
        const { autoByRow, autoAfter } = routeInfo;
        const summary = routeInfo.summary
            ? `<p class="day-drive-summary text-xs font-bold text-white/90"><i class="fa-solid fa-car mr-1"></i>${esc(routeInfo.summaryText)}<span class="block text-[10px] font-medium text-white/70">${esc(routeInfo.factorNote)}</span></p>`
            : '';
        // 擇一組（相鄰同 alt 的 spot）合成一個外框；其餘項目照舊一項一塊。連接列（autoAfter）放在項目或整組之後
        const blocks = [];
        for (let index = 0; index < day.items.length; index++) {
            const group = Trip.model.getAltGroupAt(day, index);   // 跳過整組後，走到的組內項目一定是該組的第一項
            const last = group ? group.end : index;
            if (group) {
                const members = [];
                for (let i = group.start; i <= group.end; i++) {
                    members.push(renderItem(i === group.start ? { ...day.items[i], time: '' } : day.items[i], ctx, pointByItem[i], autoByRow[i]));
                }
                blocks.push(altGroup(day.items[group.start], members));
            } else {
                blocks.push(renderItem(day.items[index], ctx, pointByItem[index], autoByRow[index]));
            }
            for (let i = index; i <= last; i++) if (autoAfter[i]) blocks.push(autoLegRow(autoAfter[i]));
            index = last;
        }
        const titleHtml = `<h3 class="font-extrabold text-base md:text-xl">${esc(day.date)}${esc(day.title)}</h3>`;
        const stayPlace = day.stay && ctx.places[day.stay.place];
        let badge;
        if (day.stay) {
            const hotel = ctx.places[day.stay.place];
            const note = day.stay.note ? `（${esc(day.stay.note)}）` : '';
            badge = `<i class="fa-solid fa-moon mr-1"></i> 宿：${esc(hotel ? hotel.name : day.stay.place)}${note}`;
        } else if (day.badge) {
            badge = `<i class="fa-solid fa-${esc(day.badge.icon)} mr-1"></i> ${esc(day.badge.text)}`;
        } else {
            badge = '';
        }
        // 有聯絡資訊的住宿：標題列的住宿標籤可直接點開住宿彈窗，不必翻到頁面最下方
        let stayBadge = '';
        if (badge && stayPlace && stayPlace.infoType) {
            stayBadge = `<button type="button" class="stay-badge-button ${theme.badge} text-xs md:text-sm font-bold px-3 py-1 rounded-full" data-place="${esc(day.stay.place)}" aria-label="查看${esc(stayPlace.name)}的住宿資訊與導航">${badge}<i class="fa-solid fa-chevron-right ml-1.5 text-[10px]"></i></button>`;
        } else if (badge) {
            stayBadge = `<span class="${theme.badge} text-xs md:text-sm font-bold px-3 py-1 rounded-full">${badge}</span>`;
        }
        return `<div class="bg-white rounded-2xl shadow-md border-2 border-slate-200 overflow-hidden" id="day-${day.day}" data-day="${day.day}">
    <div class="${theme.header} text-white p-4 md:p-5 flex flex-wrap justify-between items-center gap-2">
        <div class="flex items-center gap-3">
            <span class="bg-amber-400 text-slate-950 font-black px-3 py-1 rounded-lg text-base md:text-lg shadow-sm">DAY ${day.day}</span>
            ${summary ? `<div>${titleHtml}${summary}</div>` : titleHtml}
        </div>
        ${stayBadge}
        <button type="button" class="map-toggle-button" aria-controls="day-map-panel-${day.day}" aria-expanded="false"><i class="fa-solid fa-map-location-dot"></i><span>展開地圖</span></button>
    </div>
    <div class="day-body-grid">
        <div class="p-4 md:p-6 space-y-3.5">
${blocks.join('\n')}
        </div>
        ${mapPanelHtml}
    </div>
</div>`;
    }

    // ───────── 住宿卡片 ─────────
    function hotelCard(hotel, ctx) {
        const place = ctx.places[hotel.place];
        const click = interactive(place, hotel.place);
        const features = hotel.features.map(text =>
            `<li class="flex items-center"><i class="fa-solid fa-circle-check text-emerald-400 mr-2"></i> ${esc(text)}</li>`).join('\n');
        return `<div class="bg-slate-800 rounded-2xl p-5 md:p-6 border-2 border-slate-700 shadow-xl flex flex-col justify-between hover:border-emerald-500 transition${click.cls}"${click.attrs}>
    <div>
        <div class="flex justify-between items-center mb-3">
            <span class="bg-blue-500 text-white font-extrabold text-xs px-3 py-1 rounded-md">${esc(hotel.region)}</span>
            <span class="text-xs font-bold text-amber-400"><i class="fa-solid fa-house mr-1"></i> ${esc(hotel.status)}</span>
        </div>
        <h3 class="text-lg md:text-xl font-extrabold text-white mb-2">${esc(place ? place.name : hotel.place)}</h3>
        <ul class="text-xs md:text-sm text-slate-300 space-y-1.5 mb-4 leading-relaxed font-medium">
${features}
        </ul>
    </div>
    <div class="pt-4 border-t border-slate-700 flex justify-between items-end">
        <div>
            <span class="text-[10px] md:text-xs text-slate-400 block">${esc(hotel.nights)}</span>
            <span class="text-xs text-slate-300">住宿費用</span>
        </div>
        <div class="text-right">
            <span class="text-xl md:text-2xl font-black text-amber-400">${esc(hotel.price)}</span>
        </div>
    </div>
    ${click.hint}
</div>`;
    }

    // ───────── 頁首／導覽等小區塊 ─────────
    const navLink = link => `<a href="${esc(link.href)}" class="${NAV_TONES[link.tone] || NAV_TONES.amber} transition py-1 px-1.5 md:px-2 rounded">${esc(link.label)}</a>`;
    const heroChip = chip => `<span class="bg-white/15 border border-white/20 px-3 py-1.5 rounded-lg"><i class="fa-solid fa-${esc(chip.icon)} text-amber-400 mr-1"></i> ${esc(chip.text)}</span>`;
    const highlight = item => `<span><i class="fa-solid fa-${esc(item.icon)} mr-1"></i> ${esc(item.text)}</span>`;

    Trip.blocks = { esc, renderItem, dayCard, hotelCard, navLink, heroChip, highlight };
})(window);
