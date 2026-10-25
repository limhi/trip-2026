# 設計文件（給接手的 AI／開發者）

最後更新：2026-10-25｜資料版本 v1.6｜搭配 [`TODO.md`](TODO.md)（待辦事項）一起讀。

這份文件回答三個問題：**這個專案是什麼、為什麼這樣設計、改的時候要注意什麼**。操作層面的「想改 X 要動哪個檔」請看 [`README.md`](../README.md)，工作規則請看 [`AGENTS.md`](../AGENTS.md)。

---

## 1. 一分鐘總覽

| 項目 | 內容 |
|---|---|
| 是什麼 | 一份 2026/11/15（日）–11/20（五）、6 天 5 夜的親子順時針環島行程網頁（3 位成人＋1 位 8 歲孩童，自駕） |
| 使用者 | 規劃者本人與家人；網頁在出發前持續調整，出發後當導覽用（手機為主） |
| 公開網址 | https://limhi.github.io/trip-2026/（GitHub Pages，發布 `main`；repo 是公開的） |
| 技術 | 純靜態 HTML／CSS／JS，**零建置**；Tailwind、Leaflet、Font Awesome 皆走 CDN；沒有後端與資料庫 |
| 資料 | 全部在 `data/*.js`（行程、地點）與 `reference/guides.js`（景點攻略）；頁面載入時由 JS 組出來 |
| 現況 | 6 天行程、26 個地點、3 間住宿、14 個景點有攻略；`verify.md` 有 21 題待人工確認（見 TODO） |
| 最重要的原則 | **資料與呈現分離**：改行程只動資料檔，不動 HTML；公開頁面上的每個事實都要有可追溯的來源 |

使用者要求的核心能力（也是這個設計存在的理由）：行程、景點、順序、聯絡資訊會頻繁調整，所以要能「改一個地方，卡片、彈窗、地圖一起更新」。

---

## 2. 架構

```
            ┌──────────────┐     ┌──────────────┐
            │ data/places.js│     │ data/trip.js │   ← 所有「內容」都在這兩個檔
            │ window.       │     │ window.TRIP  │     （地點事實 / 行程順序與文案）
            │ TRIP_PLACES   │     │              │
            └──────┬───────┘     └──────┬───────┘
                   │                    │
                   ▼                    ▼
              js/model.js  ── getContact / getMapPoints / validate（不碰 DOM，可在 Node 測）
                   │
        ┌──────────┼───────────────┬───────────────┐
        ▼          ▼               ▼               ▼
   js/blocks.js  js/map.js      js/modal.js    js/guides.js
   區塊樣板與顏色  每日地圖        聯絡/導航彈窗   彈窗內的景點攻略
        └──────────┴───────┬───────┴───────────────┘
                           ▼
                      js/render.js  ── 把資料填進 index.html 的骨架、綁定事件
                           ▲
       index.html（只有骨架：data-text / data-slot 佔位）＋ css/style.css

   reference/guides.js ──（點開彈窗時才動態載入）──▶ js/guides.js
   verify.md ──（fetch + marked 轉 HTML）──▶ verify.html
```

### 載入順序（`index.html` 底部，**不可調換**）
`leaflet` → `data/places.js` → `data/trip.js` → `js/model.js` → `js/blocks.js` → `js/modal.js` → `js/map.js` → `js/guides.js` → `js/render.js`。
所有檔案都掛在 `window.Trip` 命名空間（`Trip.model`、`Trip.blocks`、`Trip.initModal`、`Trip.bindDayMap`、`Trip.mapPanelHtml`、`Trip.guides`、`Trip.mapUrl`、`Trip.MAP_TYPES`），`render.js` 最後執行。

### 為什麼是「JS 資料檔 + 傳統 script」，不是 JSON／ES module
使用者要能**雙擊 `index.html`（file://）也能開**，同時支援 http。瀏覽器在 file:// 會擋 `fetch` 本機 JSON 與 ES module，所以資料用 `window.X = {...}`、程式用傳統 `<script>`。副作用：資料檔裡可以寫註解、可以用變數（`PARTY`）。

