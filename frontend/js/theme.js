// theme.js - Script para manejar el Modo Oscuro

const initTheme = () => {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    return savedTheme;
};

// Initialize early to prevent flash of unstyled content
const currentTheme = initTheme();

window.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        toggleBtn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
    }
});

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    
    const icon = next === 'dark' ? '☀️' : '🌙';
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) toggleBtn.textContent = icon;
    
    const toggleBtnMobile = document.getElementById('theme-toggle-mobile');
    if (toggleBtnMobile) toggleBtnMobile.textContent = icon;
    
    // Refresh chart if it exists on the page
    if (typeof actualizarGrafica === 'function' && typeof chartInstance !== 'undefined' && chartInstance) {
        // Redraw to get new CSS vars
        const q = chartInstance.data.datasets[0].data;
        if(q.length >= 3) {
            actualizarGrafica(q[0], q[1], q[2]);
        }
    }
}
