/*
 * 行程資料：改行程、調順序、改文案，只需要動這個檔案。
 * 地點的電話、地址、座標在 data/places.js，這裡用 place 的 id 引用。
 *
 * ── 每天的項目（items）類型 ──────────────────────────────────────
 *  drive    交通（深灰列，車子圖示）   time, text, duration?
 *  move     移動（淺灰列，路線圖示）   time, text, duration?
 *  spot     景點卡片（藍）             tag, time?, place | title, desc
 *  meal     用餐／點心卡片（琥珀）     同上
 *  stay     入住／返回住宿卡片（紫）   同上
 *  end      行程結束卡片（綠）         同上
 *  notice   提醒卡片（琥珀）           同上
 *  brief    簡短資訊框（琥珀淡底）     time, title, place?, icon?, desc?
 *  waypoint 只出現在地圖、不顯示卡片   place, backup?, mapName?
 *
 * ── 共通欄位 ─────────────────────────────────────────────────────
 *  place    引用 data/places.js 的 id。
 *           ‧ 卡片標題預設用地點名稱（要改標題就寫 title）
 *           ‧ 該地點有 infoType 時，卡片可點開聯絡與導航彈窗
 *           ‧ 該項目會依出現順序自動成為當天地圖的標記
 *  map:false  有 place 但不想放上地圖
 *
 * ── 每天的選項 ───────────────────────────────────────────────────
 *  stay     { place, note }  標題列右側顯示「宿：住宿名稱（note）」
 *  badge    { icon, text }   沒有住宿時，標題列右側顯示的文字
 *  theme    'blue'（預設）或 'end'（綠色，最後一天用）
 *  closeLoop  true 時地圖路線會連回起點
 *
 * 調整順序：直接上下搬移 items 裡的那一行，卡片與地圖會一起更新。
 */

const PARTY = '3位成人＋1位8歲孩童';