---

## 3. 檔案地圖

| 檔案 | 角色 | 備註 |
|---|---|---|
| `index.html` | 頁面骨架、彈窗 HTML、script 載入 | 內容不寫在這裡；`data-text="a.b.c"` 填文字、`data-slot="名稱"` 填區塊 |
| `data/trip.js` | 行程內容 | 檔頭有完整的欄位說明，改之前先讀 |
| `data/places.js` | 地點資料庫 | 檔頭有欄位說明 |
| `js/model.js` | 資料處理與檢查 | 純函式，`tools/check.js` 會載入它 |
| `js/blocks.js` | 各類區塊的 HTML 樣板與 Tailwind 顏色表 | 統一改顏色改最上方的表 |
| `js/modal.js` | 聯絡／導航彈窗 | 事件委派：任何有 `data-place` 的元素都能開彈窗 |
| `js/map.js` | 每日地圖（Leaflet + OpenStreetMap 圖磚） | `MAP_TYPES` 是標記顏色／圖示／圖例 |
| `js/guides.js` | 彈窗內的景點攻略（折疊區塊） | `SECTIONS` 設定順序與預設展開 |
| `js/render.js` | 組裝頁面 | 最後執行，並在 `load` 後 1.5 秒預載攻略 |
| `css/style.css` | Tailwind 做不到的樣式 | 彈窗、地圖、編號圓點、攻略折疊箭頭 |
| `reference/guides.js` | 14 個景點的攻略資料（約 185 KB） | **網頁直接讀這個檔**；`guides.md` 是同內容的可讀版 |
| `reference/guides.md` | 同上，可讀版 | 兩者靠 `tools/check.js` 偵測是否漂移 |
| `reference/research.md` | 早期整理的來源與票務清單 | 歷史資料，只當索引 |
| `reference/pending-decisions.md` | 需要使用者決定的項目與已處理紀錄 | |
| `verify.md` / `verify.html` | 公開的人工確認清單與其閱讀頁 | 見第 7 節 |
| `tools/check.js` | 一鍵檢查（Node，無套件） | 見第 10 節 |
| `tools/e2e.js` | 瀏覽器端到端測試（Playwright；自己起 Node 靜態伺服器） | 見第 10.2 節 |
| `tools/h2t.py` | HTML 轉純文字（Python 標準庫，查證用） | 用 `python3 -I` 執行；JS 渲染頁面會是空的 |
| `docs/` | 本文件、`TODO.md`（待辦）、`RESEARCH-LOG.md`（v1.5 官方更新的逐字證據） | |
| `AGENTS.md` / `README.md` | 工作規則 / 常見調整對照表 | |

---

## 4. 資料模型

### 4.1 地點（`data/places.js` → `window.TRIP_PLACES`）
以 id 為 key，**每個地點只維護一次**（行程、彈窗、地圖都引用同一份）。

| 欄位 | 說明 |
|---|---|
| `name` | 顯示名稱（卡片標題預設取它） |
| `mapType` | `attraction｜hotel｜food｜other｜transport`，決定地圖標記顏色 |
| `lat`, `lng` | 座標；**沒有座標就不會出現在地圖** |
| `address` | 地址；導航預設用它搜尋 |
| `infoType` | **有填才有「查看聯絡與導航」彈窗**（值是彈窗標題上的類別字：旅遊景點／餐飲資訊／住宿資訊／掃墓地點） |
| `phone` | 顯示用字串（可含說明）；撥號號碼由 `phone` 取數字自動產生 |
| `tel` | 覆寫撥號號碼（`phone` 有多個號碼時必填，例如七星潭） |
| `phoneActionLabel` | 撥號按鈕文字（預設「立即撥號」；鄉公所用「撥打鄉公所」） |
| `line` | `{label, url}` |
| `website` | 官網（彈窗出現「官方網站」按鈕） |
| `navigationUrl` | 自訂導航連結；沒填就用 `address` 產生 Google Maps 導航。**地址不精準或導航會出事時用座標連結**（豆腐岬、大坡池、里港公墓都這樣做） |
| `parking` | 交通與停車提醒（字串或字串陣列），彈窗顯示藍色「交通與停車」區塊 |
| `booking` | `{name, phone}` 訂房資料（住宿用，目前都是「待提供」） |
| `alternate` | 備選地點卡（程式支援，目前沒有地點使用） |

