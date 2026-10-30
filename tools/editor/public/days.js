// 「每日行程」分頁：表單、拖拉排序、跨天、日設定。純邏輯在 days-logic.js，驗證與地圖編號用 js/model.js。
(function () {
    const L = window.DaysLogic;
    const M = window.Trip.model;
    const TYPES = L.TYPES;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const FIELD = {
        time: ['時間', 'text'], tag: ['標籤', 'text'], title: ['標題（空白＝用地點名稱）', 'text'], text: ['文字', 'text'],
        duration: ['車程', 'text'], icon: ['圖示', 'text'], mapName: ['地圖上的名稱', 'text'], desc: ['說明', 'area'],
        place: ['地點', 'place'], map: ['顯示在地圖', 'bool'], numbered: ['地圖上編號', 'bool'], backup: ['備案（不連線）', 'bool']
    };

    // ctx：{ data(): {trip, places}, errors(): string[], changed(): 重新驗證並更新外框, toast(msg) }
    function create(pane, ctx) {
        const scroller = pane.parentElement;
        const ui = { openDays: new Set([1]), dayCfg: new Set(), openItem: null, drag: null };
        const draft = () => ctx.data();

        const placeName = id => (draft().places[id] && draft().places[id].name) || '';
        const itemLabel = it => {
            if (it.type === 'waypoint') return (placeName(it.place) || it.place || '(未選地點)') + (it.text ? '・' + it.text : '');
            return it.title || placeName(it.place) || it.text || '(空白)';
        };

        function fieldHtml(name, item) {
            const [label, kind] = FIELD[name];
            if (kind === 'bool') {
                const checked = name === 'backup' ? !!item.backup : item[name] !== false;
                return `<label class="col-span-2 flex items-center gap-2"><input type="checkbox" data-f="${name}" ${checked ? 'checked' : ''}> ${label}</label>`;
            }
            if (kind === 'area') return `<label class="col-span-2 block"><span class="text-xs text-slate-500">${label}</span><textarea data-f="${name}" rows="4" class="mt-0.5 w-full rounded border p-1.5">${esc(item[name])}</textarea></label>`;
            if (kind === 'place') {
                const ok = !item.place || draft().places[item.place];
                return `<label class="col-span-2 block"><span class="text-xs text-slate-500">${label}（輸入名稱或 id 搜尋）</span><input list="placelist" data-f="place" value="${esc(item.place)}" class="mt-0.5 w-full rounded border p-1.5 ${ok ? '' : 'border-rose-500 bg-rose-50'}"><span class="hint text-xs ${ok ? 'text-slate-500' : 'text-rose-600'}">${item.place ? (ok ? esc(placeName(item.place)) : '找不到這個地點 id') : ''}</span></label>`;
            }
            return `<label class="block"><span class="text-xs text-slate-500">${label}</span><input data-f="${name}" value="${esc(item[name])}" class="mt-0.5 w-full rounded border p-1.5"></label>`;
        }

        function dayCfgHtml(day, di) {
            const f = (label, path) => `<label class="block"><span class="text-xs text-slate-500">${label}</span><input data-df="${path}" value="${esc(L.getPath(day, path))}" class="mt-0.5 w-full rounded border p-1.5"></label>`;
            return `<div class="grid grid-cols-2 gap-2 border-b bg-slate-50 p-3" data-di="${di}">
                ${f('日期', 'date')}${f('標題', 'title')}
                <label class="block"><span class="text-xs text-slate-500">住宿地點</span><input list="placelist" data-df="stay.place" value="${esc(L.getPath(day, 'stay.place'))}" class="mt-0.5 w-full rounded border p-1.5"></label>
                ${f('住宿備註', 'stay.note')}${f('沒有住宿時：圖示', 'badge.icon')}${f('沒有住宿時：文字', 'badge.text')}
                <label class="block"><span class="text-xs text-slate-500">主題</span><select data-df="theme" class="mt-0.5 w-full rounded border p-1.5"><option value="">藍（預設）</option><option value="end" ${day.theme === 'end' ? 'selected' : ''}>綠（最後一天）</option></select></label>
                <label class="flex items-end gap-2 pb-1.5"><input type="checkbox" data-df="closeLoop" ${day.closeLoop ? 'checked' : ''}> 地圖路線連回起點</label>
                <label class="block"><span class="text-xs text-slate-500">路況係數（空白＝用預設 ×${esc(M.getTrafficFactor({}, draft().trip.site))}）</span><input data-df="trafficFactor" inputmode="decimal" value="${esc(day.trafficFactor)}" class="mt-0.5 w-full rounded border p-1.5"></label>
            </div>`;
        }

        function render() {
            const errors = ctx.errors();
            const { trip, places } = draft();
            const y = scroller.scrollTop;
            pane.innerHTML = trip.days.map((day, di) => {
                const open = ui.openDays.has(day.day);
                const byIndex = new Map(M.getMapPoints(day, places).map(p => [p.itemIndex, p]));
                const dayErrs = L.dayErrors(errors, day.day);
                const rows = open ? day.items.map((it, ii) => {
                    const meta = TYPES[it.type] || { label: it.type, chip: 'bg-rose-200 text-rose-800', fields: [] };
                    const point = byIndex.get(ii);
                    const errs = L.itemErrors(errors, day.day, ii);
                    const bad = errs.length > 0;
                    const isOpen = ui.openItem === it;
                    const num = point ? (point.number != null
                        ? `<span title="地圖編號" class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">${point.number}</span>`
                        : '<span title="在地圖上但不編號" class="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">◦</span>')
                        : '<span class="h-5 w-5 shrink-0"></span>';
                    // 擇一組：整組外面加一圈外框（首項上框、尾項下框、每項左右框），第一項標示「二選一」與共用時間
                    const pos = L.altPosition(day, ii);
                    const frame = pos ? `border-x-4 border-violet-400 ${pos === 'first' ? 'border-t-4 rounded-t-lg' : ''} ${pos === 'last' ? 'border-b-4 rounded-b-lg' : ''}` : '';
                    const altTag = pos === 'first' ? `<div data-alttag class="bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">二選一（${esc(it.alt)}）</div>` : '';
                    const altBtn = it.type !== 'spot' ? ''
                        : it.alt ? '<button data-act="leavealt" class="rounded px-1.5 text-[11px] text-violet-700 hover:bg-violet-100" title="移出擇一組">移出擇一</button>'
                        : L.canJoinAlt(day, ii) ? '<button data-act="joinalt" class="rounded px-1.5 text-[11px] text-violet-700 hover:bg-violet-100" title="與相鄰的景點併成擇一組（只去其中一個）">併成擇一</button>' : '';
                    return `<div data-item data-di="${di}" data-ii="${ii}" class="${frame}">${altTag}
                        <div data-row draggable="true" data-act="toggle" class="flex cursor-pointer items-center gap-2 border-b px-2 py-1.5 hover:bg-slate-50 ${bad ? 'bg-rose-50' : ''} ${isOpen ? 'bg-blue-50' : ''}">
                            <span class="cursor-grab select-none text-slate-400">⋮⋮</span>${num}
                            <span class="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${meta.chip}">${meta.label}</span>
                            <span data-time class="w-24 shrink-0 truncate text-xs text-slate-500">${esc(it.time || '')}</span>
                            <span data-sum class="min-w-0 flex-1 truncate ${bad ? 'text-rose-700' : ''}">${bad ? '⚠ ' : ''}${esc(itemLabel(it))}</span>
                            ${altBtn}
                            <button data-act="up" class="rounded px-1.5 text-slate-500 hover:bg-slate-200" title="上移（到頂會跨到前一天）">↑</button>
                            <button data-act="down" class="rounded px-1.5 text-slate-500 hover:bg-slate-200" title="下移（到底會跨到後一天）">↓</button>
                            <button data-act="del" class="rounded px-1.5 text-rose-500 hover:bg-rose-100" title="刪除">✕</button>
                        </div>
                        ${isOpen ? `<div class="grid grid-cols-2 gap-2 border-b bg-blue-50/50 p-3" data-form data-di="${di}" data-ii="${ii}">
                            <label class="col-span-2 block"><span class="text-xs text-slate-500">類型</span><select data-f="type" class="mt-0.5 w-full rounded border p-1.5">${Object.keys(TYPES).map(t => `<option value="${t}" ${t === it.type ? 'selected' : ''}>${TYPES[t].label}（${t}）</option>`).join('')}</select></label>
                            ${meta.fields.map(f => fieldHtml(f, it)).join('')}
                            ${bad ? `<ul class="col-span-2 list-disc pl-5 text-xs text-rose-600">${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
                        </div>` : ''}
                        ${ctx.legHtml ? `<div data-legslot data-di="${di}" data-ii="${ii}">${ctx.legHtml(di, ii)}</div>` : ''}
                    </div>`;
                }).join('') : '';
                return `<section class="border-b-4 border-slate-200" data-day="${di}">
                    <div data-dayhead data-di="${di}" class="flex items-center gap-2 bg-slate-100 px-3 py-2">
                        <button data-act="daytoggle" class="flex min-w-0 flex-1 items-center gap-2 text-left">
                            <span>${open ? '▼' : '▶'}</span>
                            <strong class="shrink-0">DAY ${day.day}</strong><span class="shrink-0 text-xs text-slate-500">${esc(day.date)}</span>
                            <span class="min-w-0 truncate">${esc(day.title)}</span>
                            <span class="shrink-0 rounded bg-white px-1.5 text-xs text-slate-500">${day.items.length} 項</span>
                            ${dayErrs.length ? `<span class="shrink-0 rounded bg-rose-100 px-1.5 text-xs text-rose-700">⚠ ${dayErrs.length}</span>` : ''}
                            ${ctx.dayHeadHtml ? `<span data-dayroute data-di="${di}" class="contents">${ctx.dayHeadHtml(di)}</span>` : ''}
                        </button>
                        <button data-act="daycfg" class="rounded border bg-white px-2 py-0.5 text-xs">日設定</button>
                    </div>
                    ${ui.dayCfg.has(day.day) ? dayCfgHtml(day, di) : ''}
                    ${rows}
                    ${open ? `<div data-dropend data-di="${di}" class="flex items-center gap-2 px-3 py-2">
                        <select data-newtype="${di}" class="rounded border p-1 text-xs">${Object.keys(TYPES).map(t => `<option value="${t}">${TYPES[t].label}</option>`).join('')}</select>
                        <button data-act="add" class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white">＋ 新增項目</button>
                        <span class="text-xs text-slate-400">也可把項目拖到這一列＝放到這天最後</span>
                    </div>` : ''}
                </section>`;
            }).join('') + '<datalist id="placelist">' + Object.entries(places).map(([id, p]) => `<option value="${esc(id)}" label="${esc(p.name)}"></option>`).join('') + '</datalist>';
            scroller.scrollTop = y;
        }

        // 資料改了：重新驗證（外框更新）→ 重畫分頁
        function rerender() { ctx.changed(); render(); }

        function afterMove(pos) {
            if (!pos) return;
            const day = draft().trip.days[pos.di];
            ui.openDays.add(day.day);
            rerender();
            const el = pane.querySelector(`[data-item][data-di="${pos.di}"][data-ii="${pos.ii}"] [data-row]`);
            if (el) { el.classList.add('flash'); el.scrollIntoView({ block: 'nearest' }); }
        }

        pane.addEventListener('click', e => {
            const el = e.target.closest('[data-act]');
            if (!el) return;
            const act = el.dataset.act;
            const itemEl = el.closest('[data-item]');
            const { trip } = draft();
            const days = trip.days;
            if (itemEl) {
                const di = +itemEl.dataset.di, ii = +itemEl.dataset.ii, it = days[di].items[ii];
                if (act === 'toggle') { ui.openItem = ui.openItem === it ? null : it; return render(); }
                if (act === 'del') { days[di].items.splice(ii, 1); if (ui.openItem === it) ui.openItem = null; return rerender(); }
                if (act === 'joinalt') { L.joinAlt(days[di], ii); return rerender(); }
                if (act === 'leavealt') { L.leaveAlt(days[di], ii); return rerender(); }
                if (act === 'up') return afterMove(L.stepItem(trip, di, ii, -1));
                if (act === 'down') return afterMove(L.stepItem(trip, di, ii, 1));
            }
            const headEl = el.closest('[data-dayhead]');
            if (headEl) {
                const day = days[+headEl.dataset.di];
                if (act === 'daytoggle') { if (ui.openDays.has(day.day)) ui.openDays.delete(day.day); else { ui.openDays.add(day.day); if (ctx.onDayOpen) ctx.onDayOpen(day.day); } return render(); }
                if (act === 'daycfg') { if (ui.dayCfg.has(day.day)) ui.dayCfg.delete(day.day); else { ui.dayCfg.add(day.day); ui.openDays.add(day.day); } return render(); }
            }
            if (act === 'add') {
                const di = +el.closest('[data-dropend]').dataset.di;
                const type = pane.querySelector(`[data-newtype="${di}"]`).value;
                const it = L.newItem(type, Object.keys(draft().places));
                days[di].items.push(it);
                ui.openItem = it;
                return rerender();
            }
        });

        // 編輯：文字欄位邊打邊改草稿但不重畫（避免失去焦點）；選單、勾選、地點欄位確定後才重畫
        pane.addEventListener('input', e => handleEdit(e, false));
        pane.addEventListener('change', e => handleEdit(e, true));

        function handleEdit(e, committed) {
            const el = e.target;
            const { trip, places } = draft();
            const days = trip.days;
            const form = el.closest('[data-form]');
            if (form && el.dataset.f) {
                const it = days[+form.dataset.di].items[+form.dataset.ii], f = el.dataset.f;
                if (f === 'type') { L.changeType(it, el.value); return rerender(); }
                if (el.type === 'checkbox') {
                    if (f === 'backup') { if (el.checked) it.backup = true; else delete it.backup; }
                    else if (el.checked) delete it[f]; else it[f] = false;
                    return rerender();
                }
                if (el.value === '') delete it[f]; else it[f] = el.value;
                if (f === 'place') {
                    if (!committed) {
                        const ok = !it.place || places[it.place];
                        const hint = el.parentElement.querySelector('.hint');
                        hint.textContent = it.place ? (ok ? placeName(it.place) : '找不到這個地點 id') : '';
                        hint.className = 'hint text-xs ' + (ok ? 'text-slate-500' : 'text-rose-600');
                        return ctx.changed();
                    }
                    return rerender();
                }
                const row = form.previousElementSibling;
                row.querySelector('[data-sum]').textContent = itemLabel(it);
                if (f === 'time') row.querySelector('[data-time]').textContent = it.time || '';
                return ctx.changed();
            }
            const dayCfg = el.closest('[data-di]');
            if (el.dataset.df && dayCfg) {
                const day = days[+dayCfg.dataset.di];
                let value = el.type === 'checkbox' ? (el.checked ? true : '') : el.value;
                if (el.dataset.df === 'trafficFactor') {   // 數字欄位：空白＝刪除；打到一半不是數字就先忽略
                    value = value.trim() === '' ? '' : Number(value);
                    if (Number.isNaN(value)) return;
                }
                L.setPath(day, el.dataset.df, value);
                return committed ? rerender() : ctx.changed();
            }
        }

        // 拖拉：可在同一天內、也可跨天；放在日標題或「新增」列＝該天最後
        pane.addEventListener('dragstart', e => {
            const row = e.target.closest('[data-row]');
            if (!row) return;
            const item = row.closest('[data-item]');
            ui.drag = { di: +item.dataset.di, ii: +item.dataset.ii };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'item');
            row.classList.add('opacity-40');
        });
        const clearMarks = () => pane.querySelectorAll('.drop-before,.drop-after,.drop-end').forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-end'));
        function dropTarget(e) {
            const row = e.target.closest('[data-row]');
            if (row) {
                const item = row.closest('[data-item]');
                const r = row.getBoundingClientRect();
                const before = e.clientY < r.top + r.height / 2;
                return { node: row, mark: before ? 'drop-before' : 'drop-after', di: +item.dataset.di, ii: +item.dataset.ii + (before ? 0 : 1) };
            }
            const end = e.target.closest('[data-dropend],[data-dayhead]');
            if (end) { const di = +end.dataset.di; return { node: end, mark: 'drop-end', di, ii: draft().trip.days[di].items.length }; }
            return null;
        }
        pane.addEventListener('dragover', e => {
            if (!ui.drag) return;
            const t = dropTarget(e);
            clearMarks();
            if (!t) return;
            e.preventDefault();
            t.node.classList.add(t.mark);
        });
        pane.addEventListener('drop', e => {
            if (!ui.drag) return;
            const t = dropTarget(e);
            clearMarks();
            if (!t) return;
            e.preventDefault();
            const from = ui.drag; ui.drag = null;
            afterMove(L.moveItem(draft().trip, from.di, from.ii, t.di, t.ii));
        });
        pane.addEventListener('dragend', () => { ui.drag = null; clearMarks(); pane.querySelectorAll('.opacity-40').forEach(n => n.classList.remove('opacity-40')); });

        // 重新載入資料時呼叫：丟掉指向舊項目的展開狀態
        function reset() { ui.openItem = null; }

        return { render, reset };
    }

    window.DaysTab = { create };
})();
