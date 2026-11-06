// DAT One Security & Lockdown Guard Script
// Injected into embedded DAT view to enforce single Search Loads interface and Tab Limits

const lockCss = `
  /* Hide all nav links except Search Loads */
  a.nav-link:not(.link-search-loads-ow) {
    display: none !important;
  }
  nav li:not(:has(.link-search-loads-ow)),
  .sidebar li:not(:has(.link-search-loads-ow)),
  .nav-container li:not(:has(.link-search-loads-ow)) {
    display: none !important;
  }
  .link-chat, a[href*="chat"] { display: none !important; }
  .link-notifications, [class*="notification" i], [aria-label*="notification" i], a[href*="notification"] {
    display: none !important; pointer-events: none !important;
  }
  a[href*="account.dat.com"], a[href*="billing"], [aria-label*="account" i] {
    display: none !important; pointer-events: none !important;
  }
`;

const lockJs = `
  (() => {
    // 0 = unlimited (super admin hasn't set a cap). Any positive N caps tabs.
    const DEFAULT_LIMIT = 0;

    // ── Precise selectors from Phase-0 live DOM dump ──────────────────────────
    //
    // Open search tabs:
    //   div.mat-ripple.mat-tab-label.mat-focus-indicator  (one per tab, inside mat-tab-labels)
    //   THEIR text = "New Search"  (the tab label)
    //
    // "Add new search" blue + button:
    //   It lives OUTSIDE mat-tab-header, as a sibling or cousin.
    //   It is a <button> that contains  <mat-icon>add</mat-icon>
    //   OR its own textContent is "add" (Material ligature).
    //
    // "CLOSE ALL" button also lives near the header but its textContent
    //   contains "CLOSE ALL" — we explicitly exclude it.

    // Count open search tabs precisely.
    // DAT's mat-tab-labels contains N real tabs + 1 wide empty "add slot"
    // (confirmed via live diagnostic: slot has no text, no close button,
    // no .tab-header-new marker). Only real closeable tabs count.
    const countSearchTabs = () => {
      const container = document.querySelector(
        'mat-tab-group.search-tab-label .mat-tab-labels, ' +
        '.search-tab-label .mat-tab-labels, ' +
        '.mat-tab-labels'
      );
      if (!container) return 0;
      let count = 0;
      container.querySelectorAll('.mat-tab-label').forEach(tab => {
        if (tab.getBoundingClientRect().width < 5) return;
        const text = (tab.textContent || '').trim().toLowerCase();
        if (text.includes('close all')) return;
        // A real tab is one DAT lets the user close (X button). The empty
        // layout slot that always sits at the end has no close icon.
        const hasClose = !!tab.querySelector(
          '[data-test="close-tab-button"], .tab-close-icon, cg-icon[icon*="close" i]'
        );
        const hasNewSearch = !!tab.querySelector('.tab-header-new, .new-search');
        if (!hasClose && !hasNewSearch) return; // skip the empty add-slot
        count++;
      });
      return count;
    };

    // Find the blue "+" add-new-search button.
    // Confirmed live DOM:
    //   <div class="add-closeall-container">
    //     <button data-test="new-tab-button" class="add-button mat-button ...">
    //       <span class="mat-button-wrapper">
    //         <cg-icon icon="add-outline" class="tab-add-icon">
    const findAddButton = () => {
      // Strategy 1 (precise — from live DOM dump)
      let btn = document.querySelector(
        'button[data-test="new-tab-button"], ' +
        'button.add-button, ' +
        '.add-closeall-container > button'
      );
      if (btn) return btn;

      // Strategy 2: find via the cg-icon add-outline and climb to its button
      const addIcon = document.querySelector(
        'cg-icon.tab-add-icon, cg-icon[icon="add-outline"], cg-icon[icon*="add" i]'
      );
      if (addIcon) {
        const parentBtn = addIcon.closest('button');
        if (parentBtn) return parentBtn;
      }

      // Strategy 3: button containing <mat-icon>add</mat-icon> (older Material style)
      const allBtns = Array.from(document.querySelectorAll('button'));
      for (const b of allBtns) {
        const icon = b.querySelector('mat-icon');
        if (icon && (icon.textContent || '').trim().toLowerCase() === 'add') {
          const btext = (b.textContent || '').trim().toLowerCase();
          if (!btext.includes('close all')) return b;
        }
      }

      // Strategy 4: aria-label / title match
      const ariaEl = document.querySelector(
        '[aria-label*="new tab" i], [aria-label*="add tab" i], ' +
        '[aria-label*="new search" i], [title*="new search" i]'
      );
      if (ariaEl && !ariaEl.classList.contains('mat-tab-label')) {
        return ariaEl.closest('button') || ariaEl;
      }

      return null;
    };

    // ── State ─────────────────────────────────────────────────────────────────
    let lastCount = -1;
    let lastLimit = -1;
    let lastBtnEl = null;
    let atLimitNow = false;

    // Apply or remove disabled state to the add-tab button AND its wrapper
    // (so clicks on the padding around the icon are also blocked).
    const applyButtonState = (btn, disabled) => {
      if (!btn) return;
      const wrap = btn.closest('.add-closeall-container') || btn.parentElement;
      const targets = [btn, wrap].filter(Boolean);
      for (const t of targets) {
        if (disabled) {
          t.style.setProperty('pointer-events', 'none',         'important');
          t.style.setProperty('opacity',        '0.3',          'important');
          t.style.setProperty('filter',         'grayscale(1)', 'important');
          t.style.setProperty('cursor',         'not-allowed',  'important');
          t.setAttribute('aria-disabled', 'true');
        } else {
          t.style.removeProperty('pointer-events');
          t.style.removeProperty('opacity');
          t.style.removeProperty('filter');
          t.style.removeProperty('cursor');
          t.removeAttribute('aria-disabled');
        }
      }
      // Also set the native disabled attribute so DAT's own code treats it as disabled.
      if (disabled) btn.setAttribute('disabled', 'disabled');
      else          btn.removeAttribute('disabled');
    };

    // ── Main lock function ────────────────────────────────────────────────────
    const lockUI = () => {
      // 1. Hide sidebar items other than Search Loads
      document.querySelectorAll('a.nav-link, button.nav-link').forEach(el => {
        const text = (el.textContent || '').trim().toLowerCase();
        const isSearchLoads = el.classList.contains('link-search-loads-ow') || text === 'search loads';
        if (!isSearchLoads) {
          el.style.setProperty('display', 'none', 'important');
          const parent = el.closest('li, .nav-item');
          if (parent && !parent.querySelector('.link-search-loads-ow')) {
            parent.style.setProperty('display', 'none', 'important');
          }
        }
      });

      // 2. Hide Account Information & Billing
      document.querySelectorAll('a, button, span, div').forEach(el => {
        const href = (el.getAttribute('href') || '').toLowerCase();
        const text = (el.textContent || '').trim().toLowerCase();
        if (href.includes('account.dat.com') || text === 'account information' || text === 'billing') {
          const item = el.closest('a, button, [role="menuitem"], .mat-menu-item') || el;
          item.style.setProperty('display', 'none', 'important');
          item.style.setProperty('pointer-events', 'none', 'important');
        }
      });

      // 3. Hide Chat
      document.querySelectorAll('.link-chat, a[href*="chat"]').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });

      // 4. Hide Notifications
      document.querySelectorAll(
        '.link-notifications, [class*="notification" i], [aria-label*="notification" i], a[href*="notification"]'
      ).forEach(el => {
        const item = el.closest('li, .nav-item, button, a') || el;
        item.style.setProperty('display', 'none', 'important');
        item.style.setProperty('pointer-events', 'none', 'important');
      });

      // 5. Tab Limit Enforcement
      // LIMIT <= 0  => unlimited (never disable; always re-enable if previously
      // disabled). LIMIT > 0 => cap enforced.
      try {
        const rawLimit = Number(window.__datLoadTabLimit);
        const LIMIT = (Number.isFinite(rawLimit) && rawLimit > 0) ? rawLimit : 0;
        const count = countSearchTabs();
        // Expose live tab count so main-process heartbeat can read it without
        // re-running this logic from executeJavaScript on every poll.
        window.__datTabCount = count;
        const btn   = findAddButton();
        const shouldDisable = (LIMIT > 0 && count >= LIMIT);

        // Log only on change
        if (count !== lastCount || LIMIT !== lastLimit || btn !== lastBtnEl || shouldDisable !== atLimitNow) {
          lastCount  = count;
          lastLimit  = LIMIT;
          lastBtnEl  = btn;
          atLimitNow = shouldDisable;
          console.log('[DAT-GUARD] tabs=' + count + ' limit=' + LIMIT + ' btn=' + (btn ? btn.tagName + '.' + btn.className.split(' ').slice(0,2).join('.') : 'NOT_FOUND') + ' disabled=' + shouldDisable);
        }

        applyButtonState(btn, shouldDisable);
      } catch(e) {
        console.log('[DAT-GUARD] tab-limit error:', e && e.message);
      }
    };

    // ── Run & observe ─────────────────────────────────────────────────────────
    lockUI();
    const observer = new MutationObserver(lockUI);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // Fallback timer — catches Angular OnPush / detached view updates
    setInterval(lockUI, 500);

    // ── Click blocker ─────────────────────────────────────────────────────────
    const blockIfAtLimit = (e, logOnBlock) => {
      try {
        const rawLimit = Number(window.__datLoadTabLimit);
        const LIMIT = (Number.isFinite(rawLimit) && rawLimit > 0) ? rawLimit : 0;
        if (LIMIT <= 0) return;                 // unlimited
        if (countSearchTabs() < LIMIT) return;  // under cap
        const btn = findAddButton();
        if (!btn) return;
        if (btn === e.target || btn.contains(e.target)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (logOnBlock) console.log('[DAT-GUARD] click blocked — limit reached');
        }
      } catch(_) {}
    };
    document.addEventListener('click',     (e) => blockIfAtLimit(e, true),  true);
    document.addEventListener('mousedown', (e) => blockIfAtLimit(e, false), true);

  })();
`;

module.exports = { lockCss, lockJs };
