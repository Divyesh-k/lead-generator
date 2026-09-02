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

    const loadingEl = document.getElementById('leadsLoading');
    const tableWrap = document.getElementById('leadsTableWrap');
    const tbody = document.getElementById('leadsTableBody');
    const emptyState = document.getElementById('leadsEmptyState');
    const noResultsState = document.getElementById('leadsNoResultsState');
    const countBadge = document.getElementById('leadsCountBadge');
    const searchInput = document.getElementById('leadSearchInput');

    document.getElementById('searchIcon').innerHTML = svgIcon('search');
    document.getElementById('exportIcon').innerHTML = svgIcon('download');
    document.getElementById('leadsEmptyIcon').innerHTML = svgIcon('bar-chart', 'empty-icon');
    document.getElementById('leadsNoResultsIcon').innerHTML = svgIcon('search', 'empty-icon');

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
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
        filteredLeads = !term
            ? indiamartLeads.slice()
            : indiamartLeads.filter((lead) => {
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
        const unlockedCount = indiamartLeads.filter((l) => l.unlocked).length;
        countBadge.innerHTML = `<strong>${indiamartLeads.length}</strong> total &middot; <strong>${unlockedCount}</strong> unlocked`;

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

        tbody.innerHTML = filteredLeads.map((lead) => {
            const cityState = [lead.buyerCity, lead.buyerState].filter(Boolean).join(', ');
            const mobile = lead.buyerMobile ? `+${lead.buyerMobileCountry || '91'} ${lead.buyerMobile}` : '-';
            return `
            <tr>
                <td>${escapeHtml(lead.title || '-')}</td>
                <td>${lead.unlocked ? escapeHtml(lead.buyerName || '-') : `<span class="lead-locked">${svgIcon('lock')}Locked</span>`}</td>
                <td>${lead.unlocked ? escapeHtml(lead.buyerEmail || '-') : '-'}</td>
                <td>${lead.unlocked ? escapeHtml(mobile) : '-'}</td>
                <td>${escapeHtml(cityState || '-')}</td>
                <td>${lead.unlocked ? escapeHtml(lead.buyerCompany || 'Not provided') : '-'}</td>
                <td>${lead.unlocked ? escapeHtml(lead.memberSince || '-') : '-'}</td>
                <td>${lead.unlocked ? lead.creditsSpent : '-'}</td>
                <td>${lead.scrapedAt ? new Date(lead.scrapedAt).toLocaleString() : '-'}</td>
            </tr>`;
        }).join('');
    }

    searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        applyFilters();
    });

    document.querySelectorAll('th.sortable').forEach((th) => {
        th.innerHTML = `${th.textContent}${svgIcon('chevron-down')}`;
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (sortKey === key) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortKey = key;
                sortDir = 'asc';
            }
            document.querySelectorAll('th.sortable').forEach((el) => el.classList.remove('active'));
            th.classList.add('active');
            applyFilters();
        });
    });

    document.getElementById('exportLeadsBtn').addEventListener('click', () => {
        if (!indiamartLeads.length) {
            showToast('No IndiaMART leads to export yet', 'info');
            return;
        }

        const headers = ['Product', 'Buyer Name', 'Company', 'Email', 'Mobile', 'City', 'State', 'Country', 'Member Since', 'Order Value', 'Category', 'Credits Spent', 'Unlocked', 'Scraped At'];
        const rows = indiamartLeads.map((lead) => [
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
