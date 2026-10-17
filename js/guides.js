/*
 * 景點攻略：使用者點開景點彈窗時，在下方顯示 reference/guides.js（window.TRIP_GUIDES）整理的內容。
 *  - guides.js 檔案較大，所以不在首頁載入：頁面載入完成後在背景預載，或第一次點開彈窗時才載。
 *  - key 對應 data/places.js 的 place id，沒有攻略的地點不會顯示這一塊。
 *  - 項目標了 hidden: true 的不顯示（資料保留在 guides.js，想顯示就把標記拿掉）。
 */
(function (root) {
    const Trip = root.Trip = root.Trip || {};
    const GUIDES_SRC = 'reference/guides.js';

    // 區塊設定（順序即顯示順序）
    //   key            guides.js 的欄位名稱
    //   open           預設是否展開
    //   skipIfParking  該地點已有 places.js 的 parking（彈窗上方已顯示）時不重複顯示
    const SECTIONS = [
        { key: 'highlights', title: '旅遊重點', icon: 'star', color: 'text-amber-500', open: true },
        { key: 'kidTips', title: '親子重點', icon: 'child', color: 'text-emerald-600' },
        { key: 'ticketing', title: '票價與預約', icon: 'ticket', color: 'text-blue-600' },
        { key: 'transport', title: '交通與停車', icon: 'car', color: 'text-sky-600', skipIfParking: true },
        { key: 'cautions', title: '注意事項', icon: 'triangle-exclamation', color: 'text-rose-600' },
        { key: 'conflicts', title: '各來源說法不一', icon: 'code-compare', color: 'text-purple-600' }
    ];

    let loading = null;
    function load() {
        if (root.TRIP_GUIDES) return Promise.resolve(root.TRIP_GUIDES);
        if (!loading) {
            loading = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = GUIDES_SRC;
                script.onload = () => (root.TRIP_GUIDES ? resolve(root.TRIP_GUIDES) : reject(new Error('TRIP_GUIDES missing')));
                script.onerror = () => { loading = null; reject(new Error('guides load failed')); };
                document.head.appendChild(script);
            });
        }
        return loading;
    }

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }

    function icon(name, cls) {
        return el('i', `fa-solid fa-${name} ${cls || ''}`.trim());
    }

    function section(def, items, open) {
        const details = el('details', 'rounded-xl border border-slate-200 bg-white');
        if (open) details.open = true;

        const summary = el('summary', 'flex cursor-pointer select-none items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-800');
        summary.append(icon(def.icon, `w-4 shrink-0 ${def.color}`), el('span', 'flex-1', def.title),
            el('span', 'text-xs font-bold text-slate-400', String(items.length)), icon('chevron-right', 'guide-chevron text-xs text-slate-400'));

        const list = el('ul', 'list-disc space-y-1.5 border-t border-slate-100 py-2.5 pl-8 pr-3 text-sm leading-relaxed text-slate-700');
        items.forEach(item => {
            const li = el('li', '', item.t);
            if (item.src && item.src.length) li.append(el('span', 'ml-1 text-[10px] text-slate-400', item.src.map(n => `[${n}]`).join('')));
            list.append(li);
        });
        details.append(summary, list);
        return details;
    }

    function sourcesSection(guide) {
        const readable = (guide.sources || []).filter(src => src.status === 'ok' && /^https?:\/\//.test(src.url));
        if (!readable.length) return null;
        const details = el('details', 'rounded-xl border border-slate-200 bg-white');
        const summary = el('summary', 'flex cursor-pointer select-none items-center gap-2 px-3 py-2.5 text-sm font-bold text-slate-800');
        summary.append(icon('link', 'w-4 shrink-0 text-slate-500'), el('span', 'flex-1', '參考來源'),
            el('span', 'text-xs font-bold text-slate-400', String(readable.length)), icon('chevron-right', 'guide-chevron text-xs text-slate-400'));
        const list = el('ul', 'space-y-1.5 border-t border-slate-100 px-3 py-2.5 text-xs leading-relaxed text-slate-600');
        readable.forEach(src => {
            const li = el('li');
            const link = el('a', 'text-sky-700 underline', src.title);
            link.href = src.url;
            link.target = '_blank';
            link.rel = 'noopener';
            li.append(el('span', 'mr-1 text-slate-400', `[${src.n}]`), link);
            if (src.published) li.append(el('span', 'ml-1 text-slate-400', `（${src.published}）`));
            list.append(li);
        });
        details.append(summary, list);
        return details;
    }

    function build(guide, opts) {
        const sections = [];
        SECTIONS.forEach(def => {
            if (def.skipIfParking && opts.hasParking) return;
            const items = (guide[def.key] || []).filter(item => !item.hidden);
            if (items.length) sections.push(section(def, items, def.open));
        });
        const sources = sourcesSection(guide);
        if (sources) sections.push(sources);
        if (!sections.length) return null;

        const wrap = el('div', 'border-t border-slate-200 pt-4');
        const title = el('h3', 'mb-2 font-black text-slate-900');
        title.append(icon('book-open', 'mr-2 text-blue-600'), '景點攻略');
        const list = el('div', 'space-y-2');
        list.append(...sections);
        wrap.append(title, list, el('p', 'mt-3 text-[11px] leading-relaxed text-slate-500',
            `整理自公開網頁（官網優先），資料整理日 ${guide.updatedAt || ''}。票價、營業時間與預約規則可能變動，出發前請再確認官方公告。`));
        return wrap;
    }

    let token = 0;
    function show(placeId, box, opts) {
        const mine = ++token;
        box.classList.add('hidden');
        box.replaceChildren();
        load().then(guides => {
            if (mine !== token) return;               // 已經切到別的景點
            const guide = guides[placeId];
            const node = guide && build(guide, opts || {});
            if (!node) return;
            box.replaceChildren(node);
            box.classList.remove('hidden');
        }).catch(() => { /* 載入失敗就不顯示攻略，不影響其他資訊 */ });
    }

    Trip.guides = { load, show };
})(window);
