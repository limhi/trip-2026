/*
 * 資料處理（不碰 DOM）：把 data/places.js 與 data/trip.js 組合成頁面需要的資料，並檢查資料是否打錯。
 */
(function (root) {
    const Trip = root.Trip = root.Trip || {};

    const CARD_TYPES = ['spot', 'meal', 'stay', 'end', 'notice'];
    const ROW_TYPES = ['drive', 'move'];
    const ALL_TYPES = [...CARD_TYPES, ...ROW_TYPES, 'brief', 'waypoint'];

    // 地點的聯絡資訊（彈窗用）；沒有 infoType 的地點沒有彈窗
    function getContact(place) {
        if (!place || !place.infoType) return null;
        const digits = place.phone ? place.phone.replace(/\D/g, '') : '';
        return {
            type: place.infoType,
            name: place.name,
            phone: place.phone,
            tel: place.tel || digits || undefined,
            phoneActionLabel: place.phoneActionLabel,
            lineLabel: place.line && place.line.label,
            lineUrl: place.line && place.line.url,
            website: place.website,
            address: place.address,
            navigationUrl: place.navigationUrl,
            bookingName: place.booking && place.booking.name,
            bookingPhone: place.booking && place.booking.phone,
            alternate: place.alternate
        };
    }

    // 某一天的地圖標記：依 items 的順序，有 place（且有座標）的項目自動成為標記
    function getMapPoints(day, places) {
        const points = [];
        day.items.forEach(item => {
            if (!item.place || item.map === false) return;
            const place = places[item.place];
            if (!place || place.lat == null || place.lng == null) return;
            points.push({
                id: item.place,
                name: item.mapName || place.name,
                type: item.backup ? 'backup' : (place.mapType || 'transport'),
                lat: place.lat,
                lng: place.lng,
                address: place.address,
                navigationUrl: place.navigationUrl,
                excludeFromRoute: !!item.backup
            });
        });
        return points;
    }

    // 檢查資料，回傳問題清單（空陣列代表沒問題）
    function validate(trip, places) {
        const errors = [];
        const needPlace = (id, where) => {
            if (!places[id]) errors.push(`${where}：找不到地點「${id}」（請檢查 data/places.js 的 id）`);
        };

        trip.days.forEach(day => {
            const dayLabel = `DAY ${day.day}`;
            if (day.stay) needPlace(day.stay.place, `${dayLabel} 住宿`);
            day.items.forEach((item, index) => {
                const where = `${dayLabel} 第 ${index + 1} 項`;
                if (!ALL_TYPES.includes(item.type)) errors.push(`${where}：不認得的類型「${item.type}」`);
                if (item.place) needPlace(item.place, where);
                if (item.type === 'waypoint' && !item.place) errors.push(`${where}：waypoint 必須指定 place`);
                if (CARD_TYPES.includes(item.type) && !item.title && !item.place) errors.push(`${where}：卡片需要 place 或 title`);
                if (item.place && places[item.place] && item.map !== false && item.type !== 'waypoint') {
                    const p = places[item.place];
                    if (p.lat == null || p.lng == null) errors.push(`${where}：地點「${item.place}」沒有座標，不會出現在地圖上`);
                }
            });
        });
        trip.hotels.forEach((hotel, index) => needPlace(hotel.place, `住宿區第 ${index + 1} 間`));
        return errors;
    }

    Trip.model = { getContact, getMapPoints, validate, CARD_TYPES, ROW_TYPES };
    if (typeof module !== 'undefined') module.exports = Trip.model;
})(typeof window !== 'undefined' ? window : globalThis);
