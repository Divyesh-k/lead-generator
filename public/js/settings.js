// Settings page — account overview plus email/password self-service, backed by
// GET /api/auth/me, GET /api/subscription/status (fetched once by app-shell.js
// and handed to us via appshell:ready), and PUT /api/auth/change-email /
// PUT /api/auth/change-password. There is still no notifications endpoint, so
// nothing here invents notification data.

document.getElementById('accountCardTitle').innerHTML = svgIcon('user') + 'Account';
document.getElementById('planCardTitle').innerHTML = svgIcon('star') + 'Subscription';
document.getElementById('usageCardTitle').innerHTML = svgIcon('cpu') + 'Machine Usage';
document.getElementById('accountActionsTitle').innerHTML = svgIcon('log-out') + 'Account Actions';
document.getElementById('changeNameTitle').innerHTML = svgIcon('user') + 'Change Name';
document.getElementById('changeEmailTitle').innerHTML = svgIcon('mail') + 'Change Email';
document.getElementById('changePasswordTitle').innerHTML = svgIcon('lock') + 'Change Password';

function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// The sidebar (injected once by app-shell.js) shows name + initials too —
// keep it in sync immediately instead of requiring a page reload.
function updateSidebarName(name) {
    const sidebarName = document.getElementById('sidebarUserName');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    if (sidebarName) sidebarName.textContent = name;
    if (sidebarAvatar) sidebarAvatar.textContent = initials(name);
}

function renderSettings(user, subscription) {
    document.getElementById('settingsAvatar').textContent = initials(user.name);
    document.getElementById('newNameInput').value = user.name;
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

function showFormMessage(errorEl, successEl, message, isError) {
    if (isError) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
        successEl.classList.remove('show');
    } else {
        successEl.textContent = message;
        successEl.classList.add('show');
        errorEl.classList.remove('show');
    }
}

// Change name
const changeNameForm = document.getElementById('changeNameForm');
const changeNameError = document.getElementById('changeNameError');
const changeNameSuccess = document.getElementById('changeNameSuccess');

changeNameForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('newNameInput').value;
    const btnText = document.getElementById('changeNameBtnText');
    const spinner = document.getElementById('changeNameSpinner');

    changeNameError.classList.remove('show');
    changeNameSuccess.classList.remove('show');
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
        const res = await apiCall('/auth/update-name', {
            method: 'PUT',
            body: JSON.stringify({ name }),
        });
        showFormMessage(changeNameError, changeNameSuccess, 'Name updated successfully.', false);
        document.getElementById('settingsName').textContent = res.data.name;
        document.getElementById('settingsAvatar').textContent = initials(res.data.name);
        updateSidebarName(res.data.name);

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        storedUser.name = res.data.name;
        localStorage.setItem('user', JSON.stringify(storedUser));
    } catch (error) {
        showFormMessage(changeNameError, changeNameSuccess, error.message || 'Failed to update name', true);
    } finally {
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
});

// Change email
const changeEmailForm = document.getElementById('changeEmailForm');
const changeEmailError = document.getElementById('changeEmailError');
const changeEmailSuccess = document.getElementById('changeEmailSuccess');

changeEmailForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newEmail = document.getElementById('newEmailInput').value;
    const currentPassword = document.getElementById('emailCurrentPassword').value;
    const btnText = document.getElementById('changeEmailBtnText');
    const spinner = document.getElementById('changeEmailSpinner');

    changeEmailError.classList.remove('show');
    changeEmailSuccess.classList.remove('show');
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
        const res = await apiCall('/auth/change-email', {
            method: 'PUT',
            body: JSON.stringify({ newEmail, currentPassword }),
        });
        showFormMessage(changeEmailError, changeEmailSuccess, 'Email updated successfully.', false);
        document.getElementById('settingsEmail').textContent = res.data.email;
        changeEmailForm.reset();
    } catch (error) {
        showFormMessage(changeEmailError, changeEmailSuccess, error.message || 'Failed to update email', true);
    } finally {
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
});

// Change password
const changePasswordForm = document.getElementById('changePasswordForm');
const changePasswordError = document.getElementById('changePasswordError');
const changePasswordSuccess = document.getElementById('changePasswordSuccess');

changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById('currentPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmNewPassword = document.getElementById('confirmNewPasswordInput').value;
    const btnText = document.getElementById('changePasswordBtnText');
    const spinner = document.getElementById('changePasswordSpinner');

    changePasswordError.classList.remove('show');
    changePasswordSuccess.classList.remove('show');

    if (newPassword !== confirmNewPassword) {
        showFormMessage(changePasswordError, changePasswordSuccess, 'New passwords do not match', true);
        return;
    }

    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');

    try {
        await apiCall('/auth/change-password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword }),
        });
        showFormMessage(changePasswordError, changePasswordSuccess, 'Password updated successfully.', false);
        changePasswordForm.reset();
    } catch (error) {
        showFormMessage(changePasswordError, changePasswordSuccess, error.message || 'Failed to update password', true);
    } finally {
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
});