**慣例**：沒有官方資訊的內容要標「以現場為準」；來自部落格的內容在文字裡標「遊記」；不要把開發用語寫進會顯示的字串。

### 4.2 行程（`data/trip.js` → `window.TRIP`）
`site`（品牌、版本號、導覽連結、頁尾）、`hero`、`highlights`、`itinerary`、`days[]`、`hotelsSection`、`hotels[]`。

每一天：`{ day, date, title, stay|badge, theme?, closeLoop?, items[] }`。`items` 的 `type`：

| type | 外觀 | 欄位 |
|---|---|---|
| `drive` | 深灰列（車） | `time, text, duration?` |
| `move` | 淺灰列（路線） | `time, text, duration?` |
| `spot` / `meal` / `stay` / `end` / `notice` | 彩色卡片（藍／琥珀／紫／綠／琥珀） | `tag, time?, place` 或 `title`，`desc` |
| `brief` | 琥珀淡底小框 | `time, title, place?, icon?, desc?` |
| `waypoint` | 虛線小列（起訖點／休息點） | `place, text?, backup?, mapName?, numbered?` |

共通：`place`（引用地點 id）、`map:false`（不放上地圖）、`numbered:false`（上地圖但不編號）。

### 4.3 地圖標記與編號是「推導」出來的
`model.getMapPoints(day, places)` 依 `items` 的順序，把有 `place` 且該地點有座標的項目變成標記：

- 編號由上而下自動遞增；左側對應的卡片或 `waypoint` 列顯示**同一個編號圓點**（顏色與地圖相同）。
- `waypoint` 若有編號，左邊會多一列；`numbered:false` 的只出現在地圖（小圖示）。
- `backup:true` 的標記標成「備案」色且**不連線**（大坡池）；`day.closeLoop` 讓路線連回起點（Day 2、Day 4）。
- `map:false`（Day 4 的「離園返程」）避免同一個點重複出現。
- **調整順序＝上下搬 `items`，編號、地圖、連線自動跟著變，不需要另外維護地圖資料。**

### 4.4 `validate()` 與紅色提示列
`model.validate()` 檢查：`place` id 是否存在、`type` 是否合法、卡片是否有標題來源、住宿 id、座標缺失。頁面載入時有問題會在最上方出現**紅色提示列**並寫入主控台。這是抓「打錯 id」最快的方法。

---

## 5. 畫面與互動（行為設計）

- **導覽列**：左品牌、右兩個錨點連結與**版本號**（桌面單行 `v1.5 · 2026/10/17`，手機兩行）。手機寬度（360px 以上）實測不溢出；320px 會自動換行。
- **每日卡片**：標題列（DAY、日期標題、住宿標籤、「展開地圖」）＋項目列。住宿標籤與地圖面板的「今日住宿」按鈕可直接開住宿彈窗。
- **彈窗**（點任何有 `data-place` 的卡片／按鈕）依序顯示：訂房資料（只有住宿）→ 基本聯絡資訊（電話／LINE／地址）→ 交通與停車（有 `parking` 才顯示）→ 動作按鈕（撥號／LINE／官網／導航）→ 備選地點 → 景點攻略（有攻略才顯示）。
- **景點攻略**：折疊區塊（旅遊重點預設展開）；每條後有 `[3][4]` 來源編號，最下面是「參考來源」連結。**該地點已有 `parking` 時不重複顯示攻略裡的「交通與停車」**。
- **地圖**：每天預設收合，展開才初始化 Leaflet（省效能）；沒有 Leaflet（CDN 失敗）或沒有標記時，整個地圖功能會自己移除，不影響其他部分。
- **首頁頁尾**有「資料待確認清單 ↗」，新分頁開啟 `verify.html`。
- 顏色以「類型」為單位統一（景點藍、用餐琥珀、住宿紫、結束綠），不要再逐張卡片手調。

