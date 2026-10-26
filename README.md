# 2026 親子順時針環島行程

純靜態網頁，不需要建置。用 GitHub Pages 或其他網站伺服器開啟 `index.html` 可以，直接雙擊開啟也可以。

## 檔案結構

```
index.html        頁面骨架（導覽、頁首、各區塊的容器、聯絡彈窗），平常不用動
data/
  trip.json       行程內容（資料來源）：頁首文字、每天的行程順序、住宿區文案   ← 改行程改這裡
  places.json     地點資料庫（資料來源）：電話、LINE、地址、座標、導航連結      ← 改聯絡資訊改這裡
  routes.json     路線快取（資料來源，由編輯器寫入）：每段車程的距離、時間、路線座標
  trip.js, places.js, routes.js, routes-geo.js
                  由上面三個 JSON 產生、網頁實際載入的檔案，請勿手改（node tools/build-data.js 產生）
js/
  model.js        資料處理與檢查（組出地圖標記、聯絡資訊、路段與顯示時間、找資料錯誤）
  route-view.js   路線顯示邏輯（把快取套到每段：顯示時間、是否超過門檻、當天總車程）
  blocks.js       每種區塊的樣板與顏色表                          ← 想統一改區塊顏色改這裡
  modal.js        聯絡與導航彈窗
  map.js          每日地圖（標記顏色、圖例、道路路線與時間標示）
  render.js       把資料填進骨架
css/style.css     自訂樣式（版面本身用 Tailwind CDN）
tools/
  build-data.js   由 data/*.json 產生 data/*.js
  check.js        一鍵檢查
  editor/         行程編輯器（只在本機跑）
  routing/        路線計算（OSRM）與路線快取的讀寫
```

網頁本身仍是零建置：資料先產生成 `data/*.js`，所以直接雙擊 `index.html` 也能開。

## 怎麼改行程（建議用編輯器）

```bash
cd trip-2026                         # 專案根目錄
node tools/editor/server.js          # 預設 http://127.0.0.1:8780/ ，只綁本機
```

啟動後終端機會印出 `編輯器：http://127.0.0.1:8780/`，用瀏覽器開那個網址；結束時在終端機按 Ctrl+C。

- 前置條件：本機有 Node（LTS，`node -v` 能顯示版本）；編輯器零依賴，不用 `npm install`。編輯器頁面（Tailwind）與公開頁面的地圖（Leaflet）要連網。
- 終端機出現 `EADDRINUSE`：port 被占用（多半已經開了另一個編輯器），關掉舊的，或換埠 `node tools/editor/server.js --port 8781`。
- WSL 使用者：Windows 瀏覽器通常可直接開 `127.0.0.1:8780`；打不開再查 WSL 的 localhost 轉發。
- 三個分頁：每日行程、地點庫、住宿區；右邊是即時預覽（真正的 `index.html`，反映還沒存檔的修改）。
- 「存檔」把修改寫進 `data/*.json`（含路線快取）並重新產生 `data/*.js`，不 commit、不改版本號。「發布…」會檢查、commit、push 到 `main`，並把版本號小版 +1；只能在 `main` 分支發布。
- 路線算完後要按「存檔」才會寫進磁碟（狀態列會顯示「路線計算結果未存檔」）；沒存檔就按發布會被擋（409）。
- 「發布…」的 push 失敗（最常見是遠端有別人或 AI 剛推了新 commit，訊息含 `non-fast-forward`）：編輯器不會重試或強推，但**本機的發布 commit 已經建好**。**不要再按一次發布**（版本號會再 +1）。改在終端機執行：

  ```bash
  git pull --no-rebase origin main   # 先合併遠端新內容；有衝突就停下來處理
  git push origin main
  ```

  推完用 `curl -s https://limhi.github.io/trip-2026/data/trip.js | grep '"number"'` 確認線上版本號。
- 順序、地點或座標改變後，編輯器會自動向 OSRM 算新路段（約 0.6 秒後開始，每段間隔 1 秒）；結果存檔時才寫進 `data/routes.json`。
- 不想開編輯器時，也可以直接改 `data/*.json`，然後執行 `node tools/build-data.js` 與 `node tools/check.js`。**不要改 `data/*.js`**，下次產生時會被覆蓋。

## 給接手的人

- [`AGENTS.md`](AGENTS.md)：工作規則與發布流程（先讀這份）
- [`docs/DESIGN.md`](docs/DESIGN.md)：設計文件（架構、資料模型、編輯器與路線、決策原因、驗證方法、陷阱）
- [`docs/TODO.md`](docs/TODO.md)：待辦事項（等使用者回覆的題目、出發前檢查清單、紅線）
- [`GLOSSARY.md`](GLOSSARY.md)：詞彙表；[`docs/adr/`](docs/adr/)：4 份決策紀錄
- `docs/RESEARCH-LOG.md`：官方更新的逐字證據與核對結果
- `node tools/check.js`：一鍵檢查（只需 Node）
- `node --test`：單元與 API 測試（只需 Node）
- `node tools/e2e.js`：瀏覽器端到端測試（需要 Playwright；用法見 `docs/DESIGN.md`）

