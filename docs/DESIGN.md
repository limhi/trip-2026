# 設計文件（給接手的 AI／開發者）

最後更新：2026-10-26｜資料版本 v2.0（編輯器與路線功能已合進整合分支，尚未改版本號）｜搭配 [`TODO.md`](TODO.md)（待辦事項）一起讀。

這份文件回答三個問題：**這個專案是什麼、為什麼這樣設計、改的時候要注意什麼**。操作層面的「想改 X 要動哪個檔」請看 [`README.md`](../README.md)，工作規則請看 [`AGENTS.md`](../AGENTS.md)。

---

## 1. 一分鐘總覽

| 項目 | 內容 |
|---|---|
| 是什麼 | 一份 2026/11/15（日）–11/20（五）、6 天 5 夜的親子順時針環島行程網頁（3 位成人＋1 位 8 歲孩童，自駕） |
| 使用者 | 規劃者本人與家人；網頁在出發前持續調整，出發後當導覽用（手機為主） |
| 公開網址 | https://limhi.github.io/trip-2026/（GitHub Pages，發布 `main`；repo 是公開的） |
| 技術 | 公開頁面是純靜態 HTML／CSS／JS，**零建置**（只有「由 JSON 產生 `data/*.js`」一步）；Tailwind、Leaflet、Font Awesome 皆走 CDN；沒有後端與資料庫。編輯器與路線計算只在本機（Node，零依賴） |
| 資料 | 來源是 `data/*.json`（行程、地點、路線快取），由 `tools/build-data.js` 產生網頁載入的 `data/*.js`；景點攻略在 `reference/guides.js`；頁面載入時由 JS 組出來 |
| 編輯 | 使用者用本機編輯器（`node tools/editor/server.js`，只綁 `127.0.0.1`）改 JSON、看即時預覽、按發布；Claude 也可以直接改 JSON（見 `AGENTS.md`）。公開頁面沒有任何後端或編輯功能 |
| 現況 | 6 天行程、26 個地點、3 間住宿、14 個景點有攻略；`verify.md` 有 22 題（1 題已確認）人工確認（見 TODO） |
| 最重要的原則 | **資料與呈現分離**：改行程只動資料檔，不動 HTML；公開頁面上的每個事實都要有可追溯的來源 |

使用者要求的核心能力（也是這個設計存在的理由）：行程、景點、順序、聯絡資訊會頻繁調整，所以要能「改一個地方，卡片、彈窗、地圖一起更新」。

---

## 2. 架構

```
 資料來源（人與工具改這裡）                 產生檔（不手改；網頁載入這些）
 data/places.json ─┐                       data/places.js  window.TRIP_PLACES
 data/trip.json   ─┼─ tools/build-data.js ─▶ data/trip.js    window.TRIP
 data/routes.json ─┘                       data/routes.js   window.TRIP_ROUTES      （小，首頁載入）
        ▲                                  data/routes-geo.js window.TRIP_ROUTES_GEO （大，展開地圖才載入）
        │ 存檔 / 發布
 tools/editor/（本機 Node 伺服器 + 原生 JS 前端）──呼叫──▶ tools/routing/provider.js（OSRM）
        │ 預覽（POST /api/draft → GET /preview/*，草稿由記憶體產生，不寫磁碟）

                       data/*.js
                           │
                           ▼
              js/model.js  ── getContact / getMapPoints / getLegs / validate / getTimeWarnings…
                   │            （不碰 DOM；編輯器、公開頁面、check.js、測試共用同一份）
        ┌──────────┼───────────────┬───────────────┐
        ▼          ▼               ▼               ▼
   js/route-view.js  js/blocks.js  js/map.js      js/modal.js    js/guides.js
   路線顯示邏輯    區塊樣板與顏色  每日地圖        聯絡/導航彈窗   彈窗內的景點攻略
        └──────────┴───────┬───────┴───────────────┘
                           ▼
                      js/render.js  ── 把資料填進 index.html 的骨架、綁定事件
                           ▲
       index.html（只有骨架：data-text / data-slot 佔位）＋ css/style.css

   reference/guides.js ──（點開彈窗時才動態載入）──▶ js/guides.js
   verify.md ──（fetch + marked 轉 HTML）──▶ verify.html
```

### 載入順序（`index.html` 底部，**不可調換**）
`leaflet` → `data/places.js` → `data/trip.js` → `data/routes.js` → `js/model.js` → `js/route-view.js` → `js/blocks.js` → `js/modal.js` → `js/map.js` → `js/guides.js` → `js/render.js`。
所有檔案都掛在 `window.Trip` 命名空間（`Trip.model`、`Trip.blocks`、`Trip.initModal`、`Trip.bindDayMap`、`Trip.mapPanelHtml`、`Trip.guides`、`Trip.mapUrl`、`Trip.MAP_TYPES`），`render.js` 最後執行。

### 為什麼網頁載入的是「JS 資料檔 + 傳統 script」，不是 JSON／ES module
使用者要能**雙擊 `index.html`（file://）也能開**，同時支援 http。瀏覽器在 file:// 會擋 `fetch` 本機 JSON 與 ES module，所以網頁載入的資料是 `window.X = {...}`、程式用傳統 `<script>`。

資料來源是 `data/*.json`（方便工具讀寫），`tools/build-data.js` 產生 `data/*.js`：檔頭固定一行「請勿手改」註解，內容是 `window.TRIP = <JSON>;`／`window.TRIP_PLACES = <JSON>;`／`window.TRIP_ROUTES = …;`／`window.TRIP_ROUTES_GEO = …;`，縮排 4 空格、UTF-8 無 BOM、LF。JSON 不能寫註解與變數，所以原本的 `PARTY` 變數已展開成字串，欄位說明都在本節（第 4 節）。**改資料要改 JSON，再執行產生器，兩邊一起 commit。**

