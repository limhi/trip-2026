/*
 * 聯絡與導航彈窗：點擊有 data-place 的卡片時開啟，內容來自 data/places.js。
 * 彈窗的 HTML 骨架在 index.html（#contact-modal）。
 */
(function (root) {
    const Trip = root.Trip = root.Trip || {};

    const mapUrl = address => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    const actionLink = (href, icon, label, classes) =>
        `<a class="contact-action ${classes}" href="${href}" target="_blank" rel="noopener"><i class="${icon}"></i>${label}</a>`;

    Trip.mapUrl = mapUrl;

    Trip.initModal = function (places) {
        const modal = document.getElementById('contact-modal');
        const modalTitle = document.getElementById('contact-modal-title');
        const modalType = document.getElementById('contact-modal-type');
        const bookingDetails = document.getElementById('booking-details');
        const contactActions = document.getElementById('contact-actions');
        const alternatePlace = document.getElementById('alternate-place');
        let lastFocusedCard = null;

        function openContactModal(placeId, card) {
            const info = Trip.model.getContact(places[placeId]);
            if (!info) return;
            lastFocusedCard = card;
            modalTitle.textContent = info.name;
            modalType.textContent = info.type;
            document.getElementById('contact-phone').textContent = info.phone || '未提供';
            document.getElementById('contact-line').textContent = info.lineLabel || '未提供官方帳號';
            document.getElementById('contact-address').textContent = info.address || '';

            if (info.bookingName !== undefined) {
                bookingDetails.classList.remove('hidden');
                document.getElementById('booking-name').textContent = info.bookingName;
                document.getElementById('booking-phone').textContent = info.bookingPhone;
            } else {
                bookingDetails.classList.add('hidden');
            }

            const actions = [];
            if (info.tel) actions.push(actionLink(`tel:${info.tel}`, 'fa-solid fa-phone', info.phoneActionLabel || '立即撥號', 'bg-blue-600 text-white'));
            if (info.lineUrl) actions.push(actionLink(info.lineUrl, 'fa-brands fa-line', '開啟 LINE', 'bg-emerald-500 text-white'));
            if (info.website) actions.push(actionLink(info.website, 'fa-solid fa-globe', '官方網站', 'bg-slate-700 text-white'));
            actions.push(actionLink(info.navigationUrl || mapUrl(info.address), 'fa-solid fa-location-arrow', '開始導航', 'bg-rose-600 text-white'));
            contactActions.innerHTML = actions.join('');

            if (info.alternate) {
                const alt = info.alternate;
                const esc = Trip.blocks.esc;
                alternatePlace.classList.remove('hidden');
                alternatePlace.innerHTML = `<h3 class="font-black text-slate-900">${esc(alt.name)}</h3><p class="mt-2 text-sm text-slate-600">${esc(alt.phone)}｜${esc(alt.address)}</p><div class="mt-3 grid grid-cols-2 gap-2">${actionLink(`tel:${alt.tel}`, 'fa-solid fa-phone', '撥號', 'bg-blue-50 text-blue-700')}${actionLink(mapUrl(alt.address), 'fa-solid fa-location-arrow', '導航', 'bg-rose-50 text-rose-700')}</div>`;
            } else {
                alternatePlace.classList.add('hidden');
                alternatePlace.innerHTML = '';
            }

            modal.hidden = false;
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
            document.getElementById('contact-modal-close').focus();
        }

        function closeContactModal() {
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
            if (lastFocusedCard) lastFocusedCard.focus();
        }

        // 事件委派：行程與住宿區的卡片都靠 data-place 辨識
        ['itinerary', 'hotels'].forEach(sectionId => {
            const section = document.getElementById(sectionId);
            section.addEventListener('click', event => {
                const card = event.target.closest('[data-place]');
                if (!card) return;
                // 卡片裡的連結與按鈕照常運作；card 本身是按鈕（住宿捷徑）時則開啟彈窗
                if (card.tagName !== 'BUTTON' && event.target.closest('a, button')) return;
                openContactModal(card.dataset.place, card);
            });
            section.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                const card = event.target.closest('[data-place]');
                if (card && card === event.target && card.tagName !== 'BUTTON') {
                    event.preventDefault();
                    openContactModal(card.dataset.place, card);
                }
            });
        });

        document.getElementById('contact-modal-close').addEventListener('click', closeContactModal);
        document.getElementById('contact-modal-backdrop').addEventListener('click', closeContactModal);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !modal.hidden) closeContactModal();
        });
    };
})(window);
