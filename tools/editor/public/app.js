// 編輯器前端：載入、存檔、衝突提示、分頁、驗證錯誤列。
// 草稿 = state.data.trip / state.data.places（就地修改）；saved 是最近一次載入或存檔的快照，用來判斷有沒有未存檔修改。
// 每次草稿變動會在 document 發出 'draftchange' 事件（detail = { trip, places }），給預覽等功能使用。
const $ = id => document.getElementById(id);
const M = window.Trip.model;
const state = { data: null, saved: '', errors: [], tab: 'days', errOpen: false };

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const snapshot = () => JSON.stringify({ trip: state.data.trip, places: state.data.places });
const textDirty = () => !!state.data && snapshot() !== state.saved;
const dirty = () => textDirty() || !!(routes && routes.unsaved());   // 路線快取算出新結果也要存檔

function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2600);
}
const showNotice = msg => { $('notice').textContent = msg || ''; $('notice').classList.toggle('hidden', !msg); };

async function api(method, body) {
    const r = await fetch('/api/data', { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    const json = await r.json();
    if (!r.ok) throw Object.assign(new Error(json.error || r.statusText), { status: r.status });
    return json;
}

function renderChrome() {
    const status = $('status');
    if (!state.data) { status.textContent = '載入中…'; status.className = 'text-xs'; }
    else if (textDirty()) { status.textContent = '● 有未存檔的修改'; status.className = 'text-xs font-bold text-amber-300'; }
    else if (dirty()) { status.textContent = '● 路線計算結果未存檔'; status.className = 'text-xs font-bold text-amber-300'; }
    else { status.textContent = '已存檔（與磁碟相同）'; status.className = 'text-xs text-emerald-300'; }
    $('save').disabled = !dirty();
    document.querySelectorAll('#tabs button').forEach(b => {
        b.className = 'px-4 py-2 ' + (b.dataset.tab === state.tab ? 'border-b-2 border-blue-600 bg-white text-blue-700' : 'text-slate-500');
    });
    ['days', 'places', 'hotels'].forEach(t => $('pane-' + t).classList.toggle('hidden', t !== state.tab));
    const bar = $('errbar'), errors = state.errors;
    if (!state.data) bar.innerHTML = '';
    else if (!errors.length) bar.innerHTML = '<div class="border-b bg-emerald-50 px-3 py-1 text-xs text-emerald-700">✓ 資料驗證通過（與公開頁面的紅色提示列同一套 validate）</div>';
    else bar.innerHTML = `<div class="border-b bg-rose-50 px-3 py-1 text-xs text-rose-700"><button data-act="errtoggle" class="font-bold">⚠ ${errors.length} 個問題（發布會被擋下，仍可存檔）${state.errOpen ? '▲' : '▼'}</button>${state.errOpen ? '<ul class="mt-1 list-disc pl-5">' + errors.map(e => `<li>${esc(e)}</li>`).join('') + '</ul>' : ''}</div>`;
}

// 草稿有變動：重新驗證、更新外框、通知預覽
function changed() {
    state.errors = M.validate(state.data.trip, state.data.places);
    renderChrome();
    document.dispatchEvent(new CustomEvent('draftchange', { detail: { trip: state.data.trip, places: state.data.places } }));
}

const preview = EditorPreview.create({ frame: $('preview'), onStatus: text => { $('previewStatus').textContent = text; } });
document.addEventListener('draftchange', e => preview.sendDraft(e.detail));
document.querySelectorAll('[data-width]').forEach(b => {
    b.onclick = () => {
        preview.setWidth(b.dataset.width);
        document.querySelectorAll('[data-width]').forEach(x => x.classList.toggle('bg-slate-800', x === b));
        document.querySelectorAll('[data-width]').forEach(x => x.classList.toggle('text-white', x === b));
    };
});
preview.start();

let routes = null;   // 路線功能（routes.js）；days 先建立，所以用延後綁定
const days = DaysTab.create($('pane-days'), {
    data: () => state.data, errors: () => state.errors, changed, toast, onDayOpen: n => preview.scrollToDay(n),
    legHtml: (di, ii) => (routes ? routes.legHtml(di, ii) : ''),
    dayHeadHtml: di => (routes ? routes.dayHeadHtml(di) : '')
});
routes = EditorRoutes.create({
    pane: $('pane-days'), bar: $('routebar'), data: () => state.data, changed,
    onComputed: () => preview.sendDraft({ trip: state.data.trip, places: state.data.places }),
    onStatus: renderChrome
});

const places = PlacesTab.create($('pane-places'), { data: () => state.data, changed, toast });

const hotels = HotelsTab.create($('pane-hotels'), { data: () => state.data, changed, toast });

const publishDialog = PublishDialog.create({ modal: $('modal'), body: $('modal-body'), state: () => state, dirty, reload: load });
$('publish').onclick = () => publishDialog.show();

async function load() {
    showNotice('');
    try {
        state.data = await api('GET');
        state.saved = snapshot();
        days.reset();
        routes.reset();
        places.reset();
        changed();
        days.render();
        places.render();
        hotels.render();
    } catch (e) {
        showNotice(`載入失敗：${e.message}`);
    }
}

async function save() {
    try {
        const res = await api('PUT', state.data);
        state.data.mtimes = res.mtimes;
        state.saved = snapshot();
        routes.markSaved();   // 內部會重畫外框
        showNotice('');
        renderChrome();
        toast('已存檔');
    } catch (e) {
        showNotice(e.status === 409 ? `存檔被拒絕：${e.message}。你的修改沒有寫入，請按「重新載入」（會丟掉未存檔的修改）。` : `存檔失敗：${e.message}`);
    }
}

$('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) {
        state.tab = b.dataset.tab; renderChrome();
        // 另一個分頁可能改了地點（名稱、id），切過去時重畫
        if (state.data && state.tab === 'days') days.render();
        if (state.data && state.tab === 'places') places.render();
        if (state.data && state.tab === 'hotels') hotels.render();
    }
});
$('errbar').addEventListener('click', e => {
    if (e.target.closest('[data-act="errtoggle"]')) { state.errOpen = !state.errOpen; renderChrome(); }
});
$('reload').onclick = () => {
    if (dirty() && !confirm('有未存檔的修改，重新載入會全部丟掉。確定嗎？')) return;
    load();
};
$('save').onclick = save;
window.addEventListener('beforeunload', e => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
renderChrome();
load();
