/* ==========================================================================
   BLUNK — Gelişmiş Mobil & Masaüstü İnteraktif Hızlı Tur (Spotlight Engine)
   ========================================================================== */
'use strict';

(function setupBlunkInteractiveTour() {
  let currentStepIndex = 0;
  let backdropEl = null;
  let ringEl = null;
  let cardEl = null;
  let highlightedTarget = null;
  let activeTour = false;

  const TOUR_STEPS = [
    {
      id: 'timerStart',
      targetSelector: '#timerStartBtn, .timer-start-btn, #timerControlsBar',
      title: 'ODAKLAN BUTONU',
      text: 'İşte bu buton var ya, heh! Bu buton bizim sitemizin ana olayı. Buna basıp, odaklanman gereken şey üstüne yoğunlaşıyorsun ve odağın bozulduğu ilk an gelip kapatıyorsun. Bu sayede senin gelişimini sadece sen değil; cümle alem görüyor! Bu butona iyi davran lütfen, tamam mı?',
      page: 'timer'
    },
    {
      id: 'rooms',
      targetSelector: '#timerSoloPartyBtn, .timer-room-btn, #soloPartyControlsRow, #partyFocusOverlay',
      title: 'Sesli Odalar',
      text: 'Burası ana mekan. Arkadaşlarınla aynı masayaç kurulup sesli odaklanıyorsun, sohbet de serbest çalışma da.',
      page: 'timer'
    },
    {
      id: 'messages',
      targetSelector: '#nav-messages',
      title: 'Sohbet ve Mesajlar',
      text: 'Mola verdiğinde arkadaşlarına buradan yaz, odaya çağır ya da laflayın. (Arkadaşlarına mola vermediğinde de yazabilirsin ama tavsiyemiz değil :P )',
      page: 'messages'
    },
    {
      id: 'profile',
      targetSelector: '#nav-profile, #timerTopMeta',
      title: 'Senin destansı profilin',
      text: 'Çalıştıkça seviyen katlanıyor ve bunu profilindeki havalı bar ile takip edebiliyorsun. Paylaştığın metinleri ve görselleri burada görebilir, düzenleyebilir ya da paylaşmamalıymışsan silebilirsin...',
      page: 'profile'
    }
  ];

  function getStorageKey() {
    return 'blunk_spotlight_tour_completed';
  }

  function createOverlayElements() {
    removeOverlayElements();

    backdropEl = document.createElement('div');
    backdropEl.id = 'blunk-spotlight-backdrop';
    backdropEl.className = 'blunk-spotlight-backdrop';

    ringEl = document.createElement('div');
    ringEl.id = 'blunk-spotlight-ring';
    ringEl.className = 'blunk-spotlight-ring';

    cardEl = document.createElement('div');
    cardEl.id = 'blunk-spotlight-card';
    cardEl.className = 'blunk-spotlight-card';

    document.body.appendChild(backdropEl);
    document.body.appendChild(ringEl);
    document.body.appendChild(cardEl);

    backdropEl.addEventListener('click', onBackdropClick);
  }

  function removeOverlayElements() {
    if (highlightedTarget) {
      highlightedTarget.classList.remove('blunk-spotlight-target');
      highlightedTarget = null;
    }
    if (backdropEl) {
      backdropEl.remove();
      backdropEl = null;
    }
    if (ringEl) {
      ringEl.remove();
      ringEl = null;
    }
    if (cardEl) {
      cardEl.remove();
      cardEl = null;
    }
  }

  function onBackdropClick(e) {
    if (e.target === backdropEl) {
      nextSpotlightStep();
    }
  }

  function findTargetElement(selectorStr) {
    const selectors = selectorStr.split(',').map(s => s.trim());
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el && el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).display !== 'none') {
        return el;
      }
    }
    return null;
  }

  function renderStep(index) {
    if (index < 0 || index >= TOUR_STEPS.length) {
      finishSpotlightTour();
      return;
    }

    currentStepIndex = index;
    const step = TOUR_STEPS[index];

    if (step.page && typeof window.showPage === 'function') {
      window.showPage(step.page);
    }

    setTimeout(() => {
      let target = findTargetElement(step.targetSelector);
      
      if (highlightedTarget) {
        highlightedTarget.classList.remove('blunk-spotlight-target');
      }

      if (target) {
        highlightedTarget = target;
        target.classList.add('blunk-spotlight-target');
        
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        } catch(e) {}
      }

      if (!cardEl) return;

      const isFirst = index === 0;
      const isLast = index === TOUR_STEPS.length - 1;

      cardEl.innerHTML = `
        <div class="spotlight-card-header">
          <span class="spotlight-badge">TUR &bull; ${index + 1} / ${TOUR_STEPS.length}</span>
          <button type="button" class="spotlight-close-btn" onclick="window.finishInteractiveSpotlightTour()" aria-label="Turu Kapat">✕</button>
        </div>
        <div class="spotlight-title">${step.title}</div>
        <div class="spotlight-desc">${step.text}</div>
        <div class="spotlight-actions">
          ${!isFirst ? '<button type="button" class="spotlight-btn-sec" onclick="window.prevInteractiveSpotlightStep()">Geri</button>' : '<div></div>'}
          <button type="button" class="spotlight-btn-pri" onclick="window.nextInteractiveSpotlightStep()">
            ${isLast ? 'Turu Bitir' : 'İleri'}
          </button>
        </div>
      `;

      positionElements(target);
      setTimeout(() => positionElements(target), 250);
    }, 180);
  }

  function positionElements(target) {
    if (!target || !cardEl || !ringEl) {
      if (ringEl) ringEl.style.display = 'none';
      return;
    }

    const rect = target.getBoundingClientRect();
    const style = window.getComputedStyle(target);
    const isMobile = window.innerWidth <= 768;

    // 1. Position Spotlight Highlight Ring
    const pad = 6;
    ringEl.style.display = 'block';
    ringEl.style.position = 'fixed';
    ringEl.style.left = `${Math.max(0, rect.left - pad)}px`;
    ringEl.style.top = `${Math.max(0, rect.top - pad)}px`;
    ringEl.style.width = `${rect.width + (pad * 2)}px`;
    ringEl.style.height = `${rect.height + (pad * 2)}px`;
    ringEl.style.borderRadius = style.borderRadius !== '0px' ? style.borderRadius : '16px';

    // 2. Position Tooltip Card to NEVER overlap target
    const cardWidth = Math.min(330, window.innerWidth - 32);
    cardEl.style.position = 'fixed';
    cardEl.style.width = isMobile ? 'auto' : `${cardWidth}px`;

    if (isMobile) {
      cardEl.style.left = '16px';
      cardEl.style.right = '16px';
      cardEl.style.maxWidth = '400px';
      cardEl.style.margin = '0 auto';

      if (rect.top > window.innerHeight / 2) {
        cardEl.style.top = 'max(16px, env(safe-area-inset-top, 16px))';
        cardEl.style.bottom = 'auto';
      } else {
        cardEl.style.bottom = 'max(24px, env(safe-area-inset-bottom, 24px))';
        cardEl.style.top = 'auto';
      }
      return;
    }

    // Desktop positioning
    cardEl.style.right = 'auto';
    let left = rect.left + (rect.width / 2) - (cardWidth / 2);
    left = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, left));
    cardEl.style.left = `${left}px`;

    const cardHeight = cardEl.offsetHeight || 200;

    if (rect.top > window.innerHeight / 2) {
      // Target is in lower half of screen -> Place card ABOVE target
      cardEl.style.top = `${Math.max(16, rect.top - cardHeight - 20)}px`;
      cardEl.style.bottom = 'auto';
    } else {
      // Target is in upper half of screen -> Place card BELOW target
      cardEl.style.top = `${Math.min(window.innerHeight - cardHeight - 16, rect.bottom + 20)}px`;
      cardEl.style.bottom = 'auto';
    }
  }

  function nextSpotlightStep() {
    if (!activeTour) return;
    renderStep(currentStepIndex + 1);
  }

  function prevSpotlightStep() {
    if (!activeTour) return;
    renderStep(currentStepIndex - 1);
  }

  function finishSpotlightTour() {
    activeTour = false;
    localStorage.setItem(getStorageKey(), 'true');
    removeOverlayElements();
    document.removeEventListener('keydown', handleKeyDown);
  }

  function handleKeyDown(e) {
    if (!activeTour) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      nextSpotlightStep();
    } else if (e.key === 'ArrowLeft') {
      prevSpotlightStep();
    } else if (e.key === 'Escape') {
      finishSpotlightTour();
    }
  }

  window.startInteractiveSpotlightTour = function startInteractiveSpotlightTour() {
    activeTour = true;
    createOverlayElements();
    document.addEventListener('keydown', handleKeyDown);
    renderStep(0);
  };

  window.nextInteractiveSpotlightStep = nextSpotlightStep;
  window.prevInteractiveSpotlightStep = prevSpotlightStep;
  window.finishInteractiveSpotlightTour = finishSpotlightTour;

  window.addEventListener('resize', () => {
    if (activeTour && highlightedTarget) {
      positionElements(highlightedTarget);
    }
  });
})();