---

## 6. 景點攻略系統

- 資料：`reference/guides.js` → `window.TRIP_GUIDES`，key 是地點 id。每個景點有 `highlights／kidTips／ticketing／transport／cautions／conflicts／contactNotes／sources`；項目是 `{ t: 文字, src: [來源編號], hidden?: true }`。檔頭有完整欄位說明。
- 載入：`js/guides.js` 用動態 `<script>` 載入（不是首頁就載），`load` 後 1.5 秒背景預載，第一次點開彈窗時若還沒好就等它。載入失敗就不顯示攻略，不影響其他資訊。
- `hidden:true` 的項目網頁不顯示。**張美農場一則涉及他人刑案的新聞已隱藏，不要拿掉**（公開的家庭頁面不適合）。`contactNotes` 也不顯示。
- 文字規範：攻略會直接顯示在公開網頁，要寫成家人看得懂的說法，**不要出現 `places.js`、`專案資料` 等開發用語**（`tools/check.js` 會檢查）。
- **`guides.js` 與 `guides.md` 要同步改**（`check.js` 會偵測不同步：guides.js 的每一句都必須原樣出現在 guides.md）。
- 已知：9 個地點沒有攻略（宜蘭餅發明館、52Hz食堂、炸蛋蔥油餅黃車、池上飯包、里港公墓、文富、3 間民宿），彈窗不會顯示攻略區塊。

---

## 7. 確認清單系統（`verify.md`／`verify.html`）

**目的**：有些資訊官方網站與政府資料庫查不到明確答案（營業日、停車費、LINE、座標對不對…），由使用者請人實際查證，再用題號回覆。

- `verify.md`：總覽表 → 21 題（每題：目前網頁寫什麼／我查到的（標「官方」或「遊記」）／怎麼確認（撥號連結、地圖連結）／編號選項／回覆範例）→「已由 Claude 查證並更新」（含依據連結，供抽查）→「尚未能查證」。
- 使用者回覆格式 `Q題號-選項號`（可複選、可附註），例如 `Q6-2`、`Q9-1 營業時間 11:00–14:30`。
- **題號不重編**，新題接在最後。標成 ✅ 的方式：總覽表 ⏳→✅、該題 `**狀態**` 行改「✅ 已確認（日期）」、題目標題下加一行 `> ✅ **已確認：選項 N**（日期）…`、開頭統計行改成「共 N 題：X 題已確認 ✅、Y 題待確認 ⏳」。`tools/check.js` 會檢查這些是否一致。
- `verify.html`：因為 GitHub Pages 把 `.md` 以 `text/markdown` 提供（瀏覽器多半直接下載），所以用這個頁面 `fetch('verify.md')` 並以 `marked@12.0.2`（jsdelivr）轉成 HTML；連結新分頁開啟、題號有錨點（`#q6`）、表格可橫向捲動。**marked 載入失敗時顯示原始文字，並有 GitHub 檢視連結備援**。
- `verify.md` 最初由一支腳本產生，**腳本沒有放進 repo**；之後直接編輯 `verify.md` 即可。

---

## 8. 資料來源與可信度規則

