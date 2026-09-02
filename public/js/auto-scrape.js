// Auto-Scrape page — IndiaMART connect/disconnect/scrape + auto-scrape schedule.
// Ported from the old dashboard.js indiamart* functions (lines ~882-1126), same
// endpoints/payloads, restyled to the new app-shell components.

let imStatus = null;
let imPollInterval = null; // 15s background refresh while this page is open
let imConnectPollInterval = null; // 3s poll while the connect modal is open

const imStatusCard = document.getElementById('imStatusCard');
const autoScrapeSection = document.getElementById('autoScrapeSection');
const autoScrapeRunning = document.getElementById('autoScrapeRunning');
const autoScrapeRunningDesc = document.getElementById('autoScrapeRunningDesc');
const autoScrapeForm = document.getElementById('autoScrapeForm');

async function loadImStatus() {
    try {
        const res = await apiCall('/indiamart/status');
        imStatus = res.data;
        renderImStatus();
    } catch (error) {
        console.error('Error loading IndiaMART status:', error);
        imStatusCard.innerHTML = `
            <div class="error-state">
                <div class="empty-icon">${svgIcon('alert-triangle')}</div>
                <h3>Couldn't load IndiaMART status</h3>
                <p>${escapeHtml(error.message || 'Please refresh the page.')}</p>
            </div>
        `;
    }
}

