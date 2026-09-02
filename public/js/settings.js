// Settings page — read-only account overview. There is no profile-update,
// forgot-password, or notifications endpoint in the backend, so this page only
// ever displays data from GET /api/auth/me and GET /api/subscription/status
// (already fetched once by app-shell.js and handed to us via appshell:ready).

document.getElementById('accountCardTitle').innerHTML = svgIcon('user') + 'Account';
document.getElementById('planCardTitle').innerHTML = svgIcon('star') + 'Subscription';
document.getElementById('usageCardTitle').innerHTML = svgIcon('cpu') + 'Machine Usage';
document.getElementById('accountActionsTitle').innerHTML = svgIcon('log-out') + 'Account Actions';

function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function renderSettings(user, subscription) {
    document.getElementById('settingsAvatar').textContent = initials(user.name);
    document.getElementById('settingsName').textContent = user.name;
    document.getElementById('settingsEmail').textContent = user.email;

    const isPro = !!(subscription && subscription.isPro);
    const planBadge = document.getElementById('settingsPlanBadge');
    planBadge.innerHTML = isPro ? svgIcon('star') + 'Pro' : 'Free';

    const expiryRow = document.getElementById('settingsExpiryRow');
    const expiry = subscription && (subscription.expiry || user.subscriptionExpiry);
    if (isPro && expiry) {
        expiryRow.classList.remove('hidden');
        document.getElementById('settingsExpiry').textContent = new Date(expiry).toLocaleDateString();
    } else {
        expiryRow.classList.add('hidden');
    }

    const manageSubBtn = document.getElementById('manageSubBtn');
    manageSubBtn.textContent = isPro ? 'Manage subscription' : 'Upgrade to Pro';

    const usageLabel = document.getElementById('usageLabel');
    const usageBarFill = document.getElementById('usageBarFill');
    if (subscription) {
        const count = subscription.machineCount || 0;
        const limit = subscription.machineLimit; // null = unlimited (Pro)
        if (limit == null) {
            usageLabel.textContent = `${count} machine${count === 1 ? '' : 's'} · Unlimited on Pro`;
            usageBarFill.style.width = '100%';
        } else {
            usageLabel.textContent = `${count} of ${limit} machines used`;
            usageBarFill.style.width = `${Math.min(100, (count / limit) * 100)}%`;
        }
    } else {
        usageLabel.textContent = 'Unable to load machine usage';
        usageBarFill.style.width = '0%';
    }
}

document.addEventListener('appshell:ready', (e) => {
    renderSettings(e.detail.user, e.detail.subscription);
});

document.getElementById('settingsLogoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/auth.html';
});
