# AGENTS.md

2026/11/15–11/20 親子順時針環島行程網頁（純靜態，無建置步驟）。結構與常見調整方式見 `README.md`。

## 發布流程（重要）

- 使用者直接用**公開網頁**（GitHub Pages，發布 `main`：https://limhi.github.io/trip-2026/）檢視修改效果。
- **使用者已確認的調整，一律直接 commit 並 push 到 `main`**，讓 Pages 儘快生效；**不要另開分支 PR**，避免小調整散落在沒合併的分支。若目前在 Claude 指定的工作分支上，commit 後執行 `git push origin HEAD:main`，並一併 push 該分支。
- push 後用 `curl -s https://limhi.github.io/trip-2026/data/trip.js | grep "version:"` 確認線上版本號已更新（Pages 通常需 1–2 分鐘）。
- 行程編輯器的發布按鈕：在確認視窗按下「確認發布」＝使用者確認，編輯器會自行 commit 並 push 到 `main`。
- 這項授權只涵蓋「使用者已確認」的調整，以及下面「查證與確認清單」中**有官方原文佐證**的更新；其餘沒有使用者決定的項目仍不要自行套用。

## 查證與確認清單

- **公開確認清單**：`verify.md`（閱讀頁 `verify.html`，首頁頁尾有連結，開新分頁）。使用者會請人實際確認每一題，再用題號回覆（例如 `Q6-2`、`Q9-1 營業時間 11:00–14:30`）。
- 收到題號回覆後：依答案更新 `data/places.js`／`data/trip.js` → 在 `verify.md` 把該題標成 ✅（記下答案與日期，或移到「已確認」區）→ 更新版本號 → 直接 push 到 `main` 並確認線上生效。
- `verify.md` 由腳本一次產生，之後直接改 `verify.md` 即可；題號不要重編，新題接在最後。
- **使用者授權加大查證**：對不確定的資訊，可主動查官方網頁（政府、營運單位、內政部國土測繪中心座標查詢等）。查到**明確、有官方原文**的結果就自行更新並發布，並列入 `verify.md` 的「已由 Claude 查證並更新」；仍不確定的才列成確認題目。只有部落格的資訊要標「遊記」並列入確認題目。
- 套用官方更新時，把「網址、頁面日期、逐字原文」補進 `docs/RESEARCH-LOG.md`；引句要逐字，轉寫數字與條件要對照原文。
- 查證方法：用 curl 抓官方頁（WebFetch 在此環境無法解析網域、WebSearch 結果很弱）；許多縣府旅遊網靠 JS 渲染，可改讀它前端呼叫的公開 JSON（需帶 `X-Requested-With` 標頭）。Facebook 與 Google 地圖讀不到。子代理的查證報告不能直接採信，套用前要自己重讀原文。

## 開始前先看

- **接手先讀這兩份**：[`docs/TODO.md`](docs/TODO.md)（待辦事項：收到使用者題號回覆時各題要改什麼、出發前一週檢查清單、紅線）與 [`docs/DESIGN.md`](docs/DESIGN.md)（設計文件：架構、資料模型、決策原因、驗證方法、環境陷阱）。
- **待決定事項**：`reference/pending-decisions.md` 列出景點資料核對後還需要使用者決定的項目（B 類、C 類、規則範圍外的發現）。使用者回覆編號後，依該檔修改資料，並把已處理的項目移到該檔的「已套用」或刪除。**沒有使用者決定前，不要自行套用 B 類。**
- **攻略資料**：`reference/guides.js` 是各景點的攻略整理，**網頁彈窗的「景點攻略」直接讀這個檔**（`js/guides.js` 在使用者點開彈窗時才載入）；`reference/guides.md` 是同內容的可讀版，`reference/research.md` 是來源清單。修改攻略文字時，`guides.js` 與 `guides.md` 要同步改。
- 攻略項目若標了 `hidden: true`，網頁不顯示（例如張美農場一則涉及他人刑案的新聞，公開頁面不放）。
- 攻略文字會直接顯示在公開網頁上，不要寫「places.js」「專案資料」這類開發用語，要寫成給家人看得懂的說法（例如「本頁地址」）。

## 資料核對規則

- 與導航地點有關的「交通與停車」「聯絡資訊」：與原景點資訊一致就保留；不一致就補上資訊，或列出來讓使用者確認，不要自行改。
- 資訊優先順序：**官網 > 日期較近的 BLOG > 日期較久的 BLOG**。
- 沒有官方資訊的內容，要標示「以現場為準」。

## 檔案分工

| 想改的內容 | 檔案 |
|---|---|
| 每天行程順序、時間、說明、頁首、住宿區文案、版本號 | `data/trip.js` |
| 地點的電話、LINE、官網、地址、座標、導航連結、交通與停車（`parking`） | `data/places.js` |
| 區塊顏色與樣板 | `js/blocks.js` |
| 公開確認清單（請人實際確認的題目） | `verify.md`（顯示頁 `verify.html`） |
| 設計文件與待辦事項（接手用） | `docs/DESIGN.md`、`docs/TODO.md`（有重大變動或完成待辦就更新） |
| 一鍵檢查 | `node tools/check.js`（只需 Node） |
| 瀏覽器端到端測試 | `node tools/e2e.js`（需要 Playwright，用法見 `docs/DESIGN.md` 第 10.2 節） |
| 查證用：HTML 轉純文字 | `python3 -I tools/h2t.py in.html out.txt` |
| 官方更新的逐字證據（新增更新時要補） | `docs/RESEARCH-LOG.md` |
| 彈窗的景點攻略（區塊順序、預設展開） | `js/guides.js` 最上方的 `SECTIONS`；內容在 `reference/guides.js` |
| 其餘功能 | `js/model.js`、`js/modal.js`、`js/map.js`、`js/render.js` |

## 工作規則

- 所有文字檔使用 UTF-8（無 BOM）。修改含中文的檔案後，確認沒有 U+FFFD 與亂碼；不要因為終端機顯示亂碼就覆寫檔案。
- 每次改動行程或地點資料，更新 `data/trip.js` 的 `site.version`（版本與日期）。
- 修改後驗證：先跑 `node tools/check.js`（資料能載入且 `Trip.model.validate` 沒問題、攻略與確認清單一致、編碼正確）；動到功能（`js/`、`index.html`、`verify.html`、`css/`）再跑 `tools/e2e.js` 確認頁面沒有紅色提示列與 JS 錯誤（作法見 `docs/DESIGN.md` 第 10 節）。**commit 前要看檢查的結束碼，不要用 `cmd | tail && git commit`（會吃掉失敗狀態）。**
- 完成 `docs/TODO.md` 裡的項目、或做了影響設計的改動，要同步更新那兩份文件，讓下一個接手的人看到的是現況。
- 有不清楚的地方，先用編號條列跟使用者確認，選項也要編號。
- 回報摘要預設使用繁體中文。
