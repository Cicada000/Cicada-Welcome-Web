// ============================================================================
// 頁面核心互動邏輯（年齡、成分展開、暗色模式切換、滾動進度與章節導航）
// ============================================================================

// 1. 年齡計算
(function setupAge() {
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear() - 2005);
  }
})();

// 2. 從 resource/ingredients.json 解析並渲染「成分複雜」展開面板
(function setupIngredients() {
  const toggleBtn = document.getElementById('ingredient-toggle');
  const panel = document.getElementById('ingredient-panel');
  const groupsWrap = document.getElementById('ingredient-groups');
  if (!toggleBtn || !panel || !groupsWrap) return;

  const renderIngredients = (groups) => {
    groupsWrap.textContent = '';
    if (!Array.isArray(groups)) return;

    for (const group of groups) {
      if (!group || !Array.isArray(group.items) || group.items.length === 0) continue;
      const groupEl = document.createElement('div');

      if (group.category) {
        const labelEl = document.createElement('span');
        labelEl.className = 'ingredient-group-label';
        labelEl.textContent = group.category;
        groupEl.appendChild(labelEl);
      }

      const tagsEl = document.createElement('div');
      tagsEl.className = 'ingredient-tags';
      for (const item of group.items) {
        const tag = document.createElement('span');
        tag.className = 'ingredient-tag';
        tag.textContent = String(item);
        tagsEl.appendChild(tag);
      }

      groupEl.appendChild(tagsEl);
      groupsWrap.appendChild(groupEl);
    }
  };

  fetch('resource/ingredients.json')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((data) => renderIngredients(data))
    .catch(() => {
      // 直接以 file:// 打開時的保底展示
      renderIngredients([
        { category: '攝影與影像', items: ['攝影', '街拍', '佳能', '風光攝影', '人文紀實', '膠片攝影', '黑白攝影', 'Lightroom', '視頻剪輯'] },
        { category: '音樂與樂器', items: ['小提琴', 'Hi-Fi 發燒', 'Lo-Fi'] },
        { category: '動漫與閱讀', items: ['EVA 新世紀福音戰士', '京阿尼', '新海誠', '今敏', '宮崎駿', '押井守', '庵野秀明', '日漫', '美漫', '輕小說', '聖地巡禮', '奇幻小說', '科幻小說', '推理小說'] },
        { category: '遊戲', items: ['Steam', '獨立遊戲', '視覺小說 / Galgame', '音遊', 'Minecraft'] },
        { category: '數碼與折騰', items: ['個人建站', '開源愛好者', '折騰各種小玩意', 'Web 開發', 'Linux', 'macOS', 'Windows', 'Android 刷機', '自託管 Self-Host', 'NAS', '軟路由', '樹莓派 / 單片機', '寫作 / 部落格', 'AI 工具', '字體排版', 'UI 設計', '3D 列印', '網路安全 / CTF'] },
        { category: '體育與戶外', items: ['鐵路 / 軌道交通', '城市漫步 Citywalk', '羽毛球', '乒乓球', 'F1'] },
        { category: '飲食與生活', items: ['日料', '火鍋', '博物館控', '逛展 / 美術館', '獨處愛好者', '茶飲 / 抹茶', '奶茶', '極簡主義'] },
        { category: '性格與標籤', items: ['INFP', '細節控', '拖延症'] },
      ]);
    });

  toggleBtn.addEventListener('click', () => {
    const willOpen = toggleBtn.getAttribute('aria-expanded') !== 'true';
    toggleBtn.setAttribute('aria-expanded', String(willOpen));

    if (willOpen) {
      panel.hidden = false;
      // 強制回流以觸發 block-size 過渡
      void panel.offsetHeight;
      panel.classList.add('is-open');
    } else {
      panel.classList.remove('is-open');
      const transitions = panel.getAnimations().filter((a) => a instanceof CSSTransition);
      if (transitions.length === 0) {
        panel.hidden = true;
      } else {
        Promise.allSettled(transitions.map((t) => t.finished)).then(() => {
          if (!panel.classList.contains('is-open')) {
            panel.hidden = true;
          }
        });
      }
    }
  });
})();

