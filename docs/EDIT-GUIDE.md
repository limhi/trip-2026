# 調整行程內容指南（給 AI）

只講「怎麼改行程內容」。欄位名稱以這份為準（v2.6）；設計原因看 `DESIGN.md`，發布規則看 `AGENTS.md`。

## 1. 只改這些檔案

| 可以改 | 不能碰 |
|---|---|
| `data/trip.json`（每天行程、版本號）、`data/places.json`（地點） | `data/*.js`（`build-data.js` 產生，手改會讓 `check.js` 失敗） |
| `verify.md`、`docs/TODO.md`（題號回覆與待辦，見 AGENTS.md） | `data/routes.json`（路線快取，編輯器或 `tools/routing` 寫入） |
|  | `js/`、`tools/`（改功能才動，內容調整不用） |

每次改內容：`data/trip.json` 的 `site.version`（`number` 小版 +1、`date` 改當天）。

## 2. 欄位速查

### 項目（`days[].items[]`，順序就是行程順序）

| type | 外觀 | 必填 | 選填 |
|---|---|---|---|
| `move` | 移動列 | `text` | `time`（**系統算，不手寫**）, `buffer`（整數分鐘，可為負，預設 0）, `note`（備註文字，不參與計算） |
| `spot` / `meal` | 卡片 | `place` 或 `title` | `tag`, `time`, `desc`, `alt`（只限 `spot`）, `map:false` |
| `stay` / `end` / `notice` | 卡片 | `place` 或 `title` | `tag`, `time`, `desc` |
| `brief` | 小框 | `time`, `title` | `place`, `icon`, `desc` |
| `waypoint` | 起訖點列 | `place` | `text`, `backup`, `mapName`, `numbered:false` |

- `time`：完整區間寫 `"12:20 - 14:00"`（半形空格、連字號）；`"15:30 後"` 這類不完整的也可以，但不會有排定時間與停留時間。
- `move` 的長度 = 查詢時間（原始 × 路況係數）+ `buffer`；`time` 由系統依前一站結束算出，**不要手改**，`text`、`note`、`buffer` 可自由寫。兩標記之間沒有 `move` 時，`sync-moves.js` 與編輯器會補一個（`text` 預設「前一站 ➔ 下一站」），**只補不刪**。
- 停留時間由 `spot`／`meal` 的完整區間自動算出並顯示，**不要寫進資料**。
- `place` 是 `places.json` 的 id；有座標的項目依順序自動成為地圖標記與編號，**不用維護地圖資料**。
- 每天另有：`stay: {place, note}`（標題列住宿）、`badge: {icon, text}`（沒住宿時）、`closeLoop`、`trafficFactor`（正數）、`theme`。

### 地點（`places.json`，key 是 id，順序要保留）

`name`（必填）、`mapType`（`attraction｜hotel｜food｜other｜transport`）、`lat`/`lng`（沒有就不上地圖）、`address`、`infoType`（有填才有彈窗）、`phone`、`tel`（覆寫撥號號碼）、`phoneActionLabel`、`line {label,url}`、`website`、`navigationUrl`、`parking`（字串或陣列）、`booking {name,phone}`。

### 驗證會擋的

卡片沒有 `place` 與 `title`；`waypoint` 沒有 `place`；`place` id 不存在；項目還在用 `duration`（已改名 `note`）；`alt` 規則（見 3.2）。

## 3. 想做什麼 → 怎麼改

### 3.1 加一個景點
先在 `data/places.json` 加地點（id 用英文小寫連字號），再在該天 `items` 放項目：
```json
"test-spot": { "name": "測試景點", "mapType": "attraction", "lat": 23.12, "lng": 121.22, "infoType": "旅遊景點", "address": "臺東縣池上鄉測試路1號" }
```
```json
{ "type": "spot", "tag": "池上景點", "time": "14:10 - 15:00", "place": "test-spot", "desc": "說明文字。" }
```
有座標才會出現在地圖。相鄰標記之間要有一個 `move`：直接改 JSON 時，加完後執行 `node tools/sync-moves.js --reschedule <day>` 補列並整天重排（見第 4 節）。