function renderImStatus() {
    if (!imStatus || !imStatus.connected) {
        const expired = imStatus && imStatus.status === 'expired';
        imStatusCard.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${svgIcon(expired ? 'alert-triangle' : 'link')}</div>
                <h3>${expired ? 'Session Expired' : 'Not Connected'}</h3>
                <p>${expired
                    ? 'Your IndiaMART session expired. Reconnect to keep scraping leads.'
                    : 'Connect your IndiaMART seller account to start pulling and unlocking buy-leads directly from your dashboard.'}</p>
                <button id="imConnectBtn" class="btn btn-primary" type="button">${svgIcon('link')}Connect IndiaMART</button>
            </div>
        `;
        autoScrapeSection.classList.add('hidden');
        return;
    }

    const running = !!imStatus.autoScrapeEnabled;

    imStatusCard.innerHTML = `
        <div class="im-status-row">
            <span class="badge badge-connected">${svgIcon('check-circle')}Connected</span>
            <span class="status-pill ${running ? 'status-active' : 'status-stopped'}">${running ? 'Running' : 'Stopped'}</span>
            ${imStatus.companyName ? `<span class="im-company">${escapeHtml(imStatus.companyName)}</span>` : ''}
            <div class="section-actions" style="margin-left:auto;">
                <button id="imScrapeBtn" class="btn btn-primary btn-sm" type="button">${svgIcon('download')}Scrape Now</button>
                <button id="imDisconnectBtn" class="btn btn-secondary btn-sm" type="button">Disconnect</button>
            </div>
        </div>
        <div class="metric-grid" style="margin-bottom:0;">
            <div class="metric-card">
                <div class="metric-icon">${svgIcon('credit-card')}</div>
                <div class="metric-body">
                    <div class="metric-label">Credit Balance</div>
                    <div class="metric-value">${imStatus.creditBalance != null ? imStatus.creditBalance : '—'}</div>
                    <div class="metric-sub">${imStatus.creditBalance != null ? 'IndiaMART credits' : 'Scrape to check'}</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-icon">${svgIcon('layers')}</div>
                <div class="metric-body">
                    <div class="metric-label">Buy-Lead Purchase Balance</div>
                    <div class="metric-value">${imStatus.blPurchaseCountBalance != null ? imStatus.blPurchaseCountBalance : '—'}</div>
                    <div class="metric-sub">${imStatus.blPurchaseCountBalance != null ? 'unlocks remaining' : 'Scrape to check'}</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-icon">${svgIcon('clock')}</div>
                <div class="metric-body">
                    <div class="metric-label">Last Scraped</div>
                    <div class="metric-value" style="font-size:1.05rem;">${imStatus.lastScrapedAt ? new Date(imStatus.lastScrapedAt).toLocaleString() : 'Never'}</div>
                </div>
            </div>
        </div>
    `;

    autoScrapeSection.classList.remove('hidden');

    if (running) {
        autoScrapeRunning.classList.remove('hidden');
        autoScrapeForm.classList.add('hidden');
        autoScrapeRunningDesc.textContent = `Every ${imStatus.autoScrapeIntervalMinutes}m, up to ${imStatus.autoScrapeUnlockLimit} unlock(s)/run${imStatus.autoScrapeLastRunAt ? ` · last run ${new Date(imStatus.autoScrapeLastRunAt).toLocaleString()}` : ''}`;
    } else {
        autoScrapeRunning.classList.add('hidden');
        autoScrapeForm.classList.remove('hidden');
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

// ---- Event delegation for buttons rendered inside imStatusCard ----
imStatusCard.addEventListener('click', async (e) => {
    const connectBtn = e.target.closest('#imConnectBtn');
    const disconnectBtn = e.target.closest('#imDisconnectBtn');
    const scrapeBtn = e.target.closest('#imScrapeBtn');

    if (connectBtn) {
        try {
            const res = await apiCall('/indiamart/connect-link', { method: 'POST' });
            const { url } = res.data;

            document.getElementById('imConnectLinkInput').value = url;
            document.getElementById('imOpenLinkBtn').href = url;
            document.getElementById('imConnectModal').classList.remove('hidden');

            window.open(url, '_blank');

            if (imConnectPollInterval) clearInterval(imConnectPollInterval);
            imConnectPollInterval = setInterval(async () => {
                await loadImStatus();
                if (imStatus && imStatus.connected) {
                    clearInterval(imConnectPollInterval);
                    imConnectPollInterval = null;
                    document.getElementById('imConnectModal').classList.add('hidden');
                    showToast('IndiaMART connected!', 'success');
                }
            }, 3000);
        } catch (error) {
            showToast(error.message || 'Failed to create connect link', 'error');
        }
        return;
    }

    if (disconnectBtn) {
        if (!confirm('Disconnect your IndiaMART account? You will need to reconnect to keep scraping leads.')) return;
        try {
            await apiCall('/indiamart/disconnect', { method: 'POST' });
            await loadImStatus();
            showToast('IndiaMART disconnected', 'info');
        } catch (error) {
            showToast(error.message || 'Failed to disconnect', 'error');
        }
        return;
    }

    if (scrapeBtn) {
        const balanceHint = imStatus && imStatus.creditBalance != null ? ` Current credit balance: ${imStatus.creditBalance}.` : '';
        if (!confirm(`This will fetch recent buy-leads and unlock up to 5 new ones, which spends IndiaMART credits.${balanceHint} Continue?`)) return;

        scrapeBtn.disabled = true;
        scrapeBtn.textContent = 'Scraping...';

        try {
            const res = await apiCall('/indiamart/scrape', {
                method: 'POST',
                body: JSON.stringify({ fetchCount: 20, unlockLimit: 5 }),
            });
            showToast(`Fetched ${res.data.totalFetched} leads, ${res.data.matched} matched your machines, unlocked ${res.data.unlocked} new (spent ${res.data.creditsSpent} credits)`, 'success');
            await loadImStatus();
        } catch (error) {
            showToast(error.message || 'Scrape failed', 'error');
            await loadImStatus();
        }
        return;
    }
});

document.getElementById('imCloseConnectModal').addEventListener('click', () => {
    document.getElementById('imConnectModal').classList.add('hidden');
});

document.getElementById('imCopyLinkBtn').addEventListener('click', () => {
    const input = document.getElementById('imConnectLinkInput');
    input.select();
    navigator.clipboard.writeText(input.value).then(() => showToast('Link copied', 'success')).catch(() => {});
});

// ---- Auto-scrape schedule controls ----
autoScrapeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const intervalMinutes = parseInt(document.getElementById('autoScrapeInterval').value, 10);
    const unlockLimit = parseInt(document.getElementById('autoScrapeUnlockLimit').value, 10);

    try {
        await apiCall('/indiamart/auto-scrape/start', {
            method: 'POST',
            body: JSON.stringify({ intervalMinutes, unlockLimit }),
        });
        showToast('Auto-scrape started!', 'success');
        await loadImStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

document.getElementById('stopAutoScrapeBtn').addEventListener('click', async () => {
    try {
        await apiCall('/indiamart/auto-scrape/stop', { method: 'POST' });
        showToast('Auto-scrape stopped', 'info');
        await loadImStatus();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

// ---- Init ----
loadImStatus();

if (imPollInterval) clearInterval(imPollInterval);
imPollInterval = setInterval(loadImStatus, 15000);
