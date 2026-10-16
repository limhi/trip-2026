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

    // ───────── 行程區塊 ─────────
    function driveRow(item) {
        const duration = item.duration ? ` <span class="text-amber-600 font-extrabold block sm:inline">(${esc(item.duration)})</span>` : '';
        return `<div class="flex items-center gap-3 p-3 rounded-xl bg-slate-100/80 border border-slate-200 text-xs md:text-sm">
    <span class="font-extrabold text-slate-600 w-28 shrink-0"><i class="fa-solid fa-car text-amber-500 mr-1"></i> ${esc(item.time)}</span>
    <div class="font-bold text-slate-800">${esc(item.text)}${duration}</div>
</div>`;
    }

    function moveRow(item) {
        const duration = item.duration ? ` <span class="text-amber-600 font-bold">(${esc(item.duration)})</span>` : '';
        return `<div class="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 text-xs md:text-sm border border-slate-200">
    <span class="font-bold text-slate-500 w-28 shrink-0"><i class="fa-solid fa-route mr-1"></i> ${esc(item.time)}</span>
    <div class="text-slate-700">${esc(item.text)}${duration}</div>
</div>`;
    }

    function card(item, ctx) {
        const style = CARD_STYLES[item.type];
        const place = ctx.places[item.place];
        const click = interactive(place, item.place);
        const title = item.title || (place && place.name) || '';
        const time = item.time ? `<span class="text-xs font-bold ${style.time}">${esc(item.time)}</span>` : '';
        const desc = item.desc ? `<p class="text-slate-700 text-xs md:text-sm mt-1 font-medium leading-relaxed">${esc(item.desc)}</p>` : '';
        return `<div class="p-4 rounded-xl ${style.box} border-l-8 shadow-sm${click.cls}"${click.attrs}>
    <div class="flex justify-between items-start mb-1">
        <span class="text-xs font-black ${style.tag} text-white px-2 py-0.5 rounded">${esc(item.tag)}</span>
        ${time}
    </div>
    <h4 class="font-extrabold text-slate-900 text-base md:text-lg">${esc(title)}</h4>
    ${desc}${click.hint}
</div>`;
    }

    function brief(item, ctx) {
        const place = ctx.places[item.place];
        const click = interactive(place, item.place);
        const icon = item.icon || 'utensils';
        const desc = item.desc ? `<p class="text-slate-700 text-xs">${esc(item.desc)}</p>` : '';
        return `<div class="p-3 rounded-xl bg-amber-100/70 border border-amber-300 text-xs md:text-sm${click.cls}"${click.attrs}>
    <div class="flex justify-between font-extrabold text-amber-950 mb-0.5">
        <span><i class="fa-solid fa-${esc(icon)} mr-1"></i> ${esc(item.time)}</span>
        <span>${esc(item.title)}</span>
    </div>
    ${desc}${click.hint}
</div>`;
    }

    function renderItem(item, ctx) {
        if (item.type === 'drive') return driveRow(item);
        if (item.type === 'move') return moveRow(item);
        if (item.type === 'brief') return brief(item, ctx);
        if (item.type === 'waypoint') return '';          // 只出現在地圖
        if (CARD_STYLES[item.type]) return card(item, ctx);
        return '';
    }

    // ───────── 每日卡片外框 ─────────
    function dayCard(day, ctx, mapPanelHtml) {
        const theme = DAY_THEMES[day.theme] || DAY_THEMES.blue;
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
        return `<div class="bg-white rounded-2xl shadow-md border-2 border-slate-200 overflow-hidden" id="day-${day.day}" data-day="${day.day}">
    <div class="${theme.header} text-white p-4 md:p-5 flex flex-wrap justify-between items-center gap-2">
        <div class="flex items-center gap-3">
            <span class="bg-amber-400 text-slate-950 font-black px-3 py-1 rounded-lg text-base md:text-lg shadow-sm">DAY ${day.day}</span>
            <h3 class="font-extrabold text-base md:text-xl">${esc(day.date)}${esc(day.title)}</h3>
        </div>
        ${badge ? `<span class="${theme.badge} text-xs md:text-sm font-bold px-3 py-1 rounded-full">${badge}</span>` : ''}
        <button type="button" class="map-toggle-button" aria-controls="day-map-panel-${day.day}" aria-expanded="false"><i class="fa-solid fa-map-location-dot"></i><span>展開地圖</span></button>
    </div>
    <div class="day-body-grid">
        <div class="p-4 md:p-6 space-y-3.5">
${day.items.map(item => renderItem(item, ctx)).filter(Boolean).join('\n')}
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