---

## 3. 檔案地圖

| 檔案 | 角色 | 備註 |
|---|---|---|
| `index.html` | 頁面骨架、彈窗 HTML、script 載入 | 內容不寫在這裡；`data-text="a.b.c"` 填文字、`data-slot="名稱"` 填區塊 |
| `data/trip.json` | 行程內容的**資料來源** | 欄位說明在本文第 4.2 節 |
| `data/places.json` | 地點資料庫的**資料來源** | 欄位說明在本文第 4.1 節 |
| `data/trip.js`、`data/places.js` | 由 `tools/build-data.js` 從上面兩個 JSON 產生的**產生檔**（網頁載入的是它們） | 要 commit，不手改；`check.js` 檢查同步 |
| `tools/build-data.js` | 產生器：`node tools/build-data.js`（匯出 `build`、`buildFrom`、`buildRoutes`、`writeAtomic`、`TARGETS`、`ROUTES_JSON`；`writeAtomic` 先寫 `.tmp` 再全部 rename） | 測試：`node --test`（自動找 `*.test.js`） |
| `data/routes.json` | 路線快取（**資料來源**，由編輯器寫入；目前還是空殼：`legs` 是空的，第一次算路線前頁面維持灰色虛線）：`{profile, legs:{ "經度,緯度>經度,緯度": {distance 公尺, duration 秒, geometry, provider, computedAt} }}`，值是原始值（不含係數） | 格式由 `tools/routing/cache.js` 固定（legs 依 key 排序） |
| `data/routes.js`、`data/routes-geo.js` | 由 `routes.json` 產生：`window.TRIP_ROUTES`（距離／時間，小）、`window.TRIP_ROUTES_GEO`（polyline，大，第一次展開有快取的地圖時由 `js/map.js` 動態載入） | 同上，不手改；`check.js` 檢查同步 |
| `tools/routing/` | `provider.js`（`route(from, to)`，OSRM 實作，只有編輯器呼叫）、`cache.js`（讀寫、`prune`、`usedKeys`／`missingKeys`／`unusedKeys`、`checkStructure`） | 路線規則見本文第 15 節；`js/model.js` 有 `getLegs`、`legKey`／`formatCoord`（provider 的請求網址共用同一個座標格式）、`displayMinutes`、`formatLeg`、`getTimeWarnings` |
| `tools/editor/server.js` | 編輯器伺服器（`node tools/editor/server.js [--port 8780]`，只綁 `127.0.0.1`，非本機 Host 回 403）：路由、請求大小上限 5 MB、靜態檔 | `createServer({ root, provider })`，測試可注入假的路線服務；API 見第 14.2 節 |
| `tools/editor/store.js` | 讀取、固定格式存檔、mtime 衝突檢查（只比 `trip.json`、`places.json`） | 見第 14.3 節 |
| `tools/editor/preview.js` | 預覽：`POST /api/draft` 的記憶體草稿、`GET /preview/*`（草稿產生 `data/*.js`，不寫磁碟） | 見第 14.4 節 |
| `tools/editor/publish.js` | 發布：`plan`（異動摘要、下一版號）與 `publish`（驗證、檢查、版本號、commit、push） | 見第 14.5 節 |
| `tools/editor/routes-service.js` | 路線服務：記憶體中的路線快取草稿＋呼叫 provider | 見第 15.5 節 |
| `tools/editor/public/` | 編輯器前端（原生 JS、無建置，Tailwind CDN）：`index.html`、`app.js`（載入、存檔、分頁、驗證列）、`days.js`／`places.js`／`hotels.js`（三個分頁）、`preview.js`、`publish.js`（發布視窗）、`routes.js`（路線畫面）、`routes-controller.js`（路線計算流程）；`*-logic.js` 是不碰 DOM 的純邏輯（`days`、`places`、`hotels`、`routes`），瀏覽器與 `node:test` 共用 | 前端載入 `/lib/model.js`（伺服器直接提供 `js/model.js`），驗證與路段規則不複製 |
| `tools/editor/test-helpers.js`、`tools/*.test.js`、`tools/editor/*.test.js`、`tools/routing/*.test.js` | `node:test` 測試（假路線服務、暫存 git repo、假 DOM） | 見第 10.3 節 |
| `js/model.js` | 資料處理與檢查 | 純函式，`tools/check.js` 會載入它 |
| `js/route-view.js` | 路線快取套到某一天的路段（顯示分鐘、是否超過門檻、當天總車程）、polyline 解碼、中點 | 純函式；`blocks.js` 與 `map.js` 共用，路段規則仍在 `model.getLegs`。測試：`tools/route-view.test.js` |
| `js/blocks.js` | 各類區塊的 HTML 樣板與 Tailwind 顏色表 | 統一改顏色改最上方的表。有路線快取時：綁定的 `drive`／`move` 列沒有 `duration` 就顯示計算時間；相鄰標記間沒有交通列就補唯讀連接列；標題列顯示總車程。沒有快取時畫面與沒有這個功能時相同。測試：`tools/public-blocks.test.js` |
| `js/modal.js` | 聯絡／導航彈窗 | 事件委派：任何有 `data-place` 的元素都能開彈窗 |
| `js/map.js` | 每日地圖（Leaflet + OpenStreetMap 圖磚） | `MAP_TYPES` 是標記顏色／圖示／圖例。有路線快取時：道路路線（沒有 geo 的段落退回虛線）、路段中點「時間・距離」標示、超過 `maxLegMinutes` 紅色；載入 `routes-geo.js` 失敗就維持虛線。沒有快取時維持單一灰色虛線。測試：`tools/public-map.test.js`（假 Leaflet） |
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
| `CLAUDE.md` | 只有一行 `@AGENTS.md`，讓 Claude Code 在本機與雲端都讀到同一份專案指示 | 要改專案指示請改 `AGENTS.md`，不要改這個檔；有了 `CLAUDE.md` 後 Claude Code 預設不再單獨讀 `AGENTS.md`，所以這行引用不能刪 |