### 3.2 兩個景點二選一（`alt`）
兩項緊鄰、`alt` 字串相同；共用時間只寫在**第一項**，第二項不寫 `time`；成員只能是 `spot`，至少 2 項：
```json
{ "type": "spot", "tag": "池上景點", "time": "12:20 - 14:00", "place": "dapo-pond", "alt": "chishang", "desc": "…" },
{ "type": "spot", "tag": "池上景點", "place": "brown-boulevard", "alt": "chishang", "desc": "…" }
```
地圖編號變成 3a、3b；前後站各自與每個成員連一段，路線快取要重算（第 5 節）。

### 3.3 調整時間
景點的開始、結束都可改，時間軸要保持接得起來（每個項目的結束 = 下一個項目的開始）：編輯器裡改結束邊，後面整串自動平移；改開始邊，前面整串往前平移；改完欄位會變黃底、出現「連動」「伸縮」「取消」三鈕，離開焦點不會套用，按「連動」（或 Enter）或「伸縮」才套用（伸縮只動緊鄰的移動與景點）；移動列設緩衝時選向前或向後。直接改 JSON 時，只改停留就自己把後面（或前面）的項目時間整段平移，或執行 `node tools/sync-moves.js --reschedule <day>`（整天依停留與移動長度重排，起點是當天第一個完整時間項目的開始；`--dry-run` 只看不寫；它會重排整天，不是只平移一側）。移動列的 `time` 不要手改，要多留時間就調它的 `buffer`。排定時間比查詢時間短（只有 `buffer` 為負或手改才會）時，頁面會顯示紅字「⚠ 排定不足」，`check.js` 不會失敗。
```json
{ "type": "meal", "tag": "午餐", "time": "11:15 - 12:30", "place": "chishang-bento", "desc": "…" }
```

### 3.4 換住宿
`places.json` 加新住宿（`mapType: "hotel"`、`infoType: "住宿資訊"`），再把用到舊 id 的地方都換掉：該天 `stay.place`、該天 `waypoint` 與 `stay` 項目的 `place`、`hotels[]` 的 `place`：
```json
"test-bnb": { "name": "測試民宿", "mapType": "hotel", "infoType": "住宿資訊", "lat": 22.75, "lng": 121.15, "phone": "089-000-000", "booking": { "name": "待提供", "phone": "待提供" } }
```
```json
"stay": { "place": "test-bnb", "note": "台東第1晚" }
```
新住宿座標與前後站不同，路線快取要重算。

### 3.5 改地點座標或電話
只改 `places.json` 該地點，卡片、彈窗、地圖一起更新：
```json
"lat": 23.119911, "lng": 121.22404, "phone": "池上鄉公所 089-862-041"
```
`phone` 有多個號碼時要填 `tel`。**改座標後路線快取要重算。**

### 3.6 調整項目順序
在該天 `items` 裡把整個物件上下搬；編號、地圖、連線自動更新。擇一組成員搬動後，共用 `time` 仍要留在組內第一項。搬完檢查前後的 `move` 與 `time` 是否還合理。**順序變了，路線快取要重算。**

## 4. 改完必跑

```bash
node tools/sync-moves.js --reschedule 4   # 改了停留、順序或地點後：補移動列並整天重排第 4 天（--dry-run 只看不寫；不加 --reschedule 只補缺的移動列）
node tools/build-data.js    # 由 data/*.json 產生 data/*.js
node tools/check.js         # 看結束碼，0 才算過；不要接 | tail
node --test                 # 只有動到 js/ 或 tools/ 才跑
```
「N 段沒有路線快取」、缺移動列、多個或多餘的移動列都只是警告，不算失敗，但要處理。

## 5. 路線快取

改了座標、或某天項目的順序／地點之後要重算，否則新路段沒有快取。作法見 `AGENTS.md`「怎麼改行程、怎麼發布」（請使用者在編輯器按「全部重算」，或用 `tools/routing` 逐段呼叫，間隔至少 1 秒、不平行、不自動重試）。規則見 `DESIGN.md` 第 15 節。

## 6. 先問使用者，不要自己套用

- `reference/pending-decisions.md` 的 B 類項目、還沒有使用者決定的事。
- 沒有官方原文佐證的資料（部落格、遊記只能標「遊記」並列成確認題目）。
- 這次調整不是使用者確認過的：先問，再 commit／push。
- 營業時間、票價、預約規則等會變動的資訊：沒有官方來源不要寫成確定。

查證與確認清單（`verify.md` 題號回覆、`docs/RESEARCH-LOG.md`）的流程見 `AGENTS.md`。
