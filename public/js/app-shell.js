// Shared dashboard shell: sidebar + topbar, mounted into the skeleton every
// authenticated page provides:
//
//   <body data-page="machines" data-title="Machines" data-desc="...">
//     <div class="app-shell">
//       <main class="app-main" id="appMain">
//         <div class="app-content" id="appContent"> ...page content... </div>
//       </main>
//     </div>
//     <script src="/js/icons.js"></script>
//     <script src="/js/api.js"></script>
//     <script src="/js/app-shell.js"></script>
//     <script src="/js/<page>.js"></script>
//   </body>
//
// Fires an "appshell:ready" event on document with { user, subscription } once
// /api/auth/me and /api/subscription/status have both resolved, so page-specific
// scripts can wait for plan/user info instead of re-fetching it themselves.

(function () {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/auth.html';
    }

    const NAV_ITEMS = [
        { page: 'dashboard', href: '/dashboard.html', label: 'Dashboard', icon: 'grid' },
        { page: 'machines', href: '/machines.html', label: 'Machines', icon: 'cpu' },
        { page: 'leads', href: '/leads.html', label: 'IndiaMART Leads', icon: 'bar-chart' },
        { page: 'csv-upload', href: '/csv-upload.html', label: 'CSV Upload', icon: 'upload-cloud' },
        { page: 'search-machines', href: '/search-machines.html', label: 'Search Machines', icon: 'search' },
        { page: 'auto-scrape', href: '/auto-scrape.html', label: 'Auto-Scrape', icon: 'zap' },
        { page: 'payments', href: '/payments.html', label: 'Payments', icon: 'credit-card' },
        { page: 'settings', href: '/settings.html', label: 'Settings', icon: 'settings' },
        { page: 'help', href: '/help.html', label: 'Help & Support', icon: 'help-circle' },
    ];

    function initials(name) {
        if (!name) return '?';
        return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
    }

    function buildSidebar(activePage) {
        const nav = NAV_ITEMS.map((item) => `
            <a href="${item.href}" class="sidebar-link${item.page === activePage ? ' active' : ''}">
                ${svgIcon(item.icon)}<span>${item.label}</span>
                ${item.page === 'leads' ? '<span class="sidebar-badge hidden" id="leadsNavBadge"></span>' : ''}
            </a>
        `).join('');

        return `
            <aside class="app-sidebar" id="appSidebar">
                <div class="sidebar-brand">
                    <img src="/images/nexlead-logo-dark.png" alt="NexLead" class="brand-logo-img brand-logo-lg">
                </div>
                <nav class="sidebar-nav">${nav}</nav>
                <div class="sidebar-footer">
                    <div class="sidebar-user">
                        <div class="sidebar-avatar" id="sidebarAvatar">?</div>
                        <div class="sidebar-user-info">
                            <div class="sidebar-user-name" id="sidebarUserName">&nbsp;</div>
                            <div class="sidebar-user-plan" id="sidebarUserPlan">&nbsp;</div>
                        </div>
                    </div>
                    <button class="sidebar-logout" id="sidebarLogoutBtn" type="button">${svgIcon('log-out')}Logout</button>
                    <a href="https://syncnowise.com" target="_blank" rel="noopener noreferrer" class="made-by-credit sidebar-made-by">Powered by <span class="brand-logo-chip"><img src="/images/syncnowise-logo.png" alt="SyncNowise" class="brand-logo-img"></span></a>
                </div>
            </aside>
            <div class="sidebar-overlay" id="sidebarOverlay"></div>
        `;
    }

    function buildTopbar(title, desc) {
        return `
            <header class="app-topbar">
                <div class="topbar-left">
                    <button class="sidebar-toggle" id="sidebarToggleBtn" type="button" aria-label="Toggle menu">${svgIcon('menu')}</button>
                    <div class="topbar-titles">
                        <h1>${title}</h1>
                        ${desc ? `<p>${desc}</p>` : ''}
                    </div>
                </div>
                <div class="topbar-right">
                    <span class="badge badge-free topbar-plan-badge" id="topbarPlanBadge">Free</span>
                    <a href="/payments.html" class="btn btn-primary btn-sm hidden" id="topbarUpgradeBtn">${svgIcon('zap')}Upgrade</a>
                    <button id="themeToggle" class="icon-btn theme-toggle" aria-label="Toggle theme">
                        <svg class="icon icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS.sun}</svg>
                        <svg class="icon icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS.moon}</svg>
                    </button>
                </div>
            </header>
        `;
    }

    function mountShell() {
        const shellRoot = document.querySelector('.app-shell');
        const mainRoot = document.getElementById('appMain');

        if (!shellRoot || !mainRoot) {
            console.error('app-shell.js: page is missing the .app-shell / #appMain skeleton');
            return;
        }

        const body = document.body;
        const activePage = body.dataset.page || '';
        const title = body.dataset.title || 'Dashboard';
        const desc = body.dataset.desc || '';

        const sidebarWrap = document.createElement('div');
        sidebarWrap.innerHTML = buildSidebar(activePage);
        while (sidebarWrap.firstChild) {
            shellRoot.insertBefore(sidebarWrap.firstChild, mainRoot);
        }

        const topbarWrap = document.createElement('div');
        topbarWrap.innerHTML = buildTopbar(title, desc);
        mainRoot.insertBefore(topbarWrap.firstElementChild, mainRoot.firstElementChild);

        wireShellInteractions();
        loadShellData();
    }

    function wireShellInteractions() {
        const sidebar = document.getElementById('appSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const toggleBtn = document.getElementById('sidebarToggleBtn');
        const logoutBtn = document.getElementById('sidebarLogoutBtn');

        function openDrawer() {
            sidebar.classList.add('open');
            overlay.classList.add('show');
        }
        function closeDrawer() {
            sidebar.classList.remove('open');
            overlay.classList.remove('show');
        }

        toggleBtn.addEventListener('click', () => {
            sidebar.classList.contains('open') ? closeDrawer() : openDrawer();
        });
        overlay.addEventListener('click', closeDrawer);
        sidebar.querySelectorAll('.sidebar-link').forEach((link) => link.addEventListener('click', closeDrawer));

        logoutBtn.addEventListener('click', () => {
            localStorage.clear();
            window.location.href = '/auth.html';
        });
    }

    async function loadShellData() {
        let user = null;
        let subscription = null;

        try {
            const meRes = await apiCall('/auth/me');
            user = meRes.data;
        } catch (error) {
            console.error('app-shell: failed to load user', error);
            localStorage.clear();
            window.location.href = '/auth.html';
            return;
        }

        try {
            const subRes = await apiCall('/subscription/status');
            subscription = subRes.data;
        } catch (error) {
            console.error('app-shell: failed to load subscription status', error);
        }

        document.getElementById('sidebarAvatar').textContent = initials(user.name);
        document.getElementById('sidebarUserName').textContent = user.name;
        document.getElementById('sidebarUserPlan').textContent = user.isPro ? 'Pro plan' : 'Free plan';

        const topbarPlanBadge = document.getElementById('topbarPlanBadge');
        const topbarUpgradeBtn = document.getElementById('topbarUpgradeBtn');
        if (user.isPro) {
            topbarPlanBadge.innerHTML = svgIcon('star') + 'Pro';
            topbarPlanBadge.className = 'badge badge-pro topbar-plan-badge';
            topbarUpgradeBtn.classList.add('hidden');
        } else {
            topbarPlanBadge.textContent = 'Free';
            topbarPlanBadge.className = 'badge badge-free topbar-plan-badge';
            topbarUpgradeBtn.classList.remove('hidden');
        }

        document.dispatchEvent(new CustomEvent('appshell:ready', { detail: { user, subscription } }));

        checkForNewLeads();
        setInterval(checkForNewLeads, NEW_LEADS_POLL_MS);

        checkIndiamartHealth();
        setInterval(checkIndiamartHealth, NEW_LEADS_POLL_MS);
    }

    // ---- IndiaMART health notifications: a global toast (from any page) when
    // the connection hits a new error — rate-limited, session expired, or any
    // other scrape failure — so this isn't only visible if you happen to be on
    // the Auto-Scrape page. Tracked in localStorage so the same error doesn't
    // re-toast on every poll.
    const LAST_ERROR_NOTIFIED_KEY = 'nexlead_im_last_error_notified';

    async function checkIndiamartHealth() {
        let status;
        try {
            const res = await apiCall('/indiamart/status');
            status = res.data;
        } catch (error) {
            return;
        }

        if (!status || !status.connected) return;

        const lastNotifiedError = localStorage.getItem(LAST_ERROR_NOTIFIED_KEY) || '';

        if (status.lastError && status.lastError !== lastNotifiedError) {
            const prefix = status.lastErrorCode === 'RATE_LIMITED' ? 'IndiaMART rate-limited your account'
                : status.lastErrorCode === 'TOKEN_EXPIRED' ? 'IndiaMART session expired'
                : status.lastErrorCode === 'FETCH_FAILED' ? 'IndiaMART session looks stale'
                : 'IndiaMART scrape issue';
            showToast(`${prefix}: ${status.lastError}`, 'error');
            localStorage.setItem(LAST_ERROR_NOTIFIED_KEY, status.lastError);
        } else if (!status.lastError && lastNotifiedError) {
            // A clean run since the last error — clear the memory so the same
            // message would notify again if it recurs later.
            localStorage.removeItem(LAST_ERROR_NOTIFIED_KEY);
        }
    }

    // ---- New-lead notifications: a badge/count on the "IndiaMART Leads" nav
    // link plus a toast when leads.scrapedAt values appear that we haven't
    // seen before. Purely client-side (localStorage) — there's no "read"
    // flag on the backend, so this only tracks what THIS browser has seen.
    const NEW_LEADS_POLL_MS = 20000;
    const SEEN_KEY = 'nexlead_leads_seen_at';
    const NOTIFIED_KEY = 'nexlead_leads_notified_at';

    async function checkForNewLeads() {
        let leads;
        try {
            const res = await apiCall('/indiamart/leads');
            leads = res.data || [];
        } catch (error) {
            return; // stay quiet — this is a background nicety, not core functionality
        }

        if (!leads.length) return;

        let seenAt = Number(localStorage.getItem(SEEN_KEY));
        let notifiedAt = Number(localStorage.getItem(NOTIFIED_KEY));

        // First time this browser has ever checked: baseline to "now" so the
        // existing backlog of leads doesn't all show up as "new" at once.
        if (!seenAt) {
            const now = Date.now();
            localStorage.setItem(SEEN_KEY, String(now));
            localStorage.setItem(NOTIFIED_KEY, String(now));
            return;
        }

        const newestScrapedAt = Math.max(...leads.map((l) => (l.scrapedAt ? new Date(l.scrapedAt).getTime() : 0)));

        // On the Leads page itself, treat everything currently visible as read.
        if (document.body.dataset.page === 'leads') {
            seenAt = Date.now();
            localStorage.setItem(SEEN_KEY, String(seenAt));
        }

        const unseenCount = leads.filter((l) => l.scrapedAt && new Date(l.scrapedAt).getTime() > seenAt).length;
        renderLeadsBadge(unseenCount);

        const unnotified = notifiedAt ? leads.filter((l) => l.scrapedAt && new Date(l.scrapedAt).getTime() > notifiedAt) : [];
        if (unnotified.length > 0) {
            showToast(`${unnotified.length} new IndiaMART lead${unnotified.length === 1 ? '' : 's'} came in`, 'success');
        }
        if (newestScrapedAt > notifiedAt) {
            localStorage.setItem(NOTIFIED_KEY, String(newestScrapedAt));
        }
    }

    function renderLeadsBadge(count) {
        const badge = document.getElementById('leadsNavBadge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // This script is always a plain synchronous <script> placed after the page's
    // .app-shell/#appMain skeleton (see the contract at the top of this file), so
    // those nodes already exist — mount immediately rather than waiting for
    // DOMContentLoaded. Deferring to DOMContentLoaded would run this AFTER
    // theme.js's own DOMContentLoaded listener (registered earlier, in <head>),
    // which looks up #themeToggle once and would miss the button entirely since
    // it wouldn't exist yet.
    mountShell();
})();