---

## 4. 資料模型

### 4.1 地點（`data/places.json` → `window.TRIP_PLACES`）
以 id 為 key，**每個地點只維護一次**（行程、彈窗、地圖都引用同一份）。key 的順序就是顯示順序，要保留。除 `name` 外的欄位都可省略。

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

### 4.2 行程（`data/trip.json` → `window.TRIP`）
`site`（品牌、版本號、導覽連結、頁尾）、`hero`、`highlights`、`itinerary`、`days[]`、`hotelsSection`、`hotels[]`。

每一天：`{ day, date, title, stay|badge, theme?, closeLoop?, items[] }`。`items` 的 `type`：

| type | 外觀 | 欄位 |
|---|---|---|
| `drive` | 深灰列（車） | `time, text, duration?` |
| `move` | 淺灰列（路線） | `time, text, duration?` |
| `spot` / `meal` / `stay` / `end` / `notice` | 彩色卡片（藍／琥珀／紫／綠／琥珀） | `tag, time?, place` 或 `title`，`desc` |
| `brief` | 琥珀淡底小框 | `time, title, place?, icon?, desc?` |
| `waypoint` | 虛線小列（起訖點／休息點） | `place, text?, backup?, mapName?, numbered?` |

共通欄位：
- `place`：引用地點 id。卡片標題預設用地點名稱（要改標題就寫 `title`）；該地點有 `infoType` 時，卡片可點開聯絡與導航彈窗；該項目會依出現順序自動成為當天地圖的標記。
- `map:false`：有 `place` 但不放上地圖。
- `numbered:false`：放上地圖但不編號（`waypoint` 不會在左邊出現，地圖上以小圖示呈現）。

每天的選項：

| 欄位 | 說明 |
|---|---|
| `stay` | `{place, note}`，標題列右側顯示「宿：住宿名稱（note）」 |
| `badge` | `{icon, text}`，沒有住宿時標題列右側顯示的文字 |
| `theme` | `'blue'`（預設）或 `'end'`（綠色，最後一天用） |
| `closeLoop` | `true` 時地圖路線會連回起點 |
| `trafficFactor` | （選填）正數，覆寫當天的路況係數；沒有就用 `site.routing.trafficFactor` |

`site.routing`（選填）：`{trafficFactor: 1.25, maxLegMinutes: 180}`，路況係數預設值與「路段過長」門檻（顯示分鐘），都必須是正數。

編號：每天的地圖標記由上而下自動編號（1、2、3…），左邊對應的卡片／起訖點列顯示同一個編號。調整順序就是在 `items` 裡上下搬移那一項，卡片與地圖會一起更新。

### 4.3 地圖標記與編號是「推導」出來的
`model.getMapPoints(day, places)` 依 `items` 的順序，把有 `place` 且該地點有座標的項目變成標記：

- 編號由上而下自動遞增；左側對應的卡片或 `waypoint` 列顯示**同一個編號圓點**（顏色與地圖相同）。
- `waypoint` 若有編號，左邊會多一列；`numbered:false` 的只出現在地圖（小圖示）。
- `backup:true` 的標記標成「備案」色且**不連線**（大坡池）；`day.closeLoop` 讓路線連回起點（Day 3）。
- `map:false`（Day 3 的「離園返程」）避免同一個點重複出現。
- **調整順序＝上下搬 `items`，編號、地圖、連線自動跟著變，不需要另外維護地圖資料。**

### 4.4 `validate()` 與紅色提示列
`model.validate()` 檢查：`place` id 是否存在、`type` 是否合法、卡片是否有標題來源、住宿 id、座標缺失。「哪些位置會引用地點」的遍歷是 `model.forEachPlaceRef`（validate、編輯器的引用檢查與改 id 共用），「沒有座標」的判斷是 `model.lacksCoords`（validate 與編輯器的路線警告共用，waypoint 不算）。頁面載入時有問題會在最上方出現**紅色提示列**並寫入主控台。這是抓「打錯 id」最快的方法。

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

- `verify.md`：總覽表 → 22 題（每題：目前網頁寫什麼／我查到的（標「官方」或「遊記」）／怎麼確認（撥號連結、地圖連結）／編號選項／回覆範例）→「已由 Claude 查證並更新」（含依據連結，供抽查）→「尚未能查證」。
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

- 兩種發布方式：（a）使用者在編輯器按「發布…」，確認視窗同意即視為使用者確認，編輯器自己 commit 並 push（第 14.5 節）；（b）Claude 直接改 JSON，執行 `node tools/build-data.js`、`node tools/check.js`，再 commit／push（見 `AGENTS.md`）。
- 使用者直接看**公開網頁**驗收；**已確認的調整一律直接 commit 並 push 到 `main`，不開分支 PR**（避免小調整散落在沒合併的分支）。在 Claude 指定的工作分支上時：`git push origin HEAD:main`，並一併 push 該分支（stop hook 會檢查工作分支是否有未推送的 commit）。
- push 後用 `curl -s https://limhi.github.io/trip-2026/data/trip.js | grep '"number"'` 確認線上版本已更新；Pages 通常 **約 45 秒–1 分鐘**。
- **版本號**在 `data/trip.json` 的 `site.version`（`{number:'v1.5', date:'2026/10/17'}`；改完要執行 `node tools/build-data.js` 同步到 `data/trip.js`）：改行程或地點資料就更新；純文件或確認清單狀態更新可以不改。編輯器發布時小版自動 +1、日期用發布當天；大版號只能手動改；存檔不動版本號。
- 版本歷史：v1.0 拆分單檔（PR #1）→ v1.1 版本號與左側編號對應地圖／住宿捷徑（PR #2，另一個工作階段）→ v1.2 `parking` 欄位與第一批資料（PR #3）→ v1.3 景點攻略接進彈窗 → v1.4 四項行程文字修正 → v1.5 加大查證（座標更正、確認清單）→ v1.6 更正遠雄停車說明（官網是「平假日」不是「平日」）→ v1.7 住宿調整（11/15 宜蘭、11/16–17 花蓮、11/18 未定、11/19 屏東；遠雄改排 11/17）→ v1.8–v1.9 往南走與冷泉拿掉 → v2.0 Day 1／Day 2 重排。

