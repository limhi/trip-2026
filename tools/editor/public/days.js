// 「每日行程」分頁：表單、拖拉排序、跨天、日設定。純邏輯在 days-logic.js，驗證與地圖編號用 js/model.js。
(function () {
    const L = window.DaysLogic;
    const M = window.Trip.model;
    const TYPES = L.TYPES;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const FIELD = {
        time: ['時間', 'text'], tag: ['標籤', 'text'], title: ['標題（空白＝用地點名稱）', 'text'], text: ['文字', 'text'],
        note: ['備註', 'text'], icon: ['圖示', 'text'], mapName: ['地圖上的名稱', 'text'], desc: ['說明', 'area'],
        buffer: ['緩衝（分鐘，可正負）', 'int'], place: ['地點', 'place'], map: ['顯示在地圖', 'bool'], numbered: ['地圖上編號', 'bool'], backup: ['備案（不連線）', 'bool']
    };

    // ctx：{ data(): {trip, places}, errors(): string[], changed(): 重新驗證並更新外框, toast(msg), routes(): { legs }（路線快取，可省略） }
    function create(pane, ctx) {
        const scroller = pane.parentElement;
        const ui = { openDays: new Set([1]), dayCfg: new Set(), openItem: null, drag: null };
        const draft = () => ctx.data();

        const placeName = id => (draft().places[id] && draft().places[id].name) || '';
        const itemLabel = it => {
            if (it.type === 'waypoint') return (placeName(it.place) || it.place || '(未選地點)') + (it.text ? '・' + it.text : '');
            return it.title || placeName(it.place) || it.text || '(空白)';
        };

        // 待套用列：欄位值與資料不同時才顯示（syncPending）。連動／伸縮／取消；buffer 另有向前／向後選擇（在 pendBar 外，常駐）
        const pendBar = field => `<div data-pendbar="${field}" style="display:none" class="mt-1 flex flex-wrap items-center gap-1"><span class="text-[11px] text-amber-700">待套用：連動／伸縮</span><button type="button" data-act="pendlink" data-field="${field}" class="shrink-0 rounded border bg-white px-1.5 text-[11px] text-slate-700 hover:bg-slate-100" title="連動：${field === 'start' ? '前面整串跟著動' : field === 'end' ? '後面整串跟著動' : '依方向，該側整串跟著動'}（Enter 也是連動）">連動</button><button type="button" data-act="pendstretch" data-field="${field}" class="shrink-0 rounded border bg-white px-1.5 text-[11px] text-slate-700 hover:bg-slate-100" title="伸縮（單次）：只動緊鄰的移動與景點，更遠的不動">伸縮</button><button type="button" data-act="pendcancel" data-field="${field}" class="shrink-0 rounded border bg-white px-1.5 text-[11px] text-slate-500 hover:bg-slate-100" title="取消：欄位還原成目前資料">取消</button></div>`;

        function fieldHtml(name, item, day, ii) {
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
            if (name === 'time' && item.type === 'move') return `<label class="block"><span class="text-xs text-slate-500">${label}（自動：由前後項目與路線查詢長度決定，改「緩衝」可微調）</span><input data-f="time" readonly value="${esc(item.time)}" class="mt-0.5 w-full rounded border bg-slate-100 p-1.5 text-slate-500"></label>`;
            const parts = name === 'time' ? L.timeParts(item.time) : null;
            if (parts) {   // 完整區間：開始、結束都可改（離開欄位後連動：改結束平移後面、改開始平移前面），各有一次性「伸縮」、說明文字
                const rw = 'class="mt-0.5 w-full rounded border p-1.5"';
                const edge = (side, label, v) => `<div class="block"><span class="text-xs text-slate-500">${label}</span><input data-f="${side}" value="${esc(v)}" class="mt-0.5 w-full rounded border p-1.5">${pendBar(side)}</div>`;
                return `<div class="col-span-2 grid grid-cols-3 gap-2">
                    ${edge('start', '開始（改它＝前面整串跟著動）', parts.start)}
                    ${edge('end', '結束（改它＝後面整串跟著動）', parts.end)}
                    <label class="block"><span class="text-xs text-slate-500">時間說明</span><input data-f="tail" value="${esc(parts.tail)}" ${rw}></label>
                </div>`;
            }
            if (name === 'buffer' && item.type === 'move') {   // 移動列緩衝：向前＝開始邊動（前面跟著動）、向後＝結束邊動（後面跟著動）；方向與伸縮不存，只存總緩衝
                return `<div class="block"><span class="text-xs text-slate-500">${label}</span><div class="mt-0.5 flex gap-1"><input data-f="buffer" inputmode="numeric" value="${esc(item.buffer)}" class="min-w-0 flex-1 rounded border p-1.5"><select data-f="bufdir" class="shrink-0 rounded border bg-white p-1 text-xs" title="這次調整哪一邊動（不存）"><option value="back" selected>向後</option><option value="forward">向前</option></select></div>${pendBar('buffer')}</div>`;
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
                    const isMove = it.type === 'move';
                    const num = point ? (point.number != null
                        ? `<span title="地圖編號" class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">${point.label}</span>`
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
                        <div data-row draggable="true" data-act="toggle" class="flex cursor-pointer items-center gap-2 border-b px-2 py-1.5 ${bad ? 'bg-rose-50' : isMove ? 'bg-sky-50 hover:bg-sky-100' : isOpen ? 'bg-blue-50' : 'hover:bg-slate-50'}">
                            <span class="cursor-grab select-none text-slate-400">⋮⋮</span>${num}
                            ${isMove ? '<span title="移動" class="shrink-0 text-sky-600">🚗</span>' : ''}<span class="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${meta.chip}">${meta.label}</span>
                            <span data-time class="w-24 shrink-0 truncate text-xs text-slate-500">${esc(it.time || '')}</span>
                            <span data-stay class="shrink-0 text-[11px] text-emerald-700">${esc(L.stayHint(day, ii))}</span>
                            <span data-sum class="min-w-0 flex-1 truncate ${bad ? 'text-rose-700' : ''}">${bad ? '⚠ ' : ''}${esc(itemLabel(it))}</span>
                            ${altBtn}
                            <button data-act="up" class="rounded px-1.5 text-slate-500 hover:bg-slate-200" title="上移（到頂會跨到前一天）">↑</button>
                            <button data-act="down" class="rounded px-1.5 text-slate-500 hover:bg-slate-200" title="下移（到底會跨到後一天）">↓</button>
                            <button data-act="del" class="rounded px-1.5 text-rose-500 hover:bg-rose-100" title="刪除">✕</button>
                        </div>
                        ${isOpen ? `<div class="my-2 ml-6 mr-2 grid grid-cols-2 gap-2 rounded-lg border border-l-4 border-slate-300 ${meta.bar || 'border-l-slate-400'} bg-white p-3 shadow-sm" data-form data-di="${di}" data-ii="${ii}">
                            <label class="col-span-2 block"><span class="text-xs text-slate-500">類型</span><select data-f="type" class="mt-0.5 w-full rounded border p-1.5">${Object.keys(TYPES).map(t => `<option value="${t}" ${t === it.type ? 'selected' : ''}>${TYPES[t].label}（${t}）</option>`).join('')}</select></label>
                            ${meta.fields.map(f => fieldHtml(f, it, day, ii)).join('')}
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
                        <button data-act="dayresched" class="rounded border bg-white px-2 py-0.5 text-xs" title="以第一個有完整時間的項目的開始為起點，依停留與移動長度（路線查詢 + 緩衝）重排整天；按了才執行">整天重排</button>
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

        const routesOf = () => (ctx.routes ? ctx.routes() : undefined);
        // 結構改動前先記下受影響各天的移動列路段（Map di → moveKeys），改動後交給 syncDays
        const snap = dis => new Map([...new Set(dis)].map(di => [di, L.moveKeys(draft().trip.days[di], draft().places)]));

        // 移動列連動（ADR 0007）：補缺的移動列（fill），路段變了或新補的移動列依查詢長度調整、後面平移。回傳是否有天補了列（要重畫）
        function syncDays(before, fill = true) {
            const { trip, places } = draft();
            let grew = false;
            before.forEach((keys, di) => {
                const r = L.syncMoves(trip.days[di], places, { routes: routesOf(), site: trip.site, before: keys, fill });
                if (r.added) grew = true;
            });
            return grew;
        }

        // 輸入中不重畫：只把該天各列的時間、停留提示與展開表單的時間欄（正在輸入的欄位除外；force＝連正在輸入的也改，用於套用或還原）改成最新值
        function refreshTimes(di, force = false) {
            const day = draft().trip.days[di];
            pane.querySelectorAll(`[data-item][data-di="${di}"]`).forEach(el => {
                const ii = +el.dataset.ii, t = day.items[ii].time || '';
                el.querySelector('[data-time]').textContent = t;
                el.querySelector('[data-stay]').textContent = L.stayHint(day, ii);
                const form = el.querySelector('[data-form]');
                if (!form) return;
                const parts = L.timeParts(t) || {};
                const set = (f, v) => { const input = form.querySelector(`input[data-f="${f}"]`); if (input && (force || (input !== document.activeElement && !input.dataset.pend)) && v != null) input.value = v; };
                set('time', t); set('start', parts.start); set('end', parts.end); set('tail', parts.tail);
                set('buffer', String(day.items[ii].buffer || ''));
                syncPending(form, day.items[ii]);
            });
        }

        // 待套用狀態（只存在 DOM：input.dataset.pend＋黃底＋按鈕列），不進資料。結構改動（rerender／toggle 重畫）會整個重畫表單，等於直接捨棄待套用
        function syncPending(form, item) {
            ['start', 'end', 'buffer'].forEach(f => {
                const input = form.querySelector(`input[data-f="${f}"]`);
                if (!input) return;
                const pend = L.isPendingEdit(item, f, input.value);
                input.dataset.pend = pend ? '1' : '';
                input.style.background = pend ? '#fef3c7' : '';
                const bar = form.querySelector(`[data-pendbar="${f}"]`);
                if (bar) bar.style.display = pend ? '' : 'none';
            });
        }

        // 套用或取消待套用欄位：mode 'link'｜'stretch'｜'cancel'
        function applyPending(di, ii, field, mode) {
            const form = pane.querySelector(`[data-item][data-di="${di}"][data-ii="${ii}"] [data-form]`);
            if (!form) return;
            if (mode === 'cancel') return refreshTimes(di, true);
            const value = form.querySelector(`input[data-f="${field}"]`).value;
            if (field === 'buffer') applyBuffer(di, ii, value, form.querySelector('[data-f="bufdir"]').value, mode);
            else applyEdge(di, ii, field, value, mode);
        }

        // 路線算完（keys = 新算出的路段）：綁定這些路段的移動列依新長度調整，後面平移；不重畫，只更新時間
        function applyComputed(keys) {
            const { trip, places } = draft();
            const want = new Set(keys || []);
            let any = false;
            trip.days.forEach((day, di) => {
                if (M.fitMoves(day, places, routesOf(), trip.site, (_item, key) => want.has(key)).changed.length) { any = true; refreshTimes(di); }
            });
            if (any) ctx.changed();
        }

        // 景點開始／結束邊界調整（連動或伸縮）：不補列、不重畫，焦點不丟；拒絕時 toast 並把欄位還原成資料裡的值
        function applyEdge(di, ii, side, value, mode) {
            const day = draft().trip.days[di];
            const r = L.setItemTime(day, ii, side, value, mode);
            if (!r.ok) ctx.toast(r.message);
            refreshTimes(di, true);
            if (r.ok) ctx.changed();
        }

        // 移動列緩衝（連動或伸縮）：同景點邊界，不補列、不重畫、焦點不丟；拒絕時 toast 並還原欄位
        function applyBuffer(di, ii, value, direction, mode) {
            const { trip, places } = draft();
            const day = trip.days[di];
            const r = L.setMoveBuffer(day, ii, value, direction, mode);
            if (!r.ok) ctx.toast(r.message);
            else if (!M.parseTimeRange(day.items[ii].time)) M.fitMoves(day, places, routesOf(), trip.site, item => item === day.items[ii]);   // 還沒有時間的列：依查詢長度補上
            refreshTimes(di, true);
            if (r.ok) ctx.changed();
        }

        function afterMove(pos, fromDi, before) {
            if (!pos) return;
            const day = draft().trip.days[pos.di];
            const moved = day.items[pos.ii];
            syncDays(before);   // 補列會讓索引位移，重新找被搬的項目
            pos = { di: pos.di, ii: day.items.indexOf(moved) };
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
                if (act === 'pendlink' || act === 'pendstretch' || act === 'pendcancel') return applyPending(di, ii, el.dataset.field, act === 'pendlink' ? 'link' : act === 'pendstretch' ? 'stretch' : 'cancel');
                if (act === 'del') { const b = snap([di]); days[di].items.splice(ii, 1); if (ui.openItem === it) ui.openItem = null; syncDays(b); return rerender(); }
                if (act === 'joinalt') { const b = snap([di]); L.joinAlt(days[di], ii); syncDays(b); return rerender(); }
                if (act === 'leavealt') { const b = snap([di]); L.leaveAlt(days[di], ii); syncDays(b); return rerender(); }
                if (act === 'up') { const b = snap([di, Math.max(0, di - 1)]); return afterMove(L.stepItem(trip, di, ii, -1), di, b); }
                if (act === 'down') { const b = snap([di, Math.min(days.length - 1, di + 1)]); return afterMove(L.stepItem(trip, di, ii, 1), di, b); }
            }
            const headEl = el.closest('[data-dayhead]');
            if (headEl) {
                const day = days[+headEl.dataset.di];
                if (act === 'daytoggle') { if (ui.openDays.has(day.day)) ui.openDays.delete(day.day); else { ui.openDays.add(day.day); if (ctx.onDayOpen) ctx.onDayOpen(day.day); } return render(); }
                if (act === 'dayresched') {
                    const r = L.rescheduleDay(day, draft().places, { routes: routesOf(), site: draft().trip.site });
                    if (r.added || r.changed) rerender();
                    const nr = r.warnings.filter(w => w.type === 'no-route').length, other = r.warnings.length - nr;
                    ctx.toast(`已重排 DAY ${day.day}：${r.changed} 項時間更新${r.added ? `（補上 ${r.added} 個移動列）` : ''}${nr ? `；${nr} 個移動列沒有路線查詢結果` : ''}${other ? `；${other} 則其他警告：${r.warnings.find(w => w.type !== 'no-route').message}` : ''}`);
                    return;
                }
                if (act === 'daycfg') { if (ui.dayCfg.has(day.day)) ui.dayCfg.delete(day.day); else { ui.dayCfg.add(day.day); ui.openDays.add(day.day); } return render(); }
            }
            if (act === 'add') {
                const di = +el.closest('[data-dropend]').dataset.di;
                const type = pane.querySelector(`[data-newtype="${di}"]`).value;
                const it = L.newItem(type, Object.keys(draft().places));
                const b = snap([di]);
                days[di].items.push(it);
                ui.openItem = it;
                syncDays(b);
                return rerender();
            }
        });

        pane.addEventListener('mousedown', e => { if (e.target.closest('[data-act^="pend"]')) e.preventDefault(); });   // 按鈕不搶走欄位焦點（離開焦點本來就不套用，只是讓焦點留在原處）
        // 待套用欄位按 Enter＝連動
        pane.addEventListener('keydown', e => {
            if (e.key !== 'Enter' || e.isComposing) return;
            const el = e.target, form = el.closest && el.closest('[data-form]');
            if (!form || !['start', 'end', 'buffer'].includes(el.dataset.f) || !el.dataset.pend) return;
            e.preventDefault();
            applyPending(+form.closest('[data-item]').dataset.di, +form.dataset.ii, el.dataset.f, 'link');
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
                const di = +form.dataset.di, before = snap([di]);
                if (f === 'type') { L.changeType(it, el.value); syncDays(before); return rerender(); }
                if (el.type === 'checkbox') {
                    if (f === 'backup') { if (el.checked) it.backup = true; else delete it.backup; }
                    else if (el.checked) delete it[f]; else it[f] = false;
                    syncDays(before);
                    return rerender();
                }
                if (f === 'start' || f === 'end') {   // 開始／結束：值與資料不同就進入待套用（資料與預覽都不動），離開焦點不套用也不還原；按「連動」「伸縮」才套用
                    return syncPending(form, it);
                }
                if (f === 'tail' || (f === 'time' && it.type !== 'move')) {
                    // 說明文字與整串時間：邊輸入邊改（不補列、不重畫）；離開欄位後才補列並重畫
                    const ii = +form.dataset.ii;
                    L.setItemTime(days[di], ii, f, el.value);
                    refreshTimes(di);
                    form.previousElementSibling.querySelector('[data-sum]').textContent = itemLabel(it);
                    if (committed) { syncDays(before); return rerender(); }
                    return ctx.changed();
                }
                if (f === 'bufdir') return;   // 方向只在套用緩衝時讀，不存
                if (f === 'buffer') return syncPending(form, it);   // 緩衝：同開始／結束，待套用；方向（向前／向後）在按下連動或伸縮時才讀
                if (el.value === '') delete it[f]; else it[f] = el.value;
                if (f === 'place') {
                    if (!committed) {
                        const ok = !it.place || places[it.place];
                        const hint = el.parentElement.querySelector('.hint');
                        hint.textContent = it.place ? (ok ? placeName(it.place) : '找不到這個地點 id') : '';
                        hint.className = 'hint text-xs ' + (ok ? 'text-slate-500' : 'text-rose-600');
                        return ctx.changed();
                    }
                    syncDays(before);
                    return rerender();
                }
                form.previousElementSibling.querySelector('[data-sum]').textContent = itemLabel(it);
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
            const b = snap([from.di, t.di]); afterMove(L.moveItem(draft().trip, from.di, from.ii, t.di, t.ii), from.di, b);
        });
        pane.addEventListener('dragend', () => { ui.drag = null; clearMarks(); pane.querySelectorAll('.opacity-40').forEach(n => n.classList.remove('opacity-40')); });

        // 重新載入資料時呼叫：丟掉指向舊項目的展開狀態
        function reset() { ui.openItem = null; }

        return { render, reset, applyComputed };
    }

    window.DaysTab = { create };
})();