## 旅遊研究資料

`reference/pending-decisions.md` 是景點資料核對後還需要決定的項目清單（`AGENTS.md` 會引導 Claude 先讀它）。

`reference/research.md` 收錄本行程景點的票務與預約需求，以及每個景點 5 個熱門攻略或官方資訊連結。出發前請再次確認官方公告，因為票價、營業時間、預約規則與設施開放狀態可能變動。

## 常見調整

用編輯器操作時，下表「改哪裡」就是對應的 JSON 欄位；直接改檔時改完要跑 `node tools/build-data.js`。

| 想做的事 | 改哪裡 |
|---|---|
| 調整某天景點的順序 | 編輯器拖拉；或 `data/trip.json` 在該天的 `items` 裡上下搬移那一項（地圖標記順序會自動跟著變，路線會重算） |
| 換景點 | 在 `data/places.json` 新增地點，再把 `data/trip.json` 的 `place` 改成新的 id |
| 改電話、地址、LINE、座標 | `data/places.json`（只改一次，卡片、彈窗、地圖都會更新）；改座標後路線要重算 |
| 補交通與停車提醒 | `data/places.json` 該地點的 `parking`（一段文字或文字陣列，彈窗會顯示「交通與停車」區塊） |
| 改某個景點的時間或說明文字 | `data/trip.json` 該項目的 `time`、`desc` |
| 新增或刪除一天 | `data/trip.json` 的 `days` 加減一個區塊（`day` 編號要唯一）；編輯器固定 6 天，不支援 |
| 換住宿 | `data/places.json` 改住宿資料；`data/trip.json` 的 `hotels` 與該天的 `stay.place` 改成新 id |
| 填訂房人資料 | `data/places.json` 住宿地點的 `booking` |
| 看或更新「資料待確認清單」 | `verify.md`（首頁頁尾的連結會用新分頁開啟 `verify.html`） |
| 更新版本號（畫面右上角） | 編輯器發布時自動小版 +1；手動改 `data/trip.json` 的 `site.version`（版本與日期）。大版號只能手動改 |
| 改區塊顏色 | `js/blocks.js` 最上方的顏色表 |
| 改景點攻略的文字 | `reference/guides.js`（並同步 `reference/guides.md`）；彈窗會顯示，標 `hidden: true` 的項目不顯示。編輯器不處理攻略 |
| 調整攻略區塊的順序或預設展開 | `js/guides.js` 最上方的 `SECTIONS` |
| 改路況係數（預設值） | 編輯器路線列的「預設係數」；或 `data/trip.json` 的 `site.routing.trafficFactor`（預設 1.25，顯示時間 = 原始時間 × 係數） |
| 某一天的係數不同 | 編輯器該天的「路況係數」；或 `data/trip.json` 該天加 `trafficFactor` |
| 改「路段過長」門檻（超過標紅） | 編輯器路線列的「每段上限（分鐘）」；或 `data/trip.json` 的 `site.routing.maxLegMinutes`（預設 180，用顯示時間判斷） |
| 重算路線 | 編輯器路線列的「全部重算」（忽略快取）或某段旁的「重新計算」，再按存檔。改係數與門檻不需要重算（快取存的是原始時間） |
| 改路線顯示（時間標示、紅色門檻、自動連接列） | `js/route-view.js`、`js/map.js`、`js/blocks.js`；路線資料（`data/routes.json` 與產生的 `data/routes*.js`）由編輯器產生，不手改 |
| 改地圖標記顏色 | `js/map.js` 最上方的 `MAP_TYPES`（左邊卡片的編號圓點會跟著變） |
| 某個起點不想編號 | `data/trip.json` 該項目加 `numbered: false` |

`docs/DESIGN.md` 第 4 節有所有區塊類型（drive、move、spot、meal、stay、end、notice、brief、waypoint）、地點欄位與路線設定的說明（JSON 不能寫註解，所以說明都在那裡）。

## 資料檢查

`place` 的 id 打錯時，頁面最上方會出現紅色提示列，指出是哪一天的第幾項、哪個 id 找不到；瀏覽器主控台也會有同樣訊息。編輯器同樣即時顯示這些問題，有問題仍可存檔，但發布會被擋下。

## 注意事項

- 所有檔案使用 UTF-8（無 BOM）、LF 換行。
- `index.html` 底部 script 的載入順序不可調換。
- 想在本機預覽公開頁面（不含編輯器），可執行 `python3 -m http.server` 後開啟 `http://localhost:8000`，或直接雙擊 `index.html`。