// 3. 暗色模式兩態切換（遵循系統預設，必要時覆寫並同步多標籤頁）
(function setupThemeToggle() {
  const meta = document.querySelector('meta[name="color-scheme"]');
  const btn = document.getElementById('theme-toggle');
  if (!meta || !btn) return;

  const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const getSystemScheme = () => (systemDarkQuery.matches ? 'dark' : 'light');

  const getStoredScheme = () => {
    try {
      const value = localStorage.getItem('color-scheme');
      return value === 'light' || value === 'dark' ? value : null;
    } catch (_) {
      return null;
    }
  };

  const applyScheme = (stored) => {
    meta.content = stored ?? 'light dark';
  };

  btn.addEventListener('click', () => {
    const currentRendered = getStoredScheme() ?? getSystemScheme();
    const target = currentRendered === 'dark' ? 'light' : 'dark';
    const nextStored = target === getSystemScheme() ? null : target;

    try {
      if (nextStored) {
        localStorage.setItem('color-scheme', nextStored);
      } else {
        localStorage.removeItem('color-scheme');
      }
    } catch (_) {}

    applyScheme(nextStored);
  });

  window.addEventListener('storage', (event) => {
    if (event.key === 'color-scheme') {
      applyScheme(getStoredScheme());
    }
  });
})();

// 4. 滾動進度百分比、進度條回退、右上角控制欄自動淡入淡出與章節高亮
(function setupScrollTracking() {
  const hudBar = document.getElementById('hud-bar');
  const percentEl = document.getElementById('scroll-percent');
  const progressEl = document.getElementById('scroll-progress');
  if (!hudBar || !percentEl || !progressEl) return;

  const supportsScrollTimeline = CSS.supports('animation-timeline', 'scroll()');
  const navLinks = Array.from(document.querySelectorAll('.hud-link'));
  const sections = Array.from(document.querySelectorAll('.section[id]'));

  let hudHideTimer = null;
  let isHudHovered = false;

  const setScrollUiVisible = (visible) => {
    hudBar.classList.toggle('is-visible', visible);
    progressEl.classList.toggle('is-visible', visible);
  };

  const hasKeyboardFocus = () => Boolean(hudBar.querySelector(':focus-visible'));

  const scheduleHudFadeOut = () => {
    clearTimeout(hudHideTimer);
    if (isHudHovered || hasKeyboardFocus()) return;
    hudHideTimer = setTimeout(() => {
      if (!isHudHovered && !hasKeyboardFocus()) {
        setScrollUiVisible(false);
      }
    }, 3000);
  };

  const showHud = () => {
    setScrollUiVisible(true);
    scheduleHudFadeOut();
  };

  hudBar.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    isHudHovered = true;
    clearTimeout(hudHideTimer);
    setScrollUiVisible(true);
  });

  hudBar.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    isHudHovered = false;
    scheduleHudFadeOut();
  });

  hudBar.addEventListener('click', () => {
    scheduleHudFadeOut();
  });

  hudBar.addEventListener('focusin', () => {
    if (hasKeyboardFocus()) {
      clearTimeout(hudHideTimer);
      setScrollUiVisible(true);
    }
  });

  hudBar.addEventListener('focusout', () => {
    scheduleHudFadeOut();
  });

  const updateScroll = (revealHud = false) => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    percentEl.textContent = `${Math.round(ratio * 100)}%`;

    if (!supportsScrollTimeline) {
      progressEl.style.transform = `scaleX(${ratio})`;
    }

    if (revealHud) {
      showHud();
    }
  };

  window.addEventListener('scroll', () => updateScroll(true), { passive: true });
  window.addEventListener('resize', () => updateScroll(false), { passive: true });
  updateScroll(false);
  scheduleHudFadeOut();

  const setActiveNav = (id) => {
    for (const link of navLinks) {
      link.classList.toggle('is-active', link.dataset.section === id);
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveNav(entry.target.id);
        }
      }
    },
    { rootMargin: '-40% 0px -40% 0px', threshold: 0 }
  );

  for (const section of sections) {
    observer.observe(section);
  }
})();
