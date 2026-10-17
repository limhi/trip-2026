# 2026 親子順時針環島行程

純靜態網頁，不需要建置。用 GitHub Pages 或其他網站伺服器開啟 `index.html` 可以，直接雙擊開啟也可以。

## 檔案結構

```
index.html        頁面骨架（導覽、頁首、各區塊的容器、聯絡彈窗），平常不用動
data/
  trip.js         行程內容：頁首文字、每天的行程順序、住宿區文案   ← 改行程改這裡
  places.js       地點資料庫：電話、LINE、地址、座標、導航連結      ← 改聯絡資訊改這裡
js/
  model.js        資料處理與檢查（組出地圖標記、聯絡資訊、找資料錯誤）
  blocks.js       每種區塊的樣板與顏色表                          ← 想統一改區塊顏色改這裡
  modal.js        聯絡與導航彈窗
  map.js          每日地圖（標記顏色、圖例）
  render.js       把資料填進骨架
css/style.css     自訂樣式（版面本身用 Tailwind CDN）
```

## 旅遊研究資料

`reference/pending-decisions.md` 是景點資料核對後還需要決定的項目清單（`AGENTS.md` 會引導 Claude 先讀它）。

`reference/research.md` 收錄本行程景點的票務與預約需求，以及每個景點 5 個熱門攻略或官方資訊連結。出發前請再次確認官方公告，因為票價、營業時間、預約規則與設施開放狀態可能變動。

## 常見調整

| 想做的事 | 改哪裡 |
|---|---|
| 調整某天景點的順序 | `data/trip.js`，在該天的 `items` 裡上下搬移那一行（地圖標記順序會自動跟著變） |
| 換景點 | 在 `data/places.js` 新增地點，再把 `data/trip.js` 的 `place` 改成新的 id |
| 改電話、地址、LINE、座標 | `data/places.js`（只改一次，卡片、彈窗、地圖都會更新） |
| 補交通與停車提醒 | `data/places.js` 該地點的 `parking`（一段文字或文字陣列，彈窗會顯示「交通與停車」區塊） |
| 改某個景點的時間或說明文字 | `data/trip.js` 該項目的 `time`、`desc` |
| 新增或刪除一天 | `data/trip.js` 的 `days` 加減一個區塊（`day` 編號要唯一） |
| 換住宿 | `data/places.js` 改住宿資料；`data/trip.js` 的 `hotels` 與該天的 `stay.place` 改成新 id |
| 填訂房人資料 | `data/places.js` 住宿地點的 `booking` |
| 看或更新「資料待確認清單」 | `verify.md`（首頁頁尾的連結會用新分頁開啟 `verify.html`） |
| 更新版本號（畫面右上角） | `data/trip.js` 的 `site.version`（版本與日期，每次改完行程手動更新） |
| 改區塊顏色 | `js/blocks.js` 最上方的顏色表 |
| 改景點攻略的文字 | `reference/guides.js`（並同步 `reference/guides.md`）；彈窗會顯示，標 `hidden: true` 的項目不顯示 |
| 調整攻略區塊的順序或預設展開 | `js/guides.js` 最上方的 `SECTIONS` |
| 改地圖標記顏色 | `js/map.js` 最上方的 `MAP_TYPES`（左邊卡片的編號圓點會跟著變） |
| 某個起點不想編號 | `data/trip.js` 該項目加 `numbered: false` |

`data/trip.js` 檔案開頭有所有區塊類型（drive、move、spot、meal、stay、end、notice、brief、waypoint）與欄位的說明，`data/places.js` 開頭有地點欄位說明。

## 資料檢查

`place` 的 id 打錯時，頁面最上方會出現紅色提示列，指出是哪一天的第幾項、哪個 id 找不到；瀏覽器主控台也會有同樣訊息。

## 注意事項

- 所有檔案使用 UTF-8（無 BOM）。
- `index.html` 底部 script 的載入順序不可調換。
- 想在本機預覽，可執行 `python3 -m http.server` 後開啟 `http://localhost:8000`，或直接雙擊 `index.html`。