window.TRIP = {

    // ───────── 網站基本資訊 ─────────
    site: {
        documentTitle: '2026 親子順時針環島之旅 (6天5夜)',
        brand: '環島之旅 2026',
        navLinks: [
            { href: '#itinerary', label: '每日行程', tone: 'amber' },
            { href: '#hotels', label: '嚴選住宿', tone: 'emerald' }
        ],
        footer: '© 2026 親子順時針環島行程規劃 | 祝您與家人旅途愉快！'
    },

    // ───────── 頁首 ─────────
    hero: {
        dateBadge: '2026/11/15(日) – 11/20(五) 6天5夜',
        title: '台灣順時針親子環島行',
        route: '土城 ➔ 宜蘭（住2晚）➔ 花蓮（住2晚）➔ 台東池上與南迴 ➔ 屏東（住1晚）➔ 里港鄉第二公墓掃墓 ➔ 台中',
        chips: [
            { icon: 'users', text: PARTY },
            { icon: 'car', text: '自行開車' }
        ]
    },

    // ───────── 重點列（黃色橫條）─────────
    highlights: [
        { icon: 'bed', text: '宜蘭住宿2晚' },
        { icon: 'bed', text: '花蓮住宿2晚' },
        { icon: 'bed', text: '屏東住宿1晚' },
        { icon: 'car', text: '每段駕駛儘量不超過3小時' },
        { icon: 'users', text: PARTY }
    ],

    // ───────── 每日行程 ─────────
    itinerary: {
        badge: 'Itinerary',
        title: '每日詳細行程規劃',
        subtitle: '含精確路線車程時間與 8 歲小朋友放電節奏'
    },

    days: [
        // ───────── DAY 1 ─────────
        {
            day: 1, date: '11/15（日）', title: '土城出發 ➔ 宜蘭山林親子遊',
            stay: { place: 'tianxin-bnb', note: '宜蘭第1晚' },
            items: [
                { type: 'waypoint', place: 'tucheng-start' },
                { type: 'drive', time: '07:30 - 09:00', text: '土城出發 ➔ 宜蘭三星', duration: '車程約 1hr 20min' },
                { type: 'spot', tag: '上午景點', time: '09:00 - 11:20', place: 'zhangmei-farm',
                  desc: '近距離餵食水豚、羊駝和小鹿，提供手作 DIY 及和服體驗。' },
                { type: 'move', time: '11:20 - 12:00', text: '移動至清水地熱', duration: '車程約 30min' },
                { type: 'spot', tag: '下午景點', time: '12:00 - 14:20', place: 'qingshui-geothermal',
                  desc: '體驗用溫泉水煮溫泉蛋、玉米當午餐，並享受免費熱騰騰泡腳；建議另備主食，只有蛋和玉米可能不夠。' },
                { type: 'move', time: '14:20 - 15:05', text: '移動至冬山', duration: '車程約 30min' },
                { type: 'spot', tag: '下午景點', time: '15:05 - 16:50', place: 'shooting-museum',
                  desc: '多種趣味射擊闖關、空氣槍與大型彈弓，8 歲小朋友放電首選。17:10 後入住田心民宿，晚餐可安排冬山或羅東。' },
                { type: 'waypoint', place: 'tianxin-bnb' }
            ]
        },

        // ───────── DAY 2 ─────────
        {
            day: 2, date: '11/16（一）', title: '蘇澳觀光工廠 ➔ 南方澳海岸巡禮',
            stay: { place: 'tianxin-bnb', note: '宜蘭第2晚' },
            closeLoop: true,
            items: [
                { type: 'waypoint', place: 'tianxin-bnb' },
                { type: 'spot', tag: '09:00 田心民宿出發', time: '09:20 - 11:30', place: 'crayon-castle',
                  desc: '四道手作 DIY 關卡，讓小朋友親手製作彩色筆與造型蠟筆。' },
                { type: 'brief', icon: 'utensils', time: '11:30 - 12:30', title: '宜蘭餅發明館／蘇澳午餐', place: 'yilan-cake-museum',
                  desc: '參觀宜蘭餅發明館、採買伴手禮，再於蘇澳附近安排午餐；實際餐廳可依當天時間與營業狀況決定。' },
                { type: 'spot', tag: '下午景點', time: '12:40 - 13:30', place: 'mackerel-factory',
                  desc: '認識蘇澳在地鯖魚產業，現場享用優質現烤鯖魚點心。' },
                { type: 'spot', tag: '下午景點', time: '13:50 - 15:10', place: 'tofu-cape',
                  desc: '沿著海岸步道散步、欣賞獨特的豆腐岩地質與海景。' },
                { type: 'spot', tag: '下午景點', time: '15:25 - 16:20', place: 'suao-cold-spring',
                  desc: '體驗獨特有名的冷泉足湯，放鬆雙腳舒緩疲勞；11月可能僅部分設施開放，出發前請確認泡湯池或足湯狀態。17:00 左右返回田心民宿。' }
            ]
        },

        // ───────── DAY 3 ─────────
        {
            day: 3, date: '11/17（二）', title: '宜蘭出發 ➔ 七星潭 ➔ 花蓮市區 ➔ 花蓮入住',
            stay: { place: 'tongle-bnb', note: '花蓮第1晚' },
            items: [
                { type: 'waypoint', place: 'tianxin-bnb' },
                { type: 'drive', time: '09:00 - 11:50', text: '09:00 田心民宿退房準時出發；10:10 - 10:30 南澳短暫休息，續走蘇花改前往花蓮。' },
                { type: 'waypoint', place: 'nanao-rest' },
                { type: 'spot', tag: '海岸散步', time: '11:50 - 12:40', place: 'qixingtan',
                  desc: '抵達花蓮後先散步、看海、休息約50分鐘。' },
                { type: 'meal', tag: '午餐', time: '13:00 - 14:00', place: 'hz52-diner',
                  desc: '咖哩飯、日式豬排滑蛋丼；內用味噌湯、飲料可續，白飯可續一碗。公開營業時間為11:00 - 14:00、17:00 - 20:00，週一休息；出發前請再次確認。' },
                { type: 'spot', tag: '歷史園區', time: '14:15 - 15:25', place: 'general-mansion',
                  desc: '免費日式歷史建築園區，有餐飲、伴手禮與日式庭園；可使用附近將軍府停車場，園區與個別店家營業時間可能不同。' },
                { type: 'meal', tag: '下午點心', time: '15:35 - 16:00', place: 'egg-pancake-cart',
                  desc: '建議全家買1 - 2份分食，避免影響晚餐。' },
                { type: 'stay', tag: '入住民宿', time: '16:45 後', place: 'tongle-bnb',
                  desc: '16:00 - 16:45 前往民宿，入住後使用遊戲室及房內溜滑梯；18:00後於志學商圈簡單用餐，可選伊均蘭州拉麵、義起呷義式料理或丸山和食。' }
            ]
        },

        // ───────── DAY 4 ─────────
        {
            day: 4, date: '11/18（三）', title: '遠雄海洋公園全天暢玩',
            stay: { place: 'tongle-bnb', note: '花蓮第2晚' },
            closeLoop: true,
            items: [
                { type: 'waypoint', place: 'tongle-bnb' },
                { type: 'drive', time: '07:30 - 09:10', text: '07:30 - 08:20 早餐、整理用品；08:35 童樂會親子民宿出發，約09:10抵達遠雄海洋公園停車。' },
                { type: 'spot', tag: '上午遊園', time: '09:30 - 17:00', place: 'farglory-oceanpark',
                  desc: '全天遊玩；11:30 - 12:20園內午餐，依當日表演時間調整。入園後先確認表演時間，可先搭纜車至高處，再由上往下遊玩。' },
                { type: 'move', time: '16:40 - 17:00', text: '伴手禮、集合、準備離園；一般營業時間為09:30 - 17:00，仍依官方當日公告為準。' },
                { type: 'stay', tag: '離園返程', time: '17:00 後', place: 'tongle-bnb', map: false, title: '返回童樂會親子民宿',
                  desc: '離開海洋公園後返回志學；18:00後於志學商圈晚餐，晚上返回民宿住宿，不繞回花蓮市區。' }
            ]
        },

        // ───────── DAY 5 ─────────
        {
            day: 5, date: '11/19（四）', title: '花蓮退房 ➔ 池上午餐 ➔ 南迴 ➔ 屏東',
            stay: { place: 'pingtung-farmhouse' },
            items: [
                { type: 'waypoint', place: 'tongle-bnb' },
                { type: 'drive', time: '07:45 - 10:15', text: '童樂會親子民宿退房出發，花蓮志學 ➔ 台東池上。' },
                { type: 'meal', tag: '上午重點', time: '10:30 - 11:30', place: 'chishang-bento',
                  desc: '提早午餐後，11:40 - 12:40 前往伯朗大道或大坡池（二選一）。' },
                { type: 'spot', tag: '池上景點（二選一）', time: '11:40 - 12:40', place: 'brown-boulevard',
                  desc: '當日僅擇一停留，地圖同時保留兩個備選標記，但主線以伯朗大道示意，避免重複繞行。' },
                { type: 'waypoint', place: 'dapo-pond', backup: true, mapName: '大坡池（備選）' },
                { type: 'brief', icon: 'route', time: '12:40 - 17:40', title: '池上 ➔ 多良 ➔ 屏東市', place: 'duoliang-rest',
                  desc: '12:40 - 14:50 池上前往太麻里／多良；14:50 - 15:20 多良短暫休息、洗手間、看海；15:20 - 17:40 前往屏東市。志學至池上約2 - 2.5小時、池上至多良約2 - 2.25小時、多良至屏東市約2 - 2.5小時。' },
                { type: 'stay', tag: '入住民宿', time: '17:40 後', place: 'pingtung-farmhouse',
                  desc: '17:40 後入住。民宿位於巷弄內，先卸行李、確認車位，再前往夜市；車位與房門口間需步行一小段。' },
                { type: 'meal', tag: '晚間備選', time: '18:30 後', place: 'pingtung-night-market',
                  desc: '18:30 後短程開車前往夜市。' }
            ]
        },

        // ───────── DAY 6 ─────────
        {
            day: 6, date: '11/20（五）', title: '屏東退房 ➔ 里港鄉第二公墓掃墓 ➔ 返回台中',
            theme: 'end',
            badge: { icon: 'house', text: '返回溫馨的家' },
            items: [
                { type: 'waypoint', place: 'pingtung-farmhouse' },
                { type: 'spot', tag: '上午景點', time: '08:40 - 10:45', place: 'ligang-cemetery',
                  desc: '08:00 屏東市鄉下人家生活體驗退房；08:00 - 08:40 前往里港鄉第二公墓，08:40 - 10:45 掃墓。' },
                { type: 'brief', icon: 'utensils', time: '11:00 - 12:00 午餐', title: '文富餛飩豬腳', place: 'wenfu-pork' },
                { type: 'drive', time: '12:15', text: '文富餛飩豬腳出發 ➔ 國道10號 ➔ 國道3號 ➔ 台中。' },
                { type: 'end', tag: '返抵台中', time: '14:30 - 15:00', place: 'taichung-end',
                  desc: '依國道車況調整休息與抵達時間。' }
            ]
        }
    ],

    // ───────── 住宿區 ─────────
    hotelsSection: {
        badge: 'Accommodations',
        title: '嚴選住宿',
        subtitle: '已選定住宿以家庭空間、停車便利與行程動線為優先考量。'
    },

    hotels: [
        {
            place: 'tianxin-bnb',
            region: '宜蘭（11/15、11/16 連住兩晚）',
            status: '已選定住宿',
            features: [
                '位於冬山鄉，設有私人停車場',
                '鄰近羅東夜市與冬山河親水公園',
                '包棟可使用寬敞烤肉區與電動麻將桌'
            ],
            nights: '11/15、11/16 連住兩晚',
            price: '依訂房確認'
        },
        {
            place: 'tongle-bnb',
            region: '花蓮（11/17、11/18 連住兩晚）',
            status: '已選定住宿',
            features: [
                '位於壽豐鄉志學東華商圈',
                '提供親子主題客房與兒童遊戲區',
                '設有電梯，可寄放行李'
            ],
            nights: '11/17、11/18，共2晚',
            price: '依訂房確認'
        },
        {
            place: 'pingtung-farmhouse',
            region: '屏東（11/19 入住1晚）',
            status: '已選定住宿',
            features: [
                '三合院老宅大厝護龍，四人房有兩張雙人床',
                '停車位數量有限，停車後需步行一小段',
                '入住後可短程開車前往屏東觀光夜市'
            ],
            nights: '11/19，共1晚',
            price: '依訂房確認'
        }
    ]
};
