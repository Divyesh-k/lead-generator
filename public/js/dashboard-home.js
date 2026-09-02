// Dashboard overview page. Reads real data only from:
//   GET /api/machines
//   GET /api/indiamart/leads
//   GET /api/indiamart/status
// No invented fields, no fabricated chart data.

let machines = [];
let leads = [];
let indiamartStatus = null;
let chartRange = 'days';

const RANGE_LABELS = {
    days: 'the last 7 days',
    weeks: 'the last 8 weeks',
    months: 'the last 12 months',
};

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

async function init() {
    try {
        const [machinesRes, leadsRes, statusRes] = await Promise.all([
            apiCall('/machines'),
            apiCall('/indiamart/leads?limit=200'),
            apiCall('/indiamart/status'),
        ]);

        machines = machinesRes.data || [];
        leads = leadsRes.data || [];
        indiamartStatus = statusRes.data;

        renderMetrics();
        renderLeadsChart();
        renderRecentLeads();
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast(error.message || 'Failed to load dashboard data', 'error');
    }
}

document.getElementById('chartRangeSelect').addEventListener('change', (e) => {
    chartRange = e.target.value;
    document.getElementById('leadsChartSubtitle').textContent = `Unlocked IndiaMART leads over ${RANGE_LABELS[chartRange]}`;
    renderLeadsChart();
});

function renderMetrics() {
    const activeMachines = machines.filter((m) => m.isActive).length;
    document.getElementById('metricActiveMachines').textContent = activeMachines;
    document.getElementById('metricActiveMachinesSub').textContent = `${activeMachines} of ${machines.length} total`;

    const unlockedLeads = leads.filter((l) => l.unlocked).length;
    document.getElementById('metricUnlockedLeads').textContent = unlockedLeads;
    document.getElementById('metricUnlockedLeadsSub').textContent = `${leads.length} total scraped`;

    const creditEl = document.getElementById('metricCreditBalance');
    const creditSubEl = document.getElementById('metricCreditBalanceSub');
    const connected = !!(indiamartStatus && indiamartStatus.connected);
    if (connected && indiamartStatus.creditBalance != null) {
        creditEl.textContent = indiamartStatus.creditBalance;
    } else {
        creditEl.textContent = '—';
    }
    creditSubEl.textContent = connected ? 'IndiaMART connected' : 'IndiaMART not connected';

    const pillEl = document.getElementById('metricAutoScrapePill');
    const subEl = document.getElementById('metricAutoScrapeSub');
    const linkEl = document.getElementById('metricAutoScrapeLink');
    const linkArrow = linkEl.querySelector('svg').outerHTML;
    if (connected && indiamartStatus.autoScrapeEnabled) {
        pillEl.textContent = 'Running';
        pillEl.className = 'status-pill status-active';
        subEl.textContent = indiamartStatus.autoScrapeIntervalMinutes
            ? `Every ${indiamartStatus.autoScrapeIntervalMinutes}m`
            : '';
        linkEl.innerHTML = `Stop / manage ${linkArrow}`;
    } else if (connected) {
        pillEl.textContent = 'Stopped';
        pillEl.className = 'status-pill status-stopped';
        subEl.textContent = '';
        linkEl.innerHTML = `Start Auto-Scrape ${linkArrow}`;
    } else {
        pillEl.textContent = 'Stopped';
        pillEl.className = 'status-pill status-stopped';
        subEl.textContent = '';
        linkEl.innerHTML = `Connect IndiaMART ${linkArrow}`;
    }
}

// Builds empty time buckets for the selected range, then counts real unlocked
// leads (by scrapedAt) into whichever bucket they fall in. No fabricated points.
function getBuckets(range) {
    const buckets = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (range === 'weeks') {
        // 8 buckets, each a 7-day window ending today (most recent window last).
        for (let i = 7; i >= 0; i--) {
            const end = new Date(today);
            end.setDate(end.getDate() - i * 7);
            const start = new Date(end);
            start.setDate(start.getDate() - 6);
            buckets.push({ start, end, count: 0, label: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) });
        }
    } else if (range === 'months') {
        // 12 buckets, one per calendar month ending with the current month.
        for (let i = 11; i >= 0; i--) {
            const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
            buckets.push({ start, end, count: 0, label: start.toLocaleDateString(undefined, { month: 'short' }) });
        }
    } else {
        // Default: 7 daily buckets ending today.
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            buckets.push({ start: d, end: d, count: 0, label: d.toLocaleDateString(undefined, { weekday: 'short' }) });
        }
    }

    leads.forEach((lead) => {
        if (!lead.unlocked || !lead.scrapedAt) return;
        const d = new Date(lead.scrapedAt);
        d.setHours(0, 0, 0, 0);
        const bucket = buckets.find((b) => d.getTime() >= b.start.getTime() && d.getTime() <= b.end.getTime());
        if (bucket) bucket.count += 1;
    });

    return buckets;
}