---

## 10. 驗證方法

### 10.1 一鍵檢查（每次改完都跑）
```bash
node tools/check.js
```
只需要 Node。檢查：`data/*.json`（含 `routes.json`）與產生的 `data/*.js` 同步（改壞任一邊都會失敗）、`routes.json` 結構（`distance`／`duration` 為數字、`geometry` 為字串、key 格式）、資料能載入且 `validate()` 通過、座標在台灣範圍內、guides 的 id／來源編號／開發用語、`guides.md` 與 `guides.js` 同步、`verify.md` 的題號與狀態一致、所有文字檔 UTF-8 無 BOM／無 U+FFFD／無 CRLF、版本號格式。已用 7 種人為錯誤做過反向測試，確認抓得到。行程有路段沒快取、快取有沒被使用的舊筆只**警告**（不失敗）。**它不能取代瀏覽器實測。**

### 10.1.1 單元與 API 測試
```bash
node --test
```
只需要 Node（自動找所有 `*.test.js`，目前 210 項）。涵蓋：`build-data`、路線快取與 provider（假伺服器：User-Agent、間隔、逾時、不重試）、`getLegs`／顯示時間／警告、公開頁面的 `blocks`／`map`／`route-view`（假 DOM、假 Leaflet）、編輯器的 `store`、`preview`、`publish`（在**暫存 git repo** 內做，含 bare remote，不碰真的 `main`）、`routes-service`、各 `*-logic.js` 與 `routes-controller.js`。**編輯器前端畫面本身（拖拉、表單、預覽 iframe）沒有自動化測試**，要靠使用者在瀏覽器驗收。

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
- 路線相關（T3、T8–T10）：T8 用手造的假快取（e2e 內產生，攔截 `data/routes.js`／`routes-geo.js`，不是 repo 的檔案、不呼叫真實路線服務）檢查自動連接列、算出的交通列時間、總車程、道路路線／虛線／紅色段落／中點標示、首頁不請求 `routes-geo.js`；T9 geo 載入失敗退回虛線；T10 file:// 下動態載入（複製到暫存資料夾）。假的 `window.L` 有 `layerGroup`，並記錄路線與標示。**這些斷言在撰寫時沒有 Playwright 可跑**（只用 vm 驗證過期望式與實作一致、`node --test` 的假 DOM 測試覆蓋同樣的行為）；第一次有 Playwright 的環境請先跑一遍，必要時用植入破壞的方式確認會失敗。
- 測試內容（最小模式 15 項、完整模式 19 項，不含上述路線相關項目）：首頁無錯誤與版本號、每個有彈窗的地點（標題、停車區塊、攻略、`hidden` 項目不顯示、無開發用語、導航按鈕、訂房區塊、Esc 關閉）、每天地圖（標記數、路線連線、展開／收合）、打錯 id 的紅色提示列、file:// 開啟與攻略動態載入、`verify.html`（題號錨點、撥號連結、新分頁連結、備援）、導覽列 360／375／414／768／1280px 不溢出。
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
| 網頁載入 JS 資料檔，來源是 JSON | 網頁要支援雙擊 file:// 開啟（不能 fetch JSON）；來源用 JSON 是為了讓編輯器等工具能安全讀寫，再由 `build-data.js` 產生 JS（見 `docs/adr/0001`） |
| 同類型區塊統一顏色 | 原本同類型區塊在不同天用不同顏色，是逐塊手寫的結果 |
| 攻略延遲載入 | 185 KB 不該拖慢首頁（手機） |
| 攻略用折疊區塊 | 每景點約 1,500 字，手機一次塞滿太長 |
| `hidden` 機制 | 公開家庭頁面不放涉及他人刑案的報導，但資料保留 |
| 直接 push `main`、不開 PR | 使用者用公開網頁驗收，要最快生效；PR 分支曾造成小調整沒合併 |
| `verify.html` 轉譯 `.md` | Pages 把 `.md` 當檔案下載，請人點連結不方便 |
| 官方資料優先、blog 標「遊記」 | 使用者規則：官網 ＞ 近期 blog ＞ 舊 blog；且資訊會被拿去實際出發 |
| 邱比準改名（不再寫「勇者桂冠王／」） | 官方確認邱比準在八仙二路93號，勇者桂冠王是員山另一家；但使用者要去哪一家仍列為 Q1 |
| Day 5 多良停留 30→40 分鐘、後續順延 10 分鐘 | 停好車要走上坡 5–10 分鐘，實際在平台只剩 10–20 分鐘；抵達屏東與入住改 17:50 |
| 遠雄改排 11/17（週二）、Day 4 變成「住宿與路線待定」 | 使用者致電遠雄，園方不建議週三去；住宿改為 11/15 宜蘭、11/16–17 花蓮、11/18 未定。原 11/17 的四個花蓮市區景點沒有刪除，改放 Day 4 當候選（無時間），等使用者決定 11/18 路線 |
| Day 1／Day 2 重排（v2.0）：週日蘇澳 DIY、週一三星＋清水＋七星潭南下 | 田心只住 11/15，不用再為「來回民宿方便」安排；餅發明館 DIY 只有 10:30／13:30 場次且週一沒有，所以宜蘭南段整個放週日；週一從三星出發，並在南下途中加七星潭休息。邱比準與蘇澳冷泉拿掉 |
| 資料來源改 JSON、網頁仍載入產生的 `data/*.js`（`docs/adr/0001`） | 編輯器要安全讀寫資料；JS 檔含註解與變數不好改寫；又要保留雙擊 `index.html` 能開 |
| 編輯器只在本機跑、綁 `127.0.0.1`（`docs/adr/0002`） | 它能 push 到 `main`；不做登入與金鑰，公開頁面沒有任何能寫入的程式 |
| 發布按鈕＝使用者確認（`docs/adr/0003`） | 使用者要「改完直接發布」；確認視窗列出異動與可編輯的 commit 訊息，失敗不重試、不強推、只能在 `main`、不附 AI 署名 |
| 路線預先計算並快取，公開頁面不呼叫 API（`docs/adr/0004`） | 免金鑰、離線可看、服務掛掉不影響已發布頁面；代價是 `routes-geo.js` 讓 repo 變大（已拆成展開地圖才載入）、沒有路況預測（用係數） |
| 快取存原始時間，顯示時間 = 原始 × 係數 | OSRM 沒有路況預測；係數在資料裡，之後只調係數不用重算 |
| 路線失敗不擋存檔與發布 | 路線只是輔助資訊；失敗時退回直線並警告 |
| 發布時以記憶體中的 `trip`、`places` 與磁碟比對（body 必填 `trip`、`places`） | 確認「畫面上看到的」就是「要 commit 的」，有未存檔修改就拒絕 |
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
- **不要手改 `data/*.js`**：它們是產生檔，下次產生或編輯器存檔就被覆蓋；`check.js` 也會因為與 JSON 不同步而失敗。改完 JSON 一定要 `node tools/build-data.js`。
- 編輯器開著時，如果有別的程式（包含 Claude）改了 `data/trip.json` 或 `data/places.json`，編輯器存檔回 409 並拒絕覆蓋；按「重新載入」會丟掉編輯器裡未存檔的修改。路線快取草稿放在**伺服器記憶體**，按「重新載入」不會清掉，要重啟編輯器伺服器才回到磁碟版。
- 路線服務是 OSRM 公開 demo：逐段呼叫、間隔至少 1 秒、不要平行、不要寫迴圈自動重試（見第 15.4 節）。
- **不要用 `cmd | tail && git commit`**：管線的結束碼是 `tail` 的，檢查失敗會被吃掉（發生過，有問題的版本被推上去）。要寫成 `cmd; rc=$?; [ $rc -eq 0 ] || exit 1`。


