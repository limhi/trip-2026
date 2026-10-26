// 「住宿區」分頁：新增、刪除、上下排序、編輯欄位。純邏輯在 hotels-logic.js。
// hotelsSection 的標題文字不在介面編輯（手改 trip.json）。
(function () {
    const L = window.HotelsLogic;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const TEXT_FIELDS = [['region', '區域'], ['status', '狀態'], ['nights', '晚數'], ['price', '價格']];

    // ctx：{ data(): {trip, places}, changed(): 重新驗證並通知預覽, toast(msg) }
    function create(pane, ctx) {
        const draft = () => ctx.data();

        function placeOptions(selected) {
            const { places } = draft();
            const list = L.hotelPlaces(places);
            // 目前引用的地點若不是住宿分類（或已不存在），仍列出來避免選單悄悄改掉資料
            if (selected && !list.some(o => o.id === selected)) list.unshift({ id: selected, name: places[selected] ? places[selected].name + '（非住宿分類）' : '（地點庫找不到）' });
            return list.map(o => `<option value="${esc(o.id)}" ${o.id === selected ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
        }

        function hotelHtml(h, i, last) {
            const { places } = draft();
            const name = (places[h.place] && places[h.place].name) || h.place || '(未選地點)';
            const btn = (act, label, disabled, cls) => `<button data-act="${act}" ${disabled ? 'disabled' : ''} class="rounded px-1.5 ${cls || 'hover:bg-slate-200'} disabled:cursor-not-allowed disabled:opacity-30">${label}</button>`;
            const field = ([k, label]) => `<label class="block"><span class="text-xs text-slate-500">${label}</span><input data-hf="${k}" value="${esc(h[k])}" class="mt-0.5 w-full rounded border p-1.5"></label>`;
            return `<div class="border-b-4 border-slate-200 p-3" data-hi="${i}">
                <div class="mb-2 flex items-center gap-2"><strong class="flex-1">第 ${i + 1} 間：<span data-hname>${esc(name)}</span></strong>
                    ${btn('hup', '↑', i === 0)}${btn('hdown', '↓', i === last)}${btn('hdel', '✕', false, 'text-rose-500 hover:bg-rose-100')}</div>
                <div class="grid grid-cols-2 gap-2">
                    <label class="col-span-2 block"><span class="text-xs text-slate-500">住宿地點（地點庫裡分類為「住宿」的）</span><select data-hf="place" class="mt-0.5 w-full rounded border p-1.5">${placeOptions(h.place)}</select></label>
                    ${TEXT_FIELDS.map(field).join('')}
                    <label class="col-span-2 block"><span class="text-xs text-slate-500">特色（一行一項）</span><textarea data-hf="features" rows="3" class="mt-0.5 w-full rounded border p-1.5">${esc(L.featuresToText(h.features))}</textarea></label>
                </div></div>`;
        }

        function render() {
            const scroller = pane.parentElement, y = scroller.scrollTop;
            const { trip } = draft();
            const list = trip.hotels;
            pane.innerHTML = (list.length ? list.map((h, i) => hotelHtml(h, i, list.length - 1)).join('') : '<div class="p-4 text-slate-400">目前沒有住宿。</div>')
                + '<div class="p-3"><button data-act="hadd" class="rounded bg-slate-800 px-3 py-1.5 font-bold text-white">＋ 新增住宿</button></div>';
            scroller.scrollTop = y;
        }

        function rerender() { ctx.changed(); render(); }

        pane.addEventListener('click', e => {
            const el = e.target.closest('[data-act]');
            if (!el) return;
            const { trip, places } = draft();
            if (el.dataset.act === 'hadd') {
                const res = L.addHotel(trip, places);
                if (!res.ok) return ctx.toast('⚠ ' + res.error);
                rerender();
                const row = pane.querySelector(`[data-hi="${res.index}"]`);
                if (row) row.scrollIntoView({ block: 'nearest' });
                return;
            }
            const hi = el.closest('[data-hi]');
            if (!hi) return;
            const i = +hi.dataset.hi;
            if (el.dataset.act === 'hdel') L.removeHotel(trip, i);
            else if (el.dataset.act === 'hup') L.moveHotel(trip, i, -1);
            else if (el.dataset.act === 'hdown') L.moveHotel(trip, i, 1);
            rerender();
        });

        // 邊打邊更新草稿（不重畫，以免失去焦點、或吃掉剛離開欄位時的按鈕點擊）；只有換住宿地點才重畫標題
        function handleEdit(el) {
            const hi = el.closest('[data-hi]');
            if (!hi || !el.dataset.hf) return;
            const h = draft().trip.hotels[+hi.dataset.hi];
            h[el.dataset.hf] = el.dataset.hf === 'features' ? L.featuresFromText(el.value) : el.value;
            if (el.dataset.hf === 'place') return rerender();
            ctx.changed();
        }
        pane.addEventListener('input', e => handleEdit(e.target));
        pane.addEventListener('change', e => { if (e.target.tagName === 'SELECT') handleEdit(e.target); });

        return { render };
    }

    window.HotelsTab = { create };
})();
