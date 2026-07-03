/* ============================================================
   site.js — v3
   ============================================================ */
(function () {
  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduceMotion = reduceMotionQuery.matches;
  const THEME_KEY = "gs-theme";
  const THEME_COLORS = { light: "#f6f4ed", dark: "#0d0c0a" };
  let hudVisible = true; // HUD is display:none on phones; cached to skip wasted scroll work
  let scrollMax = 1;
  function refreshScrollMetrics() {
    const h = document.documentElement;
    scrollMax = Math.max(1, h.scrollHeight - h.clientHeight);
  }

  // ---- unified scroll / resize scheduler ----
  // Every scroll-driven effect (progress bar, HUD, scroll-spy, nav state,
  // parallax) registers here and runs inside ONE requestAnimationFrame. A burst
  // of scroll events therefore collapses into a single batched update per frame
  // instead of each handler independently waking up and forcing its own layout.
  const scrollTasks = [];
  let scrollScheduled = false;
  function runScrollTasks() {
    scrollScheduled = false;
    for (let i = 0; i < scrollTasks.length; i++) {
      try { scrollTasks[i](); } catch (_) {}
    }
  }
  function scheduleScroll() {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(runScrollTasks);
  }
  function onScrollTask(fn) { scrollTasks.push(fn); return fn; }
  window.addEventListener("scroll", scheduleScroll, { passive: true });
  window.addEventListener("resize", () => {
    refreshScrollMetrics();
    scheduleScroll();
  }, { passive: true });
  window.addEventListener("load", () => {
    refreshScrollMetrics();
    scheduleScroll();
  }, { once: true, passive: true });

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  const pendingStorageWrites = new Map();
  function writeStorageSoon(key, value) {
    const pending = pendingStorageWrites.get(key);
    if (pending) {
      if (pending.type === "idle" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(pending.id);
      } else {
        clearTimeout(pending.id);
      }
    }
    const write = () => {
      pendingStorageWrites.delete(key);
      try { localStorage.setItem(key, value); } catch (_) {}
    };
    if ("requestIdleCallback" in window) {
      pendingStorageWrites.set(key, {
        type: "idle",
        id: window.requestIdleCallback(write, { timeout: 700 })
      });
    } else {
      pendingStorageWrites.set(key, { type: "timeout", id: setTimeout(write, 0) });
    }
  }

  // ---- text selection ----
  const isSelectionEnabled = readStorage("gs-text-selection") !== "false";
  root.classList.toggle("selection-enabled", isSelectionEnabled);

  // ---- theme ----
  const saved = readStorage(THEME_KEY);
  let themeLabels = null;
  let themeButtons = null;
  let themeToggles = null;
  let dynamicThemeMeta = null;
  let themeCleanupTimer = 0;
  let themeValue = normalizeTheme(root.getAttribute("data-theme"));
  let pendingTheme = themeValue;
  let activeThemeTransition = null;

  function normalizeTheme(t) {
    return t === "dark" ? "dark" : "light";
  }

  function connected(list) {
    return list && !list.some(el => !el.isConnected);
  }

  function getThemeLabels() {
    if (!connected(themeLabels)) themeLabels = $$("[data-theme-label]");
    return themeLabels;
  }

  function getThemeButtons() {
    if (!connected(themeButtons)) themeButtons = $$("[data-tweak-theme] button");
    return themeButtons;
  }

  function getThemeToggles() {
    if (!connected(themeToggles)) themeToggles = $$(".theme-toggle");
    return themeToggles;
  }

  function getThemeMeta() {
    if (dynamicThemeMeta && dynamicThemeMeta.isConnected) return dynamicThemeMeta;
    dynamicThemeMeta = document.querySelector('meta[name="theme-color"][data-theme-dynamic]');
    if (!dynamicThemeMeta) {
      dynamicThemeMeta = document.querySelector('meta[name="theme-color"]:not([media])');
    }
    if (!dynamicThemeMeta && document.head) {
      dynamicThemeMeta = document.createElement("meta");
      dynamicThemeMeta.name = "theme-color";
      dynamicThemeMeta.setAttribute("data-theme-dynamic", "");
      document.head.appendChild(dynamicThemeMeta);
    }
    return dynamicThemeMeta;
  }

  function syncThemeControls(theme) {
    const isDark = theme === "dark";
    getThemeLabels().forEach(el => { el.textContent = isDark ? "LIGHT" : "DARK"; });
    getThemeButtons().forEach(b => b.classList.toggle("active", b.dataset.val === theme));
    getThemeToggles().forEach(btn => {
      btn.setAttribute("aria-pressed", String(isDark));
      btn.setAttribute("title", isDark ? "Switch to light mode" : "Switch to dark mode");
    });
    const meta = getThemeMeta();
    if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
  }

  function commitTheme(theme, persist) {
    themeValue = theme;
    pendingTheme = theme;
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
    syncThemeControls(theme);
    if (persist) writeStorageSoon(THEME_KEY, theme);
  }

  function setTheme(t, animate, options = {}) {
    const next = normalizeTheme(t);
    const current = pendingTheme;
    const persist = options.persist !== false;

    if (current === next) {
      if (normalizeTheme(root.getAttribute("data-theme")) !== next) {
        commitTheme(next, persist);
      } else {
        syncThemeControls(next);
      }
      if (persist) writeStorageSoon(THEME_KEY, next);
      return;
    }

    pendingTheme = next;

    clearTimeout(themeCleanupTimer);
    root.classList.remove("theme-anim");

    if (activeThemeTransition) {
      commitTheme(next, persist);
      return;
    }

    if (!animate || reduceMotion) {
      root.classList.remove("theme-switching");
      commitTheme(next, persist);
      return;
    }

    if (typeof document.startViewTransition === "function") {
      root.classList.add("theme-switching");
      try {
        const transition = document.startViewTransition(() => {
          commitTheme(pendingTheme, persist);
        });
        activeThemeTransition = transition;
        transition.finished.finally(() => {
          if (activeThemeTransition === transition) activeThemeTransition = null;
          root.classList.remove("theme-switching");
        });
        return;
      } catch (_) {
        activeThemeTransition = null;
        root.classList.remove("theme-switching");
      }
    }

    root.classList.add("theme-anim");
    commitTheme(next, persist);
    themeCleanupTimer = setTimeout(() => root.classList.remove("theme-anim"), 260);
  }
  setTheme(saved || root.getAttribute("data-theme") || "light", false, { persist: false });

  document.addEventListener("click", (e) => {
    // Only the real theme toggle, NOT the ? help button
    const tt = e.target.closest(".theme-toggle");
    if (tt && !tt.hasAttribute("data-help-toggle")) {
      const cur = pendingTheme;
      setTheme(cur === "dark" ? "light" : "dark", true);
    }
  });

  // ---- nav active state w/ scroll-spy & sliding pill ----
  function updateNavPill() {
    const container = document.querySelector(".nav-links");
    if (!container) return;
    
    let pill = container.querySelector(".nav-indicator-pill");
    if (!pill) {
      pill = document.createElement("div");
      pill.className = "nav-indicator-pill";
      container.appendChild(pill);
      container.classList.add("js-nav-pill");
    }
    
    const activeLink = container.querySelector("a.active");
    if (activeLink) {
      // Measure relative to the container's box so the pill stays correct even when
      // the active link is nested (e.g. the Work item that now holds the dropdown).
      const cRect = container.getBoundingClientRect();
      const r = activeLink.getBoundingClientRect();

      pill.style.transform = `translate(${r.left - cRect.left}px, ${r.top - cRect.top}px)`;
      pill.style.width = `${r.width}px`;
      pill.style.height = `${r.height}px`;
      pill.style.opacity = "1";
    } else {
      pill.style.opacity = "0";
    }
  }

  function setActiveByHash(hash) {
    $$(".nav-links a").forEach(a => {
      const href = a.getAttribute("href") || "";
      const m = href.match(/#([\w-]+)/);
      a.classList.toggle("active", !!(m && hash && ("#" + m[1]) === hash));
    });
    updateNavPill();
  }

  function initNavActive() {
    const path = location.pathname;
    const isProject = /\/projects\//.test(path);
    if (isProject) {
      // project pages: lock "Work" active
      $$(".nav-links a").forEach(a => {
        a.classList.toggle("active", (a.getAttribute("href") || "").includes("#work"));
      });
      updateNavPill();
      return;
    }
    setActiveByHash(location.hash || "#work");
  }
  
  // Initialize nav indicator and layout sync
  initNavActive();
  window.addEventListener("resize", updateNavPill);

  // scroll-spy / HUD section tracking
  window.isProgrammaticScroll = false;
  let indexSpyActive = false; // true once the IntersectionObserver spy is wired (index only)
  let hudObserverActive = false; // true when the HUD section label is observer-driven

  // Active-section tracking via IntersectionObserver instead of measuring every
  // section on every scroll frame. The observer keeps a set of sections that
  // overlap a thin focus band ~40% down the viewport; picking the active one from
  // that small set costs zero per-frame layout reads, which is the main reason
  // scrolling now stays smooth. Drives the side rail, the top-nav pill, and the
  // HUD section readout.
  function bindSectionObserver() {
    const isProject = /\/projects\//.test(location.pathname);
    if (isProject) return;
    const navIds = ["hero", "work", "about", "track", "contact", "now", "profile", "skills"];
    const sections = navIds.map(id => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;
    indexSpyActive = true;
    // Document order (cheap, no layout) so we can pick the lower section when two
    // briefly straddle the band.
    sections.sort((a, b) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1
    );
    const order = new Map(sections.map((el, i) => [el, i]));
    const labelById = {};
    sections.forEach(el => { labelById[el.id] = (el.getAttribute("data-screen-label") || "").toUpperCase(); });
    const rail = $$(".rail a");
    const navMap = {
      hero: "", now: "work", profile: "work", work: "work",
      about: "about", track: "track", skills: "track", contact: "contact"
    };
    const lastId = sections[sections.length - 1].id;

    const visible = new Set();   // sections currently overlapping the focus band
    let currentId = sections[0].id;
    let appliedId = null;

    function recompute() {
      let best = null, bestOrder = -1;
      visible.forEach(el => {
        const o = order.get(el);
        if (o > bestOrder) { bestOrder = o; best = el; }
      });
      if (best) currentId = best.id;
      // At the very bottom a short trailing section may never reach the band.
      const d = document.documentElement;
      if (window.scrollY + window.innerHeight >= d.scrollHeight - 4) currentId = lastId;
    }
    function apply() {
      if (window.isProgrammaticScroll) return; // don't fight a click-driven glide
      if (currentId === appliedId) return;
      appliedId = currentId;
      rail.forEach(a => a.classList.toggle("active", a.dataset.rail === currentId));
      if (hudSectionEl) {
        const L = labelById[currentId];
        if (L && L !== lastHudSection) { hudSectionEl.textContent = L; lastHudSection = L; }
      }
      const topCur = navMap[currentId];
      setActiveByHash(topCur ? "#" + topCur : "");
    }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      recompute();
      apply();
    }, { rootMargin: "-40% 0px -59% 0px", threshold: 0 });
    sections.forEach(s => io.observe(s));

    // Cheap doc-level pass in the shared scroll batch: catches the very-bottom
    // case and re-applies once a programmatic glide ends. No per-element reads.
    onScrollTask(() => { recompute(); apply(); });
    recompute();
    apply();
  }

  // Project/detail pages do not have the index rail, but they still have a HUD
  // section label. Use the same focus-band observer so scroll frames do not scan
  // every section with getBoundingClientRect().
  function bindHudSectionObserver() {
    if (indexSpyActive || hudObserverActive || !hudSectionEl || !("IntersectionObserver" in window)) return;
    const items = getHudItems();
    if (!items.length) return;

    items.sort((a, b) =>
      (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1
    );
    const order = new Map(items.map((it, i) => [it.el, i]));
    const last = items[items.length - 1];
    const visible = new Set();
    let current = items[0];
    let applied = "";

    hudObserverActive = true;

    function recompute() {
      let best = null, bestOrder = -1;
      visible.forEach(el => {
        const o = order.get(el);
        if (o > bestOrder) { bestOrder = o; best = el; }
      });
      if (best) current = items[order.get(best)] || current;
      const d = document.documentElement;
      if (window.scrollY + window.innerHeight >= d.scrollHeight - 4) current = last;
    }

    function apply() {
      const label = (current.label || "").toUpperCase();
      if (label && label !== applied) {
        hudSectionEl.textContent = label;
        lastHudSection = label;
        applied = label;
      }
    }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      recompute();
      apply();
    }, { rootMargin: "-40% 0px -59% 0px", threshold: 0 });

    items.forEach(it => io.observe(it.el));
    onScrollTask(() => { recompute(); apply(); });
    recompute();
    apply();
  }

  // ---- custom buttery-smooth scroll-to-anchor ----
  // Native window.scrollTo({behavior:"smooth"}) varies wildly across browsers
  // and feels rubbery in Chrome. A rAF-driven easeInOutCubic interpolation gives
  // a consistent, cinematic glide everywhere — and lets us pick the duration
  // based on distance so short hops are quick and long hops are graceful.
  function smoothScrollTo(target, duration) {
    const start = window.scrollY;
    const delta = target - start;
    if (Math.abs(delta) < 1) return Promise.resolve();
    const startTime = performance.now();
    // The page sets `scroll-behavior: smooth` in CSS for keyboard/native scrolls.
    // Our per-frame scrollTo() below would be re-smoothed by it, compounding into
    // a laggy, rubbery glide — so disable it for the duration of this animation
    // and restore it afterwards.
    const prevBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    // easeInOutCubic — accelerates out of start, decelerates into the destination
    const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    return new Promise(resolve => {
      function step(now) {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        window.scrollTo(0, start + delta * ease(t));
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          root.style.scrollBehavior = prevBehavior;
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  function getSamePageHash(href) {
    if (!href || href === "#") return "";
    const hashIndex = href.indexOf("#");
    if (hashIndex === -1) return "";
    let url;
    try { url = new URL(href, location.href); } catch (_) { return ""; }
    const normalizePath = p => p.replace(/\/index\.html$/i, "/");
    if (url.origin !== location.origin) return "";
    if (normalizePath(url.pathname) !== normalizePath(location.pathname)) return "";
    return url.hash || "";
  }

  function getHashTarget(hash) {
    if (!hash || hash === "#") return null;
    const raw = hash.slice(1);
    let id = raw;
    try { id = decodeURIComponent(raw); } catch (_) {}
    return document.getElementById(id) || (() => {
      try { return document.querySelector(hash); } catch (_) { return null; }
    })();
  }

  // Custom ultra-smooth smooth scroll for same-page anchors w/ index spy locking
  function initNavSmoothScroll() {
    const isProject = /\/projects\//.test(location.pathname);

    let isScrollingTimeout = null;

    // Listen to all scroll events globally to detect when smooth scrolling has completely finished.
    // This debounced unlock ensures we only reactivate scroll-spy when the browser is completely static.
    window.addEventListener("scroll", () => {
      if (!window.isProgrammaticScroll) return;

      window.clearTimeout(isScrollingTimeout);
      isScrollingTimeout = window.setTimeout(() => {
        window.isProgrammaticScroll = false;
        // Trigger a scroll spy update to align indicator perfectly
        const event = new Event("scroll");
        window.dispatchEvent(event);
      }, 150); // 150ms of silence indicates scrolling has fully settled
    }, { passive: true });

    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest("a[href*='#']");
      if (!link) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      // Only handle same-page anchors. Cross-page hash links go through normal nav.
      const href = link.getAttribute("href") || "";
      const hash = getSamePageHash(href);
      if (!hash) return;
      const target = getHashTarget(hash);
      if (!target) return;

      e.preventDefault();

      // Lock scroll spy updates during glide to eliminate jumping active states
      window.isProgrammaticScroll = true;
      if (!isProject) setActiveByHash(hash);

      const navHeight = $(".nav")?.offsetHeight || 60;
      refreshScrollMetrics();
      const offsetPosition = Math.max(0, Math.min(
        scrollMax,
        window.scrollY + target.getBoundingClientRect().top - navHeight - 10
      ));
      const correctAnchorLanding = () => {
        if (!target.isConnected) return;
        const finalNavHeight = $(".nav")?.offsetHeight || navHeight;
        refreshScrollMetrics();
        const desiredTop = finalNavHeight + 10;
        const delta = target.getBoundingClientRect().top - desiredTop;
        if (Math.abs(delta) <= 2) return;
        const prevBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        window.scrollTo(0, Math.max(0, Math.min(scrollMax, window.scrollY + delta)));
        root.style.scrollBehavior = prevBehavior;
      };

      if (reduceMotion) {
        window.scrollTo(0, offsetPosition);
        requestAnimationFrame(correctAnchorLanding);
      } else {
        // Duration scales with distance: 350ms minimum, +0.4ms per pixel,
        // capped at 1.2s so long glides stay graceful but never sluggish.
        const distance = Math.abs(offsetPosition - window.scrollY);
        const duration = Math.max(450, Math.min(1200, 350 + distance * 0.4));
        smoothScrollTo(offsetPosition, duration).then(() => requestAnimationFrame(correctAnchorLanding));
      }

      // Update URL hash smoothly
      try { history.pushState(null, null, hash); } catch (_) {}

      // Fail-safe unlock in case no scroll event is fired (e.g., if already at destination)
      window.clearTimeout(isScrollingTimeout);
      isScrollingTimeout = window.setTimeout(() => {
        window.isProgrammaticScroll = false;
        const event = new Event("scroll");
        window.dispatchEvent(event);
      }, 1400);
    });
  }
  window.addEventListener("hashchange", initNavActive);

  // ---- scroll progress ----
  const sp = $(".scroll-progress .bar");
  function updateScrollProgress() {
    if (!sp) return;
    const h = document.documentElement;
    const pct = Math.min(1, Math.max(0, h.scrollTop / scrollMax));
    sp.style.transform = `scaleX(${pct.toFixed(4)})`;
  }
  onScrollTask(updateScrollProgress);

  // ---- HUD ----
  function tickClock() {
    const el = $("[data-hud-time]");
    if (!el) return;
    const d = new Date();
    el.textContent = String(d.getHours()).padStart(2, "0") + ":" +
                     String(d.getMinutes()).padStart(2, "0") + ":" +
                     String(d.getSeconds()).padStart(2, "0");
  }
  setInterval(tickClock, 1000);
  tickClock();

  // The section list is static, so query it once. Section tops are still measured
  // live each frame (content-visibility can change heights), but we no longer
  // re-query the DOM or rewrite unchanged text on every scroll.
  let hudItems = null;
  function getHudItems() {
    if (hudItems) return hudItems;
    // 1) Prefer explicit [data-screen-label] elements (home page, robot page).
    // 2) Otherwise derive one entry per <main> section from its visible marker.
    let items = $$("[data-screen-label]")
      .filter(el => el.tagName !== "MAIN")
      .map(el => ({ el, label: el.getAttribute("data-screen-label") || "" }));
    if (!items.length) {
      items = $$("main > section").map(el => {
        const marker = el.querySelector(".bh-marker, .block-marker, .section-marker");
        const label = marker
          ? marker.textContent.replace(/§/g, " ").replace(/·/g, " ").replace(/\s+/g, " ").trim()
          : "";
        return { el, label };
      });
    }
    hudItems = items.filter(it => it.label);
    return hudItems;
  }
  const hudSectionEl = $("[data-hud-section]");
  const hudPctEl = $("[data-hud-pct]");
  let lastHudSection = "", lastHudPct = "";
  function updateHud() {
    if (!hudVisible) return; // HUD hidden on phones — skip its per-scroll layout reads
    // On the index page the IntersectionObserver spy owns the section readout with
    // zero per-frame layout reads; elsewhere (project pages) fall back to a scan.
    if (!indexSpyActive && !hudObserverActive && hudSectionEl) {
      const items = getHudItems();
      if (items.length) {
        const y = window.scrollY + window.innerHeight * 0.35;
        let cur = items[0];
        for (let i = 0; i < items.length; i++) {
          const top = items[i].el.getBoundingClientRect().top + window.scrollY;
          if (y >= top) cur = items[i];
        }
        // Make sure the final section is reachable when scrolled to the bottom.
        if (window.scrollY >= Math.max(0, scrollMax - 120)) cur = items[items.length - 1];
        const label = cur.label.toUpperCase();
        if (label !== lastHudSection) { hudSectionEl.textContent = label; lastHudSection = label; }
      }
    }
    if (hudPctEl) {
      const h = document.documentElement;
      const pct = Math.min(100, Math.max(0, (h.scrollTop / scrollMax) * 100)).toFixed(0).padStart(3, "0") + "%";
      if (pct !== lastHudPct) { hudPctEl.textContent = pct; lastHudPct = pct; }
    }
  }
  onScrollTask(updateHud);

  // ---- pointer tracking (coord readout + cursor spotlight) ----
  // A single mousemove listener stores the latest position; one rAF applies the
  // DOM writes at most once per frame. The spotlight (body::before) is moved with
  // a transform rather than by repainting its gradients, so a full-screen blurred
  // layer no longer repaints on every pointer move.
  const coordEl = $(".coord");
  const coordX = coordEl ? coordEl.querySelector("[data-cx]") : null;
  const coordY = coordEl ? coordEl.querySelector("[data-cy]") : null;
  let ptrX = 0, ptrY = 0, ptrRaf = null;
  function applyPointer() {
    ptrRaf = null;
    const bodyStyle = document.body.style;
    // The spotlight layer is centred on its own origin, so it just translates to
    // the raw pointer position (see body::before in styles.css).
    bodyStyle.setProperty("--spot-x", ptrX.toFixed(1) + "px");
    bodyStyle.setProperty("--spot-y", ptrY.toFixed(1) + "px");
    if (coordEl && !coordEl.classList.contains("frozen")) {
      if (coordX) coordX.textContent = String(Math.round(ptrX)).padStart(4, "0");
      if (coordY) coordY.textContent = String(Math.round(ptrY)).padStart(4, "0");
    }
  }
  document.addEventListener("mousemove", (e) => {
    ptrX = e.clientX; ptrY = e.clientY;
    if (!ptrRaf) ptrRaf = requestAnimationFrame(applyPointer);
  }, { passive: true });

  // ---- layout tweak ----
  function setLayout(v) {
    const list = $(".projects");
    if (list) {
      list.classList.remove("layout-notebook", "layout-spec");
      list.classList.add("layout-" + v);
      list.querySelectorAll(".proj").forEach(p => {
        p.classList.remove("layout-notebook", "layout-spec");
        p.classList.add("layout-" + v);
      });
    }
    localStorage.setItem("gs-layout-v2", v);
    $$("[data-tweak-layout] button").forEach(b => b.classList.toggle("active", b.dataset.val === v));
  }

  // ---- tweaks panel ----
  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.type === "__activate_edit_mode") $(".tweaks")?.classList.add("open");
    if (d.type === "__deactivate_edit_mode") $(".tweaks")?.classList.remove("open");
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-tweak-close]")) {
      $(".tweaks")?.classList.remove("open");
      try { window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*"); } catch (_) {}
    }
    const segL = e.target.closest("[data-tweak-layout] button");
    if (segL) setLayout(segL.dataset.val);
    const segT = e.target.closest("[data-tweak-theme] button");
    if (segT) setTheme(segT.dataset.val, true);
  });

  // ---- headline decode (keeps readable text while adding a brief settle motion) ----
  function scramble(el, dur = 520, delay = 0) {
    const finalText = el.dataset.text || el.textContent.trim();
    if (!finalText.length) return;
    el.textContent = finalText;
    setTimeout(() => {
      el.classList.add("decode-settle");
      const parent = el.closest(".decode-line");
      clearTimeout(el._decodeDone);
      el._decodeDone = setTimeout(() => {
        el.classList.remove("decode-settle");
        if (parent) parent.classList.add("done");
      }, dur);
    }, delay);
  }

  function bootScramble() {
    if (reduceMotion) {
      $$(".decode").forEach(el => {
        el.textContent = el.dataset.text || el.textContent;
        el.closest(".decode-line")?.classList.add("done");
      });
      return;
    }
    const targets = $$(".decode");
    targets.forEach((el, i) => scramble(el, 520, 90 + i * 120));
  }

  // ---- number counters ----
  function animateCounter(el) {
    const target = parseFloat(el.dataset.count);
    if (isNaN(target)) return;
    const decimals = (el.dataset.decimals | 0);
    // Reduced-motion: show the final value instantly (rAF counters bypass the CSS motion rule)
    if (reduceMotion) {
      el.textContent = decimals ? target.toFixed(decimals) : Math.round(target).toString();
      return;
    }
    const dur = parseInt(el.dataset.dur || "1400", 10);
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = target * eased;
      el.textContent = decimals ? v.toFixed(decimals) : Math.round(v).toString();
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = decimals ? target.toFixed(decimals) : Math.round(target).toString();
    }
    requestAnimationFrame(step);
  }

  // ---- schematic SVG draw-in ----
  // We previously hid all strokes by default and revealed via IntersectionObserver,
  // but that left content blank if the observer was slow. Now: only hide+animate
  // for elements explicitly opted-in via [data-animate-draw]. Default = visible.
  function prepareSchematics() {
    $$(".thumb-schematic[data-animate-draw]").forEach(svgWrap => {
      svgWrap.classList.add("draw");
      const els = svgWrap.querySelectorAll("path, line, rect, circle, polyline, polygon");
      let idx = 0;
      els.forEach(el => {
        const cs = getComputedStyle(el);
        const stroked = cs.stroke && cs.stroke !== "none" && cs.stroke !== "rgba(0, 0, 0, 0)";
        if (!stroked) {
          el.setAttribute("data-fade", "");
          return;
        }
        let len;
        try { len = el.getTotalLength ? el.getTotalLength() : 400; } catch (_) { len = 400; }
        if (!len || !isFinite(len)) len = 400;
        el.style.setProperty("--len", len.toFixed(0));
        el.style.setProperty("--d", (idx * 0.05).toFixed(2) + "s");
        el.setAttribute("data-draw", "");
        idx++;
      });
      svgWrap.querySelectorAll("text").forEach(t => t.setAttribute("data-fade", ""));
    });
  }

  // ---- progress-bar fill ----
  function fillBar(el) {
    const w = el.dataset.fill || "0";
    requestAnimationFrame(() => { el.style.width = w + "%"; });
  }

  // ---- reveal observer ----
  // Trigger reveals before the element fully enters the viewport. Combined with
  // the shorter CSS curves this makes content readable as the eye lands on it.
  function bootObservers() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const t = en.target;
        t.classList.add("in");
        // Project cards get their dedicated cascade animation from the SAME
        // trigger as the reveal, so the two never race (only cards that started
        // hidden below the fold animate — guarded by .pre-reveal).
        if (t.classList.contains("proj") && t.classList.contains("pre-reveal")) t.classList.add("anim-in");
        if (t.hasAttribute("data-count")) animateCounter(t);
        if (t.classList.contains("thumb-schematic")) t.classList.add("in");
        if (t.classList.contains("fill")) fillBar(t);
        io.unobserve(t);
      });
    }, { threshold: 0.04, rootMargin: "0px 0px 14% 0px" });

    // Auto-index children of [data-reveal-children] so CSS can stagger them
    // via calc(var(--stagger-i) * 70ms + 80ms).
    $$("[data-reveal-children]").forEach(group => {
      Array.from(group.children).forEach((child, i) => {
        child.style.setProperty("--stagger-i", String(i));
      });
    });

    $$("[data-reveal]").forEach(e => {
      const r = e.getBoundingClientRect();
      const inView = r.top < window.innerHeight && r.bottom > 0;
      if (!inView) e.classList.add("pre-reveal");
      io.observe(e);
    });

    // (data-reveal-mask wipe removed — it could hide content if the observer
    // missed the element on first paint.)
    // Project-card cascade (.anim-in) is now driven by the main reveal observer
    // above, so there's a single, race-free entrance trigger per card.

    $$("[data-count]").forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) animateCounter(e);
      else io.observe(e);
    });
    $$(".thumb-schematic[data-animate-draw]").forEach(e => io.observe(e));
    $$(".progress-bar .fill[data-fill]").forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) fillBar(e);
      else io.observe(e);
    });
    $$(".section-head").forEach(e => io.observe(e));
  }

  // ============================================================
  // SCROLL CUE
  // The section-number and hero-glow parallax that used to live here are now done
  // entirely by the compositor via CSS scroll-driven animations (animation-timeline)
  // — zero main-thread work, so they can no longer stutter the scroll. All that
  // remains in JS is fading the "scroll" hint once scrolling begins, which only
  // reads scrollY (no layout) and writes a class on change.
  // ============================================================
  function bindScrollHint() {
    const hint = $(".scroll-hint");
    if (!hint) return;
    let dimmed = false;
    onScrollTask(() => {
      const d = window.scrollY > 24;
      if (d !== dimmed) { dimmed = d; hint.classList.toggle("dim", d); }
    });
  }

  // ---- active-scroll performance mode ----
  // While the page is actually moving, drop the heaviest decorative compositing
  // (cursor spotlight, nav backdrop-blur, looping animations) via html.is-scrolling
  // so each scroll frame only pays for the content. Restored shortly after motion
  // stops. This is what keeps real wheel/trackpad scrolling smooth on modest GPUs
  // and high-DPI displays, where those effects otherwise blow the frame budget.
  // The toggle itself is a single class write — no layout reads, no per-frame cost.
  function bindScrollPerfMode() {
    let scrolling = false;
    let stopTimer = 0;
    onScrollTask(() => {
      if (!scrolling) { scrolling = true; root.classList.add("is-scrolling"); }
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        scrolling = false;
        root.classList.remove("is-scrolling");
      }, 140);
    });
  }

  // ---- pause never-ending decorative animations while off-screen ----
  // The marquee and the progress-bar shimmers loop forever, so they keep the
  // compositor producing a frame every ~16ms even when scrolled far away. That
  // leaves no headroom for the scroll itself on weaker GPUs. An Intersection
  // Observer toggles .anim-paused (CSS: animation-play-state: paused) so these
  // only animate while actually visible — pausing/resuming has no visual seam.
  function bindOffscreenPause() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    const targets = $$([
      ".marquee",
      ".now-box",
      ".arch-diagram",
      ".state-diagram",
      ".stepper-viz",
      ".eeprom-figure",
      ".hero-figure",
      ".zr-emulator-container",
      ".zr-arch-svg",
      ".bc-hero",
      ".bc-hero-photo",
      ".stepper-wrap",
      ".touch-system",
      ".eeprom-wrap",
      ".auto-panel",
      ".automation-preview",
      ".diagnostic-map",
      ".route-map",
      ".fsm-diagram",
      ".param-card",
      ".ls-hero",
      ".ls-hero-photo",
      ".radar-panel",
      ".presence-wrap",
      ".sleep-wrap",
      ".hardware-stack",
      ".bus-grid",
      ".zr-hero",
      ".phone-frame",
      ".zr-live-card",
      ".zr-arch",
      ".zr-screen",
      ".wip-card",
      ".paper-hero",
      ".figbox",
      ".crosslink"
    ].join(", "));
    if (!targets.length) return;
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        en.target.classList.toggle("anim-paused", !en.isIntersecting);
      }
    }, { rootMargin: "120px 0px" });
    targets.forEach(t => io.observe(t));
  }



  // ---- 3D tilt cards (very subtle) ----
  // The pointer position is sampled on mousemove but the transform is written
  // once per frame inside rAF, and will-change is only set while the card is
  // actually hovered — so idle cards never hold a compositor layer.
  function bindTilt() {
    if (!supportsHover || reduceMotion) return;
    $$(".tilt, .proj.layout-spec").forEach(card => {
      let raf = null, mx = 0, my = 0, baseRect = null, clearWillChangeTimer = 0;
      function apply() {
        raf = null;
        const r = baseRect || card.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const x = Math.max(0, Math.min(1, (mx - r.left) / r.width));
        const y = Math.max(0, Math.min(1, (my - r.top) / r.height));
        const px = x - 0.5;
        const py = y - 0.5;
        const glowX = (x * 100).toFixed(1) + "%";
        const glowY = (y * 100).toFixed(1) + "%";
        const rx = (py * -2.1).toFixed(2) + "deg";
        const ry = (px * 2.8).toFixed(2) + "deg";
        card.style.setProperty("--card-mx", glowX);
        card.style.setProperty("--card-my", glowY);
        card.style.setProperty("--tilt-rx", rx);
        card.style.setProperty("--tilt-ry", ry);
      }
      function scheduleTilt() {
        if (!raf) raf = requestAnimationFrame(apply);
      }
      card.addEventListener("mouseenter", (e) => {
        clearTimeout(clearWillChangeTimer);
        baseRect = card.getBoundingClientRect();
        mx = e.clientX; my = e.clientY;
        card.classList.add("tilt-active");
        card.style.willChange = "transform";
        scheduleTilt();
      });
      card.addEventListener("mousemove", (e) => {
        mx = e.clientX; my = e.clientY;
        scheduleTilt();
      });
      card.addEventListener("mouseleave", () => {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        baseRect = null;
        card.classList.remove("tilt-active");
        card.style.setProperty("--card-mx", "70%");
        card.style.setProperty("--card-my", "18%");
        card.style.setProperty("--tilt-rx", "0deg");
        card.style.setProperty("--tilt-ry", "0deg");
        clearTimeout(clearWillChangeTimer);
        clearWillChangeTimer = setTimeout(() => { card.style.willChange = ""; }, 260);
      });
    });
  }

  // ---- magnetic buttons ----
  function bindMagnetic() {
    if (!supportsHover || reduceMotion) return;
    $$(".btn").forEach(b => {
      let raf = null, mx = 0, my = 0;
      function apply() {
        raf = null;
        const r = b.getBoundingClientRect();
        const cx = mx - r.left - r.width / 2;
        const cy = my - r.top - r.height / 2;
        b.style.setProperty("--mag-x", (cx * 0.08).toFixed(1) + "px");
        b.style.setProperty("--mag-y", (cy * 0.08).toFixed(1) + "px");
      }
      b.addEventListener("mousemove", (e) => {
        mx = e.clientX; my = e.clientY;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      b.addEventListener("mouseleave", () => {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        b.style.setProperty("--mag-x", "0px");
        b.style.setProperty("--mag-y", "0px");
      });
    });
  }

  // ---- auto-wrap glitch elements with data-glitch attr ----
  function bindGlitch() {
    $$(".glitch").forEach(el => {
      if (!el.dataset.glitch) el.dataset.glitch = el.textContent.trim();
    });
  }

  // ---- grade chips: click to reveal predicted grade (3D Flipping Card) ----
  function bindGradeChips() {
    $$(".grade-card").forEach(c => {
      if (c.dataset.bound) return;
      c.dataset.bound = "1";
      c.addEventListener("click", () => {
        c.classList.toggle("flipped");
      });
    });
  }

  // ============================================================
  // EASTER EGGS
  // ============================================================
  function showToast(msg, badge = "EGG") {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<span class="badge">${badge}</span><span>${msg}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("in"));
    setTimeout(() => {
      t.classList.remove("in");
      setTimeout(() => t.remove(), 400);
    }, 3200);
  }

  function isArcadeOpen() {
    const arcade = $(".arcade-overlay");
    return Boolean(arcade && arcade.classList.contains("on"));
  }

  // 1) Konami code → blueprint mode
  function bindKonami() {
    const seq = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
    let i = 0;
    document.addEventListener("keydown", (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === seq[i]) {
        i++;
        if (i === seq.length) {
          i = 0;
          root.classList.toggle("blueprint");
          if (root.classList.contains("blueprint")) {
            showToast("Blueprint mode engaged. Press Konami again to exit.", "↑↑↓↓");
          } else {
            showToast("Blueprint mode off.", "↑↑↓↓");
          }
        }
      } else {
        i = (k === seq[0]) ? 1 : 0;
      }
    });
  }

  // 2) Typed words → easter eggs
  function bindTypeTriggers() {
    let buf = "";
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea")) return;
      if (isArcadeOpen()) return;
      if (e.key.length !== 1) return;
      buf = (buf + e.key.toLowerCase()).slice(-32);
      if (buf.endsWith("robot")) {
        showMascot();
      } else if (buf.endsWith("matrix")) {
        runMatrix();
      } else if (buf.endsWith("arcade") || buf.endsWith("sprint")) {
        runSignalSprint();
      } else if (buf.endsWith("hello")) {
        showToast("Hello from Bristol 👋", "HI");
      } else if (buf.endsWith("giorgi")) {
        showToast("That's me. Hi 👋", "HI");
      } else if (buf.endsWith("balance")) {
        showToast("LQR + Kalman, currently holding the desk robot upright.", "ROBOT");
      } else if (buf.endsWith("egg")) {
        showToast("There are 7+ hidden things. Try the ? icon next to the theme toggle.", "HINT");
      }
    });
  }

  // 3) Press '?' for help, 'g' for grid, 't' for theme
  function bindKeyShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea")) return;
      if (isArcadeOpen()) return;
      const k = e.key;
      if (k === "?" || (e.shiftKey && k === "/")) { toggleHelp(); }
      else if (k === "g" || k === "G") { document.body.classList.toggle("no-grid"); showToast("Grid " + (document.body.classList.contains("no-grid") ? "off" : "on"), "G"); }
      else if (k === "t" || k === "T") {
        const cur = root.getAttribute("data-theme") || "light";
        setTheme(cur === "dark" ? "light" : "dark", true);
      } else if (k === "Escape") {
        setHelpOpen(false);
      }
    });
  }

  // 4) Click counter on the H1 signal word
  function bindHeroClickEgg() {
    const target = $(".decode-line.signal .decode");
    if (!target) return;
    let count = 0;
    target.addEventListener("click", () => {
      count++;
      if (count === 5) {
        showToast("Engineer's apprentice unlocked. Hi from the bench. ⚙", "5×");
        count = 0;
      }
    });
  }

  // 5) Click logo dot — spins with friction; multiple clicks add velocity
  function bindLogoSpin() {
    const dot = $(".nav-mark .mark-dot");
    if (!dot) return;
    let angle = 0;
    let velocity = 0;
    let last = 0;
    let raf = null;

    function tick(now) {
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      angle += velocity * dt;
      // friction — decays to ~0 in ~3s for a single click
      velocity *= Math.pow(0.3, dt);
      if (Math.abs(velocity) < 5) velocity = 0;
      dot.style.transform = `rotate(${angle}deg)`;
      if (velocity !== 0) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
        last = 0;
      }
    }

    dot.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dot.style.animation = "none";
      // each click adds one revolution per second of angular velocity
      velocity += 360;
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    });
  }

  // 6) Click coord readout → freeze it on its current value
  function bindCoordFreeze() {
    const c = $(".coord");
    if (!c) return;
    c.addEventListener("click", () => {
      c.classList.toggle("frozen");
      if (c.classList.contains("frozen")) showToast("Coordinates frozen.", "FREEZE");
      else showToast("Coordinates live.", "LIVE");
    });
  }

  // 7) Idle 45s → little message in HUD
  function bindIdleTimer() {
    let t;
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        showToast("Still here? Keep scrolling — there's plenty more below.", "IDLE");
      }, 45000);
    };
    ["mousemove", "scroll", "keydown", "touchstart"].forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    reset();
  }

  // help overlay toggle
  function setHelpOpen(open) {
    const o = $(".help-overlay");
    if (!o) return;
    o.classList.toggle("open", open);
    // Keep aria-hidden in sync so focus is never trapped inside a hidden dialog
    o.setAttribute("aria-hidden", open ? "false" : "true");
    if (!open) {
      const focused = document.activeElement;
      if (focused && o.contains(focused)) focused.blur();
    }
  }
  function toggleHelp() {
    const o = $(".help-overlay");
    if (!o) return;
    setHelpOpen(!o.classList.contains("open"));
  }
  function bindHelpButton() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-help-toggle]")) {
        toggleHelp();
      }
      if (e.target.closest("[data-help-close]") || e.target.matches(".help-overlay")) {
        setHelpOpen(false);
      }
    });
  }

  // robot mascot toggle
  function showMascot() {
    let m = $(".mascot");
    if (!m) {
      m = document.createElement("div");
      m.className = "mascot";
      m.innerHTML = '<span class="face"></span><span>BEEP. I see you.</span>';
      document.body.appendChild(m);
    }
    m.classList.add("show");
    setTimeout(() => m.classList.remove("show"), 5000);
  }

  // matrix overlay
  function runMatrix() {
    let m = $(".matrix-overlay");
    if (!m) {
      m = document.createElement("div");
      m.className = "matrix-overlay";
      document.body.appendChild(m);
    }
    m.classList.add("on");
    m.innerHTML = "";
    const cols = Math.floor(window.innerWidth / 14);
    const chars = "01アイウエオカキクケコサシスセソタチツテト+-/<>=*";
    for (let c = 0; c < cols; c++) {
      const col = document.createElement("div");
      col.className = "col";
      col.style.left = (c * 14) + "px";
      col.style.animationDelay = (Math.random() * 2) + "s";
      col.style.animationDuration = (3 + Math.random() * 3) + "s";
      let s = "";
      const n = 10 + Math.floor(Math.random() * 20);
      for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)] + "\n";
      col.textContent = s;
      m.appendChild(col);
    }
    setTimeout(() => m.classList.remove("on"), 6000);
  }

  // Signal Sprint mini-game
  function runSignalSprint() {
    let arcade = $(".arcade-overlay");
    if (arcade && typeof arcade._cleanup === "function") arcade._cleanup(true);
    if (!arcade) {
      arcade = document.createElement("div");
      arcade.className = "arcade-overlay";
      document.body.appendChild(arcade);
    }
    if (arcade.dataset.arcadeVersion !== "2") {
      arcade.dataset.arcadeVersion = "2";
      arcade.className = "arcade-overlay";
      arcade.setAttribute("role", "dialog");
      arcade.setAttribute("aria-label", "Signal Sprint arcade");
      arcade.setAttribute("aria-hidden", "true");
      arcade.setAttribute("tabindex", "-1");
      arcade.innerHTML = [
        '<canvas aria-hidden="true"></canvas>',
        '<button class="arcade-close" data-arcade-close type="button" aria-label="Close Signal Sprint" title="Close Signal Sprint"><span aria-hidden="true"></span></button>',
        '<div class="arcade-hud" aria-live="polite">',
        '  <div class="arcade-stat title"><span>Mode</span><b>SIGNAL SPRINT</b></div>',
        '  <div class="arcade-stat"><span>Level</span><b data-arcade-level>01</b></div>',
        '  <div class="arcade-stat"><span>Cores</span><b data-arcade-goal>0/0</b></div>',
        '  <div class="arcade-stat"><span>Lives</span><b data-arcade-lives>x3</b></div>',
        '  <div class="arcade-stat"><span>Time</span><b data-arcade-time>45s</b></div>',
        '  <div class="arcade-stat"><span>Score</span><b data-arcade-score>000000</b></div>',
        '  <div class="arcade-stat"><span>Best</span><b data-arcade-best>000000</b></div>',
        '  <div class="arcade-stat"><span>Combo</span><b data-arcade-combo>x1</b></div>',
        "</div>",
        '<div class="arcade-panel" data-arcade-panel hidden>',
        '  <span data-arcade-panel-kicker>LEVEL 01</span>',
        '  <h2 data-arcade-panel-title>Signal Sprint</h2>',
        '  <p data-arcade-panel-copy>Run the network.</p>',
        '  <div class="arcade-legend" data-arcade-legend hidden>',
        '    <span class="core"><i></i><b>Core</b> clears levels</span>',
        '    <span class="time"><i></i><b>Time</b> adds seconds</span>',
        '    <span class="shield"><i></i><b>Shield</b> blocks hits</span>',
        '    <span class="bonus"><i></i><b>Bonus</b> adds points</span>',
        "  </div>",
        '  <button class="arcade-action" data-arcade-restart type="button">Restart</button>',
        "</div>",
        '<div class="arcade-status" data-arcade-status><b>READY</b> signal link online</div>'
      ].join("");
    }

    const canvas = arcade.querySelector("canvas");
    const ctx = canvas && canvas.getContext("2d", { alpha: true });
    const closeBtn = arcade.querySelector("[data-arcade-close]");
    const restartBtn = arcade.querySelector("[data-arcade-restart]");
    const panelEl = arcade.querySelector("[data-arcade-panel]");
    const panelKickerEl = arcade.querySelector("[data-arcade-panel-kicker]");
    const panelTitleEl = arcade.querySelector("[data-arcade-panel-title]");
    const panelCopyEl = arcade.querySelector("[data-arcade-panel-copy]");
    const legendEl = arcade.querySelector("[data-arcade-legend]");
    const levelEl = arcade.querySelector("[data-arcade-level]");
    const goalEl = arcade.querySelector("[data-arcade-goal]");
    const livesEl = arcade.querySelector("[data-arcade-lives]");
    const timeEl = arcade.querySelector("[data-arcade-time]");
    const scoreEl = arcade.querySelector("[data-arcade-score]");
    const bestEl = arcade.querySelector("[data-arcade-best]");
    const comboEl = arcade.querySelector("[data-arcade-combo]");
    const statusEl = arcade.querySelector("[data-arcade-status]");
    if (!ctx) {
      showToast("Signal Sprint could not start on this browser.", "PLAY");
      return;
    }

    const bestKey = "gs-signal-sprint-best";
    const pickupColors = {
      core: "#5ee1ff",
      time: "#78ffbf",
      shield: "#ffb85c",
      bonus: "#f177ff"
    };
    const hazardColors = ["#ff4d6d", "#f177ff", "#ffb85c"];
    const levelNames = [
      "Circuit Garden",
      "Pulse Alley",
      "Glitch Foundry",
      "Neon Relay",
      "Static Storm",
      "Zero-Day Loop",
      "Quantum Rush"
    ];
    const motionScale = reduceMotion ? 0.35 : 1;
    const state = {
      width: 1,
      height: 1,
      dpr: 1,
      raf: 0,
      last: performance.now(),
      openedAt: performance.now(),
      running: true,
      phase: "intro",
      phaseTimer: 0,
      nextLevel: 1,
      panelBaseCopy: "",
      level: 1,
      score: 0,
      best: Number(readStorage(bestKey) || 0),
      newBest: false,
      combo: 1,
      comboWindow: 0,
      lives: 3,
      shield: 0,
      cores: 0,
      goal: 0,
      timeLeft: 0,
      levelTime: 0,
      hitCooldown: 0,
      keys: Object.create(null),
      player: { x: window.innerWidth * 0.5, y: window.innerHeight * 0.58, vx: 0, vy: 0, r: 15, angle: 0 },
      config: null,
      pickups: [],
      gates: [],
      mines: [],
      sweepers: [],
      seekers: [],
      sparks: [],
      floaters: [],
      trail: [],
      stars: [],
      shake: 0,
      flash: 0
    };

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    function rand(min, max) {
      return min + Math.random() * (max - min);
    }

    function chance(n) {
      return Math.random() < n;
    }

    function pad(n, size) {
      return String(Math.max(0, Math.round(n))).padStart(size, "0");
    }

    function arenaBounds() {
      const top = state.width < 680 ? 178 : 112;
      const bottomPad = state.width < 680 ? 74 : 86;
      const left = 24;
      const right = Math.max(left + 160, state.width - 24);
      const bottom = Math.min(state.height - 22, Math.max(top + 170, state.height - bottomPad));
      return { left, top, right, bottom };
    }

    function levelConfig(level) {
      const compact = state.width < 680 ? 0.72 : 1;
      const goal = Math.round(clamp(6 + level * 2, 8, 28) * (state.width < 680 ? 0.86 : 1));
      return {
        goal: Math.max(5, goal),
        time: clamp(44000 - (level - 1) * 1450, 24000, 44000),
        pickups: Math.max(4, Math.round(clamp(5 + level * 0.55, 5, 11) * compact)),
        gates: Math.max(2, Math.round(clamp(2 + level * 0.7, 2, 10) * compact)),
        mines: Math.round(clamp(level - 1, 0, 7) * compact),
        sweepers: Math.round(clamp(Math.floor((level - 1) / 2), 0, 5) * compact),
        seekers: Math.round(clamp(Math.floor((level - 2) / 3), 0, 4) * compact),
        gateSpeed: 0.68 + level * 0.11,
        seekerSpeed: 0.34 + level * 0.045,
        scoreMultiplier: 1 + level * 0.08
      };
    }

    function setStatus(label, copy) {
      if (statusEl) statusEl.innerHTML = "<b>" + label + "</b> " + copy;
    }

    function setPanel(kicker, title, copy, showRestart, actionLabel, variant, showLegend) {
      if (!panelEl) return;
      if (panelKickerEl) panelKickerEl.textContent = kicker;
      if (panelTitleEl) panelTitleEl.textContent = title;
      if (panelCopyEl) panelCopyEl.textContent = copy;
      panelEl.classList.toggle("danger", variant === "danger");
      panelEl.classList.toggle("levelup", variant === "levelup");
      panelEl.classList.toggle("guide", variant === "guide");
      if (legendEl) legendEl.hidden = !showLegend;
      if (restartBtn) {
        restartBtn.hidden = !showRestart;
        restartBtn.textContent = actionLabel || "Restart";
      }
      panelEl.hidden = false;
      panelEl.classList.add("on");
    }

    function hidePanel() {
      if (!panelEl) return;
      panelEl.classList.remove("on");
      panelEl.classList.remove("danger", "levelup", "guide");
      if (legendEl) legendEl.hidden = true;
      panelEl.hidden = true;
    }

    function countdownSeconds() {
      return Math.max(1, Math.ceil(state.phaseTimer / 1000));
    }

    function updatePanelCountdown() {
      if (!panelCopyEl || !panelEl || panelEl.hidden) return;
      const seconds = countdownSeconds();
      if (state.phase === "intro") {
        panelCopyEl.textContent = state.panelBaseCopy + " Starting in " + seconds + ".";
      } else if (state.phase === "countdown") {
        panelCopyEl.textContent = state.panelBaseCopy + " Level " + pad(state.nextLevel, 2) + " starts in " + seconds + ".";
        setStatus("COUNTDOWN", "level " + state.nextLevel + " in " + seconds);
      }
    }

    function updateBest() {
      const rounded = Math.round(state.score);
      if (rounded > state.best) {
        state.best = rounded;
        state.newBest = true;
        writeStorageSoon(bestKey, String(rounded));
      }
    }

    function updateHud() {
      updateBest();
      if (levelEl) levelEl.textContent = pad(state.level, 2);
      if (goalEl) goalEl.textContent = state.cores + "/" + state.goal;
      if (livesEl) livesEl.textContent = "x" + state.lives + (state.shield ? " +" + state.shield : "");
      if (timeEl) timeEl.textContent = Math.max(0, Math.ceil(state.timeLeft / 1000)) + "s";
      if (scoreEl) scoreEl.textContent = pad(state.score, 6);
      if (bestEl) bestEl.textContent = pad(state.best, 6);
      if (comboEl) comboEl.textContent = "x" + state.combo;
    }

    function makeStars() {
      const count = reduceMotion ? 22 : clamp(Math.floor((state.width * state.height) / 18000), 34, 110);
      state.stars.length = 0;
      for (let i = 0; i < count; i++) {
        state.stars.push({
          x: Math.random() * state.width,
          y: Math.random() * state.height,
          r: rand(0.6, 1.8),
          speed: rand(0.08, 0.34),
          alpha: rand(0.12, 0.58)
        });
      }
    }

    function keepPointInArena(obj, radius) {
      const a = arenaBounds();
      obj.x = clamp(obj.x, a.left + radius, a.right - radius);
      obj.y = clamp(obj.y, a.top + radius, a.bottom - radius);
    }

    function safePoint(radius, tries) {
      const a = arenaBounds();
      let fallback = {
        x: rand(a.left + radius, Math.max(a.left + radius + 1, a.right - radius)),
        y: rand(a.top + radius, Math.max(a.top + radius + 1, a.bottom - radius))
      };
      for (let i = 0; i < (tries || 90); i++) {
        const p = {
          x: rand(a.left + radius, Math.max(a.left + radius + 1, a.right - radius)),
          y: rand(a.top + radius, Math.max(a.top + radius + 1, a.bottom - radius))
        };
        let clear = Math.hypot(p.x - state.player.x, p.y - state.player.y) > 92 + radius;
        for (let j = 0; clear && j < state.pickups.length; j++) {
          const n = state.pickups[j];
          clear = Math.hypot(p.x - n.x, p.y - n.y) > radius + n.size + 28;
        }
        for (let j = 0; clear && j < state.mines.length; j++) {
          const m = state.mines[j];
          clear = Math.hypot(p.x - m.x, p.y - m.y) > radius + m.r + 36;
        }
        if (clear) return p;
        fallback = p;
      }
      return fallback;
    }

    function countCores() {
      let count = 0;
      for (let i = 0; i < state.pickups.length; i++) {
        if (state.pickups[i].kind === "core") count++;
      }
      return count;
    }

    function choosePickupKind(forcedKind) {
      if (forcedKind) return forcedKind;
      if (state.cores < state.goal && countCores() < Math.min(3, state.pickups.length + 1)) return "core";
      const roll = Math.random();
      if (roll < 0.72) return "core";
      if (roll < 0.84) return "time";
      if (roll < 0.95) return "shield";
      return "bonus";
    }

    function spawnPickup(i, forcedKind) {
      const kind = choosePickupKind(forcedKind);
      const p = safePoint(kind === "bonus" ? 22 : 18);
      return {
        x: p.x,
        y: p.y,
        vx: rand(-0.16, 0.16),
        vy: rand(-0.16, 0.16),
        size: kind === "bonus" ? 17 : kind === "core" ? 14 : 13,
        kind,
        color: pickupColors[kind],
        phase: rand(0, Math.PI * 2),
        spin: rand(-0.035, 0.035) || 0.02,
        index: i
      };
    }

    function makeGate(i) {
      const a = arenaBounds();
      const vertical = i % 2 === 0;
      const longSide = clamp(rand(state.width * 0.07, state.width * 0.15), 70, 160);
      const shortSide = rand(13, 20);
      return {
        x: rand(a.left + 24, Math.max(a.left + 25, a.right - longSide - 24)),
        y: rand(a.top + 24, Math.max(a.top + 25, a.bottom - longSide - 24)),
        w: vertical ? shortSide : longSide,
        h: vertical ? longSide : shortSide,
        vx: rand(0.42, 1.08) * state.config.gateSpeed * (chance(0.5) ? 1 : -1),
        vy: rand(0.32, 0.92) * state.config.gateSpeed * (chance(0.5) ? 1 : -1),
        color: hazardColors[i % hazardColors.length],
        phase: rand(0, Math.PI * 2)
      };
    }

    function makeMine(i) {
      const p = safePoint(34);
      return {
        x: p.x,
        y: p.y,
        vx: rand(0.1, 0.34) * state.config.gateSpeed * (chance(0.5) ? 1 : -1),
        vy: rand(0.1, 0.34) * state.config.gateSpeed * (chance(0.5) ? 1 : -1),
        r: rand(15, 21),
        color: hazardColors[(i + 1) % hazardColors.length],
        phase: rand(0, Math.PI * 2)
      };
    }

    function makeSweeper(i) {
      const a = arenaBounds();
      const p = safePoint(80);
      return {
        x: clamp(p.x, a.left + 86, a.right - 86),
        y: clamp(p.y, a.top + 86, a.bottom - 86),
        len: clamp(state.width * rand(0.16, 0.28), 130, 250),
        angle: rand(0, Math.PI * 2),
        spin: rand(0.006, 0.012) * (chance(0.5) ? 1 : -1) * (1 + state.level * 0.08),
        width: 6 + Math.min(5, state.level * 0.55),
        color: hazardColors[(i + 2) % hazardColors.length]
      };
    }

    function makeSeeker(i) {
      const p = safePoint(40);
      return {
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        r: 13,
        angle: 0,
        color: i % 2 ? "#f177ff" : "#ff4d6d"
      };
    }

    function buildLevel() {
      state.pickups.length = 0;
      state.gates.length = 0;
      state.mines.length = 0;
      state.sweepers.length = 0;
      state.seekers.length = 0;
      for (let i = 0; i < state.config.pickups; i++) {
        state.pickups.push(spawnPickup(i, i < 3 ? "core" : null));
      }
      for (let i = 0; i < state.config.gates; i++) state.gates.push(makeGate(i));
      for (let i = 0; i < state.config.mines; i++) state.mines.push(makeMine(i));
      for (let i = 0; i < state.config.sweepers; i++) state.sweepers.push(makeSweeper(i));
      for (let i = 0; i < state.config.seekers; i++) state.seekers.push(makeSeeker(i));
    }

    function resetPlayer() {
      const a = arenaBounds();
      const p = state.player;
      p.x = (a.left + a.right) * 0.5;
      p.y = (a.top + a.bottom) * 0.55;
      p.vx = 0;
      p.vy = 0;
      p.angle = -Math.PI * 0.5;
      state.trail.length = 0;
    }

    function startLevel(level, firstRun) {
      state.level = level;
      state.nextLevel = level;
      state.config = levelConfig(level);
      state.goal = state.config.goal;
      state.cores = 0;
      state.timeLeft = state.config.time;
      state.levelTime = state.config.time;
      state.combo = 1;
      state.comboWindow = 0;
      state.hitCooldown = 900;
      state.phase = "intro";
      state.phaseTimer = firstRun ? (reduceMotion ? 2600 : 4600) : (reduceMotion ? 720 : 1400);
      state.flash = 0.5;
      resetPlayer();
      buildLevel();
      const name = levelNames[(level - 1) % levelNames.length];
      state.panelBaseCopy = firstRun
        ? "Move with WASD or arrow keys. Collect CORE diamonds to clear the level. TIME adds seconds. SHIELD blocks one hit. BONUS gives points."
        : "New hazards are online. Collect " + state.goal + " CORE diamonds before the link collapses.";
      setPanel("LEVEL " + pad(level, 2), name, state.panelBaseCopy + " Starting in " + countdownSeconds() + ".", false, null, firstRun ? "guide" : "levelup", firstRun);
      setStatus("LEVEL " + level, "collect " + state.goal + " cores");
      updateHud();
    }

    function restartGame() {
      state.score = 0;
      state.newBest = false;
      state.lives = 3;
      state.shield = 0;
      state.sparks.length = 0;
      state.floaters.length = 0;
      state.shake = 0;
      state.last = performance.now();
      startLevel(1, true);
    }

    function spawnBurst(x, y, color, amount) {
      const count = reduceMotion ? Math.ceil(amount * 0.38) : amount;
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const speed = rand(1.3, 7.4) * motionScale;
        state.sparks.push({
          x,
          y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: rand(360, 820),
          age: 0,
          size: rand(2, 5.5),
          color
        });
      }
    }

    function spawnFloater(x, y, text, color) {
      state.floaters.push({
        x,
        y,
        text,
        color,
        age: 0,
        life: 760,
        vy: -0.42 * motionScale
      });
    }

    function circleRectHit(x, y, r, rect) {
      const px = clamp(x, rect.x, rect.x + rect.w);
      const py = clamp(y, rect.y, rect.y + rect.h);
      const dx = x - px;
      const dy = y - py;
      return dx * dx + dy * dy <= r * r;
    }

    function circleLineHit(cx, cy, r, x1, y1, x2, y2, width) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy || 1;
      const t = clamp(((cx - x1) * dx + (cy - y1) * dy) / lenSq, 0, 1);
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      return Math.hypot(cx - px, cy - py) <= r + width * 0.5;
    }

    function inputVector() {
      const left = state.keys.arrowleft || state.keys.a;
      const right = state.keys.arrowright || state.keys.d;
      const up = state.keys.arrowup || state.keys.w;
      const down = state.keys.arrowdown || state.keys.s;
      let x = (right ? 1 : 0) - (left ? 1 : 0);
      let y = (down ? 1 : 0) - (up ? 1 : 0);
      const mag = Math.hypot(x, y);
      if (mag > 0) {
        x /= mag;
        y /= mag;
      }
      return { x, y, active: mag > 0 };
    }

    function takeHit(label, color) {
      if (state.phase !== "play" || state.hitCooldown > 0) return;
      state.hitCooldown = 980;
      state.shake = 12;
      state.combo = 1;
      if (state.shield > 0) {
        state.shield--;
        state.score = Math.max(0, state.score - 80);
        state.flash = 0.5;
        spawnBurst(state.player.x, state.player.y, pickupColors.shield, 30);
        spawnFloater(state.player.x, state.player.y - 12, "shield", pickupColors.shield);
        setStatus("SHIELD", "absorbed " + label);
        return;
      }
      state.lives--;
      state.score = Math.max(0, state.score - Math.round(160 * state.config.scoreMultiplier));
      state.flash = 0.75;
      spawnBurst(state.player.x, state.player.y, color || "#ff4d6d", 34);
      spawnFloater(state.player.x, state.player.y - 12, "-life", color || "#ff4d6d");
      if (state.lives <= 0) {
        endRun("Signal crashed");
      } else {
        resetPlayer();
        setStatus("HIT", label + " damaged the run");
      }
    }

    function completeLevel() {
      if (state.phase !== "play") return;
      const bonus = Math.round((state.timeLeft / 1000) * 42 + state.level * 360 + state.combo * 90);
      state.score += bonus;
      updateBest();
      state.phase = "countdown";
      state.nextLevel = state.level + 1;
      state.phaseTimer = reduceMotion ? 1600 : 3400;
      state.flash = 0.9;
      spawnBurst(state.player.x, state.player.y, pickupColors.core, 48);
      spawnBurst(state.player.x, state.player.y, pickupColors.bonus, 34);
      state.panelBaseCopy = "+" + bonus + " bonus banked.";
      setPanel("LEVEL CLEAR", "Level " + state.level + " complete", state.panelBaseCopy + " Level " + pad(state.nextLevel, 2) + " starts in " + countdownSeconds() + ".", false, null, "levelup", false);
      setStatus("LEVEL CLEAR", "+" + bonus + " bonus");
    }

    function endRun(reason) {
      if (state.phase === "gameover") return;
      state.phase = "gameover";
      state.phaseTimer = 0;
      state.shake = 18;
      state.flash = 1.4;
      updateBest();
      spawnBurst(state.player.x, state.player.y, state.newBest ? pickupColors.bonus : "#ff4d6d", 58);
      const title = state.newBest ? "New best" : "Signal lost";
      const copy = reason + ". Final level " + state.level + ". Score " + Math.round(state.score) + ".";
      setPanel(state.newBest ? "NEW BEST" : "YOU DIED", title, copy, true, "Play again", "danger", false);
      setStatus(state.newBest ? "NEW BEST" : "YOU DIED", Math.round(state.score) + " pts");
    }

    function collectPickup(node, index) {
      let value = 0;
      let message = "";
      if (node.kind === "core") {
        state.cores++;
        value = 140;
        message = "core " + state.cores + "/" + state.goal;
      } else if (node.kind === "time") {
        const gain = Math.round(2700 + state.level * 220);
        state.timeLeft = Math.min(state.levelTime + 9000, state.timeLeft + gain);
        value = 70;
        message = "+" + Math.round(gain / 1000) + "s";
      } else if (node.kind === "shield") {
        state.shield = Math.min(3, state.shield + 1);
        value = 95;
        message = "shield +" + state.shield;
      } else {
        value = 280;
        message = "bonus";
      }
      const points = Math.round(value * state.combo * state.config.scoreMultiplier);
      state.score += points;
      state.combo = Math.min(12, state.combo + 1);
      state.comboWindow = 3600;
      state.flash = Math.max(state.flash, 0.34);
      spawnBurst(node.x, node.y, node.color, node.kind === "bonus" ? 34 : 22);
      spawnFloater(node.x, node.y - node.size, "+" + points, node.color);
      state.pickups[index] = spawnPickup(index);
      setStatus("COMBO x" + state.combo, message);
      if (state.cores >= state.goal) completeLevel();
    }

    function pickupLabel(kind) {
      if (kind === "time") return "TIME";
      if (kind === "shield") return "SHIELD";
      if (kind === "bonus") return "BONUS";
      return "CORE";
    }

    function updatePlayer(step) {
      const p = state.player;
      const a = arenaBounds();
      const input = inputVector();
      const maxSpeed = 7.2 + Math.min(2.4, state.level * 0.11);
      const targetVx = input.x * maxSpeed;
      const targetVy = input.y * maxSpeed;
      const ease = input.active ? 1 - Math.pow(0.68, step) : 1 - Math.pow(0.58, step);
      p.vx += (targetVx - p.vx) * ease;
      p.vy += (targetVy - p.vy) * ease;
      const speed = Math.hypot(p.vx, p.vy);
      if (!input.active && speed < 0.04) {
        p.vx = 0;
        p.vy = 0;
      } else if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }
      const nextX = p.x + p.vx * step;
      const nextY = p.y + p.vy * step;
      p.x = clamp(nextX, a.left + p.r, a.right - p.r);
      p.y = clamp(nextY, a.top + p.r, a.bottom - p.r);
      if (p.x !== nextX) p.vx = 0;
      if (p.y !== nextY) p.vy = 0;
      const facingSpeed = Math.hypot(p.vx, p.vy);
      if (facingSpeed > 0.08) p.angle += (Math.atan2(p.vy, p.vx) - p.angle) * 0.18;
      state.trail.push({ x: p.x, y: p.y });
      if (state.trail.length > 24) state.trail.shift();
    }

    function updatePickups(step) {
      const a = arenaBounds();
      const p = state.player;
      for (let i = 0; i < state.pickups.length; i++) {
        const node = state.pickups[i];
        node.x += node.vx * step * motionScale;
        node.y += node.vy * step * motionScale;
        if (node.x < a.left + node.size || node.x > a.right - node.size) node.vx *= -1;
        if (node.y < a.top + node.size || node.y > a.bottom - node.size) node.vy *= -1;
        keepPointInArena(node, node.size);
        if (Math.hypot(node.x - p.x, node.y - p.y) < p.r + node.size + 8) {
          collectPickup(node, i);
        }
      }
    }

    function updateHazards(step, now) {
      const a = arenaBounds();
      const p = state.player;
      state.hitCooldown = Math.max(0, state.hitCooldown - step * 16.667);
      for (let i = 0; i < state.gates.length; i++) {
        const gate = state.gates[i];
        gate.x += gate.vx * step * motionScale;
        gate.y += gate.vy * step * motionScale;
        if (gate.x < a.left || gate.x + gate.w > a.right) {
          gate.vx *= -1;
          gate.x = clamp(gate.x, a.left, a.right - gate.w);
        }
        if (gate.y < a.top || gate.y + gate.h > a.bottom) {
          gate.vy *= -1;
          gate.y = clamp(gate.y, a.top, a.bottom - gate.h);
        }
        if (circleRectHit(p.x, p.y, p.r, gate)) takeHit("gate", gate.color);
      }
      for (let i = 0; i < state.mines.length; i++) {
        const mine = state.mines[i];
        mine.x += mine.vx * step * motionScale;
        mine.y += mine.vy * step * motionScale;
        if (mine.x < a.left + mine.r || mine.x > a.right - mine.r) mine.vx *= -1;
        if (mine.y < a.top + mine.r || mine.y > a.bottom - mine.r) mine.vy *= -1;
        keepPointInArena(mine, mine.r);
        const pulse = mine.r + Math.sin(now * 0.006 + mine.phase) * 4;
        if (Math.hypot(mine.x - p.x, mine.y - p.y) < p.r + pulse) takeHit("mine", mine.color);
      }
      for (let i = 0; i < state.sweepers.length; i++) {
        const sw = state.sweepers[i];
        sw.angle += sw.spin * step * motionScale;
        const dx = Math.cos(sw.angle) * sw.len * 0.5;
        const dy = Math.sin(sw.angle) * sw.len * 0.5;
        if (circleLineHit(p.x, p.y, p.r, sw.x - dx, sw.y - dy, sw.x + dx, sw.y + dy, sw.width)) {
          takeHit("laser", sw.color);
        }
      }
      for (let i = 0; i < state.seekers.length; i++) {
        const seeker = state.seekers[i];
        const dx = p.x - seeker.x;
        const dy = p.y - seeker.y;
        const dist = Math.hypot(dx, dy) || 1;
        seeker.vx += (dx / dist) * state.config.seekerSpeed * 0.12 * step;
        seeker.vy += (dy / dist) * state.config.seekerSpeed * 0.12 * step;
        seeker.vx *= Math.pow(0.9, step);
        seeker.vy *= Math.pow(0.9, step);
        seeker.x += seeker.vx * step * motionScale;
        seeker.y += seeker.vy * step * motionScale;
        seeker.angle = Math.atan2(seeker.vy, seeker.vx);
        keepPointInArena(seeker, seeker.r);
        if (Math.hypot(seeker.x - p.x, seeker.y - p.y) < seeker.r + p.r) takeHit("drone", seeker.color);
      }
    }

    function updateEffects(dt, step) {
      for (let i = state.sparks.length - 1; i >= 0; i--) {
        const s = state.sparks[i];
        s.age += dt * 1000;
        s.x += s.vx * step;
        s.y += s.vy * step;
        s.vx *= Math.pow(0.96, step);
        s.vy *= Math.pow(0.96, step);
        if (s.age >= s.life) state.sparks.splice(i, 1);
      }
      for (let i = state.floaters.length - 1; i >= 0; i--) {
        const f = state.floaters[i];
        f.age += dt * 1000;
        f.y += f.vy * step;
        if (f.age >= f.life) state.floaters.splice(i, 1);
      }
      state.shake *= Math.pow(0.72, step);
      state.flash *= Math.pow(0.74, step);
      state.comboWindow = Math.max(0, state.comboWindow - dt * 1000);
      if (state.comboWindow <= 0 && state.combo > 1 && state.phase === "play") {
        state.combo--;
        state.comboWindow = 900;
      }
    }

    function drawBackground(now) {
      const a = arenaBounds();
      const gap = state.width < 680 ? 42 : 56;
      const drift = reduceMotion ? 0 : ((now - state.openedAt) * 0.022) % gap;
      ctx.save();
      for (let i = 0; i < state.stars.length; i++) {
        const s = state.stars[i];
        if (!reduceMotion) {
          s.y += s.speed * motionScale;
          if (s.y > state.height + 4) {
            s.y = -4;
            s.x = Math.random() * state.width;
          }
        }
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = "#f4fbff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(244, 251, 255, 0.07)";
      for (let x = -gap + drift; x < state.width + gap; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x, a.top - 24);
        ctx.lineTo(x + 12, a.bottom + 28);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255, 184, 92, 0.08)";
      for (let y = a.top - gap + drift * 0.8; y < a.bottom + gap; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(state.width, y - 10);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(94, 225, 255, 0.22)";
      ctx.fillStyle = "rgba(4, 9, 18, 0.18)";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(a.left, a.top, a.right - a.left, a.bottom - a.top);
      ctx.fillRect(a.left, a.top, a.right - a.left, a.bottom - a.top);
      ctx.restore();
    }

    function drawPickup(node, now) {
      const pulse = 1 + Math.sin(now * 0.007 + node.phase) * 0.12;
      const s = node.size * pulse;
      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.rotate(node.phase + now * node.spin);
      ctx.strokeStyle = node.color;
      ctx.fillStyle = node.kind === "core" ? "rgba(94, 225, 255, 0.16)" :
        node.kind === "time" ? "rgba(120, 255, 191, 0.16)" :
        node.kind === "shield" ? "rgba(255, 184, 92, 0.17)" : "rgba(241, 119, 255, 0.18)";
      ctx.lineWidth = node.kind === "bonus" ? 2.5 : 1.8;
      if (node.kind === "time") {
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -s * 0.55);
        ctx.moveTo(0, 0);
        ctx.lineTo(s * 0.45, 0);
        ctx.stroke();
      } else if (node.kind === "shield") {
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.82, -s * 0.42);
        ctx.lineTo(s * 0.62, s * 0.42);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.62, s * 0.42);
        ctx.lineTo(-s * 0.82, -s * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s * 0.34, 0);
        ctx.lineTo(-s * 0.08, s * 0.28);
        ctx.lineTo(s * 0.42, -s * 0.34);
        ctx.stroke();
      } else if (node.kind === "bonus") {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? s : s * 0.45;
          const a = -Math.PI * 0.5 + (Math.PI * 2 * i) / 10;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s * 0.52, 0);
        ctx.lineTo(s * 0.52, 0);
        ctx.moveTo(0, -s * 0.52);
        ctx.lineTo(0, s * 0.52);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = node.color;
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
      ctx.save();
      ctx.font = "800 10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(4, 9, 18, 0.88)";
      ctx.fillStyle = node.color;
      ctx.strokeText(pickupLabel(node.kind), node.x, node.y + node.size + 16);
      ctx.fillText(pickupLabel(node.kind), node.x, node.y + node.size + 16);
      ctx.restore();
    }

    function drawGate(gate, now) {
      const stripe = ((now * 0.08 + gate.phase * 40) % 28);
      ctx.save();
      ctx.strokeStyle = gate.color;
      ctx.fillStyle = "rgba(255, 77, 109, 0.11)";
      ctx.lineWidth = 1.6;
      ctx.fillRect(gate.x, gate.y, gate.w, gate.h);
      ctx.strokeRect(gate.x, gate.y, gate.w, gate.h);
      ctx.beginPath();
      for (let i = -28; i < gate.w + gate.h + 32; i += 14) {
        ctx.moveTo(gate.x + i + stripe, gate.y);
        ctx.lineTo(gate.x + i + stripe - gate.h, gate.y + gate.h);
      }
      ctx.globalAlpha = 0.46;
      ctx.stroke();
      ctx.restore();
    }

    function drawMine(mine, now) {
      const r = mine.r + Math.sin(now * 0.006 + mine.phase) * 4;
      ctx.save();
      ctx.translate(mine.x, mine.y);
      ctx.strokeStyle = mine.color;
      ctx.fillStyle = "rgba(255, 77, 109, 0.12)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 + mine.phase;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r * 0.58), Math.sin(a) * (r * 0.58));
        ctx.lineTo(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7));
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawSweeper(sw) {
      const dx = Math.cos(sw.angle) * sw.len * 0.5;
      const dy = Math.sin(sw.angle) * sw.len * 0.5;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = sw.width + 12;
      ctx.beginPath();
      ctx.moveTo(sw.x - dx, sw.y - dy);
      ctx.lineTo(sw.x + dx, sw.y + dy);
      ctx.stroke();
      ctx.globalAlpha = 0.86;
      ctx.lineWidth = sw.width;
      ctx.beginPath();
      ctx.moveTo(sw.x - dx, sw.y - dy);
      ctx.lineTo(sw.x + dx, sw.y + dy);
      ctx.stroke();
      ctx.fillStyle = sw.color;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawSeeker(seeker) {
      ctx.save();
      ctx.translate(seeker.x, seeker.y);
      ctx.rotate(seeker.angle);
      ctx.fillStyle = "rgba(255, 77, 109, 0.16)";
      ctx.strokeStyle = seeker.color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-11, -10);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-11, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    function drawSparks() {
      for (let i = 0; i < state.sparks.length; i++) {
        const s = state.sparks[i];
        const life = 1 - s.age / s.life;
        ctx.save();
        ctx.globalAlpha = Math.max(0, life);
        ctx.fillStyle = s.color;
        ctx.translate(s.x, s.y);
        ctx.rotate(s.age * 0.012);
        ctx.fillRect(-s.size * 0.5, -s.size * 0.5, s.size, s.size);
        ctx.restore();
      }
    }

    function drawFloaters() {
      ctx.save();
      ctx.font = "700 12px var(--font-mono)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < state.floaters.length; i++) {
        const f = state.floaters[i];
        const life = 1 - f.age / f.life;
        ctx.globalAlpha = Math.max(0, life);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
    }

    function drawPlayer(now) {
      const p = state.player;
      const speed = Math.hypot(p.vx, p.vy);
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 1; i < state.trail.length; i++) {
        const a = i / state.trail.length;
        ctx.strokeStyle = "rgba(94, 225, 255, " + (a * 0.31).toFixed(3) + ")";
        ctx.lineWidth = 2 + a * 4;
        ctx.beginPath();
        ctx.moveTo(state.trail[i - 1].x, state.trail[i - 1].y);
        ctx.lineTo(state.trail[i].x, state.trail[i].y);
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.translate(p.x, p.y);
      if (state.shield > 0) {
        const shieldPulse = 1 + Math.sin(now * 0.009) * 0.08;
        ctx.strokeStyle = "rgba(255, 184, 92, 0.72)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, (p.r + 9) * shieldPulse, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(p.angle);
      const flicker = 1 + Math.sin(now * 0.02) * 0.08;
      ctx.fillStyle = "rgba(94, 225, 255, 0.18)";
      ctx.strokeStyle = "#5ee1ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20 * flicker, 0);
      ctx.lineTo(-13, -11);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-13, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ffb85c";
      ctx.beginPath();
      ctx.moveTo(-17, -5);
      ctx.lineTo(-30 - speed * 0.35, 0);
      ctx.lineTo(-17, 5);
      ctx.stroke();
      ctx.restore();
    }

    function drawScene(now) {
      ctx.clearRect(0, 0, state.width, state.height);
      const sx = (Math.random() - 0.5) * state.shake;
      const sy = (Math.random() - 0.5) * state.shake;
      ctx.save();
      ctx.translate(sx, sy);
      drawBackground(now);
      for (let i = 0; i < state.sweepers.length; i++) drawSweeper(state.sweepers[i]);
      for (let i = 0; i < state.gates.length; i++) drawGate(state.gates[i], now);
      for (let i = 0; i < state.mines.length; i++) drawMine(state.mines[i], now);
      for (let i = 0; i < state.seekers.length; i++) drawSeeker(state.seekers[i]);
      for (let i = 0; i < state.pickups.length; i++) drawPickup(state.pickups[i], now);
      drawSparks();
      drawFloaters();
      drawPlayer(now);
      ctx.restore();
      if (state.flash > 0.02) {
        ctx.save();
        ctx.globalAlpha = state.flash * 0.16;
        ctx.fillStyle = state.newBest ? pickupColors.bonus : pickupColors.core;
        ctx.fillRect(0, 0, state.width, state.height);
        ctx.restore();
      }
    }

    function frame(now) {
      if (!state.running) return;
      const dt = Math.min(0.034, (now - state.last) / 1000 || 0.016);
      const step = Math.min(2.2, dt * 60);
      state.last = now;

      if (state.phase === "intro") {
        state.phaseTimer -= dt * 1000;
        updatePanelCountdown();
        if (state.phaseTimer <= 0) {
          hidePanel();
          state.phase = "play";
          setStatus("RUN LIVE", "level " + state.level + " online");
        }
      } else if (state.phase === "countdown") {
        state.phaseTimer -= dt * 1000;
        updatePanelCountdown();
        if (state.phaseTimer <= 0) {
          startLevel(state.nextLevel, false);
        }
      } else if (state.phase === "play") {
        state.timeLeft = Math.max(0, state.timeLeft - dt * 1000);
        updatePlayer(step);
        updatePickups(step);
        updateHazards(step, now);
        if (state.timeLeft <= 0) endRun("Time expired");
      }

      updateEffects(dt, step);
      drawScene(now);
      updateHud();
      state.raf = requestAnimationFrame(frame);
    }

    function resizeGame() {
      state.width = Math.max(1, window.innerWidth);
      state.height = Math.max(1, window.innerHeight);
      state.dpr = Math.min(1.75, window.devicePixelRatio || 1);
      canvas.width = Math.floor(state.width * state.dpr);
      canvas.height = Math.floor(state.height * state.dpr);
      canvas.style.width = state.width + "px";
      canvas.style.height = state.height + "px";
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      makeStars();
      keepPointInArena(state.player, state.player.r);
      state.pickups.forEach(n => keepPointInArena(n, n.size));
      state.mines.forEach(m => keepPointInArena(m, m.r));
      state.seekers.forEach(s => keepPointInArena(s, s.r));
      state.sweepers.forEach(s => keepPointInArena(s, 86));
    }

    function onKeyDown(e) {
      const key = e.key.toLowerCase();
      const moveKey = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key);
      if (key === "escape") {
        e.preventDefault();
        e.stopPropagation();
        cleanup(false);
        return;
      }
      if (state.phase === "gameover" && key === "enter") {
        e.preventDefault();
        e.stopPropagation();
        restartGame();
        return;
      }
      if (!moveKey) return;
      e.preventDefault();
      e.stopPropagation();
      state.keys[key] = true;
    }

    function onKeyUp(e) {
      const key = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        state.keys[key] = false;
      }
    }

    function onCloseClick(e) {
      e.preventDefault();
      cleanup(false);
    }

    function onRestartClick(e) {
      e.preventDefault();
      restartGame();
      try { arcade.focus({ preventScroll: true }); } catch (_) {}
    }

    function cleanup(immediate) {
      if (!state.running) return;
      state.running = false;
      cancelAnimationFrame(state.raf);
      window.removeEventListener("resize", resizeGame);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      if (closeBtn) closeBtn.removeEventListener("click", onCloseClick);
      if (restartBtn) restartBtn.removeEventListener("click", onRestartClick);
      document.body.classList.remove("arcade-live");
      arcade.classList.remove("on");
      arcade.setAttribute("aria-hidden", "true");
      delete arcade._cleanup;
      const clear = () => ctx.clearRect(0, 0, state.width, state.height);
      if (immediate) clear();
      else setTimeout(() => { if (!arcade.classList.contains("on")) clear(); }, 320);
    }

    resizeGame();
    restartGame();
    document.body.classList.add("arcade-live");
    arcade.classList.add("on");
    arcade.setAttribute("aria-hidden", "false");
    showToast("Signal Sprint upgraded. Level run online.", "PLAY");
    window.addEventListener("resize", resizeGame, { passive: true });
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    if (closeBtn) closeBtn.addEventListener("click", onCloseClick);
    if (restartBtn) restartBtn.addEventListener("click", onRestartClick);
    arcade._cleanup = cleanup;
    try { arcade.focus({ preventScroll: true }); } catch (_) {}
    state.raf = requestAnimationFrame(frame);
  }

  // ---- email copy to clipboard ----
  function bindEmailCopy() {
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-copy]");
      if (!el) return;
      e.preventDefault();
      const text = el.dataset.copy;
      navigator.clipboard.writeText(text).then(() => {
        const arrow = el.querySelector(".copy-arrow");
        const emailText = el.querySelector(".email-text");
        if (arrow) arrow.textContent = "✓";
        if (emailText) emailText.textContent = "Copied!";
        showToast("Email copied to clipboard", "✓");
        setTimeout(() => {
          if (arrow) arrow.textContent = "→";
          if (emailText) emailText.textContent = text;
        }, 2000);
      }).catch(() => {
        // fallback — open mailto if clipboard fails
        window.location.href = "mailto:" + text;
      });
    });
  }
  function bindNavScroll() {
    const nav = $(".nav");
    if (!nav) return;
    let scrolled = false;
    const onScroll = () => {
      const s = window.scrollY > 24;
      if (s !== scrolled) { scrolled = s; nav.classList.toggle("scrolled", s); }
    };
    onScrollTask(onScroll);
    onScroll();
  }

  // ---- footer year ----
  function fillFooter() {
    const yr = $("[data-year]");
    if (yr) yr.textContent = new Date().getFullYear();
    const bt = $("[data-boot]");
    if (bt) bt.textContent = Math.round(performance.now()) + "ms";
  }

  // ---- HUD visibility cache (HUD is display:none on phones) ----
  function refreshHudVisible() {
    const h = $(".hud");
    hudVisible = !!h && getComputedStyle(h).display !== "none";
  }

  // ---- mobile slide-down menu ----
  function bindMobileMenu() {
    const nav = $(".nav");
    const toggle = $(".nav-toggle");
    if (!nav || !toggle) return;
    const workItem = nav.querySelector(".nav-item.has-dropdown");
    const workLink = workItem && workItem.querySelector(":scope > a");
    const workDropdown = workItem && workItem.querySelector(".nav-dropdown");
    const workDropdownLinks = workDropdown ? Array.from(workDropdown.querySelectorAll("a")) : [];
    const mobileMenuQuery = window.matchMedia("(max-width: 640px)");
    const syncWorkDropdown = (open) => {
      if (workItem) workItem.classList.toggle("open", open);
      if (workLink) workLink.setAttribute("aria-expanded", open ? "true" : "false");
      if (!workDropdown) return;
      const collapsedMobileMenu = mobileMenuQuery.matches && nav.classList.contains("menu-open") && !open;
      workDropdown.setAttribute("aria-hidden", collapsedMobileMenu ? "true" : "false");
      workDropdownLinks.forEach(a => {
        if (collapsedMobileMenu) a.setAttribute("tabindex", "-1");
        else a.removeAttribute("tabindex");
      });
    };
    const close = () => {
      nav.classList.remove("menu-open");
      toggle.setAttribute("aria-expanded", "false");
      syncWorkDropdown(false);
    };
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = nav.classList.toggle("menu-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      syncWorkDropdown(false);
    });
    // Work is a tap-to-expand accordion inside the mobile menu. Guard on menu-open
    // (only ever set on phones) and stop propagation so the smooth-scroll and
    // outside-click document handlers can't fire and close the menu.
    if (workLink) {
      workLink.addEventListener("click", (e) => {
        if (!nav.classList.contains("menu-open")) return; // desktop / closed: normal navigation + hover
        e.preventDefault();
        e.stopPropagation();
        syncWorkDropdown(!workItem.classList.contains("open"));
      });
    }
    // Tapping a real destination link closes the whole menu (Work toggle is excluded)
    nav.querySelectorAll(".nav-dropdown a, .nav-links > a").forEach(a => a.addEventListener("click", close));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    document.addEventListener("click", (e) => {
      if (nav.classList.contains("menu-open") && !e.target.closest(".nav")) close();
    });
    if (mobileMenuQuery.addEventListener) {
      mobileMenuQuery.addEventListener("change", () => syncWorkDropdown(workItem?.classList.contains("open")));
    }
  }

  // ---- wrap wide content tables so they scroll instead of forcing page overflow ----
  function wrapTables() {
    $$("main table").forEach(t => {
      if (t.closest(".table-scroll")) return;
      const w = document.createElement("div");
      w.className = "table-scroll";
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });
  }

  // ---- grid hide CSS hook (used by 'g' shortcut) ----
  // (We toggle body.no-grid; CSS handles it via body.no-grid override.)



  // ---- boot splash ----
  function dismissBoot() {
    const b = $(".boot");
    if (b) setTimeout(() => b.classList.add("gone"), 450);
  }

  // ---- init ----
  document.addEventListener("DOMContentLoaded", () => {
    prepareSchematics();
    bootObservers();
    bindEmailCopy();
    bindNavScroll();
    fillFooter();
    refreshHudVisible();
    window.addEventListener("resize", refreshHudVisible, { passive: true });
    wrapTables();
    bindMobileMenu();
    bindMagnetic();
    bindTilt();
    bindGlitch();
    bindGradeChips();
    refreshScrollMetrics();
    updateScrollProgress();
    updateHud();
    initNavActive();
    bindSectionObserver();
    bindHudSectionObserver();
    initNavSmoothScroll();
    bindScrollHint();
    bindScrollPerfMode();
    bindOffscreenPause();
    bootScramble();
    dismissBoot();
    // easter eggs
    bindKonami();
    bindTypeTriggers();
    bindKeyShortcuts();
    bindHeroClickEgg();
    bindLogoSpin();
    bindCoordFreeze();
    bindIdleTimer();
    bindHelpButton();

    // ---- text selection toggle ----
    const textSelectToggle = document.getElementById("textSelectToggle");
    if (textSelectToggle) {
      textSelectToggle.checked = isSelectionEnabled;
      textSelectToggle.addEventListener("change", (e) => {
        const active = e.target.checked;
        root.classList.toggle("selection-enabled", active);
        localStorage.setItem("gs-text-selection", active);
      });
    }

    const savedLayout = localStorage.getItem("gs-layout-v2") || "spec";
    setLayout(savedLayout);
    try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch (_) {}
  });
})();
