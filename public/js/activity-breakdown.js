/**
 * BLUNK Side-by-Side Analytics Dashboard & Real Wall Calendar
 * Side-by-side split layout for both 7-day & calendar view, client-side 0-to-target animated counters & bars, real-time follow status.
 */
(function() {
  const REGISTRATION_MILESTONES = [
    "Hey gidi hey... @username tam bu tarihte Blunk evrenine katıldı.",
    "Tarih bunu kaydetti: @username ilk kez Blunk kapısından içeri girdi.",
    "Büyük yolculuğun başladığı ilk gün, hesabın açıldığı tarihi an.",
    "İşte o gün: Blunk kronolojisine ilk kaydın düşüldüğü tarih.",
    "Her şey bu tarihte başladı, Blunk macerasının ilk adımı.",
    "Hey gidi günler... @username ilk profilini oluşturduğu tarih.",
    "O gün kimse farkında değildi ama serüven tam olarak burada başladı.",
    "Nereden nereye... İşte Blunk yolculuğunun sıfır noktası."
  ];

  function getRandomMilestone(username) {
    const idx = Math.floor(Math.random() * REGISTRATION_MILESTONES.length);
    return REGISTRATION_MILESTONES[idx].replace(/@username/g, `@${username}`);
  }

  // State retention for analytics dashboard
  const analyticsState = {
    mode: 'chart', // Default to chart view
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1,
    activeDate: null
  };

  // Human-readable time formatter
  function formatDuration(minutes) {
    if (!minutes || minutes <= 0) return "0 dk";
    if (minutes < 1) {
      return Math.round(minutes * 60) + " sn";
    }
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    const s = Math.round((minutes * 60) % 60);
    
    let res = [];
    if (h > 0) res.push(`${h} saat`);
    if (m > 0) res.push(`${m} dk`);
    if (s > 0 && h === 0) res.push(`${s} sn`); // Only show seconds if no hours, to keep it clean, or just show it anyway. Let's show it if it's there but maybe skip if h>0 to keep it short? The user asked for "1 saat 54 dk 18 sn", so we include it.
    if (h > 0 && s > 0 && m === 0) res.push(`${s} sn`); // if 1 hr 0 min 15 sec
    return res.join(' ');
  }

  function showInAppToast(message) {
    let toast = document.getElementById('analytics-inapp-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'analytics-inapp-toast';
      toast.className = 'analytics-toast-notification';
      document.body.appendChild(toast);
    }

    toast.innerText = message;
    toast.classList.add('active');

    setTimeout(() => {
      toast.classList.remove('active');
    }, 2500);
  }

  // Smooth 0-to-target Counter & Bar Filling Animation
  function animateCountersAndBars() {
    // 1. Animate Horizontal Activity Fill Bars
    document.querySelectorAll('.category-candle-fill-bar[data-target-width]').forEach(bar => {
      const targetWidth = bar.dataset.targetWidth;
      bar.style.width = '0%';
      requestAnimationFrame(() => {
        setTimeout(() => {
          bar.style.transition = 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
          bar.style.width = targetWidth;
        }, 30);
      });
    });

    // 2. Animate Vertical Candle Fill Bars
    document.querySelectorAll('.analytics-candle-fill[data-target-height]').forEach(bar => {
      const targetHeight = bar.dataset.targetHeight;
      bar.style.height = '0%';
      requestAnimationFrame(() => {
        setTimeout(() => {
          bar.style.transition = 'height 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
          bar.style.height = targetHeight;
        }, 30);
      });
    });

    // 3. Animate Counter Values (e.g. 0 to 65 mins / 0.0 to 1.1 hrs)
    document.querySelectorAll('[data-counter-target]').forEach(el => {
      const targetVal = parseFloat(el.dataset.counterTarget) || 0;
      const format = el.dataset.counterFormat;
      const unit = el.dataset.counterUnit || '';
      const decimals = parseInt(el.dataset.counterDecimals, 10) || 0;
      const startTime = performance.now();
      const duration = 800;

      function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const currentValRaw = targetVal * easeProgress;
        
        if (format === 'time') {
          el.innerText = formatDuration(currentValRaw);
        } else {
          const currentVal = currentValRaw.toFixed(decimals);
          el.innerText = `${currentVal} ${unit}`;
        }

        if (progress < 1) {
          requestAnimationFrame(updateCounter);
        } else {
          if (format === 'time') {
            el.innerText = formatDuration(targetVal);
          } else {
            el.innerText = `${targetVal.toFixed(decimals)} ${unit}`;
          }
        }
      }

      requestAnimationFrame(updateCounter);
    });
  }

  async function openUserActivityModal(userId, username) {
    let overlayContainer = document.getElementById('user-analytics-dashboard-overlay');
    if (!overlayContainer) {
      overlayContainer = document.createElement('div');
      overlayContainer.id = 'user-analytics-dashboard-overlay';
      overlayContainer.className = 'analytics-dashboard-overlay';
      document.body.appendChild(overlayContainer);
    }

    const getMedalSvg = typeof window.BLUNK_LEAGUES !== 'undefined' && window.BLUNK_LEAGUES.getMedalSvg
      ? window.BLUNK_LEAGUES.getMedalSvg
      : () => '';

    overlayContainer.innerHTML = `
      <div class="analytics-body-container">
        <div id="analytics-dynamic-content">
          <div style="text-align:center; padding:80px 0; color:var(--t-text-muted);">
            Kullanıcı profili ve aktivite analiz verileri yükleniyor...
          </div>
        </div>
      </div>
    `;

    setTimeout(() => overlayContainer.classList.add('active'), 10);
    document.body.style.overflow = 'hidden';

    try {
      const gCurrentUser = (typeof currentUser !== 'undefined') ? currentUser : (window.currentUser || null);
      const currentLoggedInUserId = (gCurrentUser && gCurrentUser.id) ? gCurrentUser.id : null;
      const url = `/api/users/${userId}/weekly-activity-breakdown${currentLoggedInUserId ? '?currentUserId=' + currentLoggedInUserId : ''}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('Sunucu hatası');
      const data = await res.json();
      const user = data.user || { id: userId, username, profile_photo: '/default-avatar.png', level: 1, status: 'online', is_following: false };
      const breakdown = data.breakdown || [];

      const contentEl = document.getElementById('analytics-dynamic-content');
      if (!contentEl) return;

      let calendarData = null;

      let totalWeeklyMins = breakdown.reduce((acc, d) => acc + d.total_minutes, 0);
      let totalWeeklyHoursText = formatDuration(totalWeeklyMins);

      // Determine active day: use retained date if exists in breakdown, else highest mins, else last day
      let activeDayObj = null;
      if (analyticsState.activeDate) {
        activeDayObj = breakdown.find(d => d.date === analyticsState.activeDate);
      }
      if (!activeDayObj) {
        activeDayObj = breakdown.reduce((max, d) => (d.total_minutes > (max ? max.total_minutes : -1) ? d : max), null) || breakdown[breakdown.length - 1];
        if (activeDayObj) analyticsState.activeDate = activeDayObj.date;
      }

      let medalsHtml = '';
      if (user.medals && user.medals.length > 0) {
        medalsHtml = user.medals.map(m => `
          <div class="analytics-medal-badge clickable-medal-badge" data-medal='${JSON.stringify(m).replace(/'/g, "&apos;")}' style="cursor:pointer; display:flex; align-items:center; gap:8px;" title="Madalya Detayını İncele">
            <div class="medal-3d-mini-container" data-medal-raw='${JSON.stringify(m).replace(/'/g, "&apos;")}' style="width:36px; height:36px; display:inline-block; vertical-align:middle;"></div>
            <span style="font-weight:700; font-size:12px;">${m.league_name} (#${m.rank})</span>
          </div>
        `).join('');
      } else {
        medalsHtml = `<span style="font-size:11px; color:var(--t-text-muted);">Henüz sergilenen madalya yok.</span>`;
      }

      async function fetchCalendarData(y, m) {
        try {
          const cRes = await fetch(`/api/users/${userId}/all-time-calendar?year=${y}&month=${m}`);
          if (cRes.ok) {
            calendarData = await cRes.json();
          }
        } catch (e) {
          console.error('[CALENDAR] Error loading calendar:', e);
        }
      }

      await fetchCalendarData(analyticsState.selectedYear, analyticsState.selectedMonth);

      async function renderDashboard() {
        const maxMins = Math.max(1, ...breakdown.map(d => d.total_minutes));

        // 7 Day Candle Bars
        const candlesHtml = breakdown.map(d => {
          const isSelected = activeDayObj && activeDayObj.date === d.date;
          const heightPct = Math.max(8, Math.round((d.total_minutes / maxMins) * 100));

          return `
            <div class="analytics-candle-col ${isSelected ? 'active-candle' : ''}" data-date="${d.date}">
              <span style="font-size:10px; font-weight:800; color:var(--t-text-primary);" data-counter-target="${d.total_minutes}" data-counter-format="time">0 dk</span>
              <div class="analytics-candle-track">
                <div class="analytics-candle-fill" data-target-height="${heightPct}%" style="height:0%;"></div>
              </div>
              <span style="font-size:10px; color:${isSelected ? 'var(--t-accent-primary)' : 'var(--t-text-muted)'}; font-weight:800;">
                ${d.day_name.substring(0, 3)}
              </span>
            </div>
          `;
        }).join('');

        // Category Activity Bar Candles for Selected Day
        let dayDetailsHtml = '';
        const regDateStr = calendarData && calendarData.registered_at ? calendarData.registered_at.split('T')[0] : '2026-01-01';
        const isRegDay = activeDayObj && activeDayObj.date === regDateStr;

        let milestoneBannerHtml = '';
        if (isRegDay) {
          milestoneBannerHtml = `
            <div style="background:linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(59,130,246,0.15) 100%); border:1px solid #10b981; border-radius:10px; padding:10px 14px; color:#10b981; font-size:12px; font-weight:800; margin-bottom:8px;">
              ${getRandomMilestone(user.username)}
            </div>
          `;
        }

        if (!activeDayObj || !activeDayObj.items || activeDayObj.items.length === 0) {
          const quoteStr = (typeof window.getFunnyEmptyDayQuote === 'function' && activeDayObj)
            ? window.getFunnyEmptyDayQuote(activeDayObj.date, activeDayObj.day_name, user.id)
            : 'Bu gün kaydedilmiş bir odak seansı bulunmuyor.';

          dayDetailsHtml = `
            ${milestoneBannerHtml}
            <div style="padding:18px 20px; text-align:center; background:var(--t-bg-input); border-radius:12px; border:1px solid var(--t-border-subtle, rgba(255,255,255,0.08)); color:var(--t-text-secondary); font-size:12.5px; font-weight:600; line-height:1.5;">
              <div style="font-size:11px; font-weight:800; color:var(--t-accent-primary); text-transform:uppercase; letter-spacing:0.8px; margin-bottom:6px;">
                ${activeDayObj ? (activeDayObj.day_name + ' (' + activeDayObj.date + ')') : 'Seçili Gün'}
              </div>
              ${quoteStr}
            </div>
          `;
        } else {
          const sortedItems = [...activeDayObj.items].sort((a, b) => b.minutes - a.minutes);
          const maxDayMins = Math.max(1, ...sortedItems.map(i => i.minutes));

          const categoryCandlesHtml = sortedItems.map(item => {
            const barPct = Math.max(12, Math.round((item.minutes / maxDayMins) * 100));
            return `
              <div class="category-candle-item">
                <div class="category-candle-label" title="${item.category} (${item.activity})">
                  ${item.category} <span style="opacity:0.6; font-weight:400;">(${item.activity})</span>
                </div>
                <div class="category-candle-track-bar">
                  <div class="category-candle-fill-bar" data-target-width="${barPct}%" style="width:0%;"></div>
                  <div class="category-candle-value" data-counter-target="${item.minutes}" data-counter-format="time">0 dk</div>
                </div>
              </div>
            `;
          }).join('');

          dayDetailsHtml = `
            ${milestoneBannerHtml}
            <div class="analytics-category-candles-container">
              <div style="font-size:11px; font-weight:800; color:var(--t-text-muted); text-transform:uppercase; letter-spacing:0.8px; margin-bottom:4px;">
                ${activeDayObj.day_name} (${activeDayObj.date}) KATEGORİ VE AKTİVİTE MUM GRAFİĞİ
              </div>
              ${categoryCandlesHtml}
            </div>
          `;
        }

        let mainSectionHtml = '';
        if (analyticsState.mode === 'calendar') {
          const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
          const calendarDays = (calendarData && calendarData.days) || [];
          const offset = (calendarData && calendarData.first_day_offset) || 0;

          let prevMonthCells = '';
          for (let i = 0; i < offset; i++) {
            prevMonthCells += `<div class="real-calendar-cell other-month"></div>`;
          }

          const todayIsoStr = new Date().toISOString().split('T')[0];

          const regDateOnlyStr = (calendarData && calendarData.registered_at) ? calendarData.registered_at.split('T')[0].split(' ')[0] : '2026-01-01';

          const gridDaysHtml = calendarDays.map(d => {
            const isPreReg = d.date < regDateOnlyStr;
            const isReg = d.date === regDateOnlyStr;
            const isToday = d.date === todayIsoStr;
            const hasFocus = d.total_minutes > 0;
            const isSelected = activeDayObj && activeDayObj.date === d.date;

            let cellClass = 'real-calendar-cell';
            if (isPreReg) cellClass += ' pre-registration';
            if (isReg) cellClass += ' registration-day';
            if (isSelected) cellClass += ' selected-day';
            const todayIndicatorHtml = isToday ? `
              <div style="font-size:8.5px; font-weight:900; color:#eab308; background:rgba(234,179,8,0.18); border:1px solid #eab308; padding:1px 6px; border-radius:6px; display:inline-flex; align-items:center; gap:3px;">
                <span style="width:4px; height:4px; border-radius:50%; background:#eab308; display:inline-block; flex-shrink:0;"></span>
                <span class="real-calendar-today-text">BUGÜN</span>
              </div>
            ` : '';

            return `
              <div class="${cellClass}" data-date="${d.date}" style="${isToday ? 'border: 2px solid #eab308 !important; background: rgba(234,179,8,0.12) !important;' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:4px;">
                  <div class="real-calendar-day-num" style="${isToday ? 'color:#eab308 !important; font-weight:900;' : ''}">${d.day}</div>
                  ${todayIndicatorHtml}
                </div>
                ${hasFocus && !isPreReg ? `<div class="real-calendar-focus-badge">${formatDuration(d.total_minutes)}</div>` : ''}
              </div>
            `;
          }).join('');

          mainSectionHtml = `
            <div class="analytics-chart-section">
              <div class="analytics-split-layout">
                <!-- LEFT COLUMN: WALL CALENDAR WIDGET -->
                <div class="analytics-split-left">
                  <div class="real-calendar-container">
                    <div class="real-calendar-header">
                      <div style="display:flex; align-items:center; gap:10px;">
                        <button id="toggle-weekly-mode-btn" class="analytics-follow-btn" style="background:var(--t-bg-card); border:1px solid rgba(255,255,255,0.1); color:var(--t-text-primary); padding:4px 10px; font-size:11px;">
                          ← 7 Günlük Özet
                        </button>
                        <div class="real-calendar-month-title">${monthNames[analyticsState.selectedMonth - 1]} ${analyticsState.selectedYear}</div>
                      </div>

                      <div style="display:flex; align-items:center; gap:6px;">
                        <button id="cal-prev-month-btn" class="real-calendar-nav-btn" title="Önceki Ay">&larr;</button>
                        <button id="cal-next-month-btn" class="real-calendar-nav-btn" title="Sonraki Ay">&rarr;</button>
                      </div>
                    </div>

                    <div class="real-calendar-weekdays">
                      <div>Pzt</div><div>Sal</div><div>Çar</div><div>Per</div><div>Cum</div><div>Cmt</div><div>Paz</div>
                    </div>

                    <div class="real-calendar-grid">
                      ${prevMonthCells}
                      ${gridDaysHtml}
                    </div>
                  </div>
                </div>

                <!-- RIGHT COLUMN: SELECTED DAY CATEGORY BREAKDOWN -->
                <div class="analytics-split-right">
                  ${dayDetailsHtml}
                </div>
              </div>
            </div>
          `;
        } else {
          // Side-by-side split layout for 7-Day view as well!
          mainSectionHtml = `
            <div class="analytics-chart-section">
              <div class="analytics-split-layout">
                <!-- LEFT COLUMN: 7-DAY CANDLE CHART -->
                <div class="analytics-split-left">
                  <div class="analytics-chart-header">
                    <div class="analytics-chart-title">Son 7 Günlük Odak Performansı</div>
                    <div class="analytics-weekly-total-badge">Toplam ${totalWeeklyHoursText}</div>
                  </div>

                  <div class="analytics-candles-grid" style="height:100%;">
                    ${candlesHtml}
                  </div>
                </div>

                <!-- RIGHT COLUMN: SELECTED DAY CATEGORY BREAKDOWN -->
                <div class="analytics-split-right">
                  ${dayDetailsHtml}
                </div>
              </div>
            </div>
          `;
        }

        const gCurrentUser = (typeof currentUser !== 'undefined') ? currentUser : (window.currentUser || null);
        const myId = (gCurrentUser && gCurrentUser.id) ? gCurrentUser.id : null;
        const isSelf = myId && parseInt(myId) === parseInt(user.id);

        const followBtnText = user.is_following ? '✓ Takip Ediliyor' : '+ Takip Et';
        const followBtnClass = user.is_following ? 'analytics-follow-btn following' : 'analytics-follow-btn';
        
        const followBtnHtml = isSelf ? '' : `
          <button class="${followBtnClass}" id="analytics-follow-action-btn">
            ${followBtnText}
          </button>
        `;

        contentEl.innerHTML = `
          <!-- USER PROFILE CARD -->
          <div class="analytics-profile-card">
            <div class="analytics-banner-bg">
              <button class="analytics-close-btn" id="close-analytics-overlay-btn">&times;</button>
            </div>
            <div class="analytics-profile-content">
              <div class="analytics-user-row">
                <div class="analytics-avatar-wrapper" style="cursor:pointer;" id="user-profile-avatar-click">
                  <img src="${user.profile_photo}" alt="${user.username}" class="analytics-avatar-img" onError="this.src='/default-avatar.png'" />
                  <div class="analytics-status-dot ${user.status === 'online' ? 'online' : 'offline'}" title="${user.status === 'online' ? 'Çevrimiçi' : 'Çevrimdışı'}"></div>
                </div>

                <div style="display:flex; align-items:center; gap:8px;">
                  <button class="analytics-follow-btn" id="analytics-calendar-toggle-btn" title="İnteraktif Odak Takvimi" style="background:var(--t-bg-input); border:1px solid rgba(255,255,255,0.1); color:var(--t-text-primary); padding:8px 12px;">
                    📅 Takvim
                  </button>
                  ${followBtnHtml}
                </div>
              </div>

              <div class="analytics-user-details-box">
                <div class="analytics-username" style="cursor:pointer;" id="user-profile-name-click">
                  @${user.username}
                  <span class="analytics-user-level-badge">LVL ${user.level}</span>
                </div>
                ${user.bio ? `<p class="analytics-user-bio" style="font-size:12px; margin-top:2px;">${user.bio}</p>` : ''}
              </div>

              <div class="analytics-medals-row">
                <span style="font-size:11px; font-weight:800; color:var(--t-text-secondary);">Vitrin Madalyaları:</span>
                ${medalsHtml}
              </div>
            </div>
          </div>

          ${mainSectionHtml}
        `;

        // Trigger Client-Side Bar Expansion & Number Counting Animation
        setTimeout(animateCountersAndBars, 30);

        // Profile Click Handlers (Avatar & Username)
        const avatarClick = contentEl.querySelector('#user-profile-avatar-click');
        const nameClick = contentEl.querySelector('#user-profile-name-click');
        const goToProfile = () => {
          overlayContainer.classList.remove('active');
          document.body.style.overflow = '';
          if (typeof window.openProfile === 'function') {
            window.openProfile(user.username);
          } else if (typeof window.openUserPage === 'function') {
            window.openUserPage(user.username);
          } else if (typeof window.showPage === 'function') {
            window.showPage('profile');
          } else {
            window.location.href = `/${encodeURIComponent(user.username)}`;
          }
        };
        if (avatarClick) avatarClick.onclick = goToProfile;
        if (nameClick) nameClick.onclick = goToProfile;

        // Showcased Medal Click Handlers -> Open Rich Medal Detail Modal
        contentEl.querySelectorAll('.clickable-medal-badge').forEach(badge => {
          badge.onclick = (e) => {
            try {
              const medalObj = JSON.parse(e.currentTarget.dataset.medal);
              if (typeof window.BLUNK_LEAGUES !== 'undefined' && typeof window.BLUNK_LEAGUES.openMedalModal === 'function') {
                window.BLUNK_LEAGUES.openMedalModal(medalObj);
              }
            } catch (err) {
              console.error('[MEDAL_CLICK_ERROR]', err);
            }
          };
        });

        // Initialize 3D Mini Medals in Showcase
        if (window.BLUNK_MEDAL_3D) {
          contentEl.querySelectorAll('.medal-3d-mini-container').forEach(container => {
            try {
              const mData = JSON.parse(container.dataset.medalRaw);
              window.BLUNK_MEDAL_3D.render(container, mData, { interactive: false, autoRotate: true, size: 36 });
            } catch (e) {
              console.error('[3D_MINI_ERROR]', e);
            }
          });
        }

        // Calendar Toggle Button Handler
        const calToggleBtn = contentEl.querySelector('#analytics-calendar-toggle-btn');
        if (calToggleBtn) {
          calToggleBtn.onclick = async () => {
            analyticsState.mode = 'calendar';
            await fetchCalendarData(analyticsState.selectedYear, analyticsState.selectedMonth);
            renderDashboard();
          };
        }

        // Toggle back to weekly mode
        const backWeeklyBtn = contentEl.querySelector('#toggle-weekly-mode-btn');
        if (backWeeklyBtn) {
          backWeeklyBtn.onclick = () => {
            analyticsState.mode = 'chart';
            renderDashboard();
          };
        }

        // Month Navigation Buttons (Previous / Next)
        const prevMonthBtn = contentEl.querySelector('#cal-prev-month-btn');
        const nextMonthBtn = contentEl.querySelector('#cal-next-month-btn');
        if (prevMonthBtn) {
          prevMonthBtn.onclick = async () => {
            analyticsState.selectedMonth--;
            if (analyticsState.selectedMonth < 1) {
              analyticsState.selectedMonth = 12;
              analyticsState.selectedYear--;
              if (analyticsState.selectedYear < 2026) analyticsState.selectedYear = 2026;
            }
            await fetchCalendarData(analyticsState.selectedYear, analyticsState.selectedMonth);
            renderDashboard();
          };
        }
        if (nextMonthBtn) {
          nextMonthBtn.onclick = async () => {
            analyticsState.selectedMonth++;
            if (analyticsState.selectedMonth > 12) {
              analyticsState.selectedMonth = 1;
              analyticsState.selectedYear++;
            }
            await fetchCalendarData(analyticsState.selectedYear, analyticsState.selectedMonth);
            renderDashboard();
          };
        }

        // Calendar Day Click Handlers
        contentEl.querySelectorAll('.real-calendar-cell').forEach(gridEl => {
          gridEl.onclick = (e) => {
            if (e.currentTarget.classList.contains('pre-registration')) return;
            const dateStr = e.currentTarget.dataset.date;
            if (calendarData && calendarData.days) {
              const found = calendarData.days.find(d => d.date === dateStr);
              if (found) {
                activeDayObj = found;
                analyticsState.activeDate = found.date;
                renderDashboard();
              }
            }
          };
        });

        // Close Button
        const closeBtn = contentEl.querySelector('#close-analytics-overlay-btn');
        if (closeBtn) {
          closeBtn.onclick = () => {
            overlayContainer.classList.remove('active');
            document.body.style.overflow = '';
          };
        }

        const followBtn = contentEl.querySelector('#analytics-follow-action-btn');
        if (followBtn && !isSelf) {
            followBtn.onclick = async () => {
              followBtn.disabled = true;
              try {
                const fRes = await fetch(`/api/users/${user.id}/follow`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' }
                });

                const toastFn = (msg, type) => {
                  if (typeof showInAppToast === 'function') showInAppToast(msg);
                  else if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info');
                };

                if (fRes.status === 401) {
                  toastFn('Takip etmek için önce giriş yapmalısınız.', 'info');
                  return;
                }

                if (!fRes.ok) {
                  const errData = await fRes.json();
                  toastFn(errData.error || 'İşlem başarısız.', 'error');
                  return;
                }

                const fData = await fRes.json();
                user.is_following = fData.is_following;

                if (user.is_following) {
                  toastFn(`@${user.username} takip ediliyor`, 'success');
                } else {
                  toastFn(`@${user.username} takipten çıkarıldı`, 'info');
                }

                renderDashboard();
              } catch (err) {
                console.error('[FOLLOW_CLICK_ERR]', err);
              } finally {
                followBtn.disabled = false;
              }
            };
        }

        // Candle Click Event Listeners
        contentEl.querySelectorAll('.analytics-candle-col').forEach(col => {
          col.addEventListener('click', (e) => {
            const dateStr = e.currentTarget.dataset.date;
            const found = breakdown.find(d => d.date === dateStr);
            if (found) {
              activeDayObj = found;
              analyticsState.activeDate = found.date;
              renderDashboard();
            }
          });
        });

        if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      }

      renderDashboard();

    } catch (e) {
      console.error('[ANALYTICS_DASHBOARD] Error:', e);
      const contentEl = document.getElementById('analytics-dynamic-content');
      if (contentEl) contentEl.innerHTML = '<div style="color:var(--t-text-muted);">Aktivite analizi yüklenirken hata oluştu.</div>';
    }
  }

  window.openUserActivityModal = openUserActivityModal;
  if (typeof window.BLUNK_LEAGUES !== 'undefined') {
    window.BLUNK_LEAGUES.openUserActivityModal = openUserActivityModal;
  }
})();
