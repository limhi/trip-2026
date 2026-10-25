/*
 * 地點資料庫：每個地點只在這裡維護一次，行程（data/trip.js）用 id 引用。
 *
 * 欄位說明（除 name 外都可省略）
 *   name          顯示名稱
 *   mapType       地圖標記顏色分類：attraction 景點 / hotel 住宿 / food 用餐 / other 其他行程 / transport 起訖點
 *   lat, lng      地圖座標（沒有座標的地點不會出現在地圖上）
 *   address       地址（導航預設用地址搜尋）
 *   infoType      有填才會出現「查看聯絡與導航」彈窗，內容是彈窗標題上的類別文字
 *   phone         顯示用電話（可含說明文字）；撥號用的號碼會自動取其中的數字，特殊情況可用 tel 覆寫
 *   line          { label: 顯示文字, url: 連結 }
 *   website       官方網站
 *   navigationUrl 自訂導航連結（沒填就用 address 產生 Google Maps 導航）
 *   phoneActionLabel 撥號按鈕文字（預設「立即撥號」）
 *   booking       { name, phone } 訂房資料（只有住宿用）
 *   alternate     備選地點 { name, phone, tel, address }（彈窗下方多顯示一張備選卡）
 *   parking       交通與停車提醒（一段文字，或多段文字的陣列）；有填才會在彈窗顯示「交通與停車」區塊
 */
