// 路線功能的畫面：項目之間的車程、當天總車程、路線設定、全部重算、「排太緊」等警告。
// 計算流程在 routes-controller.js、純邏輯在 routes-logic.js、規則在 js/model.js。
//   const routes = EditorRoutes.create({ pane, bar, data, changed, onComputed, onStatus });
//   routes.legHtml(di, ii) / routes.dayHeadHtml(di)   給 days.js 畫在項目之間與日標題
//   routes.known()                                    路線快取 { key: { distance, duration } }（days.js 算移動列長度用）
//   routes.reset()                                    重新載入資料後呼叫
// 草稿變動（document 的 'draftchange'）時自動重畫並排程計算；結果更新時只就地換掉路線區塊，不重畫整個分頁（避免輸入中失去焦點）。
(function () {
    const M = window.Trip.model;
    const L = window.RoutesLogic;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // pane：每日行程分頁（放路線區塊）；bar：路線設定與警告列；data()：{ trip, places }；
    // changed()：草稿改了（重新驗證並通知預覽）；onComputed(keys)：有新算出的路線（keys＝新算出的路段；預覽要重新整理、受影響的天要連動）
    // onStatus()：路線狀態變了（含「有未存檔的路線」），外框要重畫
    function create({ pane, bar, data, changed, onComputed, onStatus = () => {} }) {
        const ctl = window.RoutesController.create({ data, onUpdate: () => { refresh(); onStatus(); }, onComputed });
        let warnOpen = false;

        const site = () => data().trip.site || {};
        const maxMinutes = () => (site().routing && site().routing.maxLegMinutes) || M.DEFAULT_ROUTING.maxLegMinutes;
        const nameOf = id => { const p = data().places[id]; return (p && p.name) || id; };

        const BADGE = {
            ok: ['已算', 'bg-emerald-100 text-emerald-700'],
            computing: ['計算中…', 'bg-amber-100 text-amber-700'],
            pending: ['等待計算…', 'bg-slate-200 text-slate-600'],
            failed: ['失敗', 'bg-rose-100 text-rose-700']
        };

        // 某個項目後面接著的路段（fromItemIndex === ii）
        function legHtml(di, ii) {
            const { trip, places } = data();
            const day = trip.days[di];
            const factor = M.getTrafficFactor(day, trip.site);
            return M.getLegs(day, places).map((leg, n) => ({ leg, n })).filter(x => x.leg.fromItemIndex === ii).map(({ leg, n }) => {
                const status = ctl.status(leg.key) || 'pending';
                const [label, cls] = BADGE[status];
                const label2 = `${leg.closeLoop ? '回程' : '車程'}（第 ${n + 1} 段：${esc(nameOf(leg.fromId))} → ${esc(nameOf(leg.toId))}）`;
                let body;
                if (status === 'ok') {
                    const t = L.legText(ctl.known[leg.key], factor, maxMinutes());
                    body = `<span class="${t.over ? 'font-bold text-rose-600' : ''}">${esc(t.text)}${t.over ? `（超過 ${maxMinutes()} 分）` : ''}</span> <span class="text-slate-400">${esc(M.formatFactorNote(factor))}</span>`;
                } else if (status === 'failed') {
                    body = `<span class="text-rose-600">${esc(ctl.error(leg.key))}；退回直線，不會自動重試</span>`;
                } else body = '';
                const btn = status === 'computing' ? '' : `<button data-leg-act="recompute" data-key="${esc(leg.key)}" class="rounded border bg-white px-1.5 text-slate-600 hover:bg-slate-100">重新計算</button>`;
                return `<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b bg-slate-50 px-3 py-0.5 text-xs text-slate-600"><span>↓ ${label2}</span><span class="rounded px-1 ${cls}">${label}</span>${body}${btn}</div>`;
            }).join('');
        }

        // 當天標題上的總車程與總里程
        function dayHeadHtml(di) {
            const { trip, places } = data();
            const t = L.dayTotals(trip.days[di], places, ctl.known, trip.site);
            if (!t.count) return '';
            const miss = t.missing && t.missing !== t.count ? `（${t.missing} 段未算）` : '';
            const text = t.missing === t.count ? '車程：尚未計算' : `車程 ${M.formatDuration(t.minutes)}・${M.formatDistance(t.meters)}`;
            return `<span class="shrink-0 rounded bg-white px-1.5 text-xs text-slate-600">${text}${miss}</span>`;
        }

        // 警告：排太緊、沒座標、計算失敗。不擋存檔、不擋發布。
        function warnings() {
            const { trip, places } = data();
            const out = [];
            for (const day of trip.days) {
                M.deriveMoves(day, places).warnings.forEach(w => out.push(w.message));   // 移動列：多個、多餘
                const noRoute = new Set();
                M.getLegs(day, places).forEach(leg => {   // 移動列沒有查詢結果：時間沿用現有值，不會連動
                    if (leg.rowIndex == null || leg.closeLoop || noRoute.has(leg.rowIndex) || ctl.status(leg.key) === 'computing') return;
                    noRoute.add(leg.rowIndex);
                    if (M.getMoveMinutesAt(day, leg.rowIndex, places, { legs: ctl.known }, trip.site) == null) out.push(`DAY ${day.day} 第 ${leg.rowIndex + 1} 項：移動列沒有路線查詢結果，時間沿用現有值（算出路線後才會連動）`);
                });
                M.getTimeWarnings(day, places, { legs: ctl.known }, trip.site).forEach(w => out.push(w.message));
                M.getLegs(day, places).forEach((leg, n) => {
                    if (ctl.status(leg.key) === 'failed') out.push(`DAY ${day.day} 第 ${n + 1} 段（${nameOf(leg.fromId)} → ${nameOf(leg.toId)}）：路線計算失敗（${ctl.error(leg.key)}），公開頁面會退回直線`);
                });
            }
            L.missingCoords(trip, places).forEach(m => out.push(`DAY ${m.day} 第 ${m.itemIndex + 1} 項「${m.name}」沒有座標，路線無法計算，請到地點庫補座標`));
            return out;
        }

        function renderStatus() {
            const s = ctl.summary();
            const parts = [];
            if (s.computing) parts.push(`計算中 ${s.computing} 段…`);
            if (s.failed) parts.push(`${s.failed} 段失敗`);
            const el = bar.querySelector('[data-rb-status]');
            el.textContent = parts.join('、');
            el.className = s.failed ? 'text-rose-600' : 'text-amber-600';
            bar.querySelector('[data-rb="all"]').disabled = s.computing > 0;
        }

        function renderWarnings() {
            const w = warnings();
            const el = bar.querySelector('[data-rb-warn]');
            if (!w.length) { el.innerHTML = ''; return; }
            el.innerHTML = `<div class="border-t bg-amber-50 px-3 py-1 text-xs text-amber-800"><button data-rb="warntoggle" class="font-bold">⚠ ${w.length} 個路線提醒（不擋存檔、不擋發布）${warnOpen ? '▲' : '▼'}</button>${warnOpen ? '<ul class="mt-1 list-disc pl-5">' + w.map(m => `<li>${esc(m)}</li>`).join('') + '</ul>' : ''}</div>`;
        }

        // 就地更新：換掉路線區塊內容，不動分頁其他部分
        function refresh() {
            pane.querySelectorAll('[data-legslot]').forEach(el => { el.innerHTML = legHtml(+el.dataset.di, +el.dataset.ii); });
            pane.querySelectorAll('[data-dayroute]').forEach(el => { el.innerHTML = dayHeadHtml(+el.dataset.di); });
            renderStatus();
            renderWarnings();
        }

        // 路線設定（網站設定）：預設係數、每段上限
        function syncInputs() {
            const r = site().routing || {};
            bar.querySelector('[data-site="trafficFactor"]').value = r.trafficFactor == null ? '' : r.trafficFactor;
            bar.querySelector('[data-site="maxLegMinutes"]').value = r.maxLegMinutes == null ? '' : r.maxLegMinutes;
        }

        bar.innerHTML = `<div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-white px-3 py-1 text-xs">
                <strong>路線</strong>
                <label>預設係數 <input data-site="trafficFactor" inputmode="decimal" placeholder="${M.DEFAULT_ROUTING.trafficFactor}" class="w-14 rounded border px-1 py-0.5"></label>
                <label>每段上限（分鐘） <input data-site="maxLegMinutes" inputmode="numeric" placeholder="${M.DEFAULT_ROUTING.maxLegMinutes}" class="w-14 rounded border px-1 py-0.5"></label>
                <button data-rb="all" class="rounded border px-2 py-0.5 hover:bg-slate-100 disabled:opacity-40" title="忽略快取，全部重新呼叫路線服務">全部重算</button>
                <span data-rb-status></span>
            </div><div data-rb-warn></div>`;

        bar.addEventListener('input', e => {
            const key = e.target.dataset.site;
            if (!key) return;
            const n = L.parseNumberInput(e.target.value);
            if (n === undefined) return;
            const s = site();
            if (n === null) { if (s.routing) { delete s.routing[key]; if (!Object.keys(s.routing).length) delete s.routing; } }
            else (s.routing || (s.routing = {}))[key] = n;
            changed();
        });
        bar.addEventListener('click', e => {
            const b = e.target.closest('[data-rb]');
            if (!b) return;
            if (b.dataset.rb === 'warntoggle') { warnOpen = !warnOpen; renderWarnings(); }
            if (b.dataset.rb === 'all') ctl.recomputeAll();
        });
        pane.addEventListener('click', e => {
            const b = e.target.closest('[data-leg-act="recompute"]');
            if (b) ctl.recompute([b.dataset.key]);
        });

        document.addEventListener('draftchange', () => { refresh(); ctl.schedule(); });

        return {
            legHtml, dayHeadHtml,
            known: () => ctl.known,
            unsaved: () => ctl.unsaved(),
            markSaved: () => ctl.markSaved(),
            reset() {
                syncInputs();
                ctl.load().catch(() => {}).then(() => ctl.schedule());
            }
        };
    }

    window.EditorRoutes = { create };
})();
