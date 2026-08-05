/* ════════════════════════════════════════════════════════════════
   BLUNK UNIFIED NAVBAR COMPONENT (SINGLE SOURCE OF TRUTH)
   ════════════════════════════════════════════════════════════════ */

window.toggleMobileMenu = function() {
  var drawer = document.getElementById('mobileNavDrawer');
  if (drawer) {
    drawer.classList.toggle('open');
  }
};

function renderUnifiedNavbar() {
  var navContainer = document.getElementById('blunkNavbar');
  if (!navContainer) return;

  // Eğer kullanıcı uygulamaya giriş yapmışsa (#mainApp görünürse), üst navbar'ı gizle!
  var mainApp = document.getElementById('mainApp');
  if (mainApp && mainApp.style.display !== 'none' && mainApp.style.display !== '') {
    navContainer.style.display = 'none';
    return;
  } else {
    navContainer.style.display = 'block';
  }

  var currentPath = window.location.pathname.toLowerCase();
  
  // Eşleşme Mantığı (Kesin Dizin Tespiti)
  var isBlog = currentPath.includes('/blog');
  var isAbout = currentPath.includes('/about');
  var isContact = currentPath.includes('/contact');
  var isPrivacy = currentPath.includes('/privacy');
  var isTerms = currentPath.includes('/terms');
  
  // Ana sayfa sadece diğer özel sayfalar değilse ve yol / veya /index.html ise aktiftir
  var isHome = !isBlog && !isAbout && !isContact && !isPrivacy && !isTerms && 
               (currentPath === '/' || currentPath === '/index.html' || currentPath.endsWith('/') || currentPath === '');

  navContainer.innerHTML = `
    <header class="site-nav">
      <div class="nav-container">
        <!-- Logo with Live Pulse Dot -->
        <a href="/" class="nav-brand-wrap" title="BLUNK Ana Sayfa">
          <span class="nav-brand-dot"></span>
          <span class="nav-brand">B L U N K</span>
        </a>

        <!-- Middle Pill Links -->
        <nav class="nav-links">
          <a href="/" class="${isHome ? 'active' : ''}">Ana Sayfa</a>
          <a href="/about" class="${isAbout ? 'active' : ''}">Hakkımızda</a>
          <a href="/blog/" class="${isBlog ? 'active' : ''}">Blog</a>
          <a href="/contact" class="${isContact ? 'active' : ''}">İletişim</a>
          <a href="/privacy" class="${isPrivacy ? 'active' : ''}">Gizlilik</a>
        </nav>

        <!-- Right Actions (Theme Switcher & Download App) -->
        <div class="nav-actions" style="display:flex; align-items:center; gap:10px;">
          <button onclick="toggleBlunkTheme()" class="theme-toggle-btn" aria-label="Tema Değiştir" title="Temayı Değiştir" style="background:var(--t-bg-card); border:1px solid var(--t-border-subtle); width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; transition:transform 0.2s, background 0.2s;">
            ☀️
          </button>
          <button onclick="showAppDownloadNotice()" class="nav-cta" style="background:var(--t-accent-gradient); color:#ffffff; font-weight:800; border:none; padding:9px 20px; border-radius:24px; font-size:12.5px; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow: 0 4px 16px var(--t-accent-glow); transition:transform 0.2s;">
            <span>📱 Uygulamayı İndir</span>
          </button>
        </div>

        <!-- Mobile Menu Button -->
        <button class="mobile-menu-btn" onclick="toggleMobileMenu()" aria-label="Menü">
          ☰
        </button>
      </div>
    </header>
  `;

  // Append mobile drawer menu container
  var drawer = document.getElementById('mobileNavDrawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'mobileNavDrawer';
    drawer.className = 'mobile-nav-drawer';
    document.body.appendChild(drawer);
  }

  drawer.innerHTML = `
    <div class="mobile-drawer-header">
      <a href="/" class="nav-brand-wrap" title="BLUNK Ana Sayfa" style="text-decoration:none;">
        <span class="nav-brand-dot"></span>
        <span class="nav-brand">B L U N K</span>
      </a>
      <button class="mobile-drawer-close" onclick="toggleMobileMenu()">✕</button>
    </div>
    <nav class="mobile-drawer-links">
      <a href="/" class="${isHome ? 'active' : ''}" onclick="toggleMobileMenu()">Ana Sayfa</a>
      <a href="/about" class="${isAbout ? 'active' : ''}" onclick="toggleMobileMenu()">Hakkımızda</a>
      <a href="/blog/" class="${isBlog ? 'active' : ''}" onclick="toggleMobileMenu()">Blog</a>
      <a href="/contact" class="${isContact ? 'active' : ''}" onclick="toggleMobileMenu()">İletişim</a>
      <a href="/privacy" class="${isPrivacy ? 'active' : ''}" onclick="toggleMobileMenu()">Gizlilik</a>
    </nav>
    <div class="mobile-drawer-footer">
      <button onclick="toggleBlunkTheme(); toggleMobileMenu();" class="theme-toggle-btn-mobile">
        ☀️ Temayı Değiştir
      </button>
      <button onclick="showAppDownloadNotice(); toggleMobileMenu();" class="mobile-cta">
        📱 Uygulamayı İndir
      </button>
    </div>
  `;

  if (typeof updateThemeToggleIcons === 'function') {
    var savedTheme = localStorage.getItem('blunk_theme') || 'dark';
    updateThemeToggleIcons(savedTheme);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderUnifiedNavbar);
} else {
  renderUnifiedNavbar();
}

window.addEventListener('load', renderUnifiedNavbar);
setTimeout(renderUnifiedNavbar, 150);