window.TRIP_PLACES = {

    // ───────── 起訖點 / 中途休息點 ─────────
    'tucheng-start': { name: '土城出發', mapType: 'transport', lat: 24.9722, lng: 121.4433 },
    'nanao-rest': { name: '南澳休息點', mapType: 'other', lat: 24.448756, lng: 121.777216, address: '宜蘭縣南澳鄉蘇花路二段1號' },
    'taichung-end': { name: '返回台中', mapType: 'transport', lat: 24.1477, lng: 120.6736 },

    // ───────── 住宿 ─────────
    'tianxin-bnb': {
        name: '田心民宿', mapType: 'hotel', infoType: '住宿資訊',
        phone: '0982-131-954',
        line: { label: '@678rsujg', url: 'https://line.me/R/ti/p/%40678rsujg' },
        address: '宜蘭縣冬山鄉武淵一路6巷63號',
        lat: 24.6718, lng: 121.8040,
        parking: '官方旅宿網與訂房平台皆載明設有私人（戶外專屬）停車場。',
        booking: { name: '待提供', phone: '待提供' }
    },
    'tongle-bnb': {
        name: '童樂會親子民宿', mapType: 'hotel', infoType: '住宿資訊',
        phone: '0980-800-821（鄭小姐）',
        line: { label: 'nana0980800821', url: 'https://line.me/R/ti/p/nana0980800821' },
        address: '花蓮縣壽豐鄉志學村中山路二段265號2-3樓',
        lat: 23.9056902, lng: 121.5272580,
        parking: [
            '官方訂房頁：停車免費，設有電梯。',
            '遊記（2021）：一樓有 2 格車位，路邊也可停；多輛車請先向民宿確認。'
        ],
        booking: { name: '待提供', phone: '待提供' }
    },
    'pingtung-farmhouse': {
        name: '屏東市鄉下人家生活體驗', mapType: 'hotel', infoType: '住宿資訊',
        phone: '0911-493-513',
        address: '屏東縣屏東市維新里光義巷5號',
        lat: 22.6742189, lng: 120.4807115,
        parking: '住客評論（非官方）：合作停車位離民宿約步行 3 分鐘，訂房時請向民宿確認停車位置。',
        booking: { name: '待提供', phone: '待提供' }
    },

    // ───────── 宜蘭 ─────────
    'zhangmei-farm': {
        name: '張美阿嬤農場', mapType: 'attraction', infoType: '旅遊景點',
        phone: '0935-514-462', website: 'https://zhangmeifarm.com.tw/',
        address: '宜蘭縣三星鄉行健溪一路二段161號',
        lat: 24.6901, lng: 121.7135,
        parking: [
            '園區有免費大停車場；假日第一停車場常在 10:30 前客滿，客滿時改引導至第二停車場，步行約 3–5 分鐘。',
            '周邊為狹窄田間道路，導航請認明「行健溪一路二段161號」，勿誤入另一間「張美阿嬤農場 2.0」（萬富七路）。'
        ]
    },
    'qingshui-geothermal': {
        name: '清水地熱公園', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-989-4500', address: '宜蘭縣大同鄉三星路八段501巷150號',
        lat: 24.6118089, lng: 121.6365653,
        parking: [
            '停車場計次收費，小客車約 50 元／次（兩處共約 250 席，以現場公告為準）。',
            '末段為山區道路；假日入口前常排隊。'
        ]
    },
    'shooting-museum': {
        name: '邱比準射擊博物館', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-950-7110', website: 'https://travel.dongshan.gov.tw/tourist_spot_view.asp?id=82',
        address: '宜蘭縣冬山鄉八仙二路93號',
        lat: 24.6606803, lng: 121.7832922,
        parking: [
            '沒有專屬停車場，停在博物館對面的白線側路邊；放三角錐的那一側不能停。',
            '距羅東火車站約 2.5 公里，附近沒有公車站，建議開車。'
        ]
    },
    'crayon-castle': {
        name: '蠟藝蠟筆城堡', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-990-7101', website: 'https://luckyart.com.tw/art/guide',
        address: '宜蘭縣蘇澳鎮海山西路500號',
        lat: 24.6179, lng: 121.8275,
        parking: [
            '設有 120 個免費停車位（僅供本館遊客使用）；另有免費置物櫃與推車停放區，洽櫃台使用。',
            '國道 5 號蘇澳交流道下，直行約 100 公尺即到。'
        ]
    },
    'yilan-cake-museum': {
        name: '宜蘭餅發明館', mapType: 'food', infoType: '旅遊景點',
        phone: '03-990-5999', website: 'https://www.i-cake.com.tw/',
        address: '宜蘭縣蘇澳鎮海山西路369號',
        lat: 24.6145577, lng: 121.8291677,
        parking: '備有大型停車場，可停小客車與遊覽車，參觀遊客皆可免費停車（官網）。'
    },
    'mackerel-factory': {
        name: '大鯖魚夢工廠', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-990-4111', line: { label: '@buyfish', url: 'https://lin.ee/rr3PXm8' },
        website: 'https://www.buymackerel.com/',
        address: '宜蘭縣蘇澳鎮大圳路118號',
        lat: 24.6134019, lng: 121.8326133,
        parking: [
            '園區自有免費停車場。',
            '國道 5 號蘇澳交流道下約 5 分鐘。'
        ]
    },
    'tofu-cape': {
        name: '豆腐岬風景區', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-997-3421', address: '宜蘭縣蘇澳鎮南方澳漁港東側',
        navigationUrl: 'https://www.google.com/maps/dir/?api=1&destination=24.583822%2C121.8714345',
        lat: 24.583822, lng: 121.8714345,
        parking: [
            '入口旁設有停車場；是否收費官方未公告，遊記說法不一（免費或約 50 元／次），以現場為準。',
            '本區無管理人員照料，入內請注意相關告示，不要前往水深及危險區域（官方）。'
        ]
    },
    'suao-cold-spring': {
        name: '蘇澳冷泉公園', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-996-0645', address: '宜蘭縣蘇澳鎮冷泉路6-4號',
        lat: 24.5973124, lng: 121.850703,
        parking: [
            '公有冷泉停車場：多篇 2025–2026 遊記一致寫小型車約 50 元／次，08:00–17:00 收費、其餘時段免費（非官方公告，以現場為準）；距入口步行約 1 分鐘。'
        ]
    },

    // ───────── 花蓮 ─────────
    'qixingtan': {
        name: '七星潭', mapType: 'attraction', infoType: '旅遊景點',
        phone: '七星潭風景區 03-822-1592（遊客中心 03-822-5898）', tel: '038221592',
        address: '花蓮縣新城鄉七星街32號',
        lat: 24.031426, lng: 121.62717,
        parking: [
            '景區南北側及遊客中心旁皆有免費停車場（花蓮旅遊網官方頁）；賞星廣場前也有大型停車場。',
            '假日（尤其中午前後）車位容易客滿，建議早到或改停周邊停車場。',
            '遊客中心開放 10:00–17:00（觀光署）；遊記稱週二、週三公休，11/17 是週二，需要請先電話確認。'
        ]
    },
    'hz52-diner': {
        name: '52Hz食堂', mapType: 'food', infoType: '餐飲資訊',
        phone: '03-835-0030', address: '花蓮縣花蓮市民國路147號',
        lat: 23.9797636, lng: 121.6068246
    },
    'general-mansion': {
        name: '花蓮將軍府1936', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-831-6272', website: 'https://www.jjf1936.com/',
        address: '花蓮縣花蓮市中正路622巷6號',
        lat: 23.980954, lng: 121.61302,
        parking: [
            '官網列出：將軍府停車場（中正路與新興路口，24 小時、免費）、花蓮醫院停車場（08:30–20:00，免費）、國軍英雄館停車場（24 小時、免費）；明禮路停車場收費（平日 30 分鐘 15 元、假日 20 元）。',
            '部分 blog 稱園區本身無附設停車場，假日建議提早約 30 分鐘找車位。'
        ]
    },
    'egg-pancake-cart': {
        name: '炸蛋蔥油餅黃車', mapType: 'food', infoType: '餐飲資訊',
        phone: '0931-121-661', address: '花蓮縣花蓮市復興街102號',
        lat: 23.98245, lng: 121.605992
    },
    'farglory-oceanpark': {
        name: '遠雄海洋公園', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-812-3199',
        line: { label: '官方 LINE', url: 'https://page.line.me/qbt6753v' },
        website: 'https://www.farglory-oceanpark.com.tw/',
        address: '花蓮縣壽豐鄉鹽寮村福德189號',
        lat: 23.9011, lng: 121.6030,
        parking: [
            '汽車停車場：平假日（非連續假日）200 元、連續假日 250 元、春節初一至初五 300 元；機車 50 元（官方 FAQ，實際以現場公告為準）。',
            '停好車後搭手扶梯直達 5 樓售票大廳；園區沒有接駁車。',
            '停車場於營業結束前兩小時（約 15:00）停止開放。'
        ]
    },

    // ───────── 台東 ─────────
    'chishang-bento': {
        name: '池上飯包文化故事館', mapType: 'food', infoType: '旅遊景點',
        phone: '089-862-326', address: '臺東縣池上鄉忠孝路259號',
        lat: 23.1220288, lng: 121.2151529
    },
    'brown-boulevard': {
        name: '伯朗大道', mapType: 'attraction', infoType: '旅遊景點',
        phone: '池上鄉公所 089-862-041', phoneActionLabel: '撥打鄉公所',
        address: '臺東縣池上鄉錦新三號道路',
        lat: 23.0988, lng: 121.2126,
        parking: [
            '池上鄉公所公告實施車輛管制：除農務車輛、持池上鄉民通行證之車輛及慢車外，其餘車輛（含電動機車）禁止進入；違者依法處罰（約 900–1,800 元）。',
            '自駕請把車停在外圍停車場或租車行，再步行或騎自行車進入；官方未公告停車場名稱，租車行多提供免費停車（遊記）。',
            '「開始導航」會導到道路本身，請改導航到外圍停車場或租車行。'
        ]
    },
    'dapo-pond': {
        name: '大坡池', mapType: 'attraction', infoType: '旅遊景點',
        phone: '池上鄉公所 089-862-041', phoneActionLabel: '撥打鄉公所',
        address: '臺東縣池上鄉池富道路23號',
        navigationUrl: 'https://www.google.com/maps/dir/?api=1&destination=23.119911%2C121.22404',
        lat: 23.119911, lng: 121.22404,
        parking: [
            '風景區前有免費停車場（遊記）；觀光署地址只寫「臺9線322K東側轉入」，沒有門牌，導航已改用官方座標。',
            '北側廁所 11 月約 06:30–17:30（遊記，非官方）；觀光署列無障礙廁所 3 間。'
        ]
    },
    'duoliang-rest': {
        name: '多良休息點', mapType: 'attraction', infoType: '旅遊景點',
        phone: '太麻里鄉公所 089-781-301', phoneActionLabel: '撥打鄉公所',
        address: '臺東縣太麻里鄉多良村瀧溪路8-1號',
        lat: 22.507487, lng: 120.95888,
        parking: [
            '車輛請停在台9線路邊白線內，嚴禁並排停車（太麻里鄉公所公告）；再步行上坡約 5–10 分鐘到觀景平台（遊記）。',
            '開放時間 08:00–17:00（鄉公所公告，2025/12/1 起實施，春節等節日可能延長，以現場公告為準）。',
            '入園每人酌收清潔費 10 元；未滿 6 歲或身高 115 公分以下、太麻里鄉民免收，8 歲孩童可能需付費。',
            '近年有野生獼猴出沒，請勿靠近、觸摸或餵食（縣府農業處提醒）。'
        ]
    },

    // ───────── 屏東 ─────────
    'pingtung-night-market': {
        name: '屏東觀光夜市', mapType: 'food', infoType: '旅遊景點',
        address: '屏東縣屏東市民族路36號',
        lat: 22.66993, lng: 120.4899,
        parking: [
            '夜市沿民族路兩側，人車共道；建議把車停在附近停車場再步行，不要開進民族路。',
            '可停民生路立體停車場（約 622 格，新聞稱鄰近民族夜市，步行約 5 分鐘）；費率以現場收費牌為準。',
            '是否有徒步區管制官方無法確認；2026-04 遊記稱沒有封路、機車可直接騎進來，到場先看路口告示。'
        ]
    },
    'ligang-cemetery': {
        name: '里港鄉第二公墓', mapType: 'other', infoType: '掃墓地點',
        phone: '里港鄉公所 08-775-2114', phoneActionLabel: '撥打鄉公所',
        address: '屏東縣里港鄉塔樓村光明巷附近',
        navigationUrl: 'https://www.google.com/maps/dir/?api=1&destination=22.76478%2C120.47475',
        lat: 22.76478, lng: 120.47475
    },
    'wenfu-pork': {
        name: '文富餛飩豬腳', mapType: 'food', infoType: '旅遊景點',
        phone: '08-775-8833',
        address: '屏東縣里港鄉永樂路8號',
        lat: 22.7768, lng: 120.4945
    }
};
