// Tab switching
const tabs = document.querySelectorAll('.auth-tab');
const forms = document.querySelectorAll('.auth-form');
const authShell = document.getElementById('authShell');

function activateTab(targetTab) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === targetTab));
    forms.forEach(f => f.classList.remove('active'));
    document.getElementById(`${targetTab}Form`).classList.add('active');
    if (authShell) authShell.dataset.mode = targetTab;
    hideMessages();
}

tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});

// Deep-link support: /auth.html?tab=register
const requestedTab = new URLSearchParams(window.location.search).get('tab');
if (requestedTab === 'register') {
    activateTab('register');
}

// Show/hide password toggles
document.querySelectorAll('.password-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
        const input = document.getElementById(toggle.dataset.target);
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        toggle.innerHTML = svgIcon(isHidden ? 'eye-off' : 'eye');
    });
});

// Login form
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const btnText = document.getElementById('loginBtnText');
    const spinner = document.getElementById('loginSpinner');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    try {
        // Show loading
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
        submitBtn.disabled = true;
        hideMessages();

        // Make API call
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Login failed');
        }

        // Store token
        localStorage.setItem('token', data.data.token);
        localStorage.setItem('user', JSON.stringify(data.data));

        // Show success and redirect
        showSuccess('Login successful! Redirecting...');
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 1000);

    } catch (error) {
        showError(error.message);
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
        submitBtn.disabled = false;
    }
});

// Register form
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

    const btnText = document.getElementById('registerBtnText');
    const spinner = document.getElementById('registerSpinner');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    // Validate passwords match
    if (password !== passwordConfirm) {
        showError('Passwords do not match');
        return;
    }

    try {
        // Show loading
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
        submitBtn.disabled = true;
        hideMessages();

        // Make API call
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Registration failed');
        }

        // Store token
        localStorage.setItem('token', data.data.token);
        localStorage.setItem('user', JSON.stringify(data.data));

        // Show success and redirect
        showSuccess('Account created successfully! Redirecting...');
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 1000);

    } catch (error) {
        showError(error.message);
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
        submitBtn.disabled = false;
    }
});

// Helper functions
function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.classList.add('show');
}

function showSuccess(message) {
    const successEl = document.getElementById('successMessage');
    successEl.textContent = message;
    successEl.classList.add('show');
}

function hideMessages() {
    document.getElementById('errorMessage').classList.remove('show');
    document.getElementById('successMessage').classList.remove('show');
}

// Check if already logged in
if (localStorage.getItem('token')) {
    window.location.href = '/dashboard.html';
}