---

## 14. 行程編輯器（`tools/editor/`）

給規劃者本人在本機用的介面：改 `data/*.json`、看預覽、存檔、發布。決策原因見 `docs/adr/0001`–`0003`，詞彙見 `GLOSSARY.md`。

### 14.1 程序與安全
- `node tools/editor/server.js [--port 8780]`，只綁 `127.0.0.1`，啟動時印出網址。零依賴（只用 Node 內建模組）。
- 只接受 `Host` 為 `127.0.0.1` 或 `localhost` 的請求（其他回 403），避免網頁透過 DNS rebinding 打到編輯器；請求 body 上限 5 MB。
- **不能對區網或外網開放**：它有 push 到 `main` 的能力，沒有任何認證。
- `createServer({ root, provider })` 可注入路線服務（測試用假的）；`root` 是 repo 根目錄（發布測試在暫存 repo 內進行）。

### 14.2 API（全部回 JSON；錯誤是 `{ error, steps? }`）

| 方法與路徑 | 說明 |
|---|---|
| `GET /api/data` | `{ trip, places, mtimes: { trip, places, routes } }`，讀磁碟上的 JSON |
| `PUT /api/data` | body `{ trip, places, mtimes }`（`mtimes` 要有 `trip`、`places`、`routes` 三個數字）。缺欄位 400；磁碟上任一個檔（`trip.json`、`places.json`、`routes.json`）的 mtime 比 `mtimes` 新 → **409**，不寫入。成功時寫兩個 JSON、產生 `data/*.js`，**並把記憶體中的路線快取草稿（修剪後）一併寫入** `data/routes.json`、`data/routes*.js`；回新的 `{ mtimes }` |
| `GET /api/routes` | 路線快取草稿：`{ legs: { key: { distance, duration } }, unsaved }`（沒有 geometry；`unsaved` = 草稿與磁碟上的 `routes.json` 不同，前端用它決定存檔鈕要不要亮） |
| `POST /api/routes/compute` | body `{ legs: [{ key, from: {lat,lng}, to: {lat,lng} }] }`（最多 200 段；`key` 必須等於 `model.legKey(from, to)`，否則 400）。快取命中的不重算。回 `{ results: { key: { status: 'ok'｜'cached'｜'failed', distance?, duration?, error? } } }` |
| `POST /api/routes/recompute-all` | 同上，但忽略快取，全部重算 |
| `POST /api/draft` | body `{ trip, places }`，放記憶體草稿給預覽用（不寫磁碟） |
| `GET /preview/*` | repo 靜態檔；有草稿時 `data/trip.js`、`data/places.js`、`data/routes.js`、`data/routes-geo.js` 由草稿產生。`.` 開頭的檔案與 `node_modules` 一律 404 |
| `GET /api/publish/plan` | `{ branch, onMain, version: { current, next }, changes, hasChanges, message, missingRoutes, files }`：與 `HEAD` 的異動摘要、預設 commit 訊息、下一個版本號、缺少快取的路段 |
| `POST /api/publish` | body **`{ trip, places, message }`（三者都必填）**；見第 14.5 節。成功回 `{ ok, version, commit, steps }` |
| `GET /lib/model.js` | 直接提供 `js/model.js` 給編輯器前端（驗證與路段規則不複製） |
| 其他 `GET` | 提供 `tools/editor/public/` 的靜態檔 |

