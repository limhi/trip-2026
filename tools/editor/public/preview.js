// 預覽控制（獨立模組，不依賴編輯器其他前端程式）：
//   const preview = EditorPreview.create({ frame: iframe, onStatus: text => … });
//   preview.start();            // 載入 /preview/index.html（磁碟版）
//   preview.sendDraft(draft);   // draft = { trip, places }；350ms 防抖後送出，再重新整理 iframe 並保留捲動位置
//   preview.scrollToDay(2);     // 預覽捲到 #day-2
//   preview.setWidth('phone');  // 'phone' | 'tablet' | 'desktop'
(function (root) {
    const WIDTHS = { phone: '390px', tablet: '768px', desktop: '100%' };
    const PREVIEW_URL = '/preview/index.html';

    function create({ frame, onStatus = () => {}, delay = 350, fetchFn = (...a) => root.fetch(...a), timers = { setTimeout, clearTimeout } }) {
        let timer = null;
        let seq = 0;        // 只讓最後一次送出的草稿觸發重新整理
        let scroll = 0;     // 重新整理前的捲動位置
        let jumpDay = null; // 待捲動的天（頁面還沒載入時）

        const doc = () => { try { return frame.contentDocument; } catch { return null; } };

        function applyJump() {
            if (jumpDay == null) return false;
            const el = doc() && doc().getElementById('day-' + jumpDay);
            if (!el) return false;
            el.scrollIntoView();
            jumpDay = null;
            return true;
        }

        frame.addEventListener('load', () => {
            if (!applyJump()) {
                try { frame.contentWindow.scrollTo(0, scroll); } catch { /* 預覽不可存取時略過 */ }
            }
            onStatus('已更新 ' + new Date().toLocaleTimeString());
        });

        async function push(draft) {
            const mine = ++seq;
            try {
                const r = await fetchFn('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
                if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
                if (mine !== seq) return;
                try { scroll = frame.contentWindow.scrollY; } catch { scroll = 0; }
                if (frame.src) frame.contentWindow.location.reload(); else frame.src = PREVIEW_URL;
            } catch (e) {
                onStatus('預覽更新失敗：' + e.message);
            }
        }

        return {
            start() { frame.src = PREVIEW_URL; },
            sendDraft(draft) {
                timers.clearTimeout(timer);
                onStatus('更新中…');
                timer = timers.setTimeout(() => push(draft), delay);
            },
            scrollToDay(day) {
                jumpDay = day;
                try { scroll = frame.contentWindow.scrollY; } catch { /* 略過 */ }
                applyJump();
            },
            setWidth(mode) {
                if (!WIDTHS[mode]) throw new Error('未知的預覽寬度：' + mode);
                frame.style.width = WIDTHS[mode];
            }
        };
    }

    const api = { create, WIDTHS, PREVIEW_URL };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.EditorPreview = api;
})(typeof window !== 'undefined' ? window : globalThis);
