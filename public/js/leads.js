// IndiaMART Leads page — ported from old dashboard.js loadIndiamartLeads /
// renderIndiamartLeads / CSV export (lines ~962-1053), plus client-side
// search + sort layered on top of the already-loaded leads array.
// Endpoint: GET /api/indiamart/leads -> { success, count, data: [...] }

(function () {
    let indiamartLeads = [];
    let filteredLeads = [];
    let sortKey = 'scrapedAt';
    let sortDir = 'desc';
    let searchTerm = '';
    let sourceFilter = 'all'; // 'all' | 'app' (unlocked by this app's own scrape) | 'synced' (unlocked elsewhere, picked up via Lead Manager sync)

    const loadingEl = document.getElementById('leadsLoading');
    const tableWrap = document.getElementById('leadsTableWrap');
    const tbody = document.getElementById('leadsTableBody');
    const emptyState = document.getElementById('leadsEmptyState');
    const noResultsState = document.getElementById('leadsNoResultsState');
    const countBadge = document.getElementById('leadsCountBadge');
    const searchInput = document.getElementById('leadSearchInput');
    const sourceFilterSelect = document.getElementById('leadSourceFilter');

    document.getElementById('searchIcon').innerHTML = svgIcon('search');
    document.getElementById('exportIcon').innerHTML = svgIcon('download');
    document.getElementById('leadsEmptyIcon').innerHTML = svgIcon('bar-chart', 'empty-icon');
    document.getElementById('leadsNoResultsIcon').innerHTML = svgIcon('search', 'empty-icon');

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    // offerId prefixed "cl_" means this row came from the Lead Manager contact
    // sync (someone/something else already consumed the BuyLead — the website
    // directly, another session); anything else was unlocked by this app's own
    // auto-scrape or manual "Scrape Now".
    function isAppUnlocked(lead) {
        return !!(lead.offerId && !lead.offerId.startsWith('cl_'));
    }

    function sourceIconHtml(lead) {
        return isAppUnlocked(lead)
            ? `<span data-tooltip="Unlocked by NexLead" style="color:var(--primary);display:inline-flex;">${svgIcon('zap')}</span>`
            : `<span data-tooltip="Synced from IndiaMART (unlocked elsewhere)" style="color:var(--text-muted);display:inline-flex;">${svgIcon('refresh-cw')}</span>`;
    }

    function csvEscape(value) {
        const str = value == null ? '' : String(value);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }

    async function loadIndiamartLeads() {
        loadingEl.classList.remove('hidden');
        tableWrap.classList.add('hidden');
        emptyState.classList.add('hidden');
        noResultsState.classList.add('hidden');
        try {
            const res = await apiCall('/indiamart/leads');
            indiamartLeads = res.data || [];
            applyFilters();
        } catch (error) {
            console.error('Error loading IndiaMART leads:', error);
            showToast(error.message, 'error');
            indiamartLeads = [];
            applyFilters();
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    function applyFilters() {
        const term = searchTerm.trim().toLowerCase();

        filteredLeads = indiamartLeads.filter((lead) => {
            if (sourceFilter === 'app' && !isAppUnlocked(lead)) return false;
            if (sourceFilter === 'synced' && isAppUnlocked(lead)) return false;
            if (!term) return true;
            const haystack = [lead.title, lead.buyerCompany, lead.buyerCity].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(term);
        });

        filteredLeads.sort((a, b) => {
            let av = a[sortKey];
            let bv = b[sortKey];
            if (sortKey === 'scrapedAt') {
                av = av ? new Date(av).getTime() : 0;
                bv = bv ? new Date(bv).getTime() : 0;
            } else {
                av = (av || '').toString().toLowerCase();
                bv = (bv || '').toString().toLowerCase();
            }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        renderIndiamartLeads();
    }

    function renderIndiamartLeads() {
        const sourceScoped = sourceFilter === 'all'
            ? indiamartLeads
            : indiamartLeads.filter((l) => (sourceFilter === 'app' ? isAppUnlocked(l) : !isAppUnlocked(l)));
        const unlockedCount = sourceScoped.filter((l) => l.unlocked).length;
        countBadge.innerHTML = `<strong>${sourceScoped.length}</strong> ${sourceFilter === 'all' ? 'total' : 'shown'} &middot; <strong>${unlockedCount}</strong> unlocked`;

        if (!indiamartLeads.length) {
            tableWrap.classList.add('hidden');
            noResultsState.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        if (!filteredLeads.length) {
            tableWrap.classList.add('hidden');
            noResultsState.classList.remove('hidden');
            return;
        }

        noResultsState.classList.add('hidden');
        tableWrap.classList.remove('hidden');

        tbody.innerHTML = filteredLeads.map((lead, i) => {
            const cityState = [lead.buyerCity, lead.buyerState].filter(Boolean).join(', ');
            const mobile = lead.buyerMobile ? `+${lead.buyerMobileCountry || '91'} ${lead.buyerMobile}` : '-';
            return `
            <tr class="lead-row" data-index="${i}" style="cursor:pointer;">
                <td>${sourceIconHtml(lead)}</td>
                <td>${escapeHtml(lead.title || '-')}</td>
                <td>${lead.unlocked ? escapeHtml(lead.buyerName || '-') : `<span class="lead-locked">${svgIcon('lock')}Locked</span>`}</td>
                <td>${lead.unlocked ? escapeHtml(lead.buyerEmail || '-') : '-'}</td>
                <td>${lead.unlocked ? escapeHtml(mobile) : '-'}</td>
                <td>${escapeHtml(cityState || '-')}</td>
                <td>${lead.unlocked ? escapeHtml(lead.buyerCompany || 'Not provided') : '-'}</td>
                <td>${lead.unlocked ? escapeHtml(lead.memberSince || '-') : '-'}</td>
                <td>${lead.unlocked ? (lead.creditsSpent ?? '-') : '-'}</td>
                <td>${escapeHtml(lead.postedAt || '-')}</td>
                <td>${lead.scrapedAt ? new Date(lead.scrapedAt).toLocaleString() : '-'}</td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('tr.lead-row').forEach((row) => {
            row.addEventListener('click', () => openLeadDetail(filteredLeads[Number(row.dataset.index)]));
        });
    }

    // ===== Lead detail modal =====
    const leadDetailModal = document.getElementById('leadDetailModal');
    const leadDetailBody = document.getElementById('leadDetailBody');
    document.getElementById('leadDetailCloseIcon').innerHTML = svgIcon('x');

    function detailRow(label, value) {
        return `<div class="detail-row"><span class="detail-row-label">${escapeHtml(label)}</span><span class="detail-row-value">${value}</span></div>`;
    }

    function openLeadDetail(lead) {
        if (!lead) return;

        const cityState = [lead.buyerCity, lead.buyerState, lead.buyerCountry].filter(Boolean).join(', ');
        const mobile = lead.buyerMobile ? `+${lead.buyerMobileCountry || '91'} ${lead.buyerMobile}` : null;
        const lockedNote = !lead.unlocked
            ? `<div class="empty-state" style="padding: 1rem 0 1.25rem;"><p style="margin:0;">${svgIcon('lock')} Buyer contact details are locked. Unlock this lead from the Auto-Scrape page to reveal them.</p></div>`
            : '';

        document.getElementById('leadDetailTitle').textContent = lead.title || 'Lead Details';

        leadDetailBody.innerHTML = `
            ${lockedNote}
            ${detailRow('Product', escapeHtml(lead.title || '-'))}
            ${lead.category ? detailRow('Category', escapeHtml(lead.category)) : ''}
            ${lead.approxOrderValue ? detailRow('Approx. order value', escapeHtml(lead.approxOrderValue)) : ''}
            ${detailRow('Status', lead.unlocked ? `<span class="status-pill status-active">Unlocked</span>` : `<span class="status-pill status-stopped">Locked</span>`)}
            ${detailRow('Source', isAppUnlocked(lead) ? `${svgIcon('zap')} Unlocked by NexLead` : `${svgIcon('refresh-cw')} Synced from IndiaMART`)}
            ${lead.unlocked ? detailRow('Buyer name', escapeHtml(lead.buyerName || '-')) : ''}
            ${lead.unlocked ? detailRow('Company', escapeHtml(lead.buyerCompany || 'Not provided')) : ''}
            ${lead.unlocked ? detailRow('Email', escapeHtml(lead.buyerEmail || '-')) : ''}
            ${lead.unlocked && mobile ? detailRow('Mobile', escapeHtml(mobile)) : ''}
            ${lead.unlocked && cityState ? detailRow('Location', escapeHtml(cityState)) : ''}
            ${lead.unlocked && lead.memberSince ? detailRow('IndiaMART member since', escapeHtml(lead.memberSince)) : ''}
            ${lead.unlocked ? detailRow('Credits spent', String(lead.creditsSpent ?? '-')) : ''}
            ${lead.postedAt ? detailRow('Posted on IndiaMART', escapeHtml(lead.postedAt)) : ''}
            ${detailRow('Scraped at', lead.scrapedAt ? new Date(lead.scrapedAt).toLocaleString() : '-')}
        `;

        leadDetailModal.classList.remove('hidden');
    }

    function closeLeadDetail() {
        leadDetailModal.classList.add('hidden');
    }

    document.getElementById('leadDetailCloseBtn').addEventListener('click', closeLeadDetail);
    leadDetailModal.addEventListener('click', (e) => {
        if (e.target === leadDetailModal) closeLeadDetail();
    });

    searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        applyFilters();
    });

    sourceFilterSelect.addEventListener('change', (e) => {
        sourceFilter = e.target.value;
        applyFilters();
    });

    // Columns holding a date/time value should sort newest-first the moment
    // they're selected — an "ascending" first click on a time column (oldest
    // on top) reads as broken, since "recent leads on top" is the whole point
    // of a time column. Text columns keep the conventional A-Z first click.
    const DATE_SORT_KEYS = new Set(['scrapedAt']);

    function updateSortHeaderState() {
        document.querySelectorAll('th.sortable').forEach((el) => {
            const isActive = el.dataset.sort === sortKey;
            el.classList.toggle('active', isActive);
            el.classList.toggle('sort-asc', isActive && sortDir === 'asc');
        });
    }

    document.querySelectorAll('th.sortable').forEach((th) => {
        th.innerHTML = `${th.textContent}<span class="sort-chevron">${svgIcon('chevron-down')}</span>`;
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (sortKey === key) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortKey = key;
                sortDir = DATE_SORT_KEYS.has(key) ? 'desc' : 'asc';
            }
            updateSortHeaderState();
            applyFilters();
        });
    });

    updateSortHeaderState();

    document.getElementById('exportLeadsBtn').addEventListener('click', () => {
        if (!filteredLeads.length) {
            showToast('No IndiaMART leads to export yet', 'info');
            return;
        }

        const headers = ['Product', 'Buyer Name', 'Company', 'Email', 'Mobile', 'City', 'State', 'Country', 'Member Since', 'Order Value', 'Category', 'Credits Spent', 'Unlocked', 'Posted On', 'Scraped At'];
        const rows = filteredLeads.map((lead) => [
            lead.title,
            lead.buyerName,
            lead.buyerCompany || 'Not provided',
            lead.buyerEmail,
            lead.buyerMobile ? `+${lead.buyerMobileCountry || '91'} ${lead.buyerMobile}` : '',
            lead.buyerCity,
            lead.buyerState,
            lead.buyerCountry,
            lead.memberSince,
            lead.approxOrderValue,
            lead.category,
            lead.creditsSpent,
            lead.unlocked ? 'Yes' : 'No',
            lead.postedAt,
            lead.scrapedAt ? new Date(lead.scrapedAt).toLocaleString() : '',
        ]);

        const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `indiamart-leads-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast('IndiaMART leads exported', 'success');
    });

    loadIndiamartLeads();
})();