注意：**沒有 `POST /api/validate`**。驗證不走 API：前端載入 `/lib/model.js`（同一份 `Trip.model.validate`）即時驗證，發布時伺服器端 `require('js/model.js')` 再驗一次。

### 14.3 存檔（`store.js`）
- 序列化固定格式：縮排 2 空格、保留欄位順序（key 順序就是顯示順序）、LF、UTF-8 無 BOM、結尾換行。未編輯的欄位（`site`、`hero`、`highlights`…）原封不動。
- 衝突檢查比 `data/trip.json`、`data/places.json`、`data/routes.json` 三個檔的 mtime（`routes.json` 不存在時視為 0）；載入與每次存檔後都會回傳最新的 mtimes。
- 寫入：JSON 與產生檔（含路線檔）全部先寫 `.tmp` 再逐一 rename（`build-data.writeAtomic`）；寫 `.tmp` 失敗會清掉暫存檔，不留半套。存檔不更動版本號。
- 路線快取草稿存檔時用 `cache.prune` 只留下目前行程用到的段落（`cache.usedKeys`），並回傳實際寫入的內容，讓草稿跟著修剪。

### 14.4 預覽（`preview.js` ＋ 前端 `public/preview.js`）
- 預覽是嵌入的**真正的 `index.html`**（`/preview/index.html`），沒有另寫渲染。
- 前端每次草稿變動（`document` 的 `draftchange` 事件）350 ms 防抖後 `POST /api/draft`，再重新整理 iframe 並保留捲動位置；路線有新結果時重新送一次草稿。可切手機／平板／桌面寬度，點某一天可讓預覽捲到 `#day-N`。
- 伺服器端草稿在記憶體；沒有草稿時預覽用磁碟版。伺服器重啟後草稿消失。

### 14.5 發布（`publish.js`；全部同步執行，不重試）
`GET /api/publish/plan` 只讀不寫。`POST /api/publish` 依序執行，任一步失敗就停下並回 `{ error, steps }`（steps 是已執行各步的輸出，前端顯示）：

1. 請求檢查：`trip`、`places` 必須是物件，`message` 不可空白（**與原 spec 只寫 `message` 不同**：要用 `trip`／`places` 確認已存檔）→ 400。
2. 分支必須是 `main` → 否則 **409**。
3. 確認已存檔：磁碟上的 `trip.json`、`places.json` 與 body 的內容必須完全相同 → 否則 **409**「編輯器有未存檔的修改」。若伺服器記憶體有路線快取草稿，把草稿與磁碟的 `routes.json`（各自修剪到目前行程用到的段落後）序列化比較，不同 → **409**「路線計算結果有未存檔的修改，請先存檔再發布」。
4. `Trip.model.validate` 有問題 → 422。
5. 執行 `node tools/check.js`，結束碼不是 0 → 422。
6. 版本號小版 +1、日期改成當天，寫入 `trip.json` 並重新產生 `data/*.js`，再跑一次 `check.js`。**寫入版本號之後（第二次 `check.js`、`git add`、`git commit`）任何一步失敗，會把發布清單內的檔案還原成寫入前的內容並清掉暫存區**（steps 多一筆「還原版本號與產生檔」），不留下半套的版本號。
7. `git add` 並 `git commit`（訊息用使用者在確認視窗編輯後的內容，`--cleanup=whitespace`，**不附 AI 署名**；commit 只含發布清單：`data/trip.json`、`places.json`、`trip.js`、`places.js`、`routes.json`、`routes.js`、`routes-geo.js`，其他檔案不會被帶進去）。
8. `git push origin main`。失敗（403、non-fast-forward…）→ 502，**本機 commit 保留**，只回報錯誤文字；不重試、不 `--force`、不改用其他路徑。

行為細節：
- 路線沒有快取的段落**只在 plan 的 `missingRoutes` 回報警告**，不擋發布；與 `HEAD` 相同也只提示（仍會更新版本號）。
- 前端（`public/publish.js`）的確認視窗顯示：驗證／已存檔／分支／版本號、異動摘要（各天、地點、路線快取新增／移除／重算的段落數、住宿區、網站設定）、警告、可編輯的 commit 訊息；有驗證錯誤、未存檔、不在 `main` 時「確認發布」不可按。**在這個視窗按下「確認發布」＝使用者確認**（`docs/adr/0003`，`AGENTS.md` 已寫明）；這項授權只涵蓋編輯器按鈕，Claude 在對話中自己 commit／push 仍照 `AGENTS.md`。
- plan 的 `changes.routes` = `{ added, removed, changed }`（與 `HEAD` 的 `routes.json` 比對的段落數）；只改路線也算有異動，預設訊息會列「路線（新增 n、移除 m、重算 k 段）」。
- 預設 commit 訊息：`v新版號：調整 DAY n、新增「地點」…`（最多列 4 項）。

