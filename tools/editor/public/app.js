// 編輯器前端（最小版）：載入、存檔、衝突提示
const $ = id => document.getElementById(id);
const state = { data: null };

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

$('reload').onclick = load;
$('save').onclick = save;
load();