function renderLeadsChart() {
    const wrap = document.getElementById('leadsChartWrap');
    const connected = !!(indiamartStatus && indiamartStatus.connected);

    if (!connected) {
        wrap.innerHTML = `
            <div class="connect-prompt-card">
                <div>
                    <h3>Connect your IndiaMART account</h3>
                    <p>Connect your IndiaMART account to start generating leads.</p>
                </div>
                <a href="/auto-scrape.html" class="btn btn-primary btn-sm">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    Connect IndiaMART
                </a>
            </div>
        `;
        return;
    }

    if (leads.length === 0) {
        wrap.innerHTML = `<div class="chart-empty">No lead data yet</div>`;
        return;
    }

    const buckets = getBuckets(chartRange);
    const totalInRange = buckets.reduce((sum, b) => sum + b.count, 0);

    if (totalInRange === 0) {
        wrap.innerHTML = `<div class="chart-empty">No leads scraped in ${RANGE_LABELS[chartRange]}</div>`;
        return;
    }

    const rawMax = Math.max(...buckets.map((b) => b.count));
    const max = Math.max(1, rawMax);
    const width = 720;
    const height = 240;
    const padLeft = 34;
    const padRight = 16;
    const padTop = 20;
    const padBottom = 30;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const stepX = plotW / (buckets.length - 1);
    const gridY = height - padBottom;

    const points = buckets.map((b, i) => {
        const x = padLeft + i * stepX;
        const y = padTop + plotH - (b.count / max) * plotH;
        return { x, y, count: b.count, label: b.label };
    });

    const smoothLinePath = catmullRomPath(points);
    const areaPath = `${smoothLinePath} L${points[points.length - 1].x.toFixed(1)},${gridY} L${points[0].x.toFixed(1)},${gridY} Z`;

    // Thin out x-axis labels for the 12-month view so they don't overlap.
    const labelEvery = buckets.length > 8 ? 2 : 1;

    const dots = points.map((p) => {
        const tipLabel = `${p.label}: ${p.count} lead${p.count === 1 ? '' : 's'}`;
        const tipW = Math.max(60, tipLabel.length * 5.8 + 18);
        const tipH = 24;
        const gap = 10;
        const rectX = p.x - tipW / 2;
        const rectY = p.y - gap - tipH;
        const arrowY = rectY + tipH;
        const textY = rectY + tipH / 2 + 3.5;
        return `
            <g class="chart-point" tabindex="0">
                <circle class="chart-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4"/>
                <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="11" fill="transparent"/>
                <g class="chart-tip">
                    <rect class="chart-tip-bg" x="${rectX.toFixed(1)}" y="${rectY.toFixed(1)}" width="${tipW.toFixed(1)}" height="${tipH}" rx="6"/>
                    <polygon class="chart-tip-bg" points="${(p.x - 5).toFixed(1)},${arrowY.toFixed(1)} ${(p.x + 5).toFixed(1)},${arrowY.toFixed(1)} ${p.x.toFixed(1)},${(arrowY + 6).toFixed(1)}"/>
                    <text class="chart-tip-text" x="${p.x.toFixed(1)}" y="${textY.toFixed(1)}">${tipLabel}</text>
                </g>
            </g>
        `;
    }).join('');
    const xLabels = points.map((p, i) => (i % labelEvery === 0 ? `<text class="chart-label" x="${p.x.toFixed(1)}" y="${height - 8}" text-anchor="middle">${p.label}</text>` : '')).join('');

    // Real y-axis reference values only — 0, the midpoint, and the actual max count.
    const mid = Math.round(max / 2);
    const yTicks = [0, mid, max].filter((v, i, arr) => arr.indexOf(v) === i);
    const gridLines = yTicks.map((v) => {
        const y = padTop + plotH - (v / max) * plotH;
        return `
            <line class="chart-grid-line" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}"/>
            <text class="chart-y-label" x="${padLeft - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${v}</text>
        `;
    }).join('');

    wrap.innerHTML = `
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}">
            <defs>
                <linearGradient id="leadsChartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--primary);stop-opacity:0.28"/>
                    <stop offset="100%" style="stop-color:var(--primary);stop-opacity:0"/>
                </linearGradient>
            </defs>
            ${gridLines}
            <line class="chart-axis" x1="${padLeft}" y1="${gridY}" x2="${width - padRight}" y2="${gridY}"/>
            <path class="chart-area" d="${areaPath}"/>
            <path class="chart-line" d="${smoothLinePath}"/>
            ${dots}
            ${xLabels}
        </svg>
    `;
}

// Smooth curve through the given points via Catmull-Rom -> cubic Bezier conversion,
// so the trend line reads as a continuous curve rather than sharp polyline segments.
function catmullRomPath(points) {
    if (points.length < 2) return '';
    if (points.length === 2) {
        return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
    }
    let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
}

function renderRecentLeads() {
    const wrap = document.getElementById('recentLeadsWrap');

    if (leads.length === 0) {
        const connected = !!(indiamartStatus && indiamartStatus.connected);
        wrap.innerHTML = `
            <div class="empty-state">
                <p>${connected ? 'No leads scraped yet.' : 'No leads yet. Connect IndiaMART to start generating leads.'}</p>
            </div>
        `;
        return;
    }

    // Leads already come back sorted desc by scrapedAt from the API.
    const recent = leads.slice(0, 5);

    const rows = recent.map((lead) => {
        const cityState = [lead.buyerCity, lead.buyerState].filter(Boolean).join(', ');
        const buyerCell = lead.unlocked
            ? escapeHtml(lead.buyerCompany || 'Not provided')
            : `<span class="recent-leads-locked"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Locked</span>`;
        return `
            <tr>
                <td>${escapeHtml(lead.title || '-')}</td>
                <td>${buyerCell}</td>
                <td>${escapeHtml(cityState || '-')}</td>
                <td>${new Date(lead.scrapedAt).toLocaleString()}</td>
            </tr>
        `;
    }).join('');

    wrap.innerHTML = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>Buyer</th>
                        <th>Location</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

init();