### 14.6 前端行為摘要
- **每日行程**：依項目類型顯示不同欄位表單（`days-logic.js` 的 `TYPES`，與第 4.2 節一致）；拖拉排序、可跨天（天數固定 6 天，日期標題可改）；改類型會清掉不適用的欄位；顯示地圖編號與驗證標示；日設定含「路況係數」。
- **地點庫**：搜尋、新增（含 id 建議）、改 id **同步更新引用**（`days[].stay.place`、`days[].items[].place`、`hotels[].place`）、被引用的地點不能刪（列出引用位置）、顯示引用次數與無座標標示。id 限 `^[a-z0-9-]+$` 且不得重複。
- **住宿區**：新增、刪除、上下排序、`features` 一行一項；`hotelsSection` 的標題文字不在介面編輯（手改 `trip.json`）。
- **驗證**：每次草稿變動即時跑 `Trip.model.validate`，有錯可存檔，發布被擋。
- **存檔**：明確存檔（沒有自動存檔）；預覽反映未存檔草稿；沒有 undo，靠 git；有未存檔修改時離開頁面會提示。路線算出新結果（草稿與磁碟不同）也算未存檔：存檔鈕會亮、狀態列顯示「路線計算結果未存檔」，重新整理頁面後由 `GET /api/routes` 的 `unsaved` 還原。

### 14.7 不在範圍內
攻略（`reference/guides.js`）、`verify.md`、`hero` 文案、新增或刪除天數、編輯器內 undo／redo、多人編輯。

### 14.8 已知限制
- 編輯器前端沒有在真實瀏覽器驗收過（自動測試只覆蓋純邏輯與伺服器 API）。
- 路線快取草稿與預覽草稿都在伺服器記憶體：重啟伺服器就回到磁碟版；「重新載入」只重讀行程資料，不清路線草稿。
- 發布時若路線草稿與磁碟不同回 409，所以重算路線後必須先存檔才能發布。
- 發布只能在 `main`；整合分支上的編輯器程式要先合進 `main` 才能真的發布。

---

## 15. 路線與交通時間

決策見 `docs/adr/0004`。一句話：**只有編輯器（本機）呼叫 OSRM，結果存成快取檔；公開頁面只讀快取，不呼叫任何 API。**

### 15.1 路段（leg）規則（`js/model.js` 的 `getLegs(day, places)`，純函式，編輯器、公開頁面、測試共用）
- 同一天內、依順序相鄰、有座標的地圖標記兩兩一段（標記規則與 `getMapPoints` 相同）。
- 不算：`backup:true` 的標記、`map:false` 的項目、沒有座標的地點；不跨天。
- `day.closeLoop` 時，最後一個標記回到第一個的**回程段**也算。
- 每段含 `fromItemIndex`、`toItemIndex`、`fromId`、`toId`、`from`、`to`、`key`、`rowIndex`、`needsRow`、`closeLoop`。
- **綁定交通列**：兩標記之間恰好一個 `drive` 或 `move` → `rowIndex` 是它的索引；一個都沒有 → `needsRow: true`（公開頁面補一條唯讀連接列）；超過一個 → 不綁定（保留手寫文字，路段仍畫在地圖上）；`closeLoop` 回程段不綁定任何列。
- 只算開車（`driving`），`move` 也用開車算。
- 快取 key：`legKey(from, to)` = `經度,緯度>經度,緯度`，各取 5 位小數。座標一改就是新的 key，自動重算。

### 15.2 資料格式
**`data/routes.json`**（來源，由編輯器寫入）：
```json
{
  "profile": "driving",
  "legs": {
    "121.44330,24.97220>121.80400,24.67180": {
      "distance": 75323,
      "duration": 4334,
      "geometry": "<polyline，精度 5>",
      "provider": "osrm",
      "computedAt": "2026-10-26"
    }
  }
}
```
- `distance` 公尺、`duration` 秒，**都是服務回傳的原始值（不含係數）**；`geometry` 是 polyline 字串。
- 固定序列化（`tools/routing/cache.js`）：縮排 2 空格、LF、結尾換行，`legs` 依 key 排序、每筆欄位順序固定，讓 diff 穩定。
- 存檔時移除沒被目前行程用到的舊筆；不設期限。

**產生檔**（`build-data.js`，同樣標示「請勿手改」）：
- `data/routes.js`：`window.TRIP_ROUTES = { legs: { key: { distance, duration } } }`，小，`index.html` 載入（在 `trip.js` 之後、`model.js` 之前）。
- `data/routes-geo.js`：`window.TRIP_ROUTES_GEO = { key: geometry }`，大，**第一次展開有快取的地圖時才由 `js/map.js` 動態載入**（方式同攻略）；首頁不載入。

**`data/trip.json` 新增欄位**：`site.routing = { trafficFactor: 1.25, maxLegMinutes: 180 }`（選填）、`days[].trafficFactor`（選填，覆寫當天）。`validate` 檢查這些值為正數。

### 15.3 係數與門檻
| 名稱 | 位置 | 預設 | 作用 |
|---|---|---|---|
| 路況係數 `trafficFactor` | `site.routing.trafficFactor`；每天可用 `days[].trafficFactor` 覆寫 | 1.25 | 顯示分鐘 = 四捨五入（`duration ÷ 60 × 係數`） |
| 門檻 `maxLegMinutes` | `site.routing.maxLegMinutes` | 180 | 顯示分鐘**大於**門檻的段落在地圖上標紅（`>`，等於不算） |

- 當天使用的係數：`day.trafficFactor` > `site.routing.trafficFactor` > 預設 1.25（`model.getTrafficFactor`）。
- 門檻判斷與「排太緊」警告都用**顯示分鐘**，不是原始時間。
- 顯示格式：`約 1 小時 5 分・75.3 km`；不滿 1 小時寫 `約 45 分`；整點寫 `約 2 小時`；距離取一位小數公里。標示文字：`預估・含路況緩衝 ×1.25`（係數用實際值）。
- 因為快取存原始時間，**調係數與門檻不需要重算路線**。

