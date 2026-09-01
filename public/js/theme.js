// Applied immediately (not on DOMContentLoaded) so the stored theme is set before first paint.
(function () {
    const stored = localStorage.getItem('theme');
    const theme = stored === 'light' || stored === 'dark' ? stored : 'light';
    document.documentElement.setAttribute('data-theme', theme);
})();

function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', toggleTheme);
});
