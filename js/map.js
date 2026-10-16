/*
 * 每日行程地圖（Leaflet）。標記由行程順序自動產生（見 js/model.js 的 getMapPoints）。
 * 想改標記顏色或圖例，改下面的 MAP_TYPES。
 */
(function (root) {
    const Trip = root.Trip = root.Trip || {};

    const MAP_TYPES = {
        attraction: { label: '景點', color: '#2563eb' },
        hotel: { label: '住宿', color: '#059669' },
        food: { label: '用餐', color: '#d97706' },
        backup: { label: '備案', color: '#7c3aed' },
        other: { label: '其他行程', color: '#db2777' },
        transport: { label: '起訖點', color: '#475569' }
    };

    // 每天卡片裡的地圖面板（預設收合）
    Trip.mapPanelHtml = function (day) {
        return `<aside class="day-map-panel" id="day-map-panel-${day.day}" hidden>
    <div class="flex items-center justify-between gap-3">
        <div>
            <span class="text-xs font-black uppercase tracking-wider text-blue-600">Day ${day.day} Map</span>
            <h4 class="text-base font-black text-slate-900">當日行程地圖</h4>
        </div>
        <span class="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-500 shadow-sm"><i class="fa-solid fa-magnifying-glass-plus mr-1"></i>可縮放拖曳</span>
    </div>
    <div class="day-map-legend">
        ${Object.values(MAP_TYPES).map(item => `<span><i style="background:${item.color}"></i>${item.label}</span>`).join('')}
    </div>
    <div id="day-map-${day.day}" class="day-map" aria-label="第 ${day.day} 天互動行程地圖"></div>
    <p class="mt-2 text-[10px] leading-relaxed text-slate-500">標記數字為行程順序；連線僅為順序示意，實際道路請點標記後開啟導航。</p>
</aside>`;
    };

    function createMarkerIcon(point, index) {
        const style = MAP_TYPES[point.type] || MAP_TYPES.transport;
        return L.divIcon({
            className: '',
            html: `<div class="map-number-marker" style="background:${style.color}">${index + 1}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -16]
        });
    }

    function renderDayMap(mapElement, day, points) {
        const esc = Trip.blocks.esc;
        const map = L.map(mapElement, { scrollWheelZoom: false, tap: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        const bounds = [];
        points.forEach((point, index) => {
            const latLng = [point.lat, point.lng];
            bounds.push(latLng);
            const addressLine = point.address ? `<div class="text-xs text-slate-600">${esc(point.address)}</div>` : '';
            const navTarget = point.navigationUrl || (point.address ? Trip.mapUrl(point.address) : '');
            const navLink = navTarget ? `<a class="map-popup-link" href="${navTarget}" target="_blank" rel="noopener"><i class="fa-solid fa-location-arrow"></i>開啟導航</a>` : '';
            L.marker(latLng, { icon: createMarkerIcon(point, index) })
                .addTo(map)
                .bindPopup(`<div class="map-popup-name">${index + 1}. ${esc(point.name)}</div>${addressLine}${navLink}`);
        });

        const routePoints = points.filter(point => !point.excludeFromRoute).map(point => [point.lat, point.lng]);
        if (day.closeLoop && routePoints.length > 1) routePoints.push(routePoints[0]);
        L.polyline(routePoints, { color: '#475569', weight: 3, opacity: .65, dashArray: '7 7' }).addTo(map);
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
        L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
        setTimeout(() => map.invalidateSize(), 0);
        return map;
    }

    // 綁定某一天的「展開地圖」按鈕
    Trip.bindDayMap = function (dayEl, day, places) {
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
                        leafletMap = renderDayMap(mapElement, day, points);
                    } else {
                        leafletMap.invalidateSize();
                    }
                });
            }
        });
    };
})(window);
