// 發布視窗：顯示驗證／存檔／版本號／異動摘要，可編輯 commit 訊息，按「確認發布」才真的 commit 並 push 到 main。
// 在確認視窗按下確認發布＝使用者確認（AGENTS.md）。純邏輯（blockers、changeLines）可在 node 測試。
(function (root) {
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const KIND = { added: '新增', removed: '刪除', modified: '修改' };

    // 不能發布的原因（空陣列＝可以）。與 HEAD 相同、缺少路線快取只警告，不擋。
    function blockers(plan, { dirty, errors }) {
        const out = [];
        if (errors.length) out.push(`資料驗證有 ${errors.length} 個問題`);
        if (dirty) out.push('還有未存檔的修改，請先存檔');
        if (!plan.onMain) out.push(`目前在「${plan.branch || '未知分支'}」，只能在 main 分支發布`);
        return out;
    }

    function changeLines(changes) {
        return [
            ...changes.days.map(d => ({ label: `DAY ${d.day}`, text: d.note })),
            ...changes.places.map(p => ({ label: '地點', text: `${KIND[p.kind]}「${p.name}」` })),
            ...(changes.hotels ? [{ label: '住宿區', text: '有變更' }] : []),
            ...(changes.other ? [{ label: '網站設定', text: '有變更' }] : [])
        ];
    }

    // ctx：{ modal, body（DOM 元素）, state(): { data, errors }, dirty(): bool, reload(): Promise }
    function create(ctx) {
        const close = () => { ctx.modal.classList.add('hidden'); ctx.modal.classList.remove('flex'); };
        const open = () => { ctx.modal.classList.remove('hidden'); ctx.modal.classList.add('flex'); };

        async function call(method, url, body) {
            const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
            const json = await r.json();
            if (!r.ok) throw Object.assign(new Error(json.error || r.statusText), { status: r.status, steps: json.steps });
            return json;
        }

        const stepsText = steps => (steps || []).map(s => `${s.ok ? '✓' : '✗'} ${s.name}${s.output ? '\n' + s.output.split('\n').map(l => '    ' + l).join('\n') : ''}`).join('\n');

        async function show() {
            ctx.body.innerHTML = '<p>讀取異動中…</p>';
            open();
            let plan;
            try { plan = await call('GET', '/api/publish/plan'); }
            catch (e) { ctx.body.innerHTML = `<p class="text-rose-700">無法取得發布資訊：${esc(e.message)}</p><div class="mt-4 text-right"><button id="m-cancel" class="rounded border px-3 py-1.5">關閉</button></div>`; ctx.body.querySelector('#m-cancel').onclick = close; return; }

            const { errors } = ctx.state();
            const dirty = ctx.dirty();
            const block = blockers(plan, { dirty, errors });
            const lines = changeLines(plan.changes);
            const warns = [];
            if (!plan.hasChanges) warns.push('與目前的 HEAD 相同，沒有可發布的異動（仍會更新版本號）');
            if (plan.missingRoutes.length) warns.push(`有 ${plan.missingRoutes.length} 段路線沒有計算快取，公開頁面會用直線代替（不擋發布）`);
            ctx.body.innerHTML = `<h2 class="mb-3 text-lg font-black">發布到 main</h2>
                <ol class="mb-3 space-y-1 text-sm">
                    <li>${errors.length ? '✗' : '✓'} 資料驗證${errors.length ? `：${errors.length} 個問題` : ''}（發布時會再跑 tools/check.js）</li>
                    <li>${dirty ? '✗ 有未存檔的修改' : '✓ 已存檔'}</li>
                    <li>${plan.onMain ? '✓' : '✗'} 分支：${esc(plan.branch)}</li>
                    <li>✓ 版本號 ${esc(plan.version.current.number)} → <strong>${esc(plan.version.next.number)}</strong>（${esc(plan.version.next.date)}）</li>
                </ol>
                <h3 class="mb-1 font-bold">這次的異動（與 HEAD 比對）</h3>
                <ul class="mb-3 list-disc pl-5 text-sm">${lines.map(l => `<li><strong>${esc(l.label)}</strong>：${esc(l.text)}</li>`).join('') || '<li class="text-slate-400">沒有</li>'}</ul>
                ${warns.map(w => `<p class="mb-2 rounded bg-amber-50 p-2 text-amber-800">⚠ ${esc(w)}</p>`).join('')}
                <label class="block"><span class="font-bold">commit 訊息（可編輯，不加 AI 署名）</span><textarea id="commitmsg" rows="3" class="mt-1 w-full rounded border p-2">${esc(plan.message)}</textarea></label>
                ${block.length ? `<p class="mt-3 rounded bg-rose-50 p-2 text-rose-700">無法發布：${block.map(esc).join('；')}</p>` : '<p class="mt-3 text-xs text-slate-500">按下「確認發布」即確認這次內容：會 commit 並 push 到 main，公開網頁約 1–2 分鐘後更新。</p>'}
                <pre id="publog" class="mt-3 hidden max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-3 text-xs text-emerald-300"></pre>
                <div class="mt-4 flex justify-end gap-2"><button id="m-cancel" class="rounded border px-3 py-1.5">關閉</button><button id="m-ok" class="rounded bg-emerald-600 px-3 py-1.5 font-bold text-white disabled:opacity-40" ${block.length ? 'disabled' : ''}>確認發布</button></div>`;
            const $ = id => ctx.body.querySelector(id);
            $('#m-cancel').onclick = close;
            $('#m-ok').onclick = async () => {
                const ok = $('#m-ok'), log = $('#publog');
                ok.disabled = true;
                log.classList.remove('hidden'); log.className = log.className.replace('text-rose-300', 'text-emerald-300');
                log.textContent = '發布中…（檢查、commit、push 需要幾秒）';
                const { data } = ctx.state();
                try {
                    const res = await call('POST', '/api/publish', { trip: data.trip, places: data.places, message: $('#commitmsg').value });
                    log.textContent = `${stepsText(res.steps)}\n\n已發布 ${res.version.number}（${res.version.date}）。公開網頁約 1–2 分鐘後更新。`;
                    await ctx.reload();
                } catch (e) {
                    log.className = log.className.replace('text-emerald-300', 'text-rose-300');
                    log.textContent = `${stepsText(e.steps)}\n\n發布失敗（${e.status || '連線錯誤'}）：${e.message}`;
                    ok.disabled = false;
                }
            };
        }
        return { show, close };
    }

    const api = { create, blockers, changeLines };
    root.PublishDialog = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
