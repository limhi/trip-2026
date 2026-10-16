/*
 * 頁面組裝：讀取 data/*.js，把內容填進 index.html 的骨架，最後啟動彈窗與地圖。
 *   data-text="a.b.c"  → 把 TRIP.a.b.c 填成該元素的文字
 *   data-slot="名稱"   → 該元素內容由下面的 slots 產生
 */
(function () {
    const Trip = window.Trip;
    const trip = window.TRIP;
    const places = window.TRIP_PLACES;
    const ctx = { places };
    const B = Trip.blocks;
    const errors = Trip.model.validate(trip, places);

    function showProblems(errors) {
        errors.forEach(message => console.error('[行程資料] ' + message));
        const banner = document.createElement('div');
        banner.className = 'bg-rose-600 text-white text-xs md:text-sm font-bold p-3';
        banner.innerHTML = `<div class="container mx-auto px-4"><strong>行程資料有 ${errors.length} 個問題：</strong><ul class="list-disc ml-5 mt-1">${errors.map(e => `<li>${B.esc(e)}</li>`).join('')}</ul></div>`;
        document.body.prepend(banner);
    }

    const slots = {
        'nav-links': () => trip.site.navLinks.map(B.navLink).join(''),
        'hero-chips': () => trip.hero.chips.map(B.heroChip).join(''),
        'highlights': () => trip.highlights.map(B.highlight).join(''),
        'days': () => trip.days.map(day => B.dayCard(day, ctx, Trip.mapPanelHtml(day, places))).join('\n'),
        'hotels': () => trip.hotels.map(hotel => B.hotelCard(hotel, ctx)).join('\n')
    };

    // 文字綁定
    document.querySelectorAll('[data-text]').forEach(el => {
        const value = el.dataset.text.split('.').reduce((obj, key) => (obj == null ? obj : obj[key]), trip);
        if (value != null) el.textContent = value;
    });
    document.title = trip.site.documentTitle;

    // 區塊
    document.querySelectorAll('[data-slot]').forEach(el => {
        const build = slots[el.dataset.slot];
        if (build) el.innerHTML = build();
    });

    // 地圖按鈕
    trip.days.forEach(day => {
        const dayEl = document.getElementById(`day-${day.day}`);
        if (dayEl) Trip.bindDayMap(dayEl, day, places);
    });

    Trip.initModal(places);

    if (errors.length) showProblems(errors);
})();
