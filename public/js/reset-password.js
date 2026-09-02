document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = svgIcon(el.dataset.icon); });

document.querySelectorAll('.password-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
        const input = document.getElementById(toggle.dataset.target);
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        toggle.innerHTML = svgIcon(isHidden ? 'eye-off' : 'eye');
    });
});

function showError(message) {
    const el = document.getElementById('errorMessage');
    el.textContent = message;
    el.classList.add('show');
}

function hideMessages() {
    document.getElementById('errorMessage').classList.remove('show');
    document.getElementById('successMessage').classList.remove('show');
}

const token = new URLSearchParams(window.location.search).get('token');
const form = document.getElementById('resetPasswordForm');

if (!token) {
    document.getElementById('resetHeading').textContent = 'Invalid reset link';
    document.getElementById('resetSubheading').textContent = 'This link is missing its reset token. Request a new one from the forgot-password page.';
    form.classList.add('hidden');
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;
    const btnText = document.getElementById('resetBtnText');
    const spinner = document.getElementById('resetSpinner');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    hideMessages();

    if (newPassword !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    submitBtn.disabled = true;

    try {
        const res = await apiCall(`/auth/reset-password/${token}`, {
            method: 'POST',
            body: JSON.stringify({ newPassword }),
        });

        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data));

        const successEl = document.getElementById('successMessage');
        successEl.textContent = 'Password reset! Redirecting to your dashboard...';
        successEl.classList.add('show');

        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 1000);
    } catch (error) {
        showError(error.message || 'Failed to reset password');
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
        submitBtn.disabled = false;
    }
});

if (localStorage.getItem('token')) {
    window.location.href = '/dashboard.html';
}