### 15.4 計算服務與 OSRM 使用限制（`tools/routing/provider.js`）
- 介面：`route({lat,lng}, {lat,lng})` → `Promise<{ distance, duration, geometry }>`。目前實作是 OSRM 公開 demo（`https://router.project-osrm.org/route/v1/driving/…?overview=simplified&geometries=polyline`）。**要換服務（例如 Google Routes）只改這個檔**。
- 規則（有假伺服器測試）：請求**逐一送出**（內部排隊）、兩次請求間隔**至少 1 秒**（用單調時鐘計時，`setTimeout` 提早醒來會補足）、逾時 **15 秒**（涵蓋整個請求，含讀回應 body；逾時報「路線服務逾時」）、**不自動重試**（失敗直接丟錯，不影響後面的請求）、帶識別專案的 `User-Agent`（`trip-2026-editor/1.0 (+https://github.com/limhi/trip-2026)`）。
- OSRM 公開 demo 有使用政策、沒有 SLA、沒有路況預測；用量遠低於上限，但**不要改成批次大量查詢、不要平行送、不要加自動重試**。
- 只有編輯器伺服器會呼叫；公開頁面與 `check.js` 都不呼叫。

### 15.5 編輯器行為（`routes-service.js`、`public/routes-controller.js`、`public/routes.js`）
- 草稿 = 記憶體中的路線快取（一開始是磁碟上的 `routes.json`）；計算結果先進草稿，預覽立刻使用；按「存檔」才寫入檔案。
- 順序、地點或座標改變時，前端找出快取沒有的路段，約 0.6 秒後送 `POST /api/routes/compute`；命中快取的不重算。每段顯示「等待計算／計算中／已算／失敗」，並有「重新計算」；路線列有「全部重算」（`/recompute-all`，忽略快取）。
- 失敗（網路、逾時、服務錯誤）：該段退回直線、標示警告，**不自動重試**；失敗的段落**一律從草稿移除**（包含按「重新計算」失敗時原本的舊路線，API 結果多 `removed: true`），公開預覽不會繼續畫舊路線；同一段持續存在時維持失敗，段落離開行程後再出現、或按「重新計算」才會再試。失敗不擋存檔、不擋發布。
- 沒有座標的地點不算路線，並提示補座標。
- 路線列可改「預設係數」「每段上限（分鐘）」（寫進 `site.routing`，空白＝刪除欄位用預設）；每天的日設定有「路況係數」。
- 同一段同時只算一次（`inflight`），避免重複呼叫。

### 15.6 公開頁面行為（`js/route-view.js`、`js/blocks.js`、`js/map.js`）
- 地圖：有快取的段落畫道路路線（`geometry` 解碼）取代灰色虛線；沒有 geo 或沒有快取的段落仍畫虛線直線；每段中點（沿路線一半長度處）標示「時間・距離」，並一律帶「預估 ×係數」（title 為完整的「預估・含路況緩衝 ×係數」）；超過門檻的段落紅色。完全沒有快取時維持原本單一灰色虛線。
- 當天標題列顯示「總車程・總里程」（有快取的路段加總；缺段時加「（部分路段未計算）」）。
- 綁定的 `drive`／`move` 列：**沒有 `duration` 時顯示計算結果**；有 `duration` 就用手寫的（手動覆寫）；`text` 不變。
- 兩個標記之間沒有交通列時，自動補一條唯讀連接列「車程約 …（自動）」。
- 圖例下方的說明文字有快取時改寫：實線為道路預估路線、虛線為尚未計算、紅色表示單段超過門檻、附係數說明，並寫「實際請以導航為準」。
- 載入失敗或沒有快取時整個功能靜默退回現狀，不出現紅色提示列或 JS 錯誤。

### 15.7 「排太緊」警告（`model.getTimeWarnings(day, places, routes, site)`，只在編輯器，不擋存檔與發布）
- 只在兩端都有可解析的 `HH:MM` 時比對；「17:10 後」「12:15」這類不完整時間不比對。
- 有綁定交通列、且其 `time` 是區間（`07:30 - 09:20`）：區間長度 < 顯示時間就警告。
- 沒有交通列：「前一項結束時間」與「後一項開始時間」之差 < 顯示時間就警告（前後項的 `time` 都要是區間）。
- 沒有快取的路段、未綁定的路段（多個交通列）、`closeLoop` 回程段都不比對。
- 警告文字寫明哪一天、第幾段、排定幾分、至少需要多久。
- 編輯器還會警告：路線計算失敗、有地點沒有座標。

### 15.8 `tools/check.js`
- `data/routes.js`、`data/routes-geo.js` 與 `routes.json` 重新產生的結果不同 → **失敗**。
- `routes.json` 結構錯（key 格式、`distance`／`duration` 不是數字、`geometry` 不是字串）→ **失敗**。
- 行程中有路段沒有快取、快取有沒被使用的舊筆 → **只警告**。

### 15.9 改了座標或順序之後
編輯器會自動重算受影響的段落，存檔時寫入。Claude 直接改了 JSON 的話，要請使用者在編輯器按「全部重算」再存檔，或用 `tools/routing`（`provider.route` ＋ `cache.write`）逐段計算寫回；做法見 `AGENTS.md`。

---

## 13. 與使用者的協作偏好

- 摘要預設用**繁體中文**。
- 指令有不清楚的地方，**先用編號條列確認再動手**；問題與選項**都要編號**。
- 文字檔一律 **UTF-8（無 BOM）**；看到亂碼先驗證檔案能否正常 UTF-8 解碼，不要因終端機顯示亂碼就覆寫。
- 使用者會請別人實際查證，再用題號回覆；回覆前不要自行套用沒有官方佐證的資訊。
- 使用者重視「結論先行、誠實標示沒驗證到的部分」：沙箱擋掉的 CDN、讀不到的來源、子代理的說法，都要明講。
