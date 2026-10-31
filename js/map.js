/*
 * 每日行程地圖（Leaflet）。標記由行程順序自動產生（見 js/model.js 的 getMapPoints）。
 * 想改標記顏色或圖例，改下面的 MAP_TYPES。
 */
(function (root) {
    const Trip = root.Trip = root.Trip || {};

    const MAP_TYPES = {
        attraction: { label: '景點', color: '#2563eb', icon: 'location-dot' },
        hotel: { label: '住宿', color: '#059669', icon: 'bed' },
        food: { label: '用餐', color: '#d97706', icon: 'utensils' },
        backup: { label: '備案', color: '#7c3aed', icon: 'location-dot' },
        other: { label: '其他行程', color: '#db2777', icon: 'location-dot' },
        transport: { label: '起訖點', color: '#475569', icon: 'flag' }
    };
    Trip.MAP_TYPES = MAP_TYPES;   // 左邊卡片的編號圓點也用同一組顏色

    // 道路路線（有路線快取時）的顏色
    const ROAD_COLOR = '#334155';
    const OVER_COLOR = '#dc2626';

    // 路線快取：routeCtx = { routes: window.TRIP_ROUTES, site }。沒有快取時回傳 null，地圖維持灰色虛線
    function dayRouteInfo(day, places, routeCtx) {
        if (!routeCtx) return null;
        const info = Trip.routeView.dayRoutes(day, places, routeCtx.routes, routeCtx.site);
        return info.hasCache ? info : null;
    }

    // 路線座標（routes-geo.js）較大，第一次展開有快取的地圖時才動態載入（方式同 js/guides.js）
    const GEO_SRC = 'data/routes-geo.js';
    let geoLoading = null;
    function loadGeo() {
        if (!geoLoading) {
            geoLoading = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = GEO_SRC;
                script.onload = () => (root.TRIP_ROUTES_GEO ? resolve(root.TRIP_ROUTES_GEO) : reject(new Error('TRIP_ROUTES_GEO missing')));
                script.onerror = () => { geoLoading = null; reject(new Error('routes-geo load failed')); };
                document.head.appendChild(script);
            });
        }
        return geoLoading;
    }

    // 每天卡片裡的地圖面板（預設收合）
    Trip.mapPanelHtml = function (day, places, routeCtx) {
        const esc = Trip.blocks.esc;
        const info = dayRouteInfo(day, places, routeCtx);
        const note = info
            ? `標記數字與左邊行程的編號相同（無數字的圓點為不列入行程的起點）；實線為道路路線，虛線為尚未計算的順序示意。路段中間標示預估時間與距離，紅色表示單段超過 ${Trip.model.formatHM(info.max)}。${esc(info.factorNote)}，實際請以導航為準，可點標記開啟導航。`
            : '標記數字與左邊行程的編號相同（無數字的圓點為不列入行程的起點）；連線僅為順序示意，實際道路請點標記後開啟導航。';
        const stayPlace = day.stay && places[day.stay.place];
        const stayButton = stayPlace && stayPlace.infoType
            ? `<button type="button" class="map-stay-button" data-place="${esc(day.stay.place)}" aria-label="查看${esc(stayPlace.name)}的住宿資訊與導航"><i class="fa-solid fa-bed"></i><span>今日住宿：${esc(stayPlace.name)}</span><i class="fa-solid fa-chevron-right"></i></button>`
            : '';
        return `<aside class="day-map-panel" id="day-map-panel-${day.day}" hidden>
    <div class="flex items-center justify-between gap-3">
        <div>
            <span class="text-xs font-black uppercase tracking-wider text-blue-600">Day ${day.day} Map</span>
            <h4 class="text-base font-black text-slate-900">當日行程地圖</h4>
        </div>
        <span class="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-500 shadow-sm"><i class="fa-solid fa-magnifying-glass-plus mr-1"></i>可縮放拖曳</span>
    </div>
    ${stayButton}
    <div class="day-map-legend">
        ${Object.values(MAP_TYPES).map(item => `<span><i style="background:${item.color}"></i>${item.label}</span>`).join('')}
    </div>
    <div id="day-map-${day.day}" class="day-map" aria-label="第 ${day.day} 天互動行程地圖"></div>
    <p class="mt-2 text-[10px] leading-relaxed text-slate-500">${note}</p>
</aside>`;
    };

    function createMarkerIcon(point) {
        const style = MAP_TYPES[point.type] || MAP_TYPES.transport;
        const content = point.number == null ? `<i class="fa-solid fa-${style.icon}"></i>` : point.label;
        return L.divIcon({
            className: '',
            html: `<div class="map-number-marker" style="background:${style.color}">${content}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -16]
        });
    }

    // 路段中間的「時間・距離」標示（不攔截點擊，標記仍可點）
    // 時間一律標示「預估」與係數（短形式可見，完整說明放 title）
    function createLegLabel(text, over, info) {
        const esc = Trip.blocks.esc;
        return L.divIcon({
            className: 'map-leg-label-icon',
            html: `<div class="map-leg-label${over ? ' map-leg-label-over' : ''}" title="${esc(info.factorNote)}">${esc(text)} <span class="map-leg-factor">預估 ×${esc(info.factor)}</span></div>`,
            iconSize: [0, 0]
        });
    }

    // 畫路線：有快取的段落畫道路路線（geo 還沒載入或沒有該段時退回虛線），並在中點標示時間距離；
    // 完全沒有快取時維持原本的單一灰色虛線（有擇一組時逐段畫，路段由 places 算出）。可重複呼叫（geo 載入完成後重畫）。
    function drawRoutes(group, day, points, info, geo, places) {
        group.clearLayers();
        const dashed = { color: '#475569', weight: 3, opacity: .65, dashArray: '7 7' };
        if (!info) {
            // 有擇一組時分岔再合流，逐段畫虛線；沒有時維持單一條虛線
            if (Trip.model.getAltGroups(day).length) {
                Trip.model.getLegs(day, places).forEach(leg => L.polyline([[leg.from.lat, leg.from.lng], [leg.to.lat, leg.to.lng]], dashed).addTo(group));
                return;
            }
            const routePoints = points.filter(point => !point.excludeFromRoute).map(point => [point.lat, point.lng]);
            if (day.closeLoop && routePoints.length > 1) routePoints.push(routePoints[0]);
            L.polyline(routePoints, dashed).addTo(group);
            return;
        }
        info.legs.forEach(item => {
            const { leg } = item;
            const line = item.cached && geo && geo[leg.key] ? Trip.routeView.decodePolyline(geo[leg.key]) : [];
            const color = item.over ? OVER_COLOR : ROAD_COLOR;
            if (line.length > 1) L.polyline(line, { color, weight: 4, opacity: .85 }).addTo(group);
            else L.polyline([[leg.from.lat, leg.from.lng], [leg.to.lat, leg.to.lng]], item.over ? { ...dashed, color: OVER_COLOR, opacity: .85 } : dashed).addTo(group);
            if (item.cached) {
                const at = Trip.routeView.midpoint(line, leg.from, leg.to);
                L.marker(at, { icon: createLegLabel(item.text, item.over, info), interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(group);
            }
        });
    }

    function renderDayMap(mapElement, day, points, info, places) {
        const esc = Trip.blocks.esc;
        const map = L.map(mapElement, { scrollWheelZoom: false, tap: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        const bounds = [];
        points.forEach(point => {
            const latLng = [point.lat, point.lng];
            bounds.push(latLng);
            const addressLine = point.address ? `<div class="text-xs text-slate-600">${esc(point.address)}</div>` : '';
            const navTarget = point.navigationUrl || (point.address ? Trip.mapUrl(point.address) : '');
            const navLink = navTarget ? `<a class="map-popup-link" href="${navTarget}" target="_blank" rel="noopener"><i class="fa-solid fa-location-arrow"></i>開啟導航</a>` : '';
            const numberPrefix = point.number == null ? '' : `${point.label}. `;
            L.marker(latLng, { icon: createMarkerIcon(point) })
                .addTo(map)
                .bindPopup(`<div class="map-popup-name">${numberPrefix}${esc(point.name)}</div>${addressLine}${navLink}`);
        });

        const routeLayer = L.layerGroup().addTo(map);
        drawRoutes(routeLayer, day, points, info, root.TRIP_ROUTES_GEO, places);
        // 載入失敗就維持現狀（虛線與中點標示），不顯示任何錯誤
        if (info && !root.TRIP_ROUTES_GEO) loadGeo().then(geo => drawRoutes(routeLayer, day, points, info, geo, places)).catch(() => {});
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
        L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
        setTimeout(() => map.invalidateSize(), 0);
        return map;
    }

    // 綁定某一天的「展開地圖」按鈕
    Trip.bindDayMap = function (dayEl, day, places, routeCtx) {
        const toggleButton = dayEl.querySelector('.map-toggle-button');
        const mapPanel = dayEl.querySelector('.day-map-panel');
        const layout = dayEl.querySelector('.day-body-grid');
        const mapElement = mapPanel.querySelector('.day-map');
        const points = Trip.model.getMapPoints(day, places);

        if (typeof L === 'undefined' || points.length === 0) {
            toggleButton.remove();
            mapPanel.remove();
            return;
        }

        let leafletMap = null;
        toggleButton.addEventListener('click', () => {
            const willExpand = mapPanel.hidden;
            mapPanel.hidden = !willExpand;
            layout.classList.toggle('map-expanded', willExpand);
            toggleButton.setAttribute('aria-expanded', String(willExpand));
            toggleButton.querySelector('span').textContent = willExpand ? '收合地圖' : '展開地圖';
            toggleButton.querySelector('i').className = willExpand ? 'fa-solid fa-compress' : 'fa-solid fa-map-location-dot';

            if (willExpand) {
                requestAnimationFrame(() => {
                    if (!leafletMap) {
                        leafletMap = renderDayMap(mapElement, day, points, dayRouteInfo(day, places, routeCtx), places);
                    } else {
                        leafletMap.invalidateSize();
                    }
                });
            }
        });
    };
})(window);
