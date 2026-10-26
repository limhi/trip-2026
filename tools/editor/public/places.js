// 「地點庫」分頁：搜尋、展開表單、新增、改 id、刪除。純邏輯在 places-logic.js。
(function () {
    const L = window.PlacesLogic;
    const D = window.DaysLogic;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const MAP_TYPES = { attraction: '景點', hotel: '住宿', food: '用餐', other: '其他行程', transport: '起訖點' };
    const INFO_TYPES = ['', '旅遊景點', '餐飲資訊', '住宿資訊', '掃墓地點'];
    const noCoord = p => p.lat == null || p.lng == null || p.lat === '' || p.lng === '';

    // ctx：{ data(): {trip, places}, changed(): 重新驗證並通知預覽, toast(msg) }
    function create(pane, ctx) {
        const scroller = pane.parentElement;
        const ui = { open: null, filter: '', adding: null };
        const draft = () => ctx.data();

        function selectHtml(path, p, options) {
            const cur = D.getPath(p, path) || '';
            const opts = options.includes(cur) ? options : [...options, cur];
            return opts.map(o => `<option value="${esc(o)}" ${o === cur ? 'selected' : ''}>${esc(o ? (MAP_TYPES[o] || o) : '（無）')}</option>`).join('');
        }

        function formHtml(id, p) {
            const f = (label, path, num) => `<label class="block"><span class="text-xs text-slate-500">${label}</span><input data-pf="${path}" ${num ? 'data-num' : ''} value="${esc(D.getPath(p, path))}" class="mt-0.5 w-full rounded border p-1.5"></label>`;
            const refs = L.placeRefs(draft().trip, id);
            const mapTypeOpts = Object.keys(MAP_TYPES).map(k => `<option value="${k}" ${p.mapType === k ? 'selected' : ''}>${MAP_TYPES[k]}</option>`).join('')
                + (p.mapType && !MAP_TYPES[p.mapType] ? `<option value="${esc(p.mapType)}" selected>${esc(p.mapType)}</option>` : '');
            const infoOpts = (INFO_TYPES.includes(p.infoType || '') ? INFO_TYPES : [...INFO_TYPES, p.infoType])
                .map(t => `<option value="${esc(t)}" ${(p.infoType || '') === t ? 'selected' : ''}>${esc(t || '（無）')}</option>`).join('');
            return `<div class="grid grid-cols-2 gap-2 border-b bg-blue-50/50 p-3" data-pform="${esc(id)}">
                <div class="col-span-2 flex items-end gap-2"><label class="block flex-1"><span class="text-xs text-slate-500">id（改了會自動更新所有引用；小寫英文、數字、連字號）</span><input id="newid" value="${esc(id)}" class="mt-0.5 w-full rounded border p-1.5 font-mono"></label><button data-act="renameid" class="rounded border bg-white px-2 py-1.5 text-xs">套用 id</button></div>
                ${f('名稱', 'name')}
                <label class="block"><span class="text-xs text-slate-500">地圖分類</span><select data-pf="mapType" class="mt-0.5 w-full rounded border p-1.5">${mapTypeOpts}</select></label>
                ${f('緯度', 'lat', true)}${f('經度', 'lng', true)}
                <div class="col-span-2">${f('地址', 'address')}</div>
                <label class="block"><span class="text-xs text-slate-500">彈窗類別（空白＝沒有彈窗）</span><select data-pf="infoType" class="mt-0.5 w-full rounded border p-1.5">${infoOpts}</select></label>
                ${f('電話', 'phone')}${f('撥號覆寫 tel', 'tel')}${f('官網', 'website')}
                <div class="col-span-2">${f('自訂導航連結', 'navigationUrl')}</div>
                ${f('LINE 文字', 'line.label')}${f('LINE 連結', 'line.url')}
                <label class="col-span-2 block"><span class="text-xs text-slate-500">交通與停車（一行一段）</span><textarea data-pf="parking" rows="3" class="mt-0.5 w-full rounded border p-1.5">${esc(L.parkingToText(p.parking))}</textarea></label>
                <div class="col-span-2 text-xs ${refs.length ? 'text-slate-600' : 'text-slate-400'}">被引用 ${refs.length} 處${refs.length ? '：' + esc(refs.join('、')) : '（沒有行程使用）'}</div>
                <div class="col-span-2"><button data-act="delplace" class="rounded border border-rose-300 px-2 py-1 text-xs text-rose-600 ${refs.length ? 'cursor-not-allowed opacity-40' : 'hover:bg-rose-50'}">${refs.length ? '刪除（被引用中，不能刪）' : '刪除這個地點'}</button></div>
            </div>`;
        }

        function addHtml() {
            if (!ui.adding) return '';
            return `<div class="grid grid-cols-2 gap-2 border-b bg-amber-50 p-3" data-addform>
                <label class="block"><span class="text-xs text-slate-500">名稱</span><input id="addname" value="${esc(ui.adding.name)}" class="mt-0.5 w-full rounded border p-1.5"></label>
                <label class="block"><span class="text-xs text-slate-500">id（由名稱建議，可手改）</span><input id="addid" value="${esc(ui.adding.id)}" class="mt-0.5 w-full rounded border p-1.5 font-mono"></label>
                <div class="col-span-2 flex items-center gap-2"><button data-act="addok" class="rounded bg-slate-800 px-3 py-1 text-xs font-bold text-white">建立</button><button data-act="addcancel" class="rounded border bg-white px-3 py-1 text-xs">取消</button><span id="addhint" class="text-xs text-rose-600"></span></div>
            </div>`;
        }

        // 外框（搜尋列、新增表單）與清單分開：打字搜尋時只重畫清單，輸入法組字才不會被打斷
        function listHtml() {
            const { trip, places } = draft();
            const q = ui.filter.trim().toLowerCase();
            const entries = Object.entries(places).filter(([id, p]) => !q || id.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q));
            const total = Object.keys(places).length;
            return `<div class="border-b bg-slate-50 px-3 py-1 text-xs text-slate-500">${entries.length === total ? `共 ${total} 個地點` : `符合 ${entries.length} / ${total} 個地點`}</div>`
                + (entries.length ? entries.map(([id, p]) => {
                    const refs = L.placeRefs(trip, id).length;
                    return `<div data-place="${esc(id)}"><div data-act="placetoggle" class="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 hover:bg-slate-50 ${ui.open === id ? 'bg-blue-50' : ''}">
                        <span class="shrink-0 rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">${MAP_TYPES[p.mapType] || '?'}</span>
                        <span data-pname class="min-w-0 flex-1 truncate">${esc(p.name)}</span>
                        <span class="font-mono text-[11px] text-slate-400">${esc(id)}</span>
                        ${noCoord(p) ? '<span title="沒有座標，不會出現在地圖" class="text-amber-500">📍✕</span>' : ''}
                        <span class="w-14 shrink-0 text-right text-xs ${refs ? 'text-slate-500' : 'text-slate-300'}">${refs ? '用 ' + refs + ' 次' : '未使用'}</span>
                    </div>${ui.open === id ? formHtml(id, p) : ''}</div>`;
                }).join('') : '<div class="p-4 text-slate-400">沒有符合的地點</div>');
        }

        function renderList() {
            const y = scroller.scrollTop;
            $('plist').innerHTML = listHtml();
            scroller.scrollTop = y;
        }

        function render() {
            const y = scroller.scrollTop;
            const focused = document.activeElement && pane.contains(document.activeElement) ? document.activeElement.id : '';
            pane.innerHTML = `<div class="sticky top-0 z-10 flex gap-2 border-b bg-white p-2"><input id="pfilter" placeholder="搜尋地點名稱或 id" value="${esc(ui.filter)}" class="flex-1 rounded border p-1.5"><button data-act="newplace" class="rounded bg-slate-800 px-3 py-1.5 font-bold text-white">＋ 新地點</button></div>`
                + addHtml() + '<div id="plist"></div>';
            renderList();
            scroller.scrollTop = y;
            if (focused) { const el = $(focused); if (el) el.focus(); }
        }
        const $ = id => pane.querySelector('#' + id);

        function rerender() { ctx.changed(); renderList(); }

        pane.addEventListener('click', e => {
            const el = e.target.closest('[data-act]');
            if (!el) return;
            const act = el.dataset.act;
            const { trip, places } = draft();
            if (act === 'placetoggle') { const id = el.closest('[data-place]').dataset.place; ui.open = ui.open === id ? null : id; return render(); }
            if (act === 'newplace') { ui.adding = { name: '', id: '', idEdited: false }; ui.filter = ''; render(); return $('addname').focus(); }
            if (act === 'addcancel') { ui.adding = null; return render(); }
            if (act === 'addok') {
                const name = $('addname').value.trim(), id = $('addid').value.trim();
                if (!name) { $('addhint').textContent = '請填名稱'; return; }
                const err = L.checkId(places, id);
                if (err) { $('addhint').textContent = err; return; }
                L.newPlace(places, name, id);
                ui.adding = null; ui.open = id;
                ctx.changed(); render();
                const row = pane.querySelector(`[data-place="${id}"]`);
                if (row) row.scrollIntoView({ block: 'nearest' });
                return ctx.toast(`已新增「${name}」，請接著填座標與聯絡資訊`);
            }
            if (act === 'renameid') {
                const res = L.renameId(trip, places, ui.open, $('newid').value.trim());
                if (res.error) return ctx.toast('⚠ ' + res.error);
                if (res.count === 0 && $('newid').value.trim() === ui.open) return;
                ui.open = $('newid').value.trim();
                rerender();
                return ctx.toast(`id 已改為 ${ui.open}，同步更新 ${res.count} 處引用`);
            }
            if (act === 'delplace') {
                const res = L.deletePlace(trip, places, ui.open);
                if (!res.ok) return ctx.toast(`這個地點還被引用，不能刪除：${res.refs.join('、')}`);
                ui.open = null;
                return rerender();
            }
        });

        // 搜尋、新增表單：邊打邊更新（不重畫整個表單以免失去焦點）
        pane.addEventListener('input', e => {
            const el = e.target;
            if (el.id === 'pfilter') { ui.filter = el.value; return renderList(); }
            if (el.id === 'addname' && ui.adding) {
                ui.adding.name = el.value;
                if (!ui.adding.idEdited) { ui.adding.id = el.value.trim() ? L.suggestId(el.value, draft().places) : ''; $('addid').value = ui.adding.id; }
                return;
            }
            if (el.id === 'addid' && ui.adding) { ui.adding.id = el.value; ui.adding.idEdited = true; return; }
            handleEdit(el, false);
        });
        pane.addEventListener('change', e => handleEdit(e.target, true));

        function handleEdit(el, committed) {
            const form = el.closest('[data-pform]');
            if (!form || !el.dataset.pf) return;
            const p = draft().places[form.dataset.pform];
            let value = el.value;
            if (el.dataset.num) { value = value.trim() === '' ? '' : parseFloat(value); if (Number.isNaN(value)) value = ''; }
            if (el.dataset.pf === 'parking') value = L.parkingFromText(value);
            D.setPath(p, el.dataset.pf, value);
            if (el.dataset.pf === 'name') form.parentElement.querySelector('[data-pname]').textContent = p.name || '';
            return committed ? rerender() : ctx.changed();
        }

        // 重新載入資料時呼叫：丟掉展開與新增狀態
        function reset() { ui.open = null; ui.adding = null; }

        return { render, reset };
    }

    window.PlacesTab = { create };
})();
