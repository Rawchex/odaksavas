(function() {
  var savedTheme = localStorage.getItem('blunk_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

function setBlunkTheme(themeName, event) {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  if (currentTheme === themeName) return;

  const updateThemeDOM = () => {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('blunk_theme', themeName);
    updateThemeToggleIcons(themeName);
  };

  // View Transitions API (Modern Smooth Circle/Ripple Effect)
  if (document.startViewTransition && event) {
    const x = event.clientX || window.innerWidth / 2;
    const y = event.clientY || window.innerHeight / 2;
    document.documentElement.style.setProperty('--theme-switch-x', `${x}px`);
    document.documentElement.style.setProperty('--theme-switch-y', `${y}px`);

    document.startViewTransition(() => {
      updateThemeDOM();
    });
  } else {
    updateThemeDOM();
  }
}

function toggleBlunkTheme(event) {
  var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  var nextTheme = currentTheme === 'light' ? 'dark' : 'light';
  setBlunkTheme(nextTheme, event);
}

function updateThemeToggleIcons(themeName) {
  var isLight = themeName === 'light';

  // Toggle button content with SVG
  var btns = document.querySelectorAll('.theme-toggle-btn');
  btns.forEach(function(btn) {
    btn.innerHTML = isLight 
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' 
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    btn.setAttribute('aria-label', isLight ? 'Karanlık Moda Geç' : 'Aydınlık Moda Geç');
  });

  // Profile switch button update
  var profileThemeText = document.getElementById('profileThemeText');
  var profileThemeIcon = document.getElementById('profileThemeIcon');
  if (profileThemeText) {
    profileThemeText.textContent = isLight ? 'Koyu Moda Geç' : 'Açık Moda Geç';
  }
  if (profileThemeIcon) {
    profileThemeIcon.innerHTML = isLight 
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' 
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  }

  var settingsThemeToggle = document.getElementById('settingsThemeToggle');
  if (settingsThemeToggle) {
    settingsThemeToggle.checked = isLight;
  }

  // Sync dropdown selectors throughout app
  var dropdowns = document.querySelectorAll('.theme-select-dropdown');
  dropdowns.forEach(function(dd) {
    dd.value = themeName;
  });
}

document.addEventListener('DOMContentLoaded', function() {
  var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeToggleIcons(currentTheme);
});
