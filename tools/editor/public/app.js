// 編輯器前端（最小版）：載入、存檔、衝突提示
const $ = id => document.getElementById(id);
const state = { data: null };

// 預覽：整合其他前端功能時，資料一有修改就呼叫 onDraftChange()；點開某一天呼叫 preview.scrollToDay(n)
const preview = EditorPreview.create({ frame: $('preview'), onStatus: text => { $('previewStatus').textContent = text; } });
const onDraftChange = () => preview.sendDraft({ trip: state.data.trip, places: state.data.places });

const setStatus = text => {
    $('status').textContent = text;
    $('save').disabled = !state.data;
};
const showNotice = msg => { $('notice').textContent = msg || ''; $('notice').classList.toggle('show', !!msg); };

async function api(method, body) {
    const r = await fetch('/api/data', { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    const json = await r.json();
    if (!r.ok) throw Object.assign(new Error(json.error || r.statusText), { status: r.status });
    return json;
}

async function load() {
    showNotice('');
    try {
        state.data = await api('GET');
        const { trip, places } = state.data;
        $('main').textContent = `${trip.days.length} 天、${Object.keys(places).length} 個地點（版本 ${trip.site.version.number}）`;
        setStatus('已載入');
        $('heroTitle').value = trip.hero.title;
        $('heroTitle').disabled = false;
        onDraftChange(); // 重新載入後，預覽回到磁碟內容
    } catch (e) {
        setStatus('載入失敗');
        showNotice(`載入失敗：${e.message}`);
    }
}

async function save() {
    try {
        const res = await api('PUT', state.data);
        state.data.mtimes = res.mtimes;
        showNotice('');
        setStatus('已存檔');
    } catch (e) {
        showNotice(e.status === 409 ? `存檔被拒絕：${e.message}。你的修改沒有寫入，請按「重新載入」。` : `存檔失敗：${e.message}`);
    }
}

$('heroTitle').oninput = e => { state.data.trip.hero.title = e.target.value; onDraftChange(); };
document.querySelectorAll('[data-day]').forEach(b => { b.onclick = () => preview.scrollToDay(Number(b.dataset.day)); });
document.querySelectorAll('[data-width]').forEach(b => {
    b.onclick = () => {
        preview.setWidth(b.dataset.width);
        document.querySelectorAll('[data-width]').forEach(x => x.classList.toggle('on', x === b));
    };
});
preview.start();

$('reload').onclick = load;
$('save').onclick = save;
load();