1. **優先順序**：官網／政府官方頁 ＞ 日期較近的 BLOG ＞ 日期較久的 BLOG。
2. 只有部落格的資訊要標「遊記」並列為確認題目；沒有官方資訊的內容要標「以現場為準」。
3. **查到明確、有官方原文的結果可自行更新並發布**（使用者已授權），並寫進 `verify.md` 的「已由 Claude 查證並更新」；仍不確定的列成題目。
4. **子代理的查證報告不能直接採信**：套用前要自己重讀原文。實際發生過：研究員說「03-997-3421 是蘇澳鎮公所總機」，我重讀頁面找不到該段頁尾，所以沒採用；他引用的自由時報我讀不到（被擋），所以沒當事實寫進網頁。
5. 座標：優先用縣府／觀光署的官方座標；沒有官方座標時，用內政部國土測繪中心查詢**確認座標落在地址所在的行政區**（見下）。
6. **每項已套用的官方更新，其逐字原文、網址、日期與核對結果在 [`RESEARCH-LOG.md`](RESEARCH-LOG.md)**（原始抓取檔不留，所以保留的是引句與比對結果）。新增更新時也要補進去。引句要逐字：這次比對就抓到我把官網的「平假日」抄成「平日」（已更正），所以轉寫數字與條件時要對照原文，不要憑印象。

### 查證用的管道（這個環境實測過）
| 管道 | 用法 |
|---|---|
| curl | `curl -sL -m 30 -A "Mozilla/5.0" -o out.html "<url>"`，再轉文字（只用標準庫解析，不執行內容）。**WebFetch 在此環境 DNS 失敗不能用；WebSearch 結果很弱** |
| 宜蘭縣政府旅遊網 | 頁面靠 JS；改讀 `https://travel.yilan.gov.tw/_api/zh-tw/attractions`，標頭 `X-Requested-With: XMLHttpRequest`、`Referer: https://travel.yilan.gov.tw/zh-tw/attractions/`（246 筆，含 `address／tel／latlng／open_time／date_modified`） |
| 花蓮旅遊網 | `https://hualien.travel/_api/zh-tw/attractions?page=1`，需 `X-Requested-With`（我自己直接請求曾回空陣列，研究員成功過，細節不明） |
| 交通部觀光署 | `https://www.taiwan.net.tw/m1.aspx?sNo=…&id=…`，頁面文字含電話、地址、**經緯度** |
| 內政部國土測繪中心 | `https://api.nlsc.gov.tw/other/TownVillagePointQuery/{經度}/{緯度}`，回傳該座標的縣市／鄉鎮／**村里**。用來抓「座標落在別的村里」的錯誤（大鯖魚、屏東民宿、大坡池都靠它發現） |
| 讀不到 | Facebook、Google 地圖（JS 外殼）、屏東縣政府與里港鄉公所（連線被擋）、池上鄉公所（被擋）、自由時報（403）、多數大型旅遊 blog（403） |

---

## 9. 發布與版本

- 使用者直接看**公開網頁**驗收；**已確認的調整一律直接 commit 並 push 到 `main`，不開分支 PR**（避免小調整散落在沒合併的分支）。在 Claude 指定的工作分支上時：`git push origin HEAD:main`，並一併 push 該分支（stop hook 會檢查工作分支是否有未推送的 commit）。
- push 後用 `curl -s https://limhi.github.io/trip-2026/data/trip.js | grep "version:"` 確認線上版本已更新；Pages 通常 **約 45 秒–1 分鐘**。
- **版本號**在 `data/trip.js` 的 `site.version`（`{number:'v1.5', date:'2026/10/17'}`）：改行程或地點資料就更新；純文件或確認清單狀態更新可以不改。
- 版本歷史：v1.0 拆分單檔（PR #1）→ v1.1 版本號與左側編號對應地圖／住宿捷徑（PR #2，另一個工作階段）→ v1.2 `parking` 欄位與第一批資料（PR #3）→ v1.3 景點攻略接進彈窗 → v1.4 四項行程文字修正 → v1.5 加大查證（座標更正、確認清單）→ v1.6 更正遠雄停車說明（官網是「平假日」不是「平日」）。

---

## 10. 驗證方法

### 10.1 一鍵檢查（每次改完都跑）
```bash
node tools/check.js
```
只需要 Node。檢查：資料能載入且 `validate()` 通過、座標在台灣範圍內、guides 的 id／來源編號／開發用語、`guides.md` 與 `guides.js` 同步、`verify.md` 的題號與狀態一致、所有文字檔 UTF-8 無 BOM／無 U+FFFD／無 CRLF、版本號格式。已用 7 種人為錯誤做過反向測試，確認抓得到。**它不能取代瀏覽器實測。**

