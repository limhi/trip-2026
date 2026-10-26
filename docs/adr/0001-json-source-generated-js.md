# 0001 資料來源改為 JSON，並產生 `data/*.js`

日期：2026-10-26｜狀態：已決定（尚未實作）

## 背景

行程與地點原本直接寫在 `data/trip.js`、`data/places.js`（`window.X = {...}`）。這樣做是為了讓雙擊 `index.html`（file://）也能開，因為瀏覽器在 file:// 會擋 `fetch` 本機 JSON。

要做規劃介面（見 0002）時，程式需要讀寫資料；JS 檔含註解與變數（`PARTY`），程式很難安全地改寫。

## 決定

- 資料來源是 `data/trip.json`、`data/places.json`，介面與 Claude 都改這兩個檔。
- `tools/build-data.js` 由 JSON 產生 `data/trip.js`、`data/places.js`，產生檔要 commit。
- 公開頁面程式（`js/`、`index.html`）除資料載入外不動，仍是零建置，仍可雙擊開啟。
- `tools/check.js` 檢查產生檔與 JSON 同步。

## 後果

- 好處：資料格式單純，工具可讀寫；網頁行為不變。
- 代價：每次改資料要多一步產生；JSON 不能寫註解，欄位說明改放 `docs/DESIGN.md`。
- 不要把這個決定改回「手改 `data/*.js`」：下次存檔或產生時會被覆蓋。

## 考慮過的其他做法

- 網頁直接 `fetch` JSON：失去 file:// 能力（使用者要求保留）。
- 產生完整靜態 HTML：公開頁面程式要大改，風險大。
