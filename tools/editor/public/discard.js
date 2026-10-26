// 還原視窗：把資料檔退回目前分支的 HEAD（上次發布）。按「確認還原」前會列出會被丟掉的內容；
// 伺服器一定先把修改存成備份 patch，結果訊息會顯示備份位置與套回指令。純邏輯（describe）可在 node 測試。
(function (root) {
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const Publish = typeof require !== 'undefined' ? require('./publish') : root.PublishDialog;

    // dirty：編輯器裡有沒有未存檔的修改（還原會一併丟掉）
    function describe(plan, { dirty }) {
        return {
            empty: !plan.hasChanges,
            lines: plan.changes ? Publish.changeLines(plan.changes) : [{ label: '資料檔', text: '內容無法解析（仍然可以還原）' }],
            files: plan.files,
            dropsDraft: !!dirty
        };
    }

    // ctx：{ modal, body, dirty(): bool, reload(): Promise }
    function create(ctx) {
        const close = () => { ctx.modal.classList.add('hidden'); ctx.modal.classList.remove('flex'); };
        const open = () => { ctx.modal.classList.remove('hidden'); ctx.modal.classList.add('flex'); };
        const closeOnly = msg => {
            ctx.body.innerHTML = `${msg}<div class="mt-4 text-right"><button id="m-cancel" class="rounded border px-3 py-1.5">關閉</button></div>`;
            ctx.body.querySelector('#m-cancel').onclick = close;
        };

        async function call(method, url) {
            const r = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'trip-editor' } });
            const json = await r.json();
            if (!r.ok) throw Object.assign(new Error(json.error || r.statusText), { status: r.status });
            return json;
        }

        async function show() {
            ctx.body.innerHTML = '<p>讀取異動中…</p>';
            open();
            let plan;
            try { plan = await call('GET', '/api/discard/plan'); }
            catch (e) { return closeOnly(`<p class="text-rose-700">無法取得還原資訊：${esc(e.message)}</p>`); }

            const d = describe(plan, { dirty: ctx.dirty() });
            if (d.empty) return closeOnly('<h2 class="mb-2 text-lg font-black">還原到上次發布</h2><p>資料檔和上次發布（HEAD）相同，沒有可還原的內容。</p>');

            ctx.body.innerHTML = `<h2 class="mb-3 text-lg font-black">還原到上次發布</h2>
                <p class="mb-2 text-sm">會把資料檔退回分支「<strong>${esc(plan.branch)}</strong>」最後一次 commit 的內容，<strong>下面這些還沒發布的修改會被丟掉</strong>：</p>
                <ul class="mb-3 list-disc pl-5 text-sm">${d.lines.map(l => `<li><strong>${esc(l.label)}</strong>：${esc(l.text)}</li>`).join('')}</ul>
                <p class="mb-2 text-xs text-slate-500">${d.files.length} 個檔案：${d.files.map(esc).join('、')}（只動資料檔，其他檔案不受影響）</p>
                ${d.dropsDraft ? '<p class="mb-2 rounded bg-amber-50 p-2 text-amber-800">⚠ 編輯器裡還有未存檔的修改，也會一併丟掉。</p>' : ''}
                <p class="mb-2 rounded bg-rose-50 p-2 text-rose-700">無法在編輯器內復原。還原前會先把這些修改存成備份檔（<code>.git/editor-backups/</code>，保留最近 ${esc(plan.keep)} 份），事後可用 <code>git apply</code> 套回。</p>
                <pre id="dlog" class="mt-3 hidden max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-3 text-xs text-emerald-300"></pre>
                <div class="mt-4 flex justify-end gap-2"><button id="m-cancel" class="rounded border px-3 py-1.5">取消</button><button id="m-ok" class="rounded bg-rose-600 px-3 py-1.5 font-bold text-white disabled:opacity-40">確認還原</button></div>`;
            const $ = id => ctx.body.querySelector(id);
            $('#m-cancel').onclick = close;
            $('#m-ok').onclick = async () => {
                const ok = $('#m-ok'), log = $('#dlog');
                ok.disabled = true;
                log.classList.remove('hidden');
                log.textContent = '還原中…';
                try {
                    const res = await call('POST', '/api/discard');
                    log.textContent = `已還原 ${res.restored.length} 個檔案。\n\n修改已備份：${res.backup}\n${res.recoverable ? '想套回來：' : '⚠ 備份套用檢查沒有通過，請手動確認內容。\n參考指令：'}${res.applyCommand}`;
                    $('#m-cancel').textContent = '關閉';
                    await ctx.reload();
                } catch (e) {
                    log.className = log.className.replace('text-emerald-300', 'text-rose-300');
                    log.textContent = `還原失敗（${e.status || '連線錯誤'}）：${e.message}`;
                    ok.disabled = false;
                }
            };
        }
        return { show, close };
    }

    const api = { create, describe };
    root.DiscardDialog = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