### 10.2 瀏覽器端到端測試（`tools/e2e.js`）
改到功能（`js/`、`index.html`、`verify.html`、`css/`）就要跑；只改資料文字可以只跑 `check.js`。

```bash
# 這個專案的雲端沙箱用法
PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright \
CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
MARKED_JS=<本機 marked@12.0.2 的 marked.min.js> \
TAILWIND_CSS=<本機編譯的 Tailwind CSS> \
node tools/e2e.js
```
- `MARKED_JS`、`TAILWIND_CSS` 可省略：沒有 `MARKED_JS` 只測 `verify.html` 的轉換失敗備援；沒有 `TAILWIND_CSS` 只測行為、不測版面（導覽列寬度）。取得方式：在**暫存資料夾**（不要在 repo 裡）`npm install marked@12.0.2 tailwindcss@3.4.17`；Tailwind 用 `content: ['<repo>/index.html','<repo>/js/*.js']` 編譯成 CSS。
- 測試內容（最小模式 15 項、完整模式 19 項）：首頁無錯誤與版本號、每個有彈窗的地點（標題、停車區塊、攻略、`hidden` 項目不顯示、無開發用語、導航按鈕、訂房區塊、Esc 關閉）、每天地圖（標記數、路線連線、展開／收合）、打錯 id 的紅色提示列、file:// 開啟與攻略動態載入、`verify.html`（題號錨點、撥號連結、新分頁連結、備援）、導覽列 360／375／414／768／1280px 不溢出。
- 做法：自己起 Node 靜態伺服器（**不用 python／pkill**）、放行本機請求並 `abort` 外部請求，沙箱連不到 Tailwind／Leaflet／Font Awesome CDN。地圖用 `addInitScript` 在頁面載入前放假的 `window.L`；**不要改成 route 回傳假的 leaflet.js**——頁面有 SRI `integrity`，內容不符會被擋，結果地圖按鈕被程式整個移除，測試會以為地圖壞了。
- 每個測試區塊獨立執行，出例外只記成一項失敗，不會擋住其他結果。結束碼：0 全過、1 有失敗、2 測試本身無法執行。
- **已做過反向測試**：在複本裡植入 6 種功能破壞（停車區塊永遠隱藏、攻略路徑壞掉、路線不連回起點、頁尾連結不開新分頁、題號錨點消失、不顯示紅色提示列），全部被抓到；過程中也抓到並修掉兩個測試本身的缺陷（一個永遠為真的斷言、一個例外會中斷全部結果的寫法）。**改測試時請維持這個標準：新增斷言就要想辦法證明它會失敗。**
- **AI 從來沒有在真實瀏覽器看過**：Font Awesome 圖示、Leaflet 真實地圖、Tailwind 的真實外觀。這些要請使用者在手機與電腦看一次（見 TODO）。

## 11. 決策紀錄（為什麼這樣做）

