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
        booking: { name: '待提供', phone: '待提供' }
    },
    'tongle-bnb': {
        name: '童樂會親子民宿', mapType: 'hotel', infoType: '住宿資訊',
        phone: '0980-800-821（鄭小姐）',
        line: { label: 'nana0980800821', url: 'https://line.me/R/ti/p/nana0980800821' },
        address: '花蓮縣壽豐鄉志學村中山路二段265號2-3樓',
        lat: 23.9056902, lng: 121.5272580,
        booking: { name: '待提供', phone: '待提供' }
    },
    'pingtung-farmhouse': {
        name: '屏東市鄉下人家生活體驗', mapType: 'hotel', infoType: '住宿資訊',
        phone: '0911-493-513',
        address: '屏東縣屏東市維新里光義巷5號',
        lat: 22.6807, lng: 120.4912,
        booking: { name: '待提供', phone: '待提供' }
    },

    // ───────── 宜蘭 ─────────
    'zhangmei-farm': {
        name: '張美阿嬤農場', mapType: 'attraction', infoType: '旅遊景點',
        phone: '0935-514-462', address: '宜蘭縣三星鄉行健溪一路二段161號',
        lat: 24.6901, lng: 121.7135
    },
    'qingshui-geothermal': {
        name: '清水地熱公園', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-989-4500', address: '宜蘭縣大同鄉三星路八段501巷150號',
        lat: 24.6120, lng: 121.6350
    },
    'shooting-museum': {
        name: '勇者桂冠王／邱比準射擊博物館', mapType: 'attraction', infoType: '旅遊景點',
        address: '宜蘭縣冬山鄉八仙二路93號',
        lat: 24.6606803, lng: 121.7832922
    },
    'crayon-castle': {
        name: '蠟藝蠟筆城堡', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-990-7101', address: '宜蘭縣蘇澳鎮海山西路500號',
        lat: 24.6179, lng: 121.8275
    },
    'yilan-cake-museum': {
        name: '宜蘭餅發明館', mapType: 'food', infoType: '旅遊景點',
        phone: '03-990-5999', address: '宜蘭縣蘇澳鎮海山西路369號',
        lat: 24.6170, lng: 121.8271
    },
    'mackerel-factory': {
        name: '大鯖魚夢工廠', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-990-4111', line: { label: '@buyfish', url: 'https://lin.ee/rr3PXm8' },
        address: '宜蘭縣蘇澳鎮大圳路118號',
        lat: 24.6357, lng: 121.8337
    },
    'tofu-cape': {
        name: '豆腐岬風景區', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-997-3421', address: '宜蘭縣蘇澳鎮南方澳漁港東側',
        lat: 24.5815, lng: 121.8703
    },
    'suao-cold-spring': {
        name: '蘇澳冷泉公園', mapType: 'attraction', infoType: '旅遊景點',
        phone: '03-996-0645', address: '宜蘭縣蘇澳鎮冷泉路6-4號',
        lat: 24.5977, lng: 121.8492
    },

    // ───────── 花蓮 ─────────
    'qixingtan': {
        name: '七星潭', mapType: 'attraction', infoType: '旅遊景點',
        address: '花蓮縣新城鄉七星街',
        lat: 24.034006, lng: 121.628589
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
        lat: 23.980954, lng: 121.61302
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
        lat: 23.9011, lng: 121.6030
    },

    // ───────── 台東 ─────────
    'chishang-bento': {
        name: '池上飯包文化故事館', mapType: 'food', infoType: '旅遊景點',
        phone: '089-862-326', address: '臺東縣池上鄉忠孝路259號',
        lat: 23.1220288, lng: 121.2151529
    },
    'brown-boulevard': {
        name: '伯朗大道', mapType: 'attraction', infoType: '旅遊景點',
        address: '臺東縣池上鄉錦新三號道路',
        lat: 23.0988, lng: 121.2126
    },
    'dapo-pond': {
        name: '大坡池', mapType: 'attraction', infoType: '旅遊景點',
        address: '臺東縣池上鄉池富道路23號',
        lat: 23.1219, lng: 121.2052
    },
    'duoliang-rest': {
        name: '多良休息點', mapType: 'attraction', infoType: '旅遊景點',
        phone: '089-781-301', address: '臺東縣太麻里鄉多良村瀧溪路8-1號',
        lat: 22.507487, lng: 120.95888
    },

    // ───────── 屏東 ─────────
    'pingtung-night-market': {
        name: '屏東觀光夜市', mapType: 'food', infoType: '旅遊景點',
        address: '屏東縣屏東市民族路',
        lat: 22.6732, lng: 120.4885
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
        address: '屏東縣里港鄉永樂路8號',
        lat: 22.7768, lng: 120.4945
    }
};
