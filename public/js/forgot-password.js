function showError(message) {
    const el = document.getElementById('errorMessage');
    el.textContent = message;
    el.classList.add('show');
}

function hideMessages() {
    document.getElementById('errorMessage').classList.remove('show');
    document.getElementById('successMessage').classList.remove('show');
}

document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('forgotEmail').value;
    const btnText = document.getElementById('forgotBtnText');
    const spinner = document.getElementById('forgotSpinner');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    hideMessages();
    document.getElementById('resetLinkResult').classList.add('hidden');
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    submitBtn.disabled = true;

    try {
        const res = await apiCall('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
        });

        const successEl = document.getElementById('successMessage');
        successEl.textContent = res.message;
        successEl.classList.add('show');

        if (res.data && res.data.demoMode && res.data.resetUrl) {
            document.getElementById('resetLinkText').textContent = res.data.resetUrl;
            document.getElementById('openResetLinkBtn').href = res.data.resetUrl;
            document.getElementById('resetLinkResult').classList.remove('hidden');
        }

        e.target.reset();
    } catch (error) {
        showError(error.message || 'Failed to request password reset');
    } finally {
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
        submitBtn.disabled = false;
    }
});

if (localStorage.getItem('token')) {
    window.location.href = '/dashboard.html';
}