| 決策 | 原因 |
|---|---|
| 資料／樣板／功能／樣式四層拆分 | 使用者行程常調整；改一處、多處更新 |
| 地點用 id 引用 | 原本同一景點的資料散在 3 處，靠標題文字比對，打錯一字就無聲失效 |
| 地圖標記由行程順序推導 | 取代手動維護的 `dailyMapData`，調順序不用改兩份 |
| JS 資料檔而非 JSON | 要支援雙擊 file:// 開啟 |
| 同類型區塊統一顏色 | 原本同類型區塊在不同天用不同顏色，是逐塊手寫的結果 |
| 攻略延遲載入 | 185 KB 不該拖慢首頁（手機） |
| 攻略用折疊區塊 | 每景點約 1,500 字，手機一次塞滿太長 |
| `hidden` 機制 | 公開家庭頁面不放涉及他人刑案的報導，但資料保留 |
| 直接 push `main`、不開 PR | 使用者用公開網頁驗收，要最快生效；PR 分支曾造成小調整沒合併 |
| `verify.html` 轉譯 `.md` | Pages 把 `.md` 當檔案下載，請人點連結不方便 |
| 官方資料優先、blog 標「遊記」 | 使用者規則：官網 ＞ 近期 blog ＞ 舊 blog；且資訊會被拿去實際出發 |
| 邱比準改名（不再寫「勇者桂冠王／」） | 官方確認邱比準在八仙二路93號，勇者桂冠王是員山另一家；但使用者要去哪一家仍列為 Q1 |
| Day 5 多良停留 30→40 分鐘、後續順延 10 分鐘 | 停好車要走上坡 5–10 分鐘，實際在平台只剩 10–20 分鐘；抵達屏東與入住改 17:50 |
| 大鯖魚、冷泉停留時間**沒有**延長 | 要動到當天其他安排；列在 TODO 讓使用者決定 |

---

## 12. 已知限制與陷阱

- `pkill -f "http.server 8765"` 會殺掉自己的 shell（指令列也含這串字）。**用 `echo $! > pidfile`，再 `kill $(cat pidfile)`。**
- Tailwind 是 CDN（Play CDN）即時掃 DOM，所以 JS 字串裡的 class 要寫成**完整字串**（不能用字串拼接組 class 名），否則不會生效。
- 閱讀 `.md` 用 `verify.html`，不要把 `verify.md` 的連結直接給人（會下載）。
- 公開 repo：**不要把家人的姓名、電話、訂房資料寫進任何檔案**（`booking` 欄位目前是「待提供」，見 TODO 的隱私提醒）。
- 地圖圖磚用 OpenStreetMap，有使用政策；目前流量極小沒問題。
- stop hook 會抱怨「工作分支有未推送 commit」或「有未追蹤檔案」：commit 後同時 push `main` 與工作分支即可。
- GitHub MCP 工具有時需要先用 `ToolSearch` 載入；目前流程用 git 直接 push，不需要它。
- `git push` 回 **403**（Claude 沒有寫入授權）：請使用者到 https://claude.ai/connect-github 重新連結 GitHub，並確認 Claude GitHub App 已安裝在這個 repo；**不要改用其他路徑繞過**。
- 舊版單檔 `index.html`（拆分前最後一版）在 git 歷史 commit `2a43d75`，要回頭看原貌可以 `git show 2a43d75:index.html`。
- **子代理的環境和主環境相同**：WebFetch DNS 失敗、curl 可用、同樣讀不到 Facebook／Google 地圖。子代理的報告有過：把同一頁不連續的句子合併成一句引句、把出處標錯（登記證號與地址的出處、愛貝客與 curly 的地址）、做出沒有佐證的推論。所以才有 `RESEARCH-LOG.md` 的逐句比對；**子代理說的話一律當成「待核對」**。
- **寫檔時 `\uFFFD` 這類跳脫序列要小心**：如果寫成真正的字元，`check.js` 會把自己抓出來（發生過）。commit 訊息也一樣，別放真正的替換字元。
- **不要用 `cmd | tail && git commit`**：管線的結束碼是 `tail` 的，檢查失敗會被吃掉（發生過，有問題的版本被推上去）。要寫成 `cmd; rc=$?; [ $rc -eq 0 ] || exit 1`。

---

## 13. 與使用者的協作偏好

- 摘要預設用**繁體中文**。
- 指令有不清楚的地方，**先用編號條列確認再動手**；問題與選項**都要編號**。
- 文字檔一律 **UTF-8（無 BOM）**；看到亂碼先驗證檔案能否正常 UTF-8 解碼，不要因終端機顯示亂碼就覆寫。
- 使用者會請別人實際查證，再用題號回覆；回覆前不要自行套用沒有官方佐證的資訊。
- 使用者重視「結論先行、誠實標示沒驗證到的部分」：沙箱擋掉的 CDN、讀不到的來源、子代理的說法，都要明講。
