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

function initCookieConsent() {
  if (localStorage.getItem('blunk_cookie_consent')) return;

  var style = document.createElement('style');
  style.innerHTML = `
    .blunk-cookie-banner {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translate(-50%, 100px);
      z-index: 100000;
      background: rgba(18, 20, 29, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      padding: 16px 24px;
      width: 90%;
      max-width: 500px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 20px rgba(108, 99, 255, 0.05) inset;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease;
      opacity: 0;
      pointer-events: none;
      box-sizing: border-box;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .blunk-cookie-banner.show {
      transform: translate(-50%, 0);
      opacity: 1;
      pointer-events: auto;
    }
    .blunk-cookie-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .blunk-cookie-icon {
      font-size: 20px;
    }
    .blunk-cookie-title {
      color: #fff;
      font-weight: 800;
      font-size: 15px;
      letter-spacing: -0.2px;
    }
    .blunk-cookie-text {
      color: rgba(255, 255, 255, 0.7);
      font-size: 13px;
      line-height: 1.6;
    }
    .blunk-cookie-text a {
      color: #a855f7;
      text-decoration: none;
      font-weight: 600;
    }
    .blunk-cookie-text a:hover {
      text-decoration: underline;
    }
    .blunk-cookie-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 4px;
    }
    .blunk-cookie-btn-decline {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.7);
      padding: 8px 16px;
      font-size: 12.5px;
      font-weight: 600;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .blunk-cookie-btn-decline:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
    .blunk-cookie-btn-accept {
      background: linear-gradient(135deg, #6c63ff, #a855f7);
      border: none;
      color: #fff;
      padding: 8px 20px;
      font-size: 12.5px;
      font-weight: 700;
      border-radius: 10px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 12px rgba(108, 99, 255, 0.3);
    }
    .blunk-cookie-btn-accept:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(168, 85, 247, 0.4);
    }
    [data-theme="light"] .blunk-cookie-banner {
      background: rgba(255, 255, 255, 0.98);
      border-color: rgba(108, 99, 255, 0.15);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08), 0 0 20px rgba(108, 99, 255, 0.03) inset;
    }
    [data-theme="light"] .blunk-cookie-title {
      color: #12131c;
    }
    [data-theme="light"] .blunk-cookie-text {
      color: #333645;
    }
    [data-theme="light"] .blunk-cookie-btn-decline {
      background: rgba(0, 0, 0, 0.04);
      border-color: rgba(0, 0, 0, 0.08);
      color: #62667d;
    }
    [data-theme="light"] .blunk-cookie-btn-decline:hover {
      background: rgba(0, 0, 0, 0.08);
      color: #12131c;
    }
  `;
  document.head.appendChild(style);

  var banner = document.createElement('div');
  banner.className = 'blunk-cookie-banner';
  banner.innerHTML = `
    <div class="blunk-cookie-header">
      <span class="blunk-cookie-icon">🍪</span>
      <span class="blunk-cookie-title">Çerez Tercihleri</span>
    </div>
    <div class="blunk-cookie-text">
      Deneyiminizi geliştirmek, site trafiğini analiz etmek ve kişiselleştirilmiş reklamlar sunmak amacıyla çerezler kullanıyoruz. Detaylar için <a href="/privacy.html">Gizlilik Politikamızı</a> inceleyebilirsiniz.
    </div>
    <div class="blunk-cookie-actions">
      <button class="blunk-cookie-btn-decline" id="cookieDeclineBtn">Reddet</button>
      <button class="blunk-cookie-btn-accept" id="cookieAcceptBtn">Kabul Et</button>
    </div>
  `;
  document.body.appendChild(banner);

  setTimeout(function() {
    banner.classList.add('show');
  }, 150);

  document.getElementById('cookieAcceptBtn').addEventListener('click', function() {
    localStorage.setItem('blunk_cookie_consent', 'accepted');
    banner.classList.remove('show');
  });

  document.getElementById('cookieDeclineBtn').addEventListener('click', function() {
    localStorage.setItem('blunk_cookie_consent', 'declined');
    banner.classList.remove('show');
  });
}

document.addEventListener('DOMContentLoaded', function() {
  var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeToggleIcons(currentTheme);
  initCookieConsent();
});
