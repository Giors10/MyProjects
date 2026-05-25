/* ============================================================
   site.js — v3
   ============================================================ */
(function () {
  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let hudVisible = true; // HUD is display:none on phones; cached to skip wasted scroll work

  // ---- text selection ----
  const isSelectionEnabled = localStorage.getItem("gs-text-selection") === "true";
  root.classList.toggle("selection-enabled", isSelectionEnabled);

  // ---- theme ----
  const saved = localStorage.getItem("gs-theme");
  function setTheme(t, animate) {
    // Briefly enable a global palette crossfade on user toggles (not on initial load, to avoid a flash)
    if (animate) {
      root.classList.add("theme-anim");
      clearTimeout(setTheme._t);
      setTheme._t = setTimeout(() => root.classList.remove("theme-anim"), 520);
    }
    root.setAttribute("data-theme", t);
    localStorage.setItem("gs-theme", t);
    $$("[data-theme-label]").forEach(el => el.textContent = t === "dark" ? "LIGHT" : "DARK");
    $$("[data-tweak-theme] button").forEach(b => b.classList.toggle("active", b.dataset.val === t));
  }
  setTheme(saved || "light");

  document.addEventListener("click", (e) => {
    // Only the real theme toggle, NOT the ? help button
    const tt = e.target.closest(".theme-toggle");
    if (tt && !tt.hasAttribute("data-help-toggle")) {
      const cur = root.getAttribute("data-theme") || "light";
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

  // scroll-spy on index page
  window.isProgrammaticScroll = false;
  
  function bindScrollSpy() {
    const isProject = /\/projects\//.test(location.pathname);
    if (isProject) return;
    const navIds = ["hero", "work", "about", "track", "contact", "now", "profile", "skills"];
    const sections = navIds.map(id => document.getElementById(id)).filter(Boolean);
    const rail = $$(".rail a");
    if (!sections.length) return;
    function onScroll() {
      if (window.isProgrammaticScroll) return; // Skip spy calculations during programmatic smooth glides
      
      const y = window.scrollY + window.innerHeight * 0.35;
      
      // Sort sections by their physical top offset in the document to ensure top-to-bottom scroll spy evaluation
      const sortedSections = [...sections].sort((a, b) => {
        const topA = a.getBoundingClientRect().top + window.scrollY;
        const topB = b.getBoundingClientRect().top + window.scrollY;
        return topA - topB;
      });

      let cur = sortedSections[0] ? sortedSections[0].id : "";
      for (const s of sortedSections) {
        const top = s.getBoundingClientRect().top + window.scrollY;
        if (y >= top) cur = s.id;
      }

      // Check if we are scrolled near the bottom of the page (within 120px of scroll limit or contact section visible in bottom viewport)
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const isBottom = window.scrollY >= Math.max(0, maxScroll - 120);
      if (isBottom) {
        cur = "contact";
      }

      // rail update
      rail.forEach(a => a.classList.toggle("active", a.dataset.rail === cur));
      // top nav: map sub-sections to their nearest top-level link
      const navMap = { 
        hero: "",
        now: "work", 
        profile: "work", 
        work: "work", 
        about: "about", 
        track: "track", 
        skills: "track", 
        contact: "contact" 
      };
      const topCur = navMap[cur];
      setActiveByHash(topCur ? "#" + topCur : "");
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // Custom ultra-smooth smooth scroll for nav links on click w/ spy locking
  function initNavSmoothScroll() {
    const isProject = /\/projects\//.test(location.pathname);
    if (isProject) return;

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
      const link = e.target.closest(".nav-links a");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      const hashIndex = href.indexOf("#");
      if (hashIndex === -1) return;
      const hash = href.substring(hashIndex);
      const target = document.querySelector(hash);

      if (target) {
        e.preventDefault();

        // Lock scroll spy updates during glide to eliminate jumping active states
        window.isProgrammaticScroll = true;
        setActiveByHash(hash);

        const navHeight = $(".nav")?.offsetHeight || 60;
        const bodyRect = document.body.getBoundingClientRect().top;
        const targetRect = target.getBoundingClientRect().top;
        const targetPosition = targetRect - bodyRect;
        const offsetPosition = targetPosition - navHeight;

        window.scrollTo({
          top: offsetPosition,
          behavior: reduceMotion ? "auto" : "smooth"
        });

        // Update URL hash smoothly
        history.pushState(null, null, hash);

        // Fail-safe unlock in case no scroll event is fired (e.g., if already at destination)
        window.clearTimeout(isScrollingTimeout);
        isScrollingTimeout = window.setTimeout(() => {
          window.isProgrammaticScroll = false;
          const event = new Event("scroll");
          window.dispatchEvent(event);
        }, 800);
      }
    });
  }
  window.addEventListener("hashchange", initNavActive);

  // ---- scroll progress ----
  const sp = $(".scroll-progress .bar");
  function updateScrollProgress() {
    if (!sp) return;
    const h = document.documentElement;
    const max = (h.scrollHeight - h.clientHeight) || 1;
    const pct = Math.min(100, Math.max(0, (h.scrollTop / max) * 100));
    sp.style.width = pct.toFixed(2) + "%";
  }
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("resize", updateScrollProgress);

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

  function updateHud() {
    if (!hudVisible) return; // HUD hidden on phones — skip its per-scroll layout reads
    // Build the ordered list of sections that drive the SECTION readout.
    // 1) Prefer explicit [data-screen-label] elements (home page, robot page).
    // 2) Otherwise derive one entry per <main> section from its visible marker
    //    (project pages) so the readout always mirrors the section on screen.
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

    items = items.filter(it => it.label);
    if (items.length) {
      const y = window.scrollY + window.innerHeight * 0.35;
      let cur = items[0];
      items.forEach(it => {
        const top = it.el.getBoundingClientRect().top + window.scrollY;
        if (y >= top) cur = it;
      });
      // Make sure the final section is reachable when scrolled to the bottom
      // (the 0.35 focus line can't otherwise reach short trailing sections).
      const h = document.documentElement;
      const maxScroll = h.scrollHeight - h.clientHeight;
      if (window.scrollY >= Math.max(0, maxScroll - 120)) cur = items[items.length - 1];
      const el = $("[data-hud-section]");
      if (el) el.textContent = cur.label.toUpperCase();
    }
    const pe = $("[data-hud-pct]");
    if (pe) {
      const h = document.documentElement;
      const max = (h.scrollHeight - h.clientHeight) || 1;
      const pct = Math.min(100, Math.max(0, (h.scrollTop / max) * 100));
      pe.textContent = pct.toFixed(0).padStart(3, "0") + "%";
    }
  }
  window.addEventListener("scroll", updateHud, { passive: true });
  window.addEventListener("resize", updateHud);

  // ---- coord readout (hero) ----
  document.addEventListener("mousemove", (e) => {
    const c = $(".coord");
    if (c && !c.classList.contains("frozen")) {
      const xEl = c.querySelector("[data-cx]");
      const yEl = c.querySelector("[data-cy]");
      if (xEl) xEl.textContent = String(Math.round(e.clientX)).padStart(4, "0");
      if (yEl) yEl.textContent = String(Math.round(e.clientY)).padStart(4, "0");
    }
    // body spotlight follows cursor
    document.body.style.setProperty("--mx", e.clientX + "px");
    document.body.style.setProperty("--my", e.clientY + "px");
  });

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

  // ---- scramble decode (subtle: only letters/digits, gentle pace) ----
  const SCRAMBLE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  function scramble(el, dur = 1200, delay = 0) {
    const finalText = el.dataset.text || el.textContent.trim();
    const len = finalText.length;
    if (!len) return;
    // pre-fill so width is stable
    let initial = "";
    for (let i = 0; i < len; i++) {
      initial += (finalText[i] === " ") ? " " : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }
    el.textContent = initial;
    setTimeout(() => {
      const start = performance.now();
      const lockTimes = [];
      for (let i = 0; i < len; i++) {
        lockTimes.push(start + 200 + ((i + 1) / len) * (dur - 200));
      }
      function frame(now) {
        let out = "";
        for (let i = 0; i < len; i++) {
          const c = finalText[i];
          if (now >= lockTimes[i] || c === " " || c === "\u00A0") out += c;
          else out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
        el.textContent = out;
        if (now < lockTimes[len - 1]) requestAnimationFrame(frame);
        else {
          el.textContent = finalText;
          const parent = el.closest(".decode-line");
          if (parent) parent.classList.add("done");
        }
      }
      requestAnimationFrame(frame);
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
    targets.forEach((el, i) => scramble(el, 900 + i * 60, 180 + i * 260));
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
  function bootObservers() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const t = en.target;
        t.classList.add("in");
        if (t.hasAttribute("data-count")) animateCounter(t);
        if (t.classList.contains("thumb-schematic")) t.classList.add("in");
        if (t.classList.contains("fill")) fillBar(t);
        io.unobserve(t);
      });
    }, { threshold: 0.05, rootMargin: "0px 0px -6% 0px" });

    $$("[data-reveal]").forEach(e => {
      const r = e.getBoundingClientRect();
      const inView = r.top < window.innerHeight && r.bottom > 0;
      if (!inView) e.classList.add("pre-reveal");
      io.observe(e);
    });

    // stagger project cards
    const cards = $$(".proj");
    const cardIo = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.classList.add("anim-in");
        cardIo.unobserve(en.target);
      });
    }, { threshold: 0.1 });
    cards.forEach(c => {
      const r = c.getBoundingClientRect();
      if (r.top >= window.innerHeight) cardIo.observe(c);
    });

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



  // ---- 3D tilt cards (very subtle) ----
  function bindTilt() {
    if (!supportsHover) return;
    $$(".tilt").forEach(card => {
      const inner = card.querySelector(".tilt-inner") || card;
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const rx = py * -1.4;
        const ry = px * 2;
        inner.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
      });
      card.addEventListener("mouseleave", () => {
        inner.style.transform = "perspective(1200px) rotateX(0) rotateY(0)";
      });
    });
  }

  // ---- magnetic buttons ----
  function bindMagnetic() {
    if (!supportsHover) return;
    $$(".btn").forEach(b => {
      b.addEventListener("mousemove", (e) => {
        const r = b.getBoundingClientRect();
        const cx = e.clientX - r.left - r.width / 2;
        const cy = e.clientY - r.top - r.height / 2;
        b.style.transform = `translate(${cx * 0.1}px, ${cy * 0.1}px)`;
      });
      b.addEventListener("mouseleave", () => { b.style.transform = ""; });
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
      if (e.key.length !== 1) return;
      buf = (buf + e.key.toLowerCase()).slice(-32);
      if (buf.endsWith("robot")) {
        showMascot();
      } else if (buf.endsWith("matrix")) {
        runMatrix();
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
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
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
    const close = () => {
      nav.classList.remove("menu-open");
      toggle.setAttribute("aria-expanded", "false");
      if (workItem) workItem.classList.remove("open");
      if (workLink) workLink.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = nav.classList.toggle("menu-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (!open && workItem) workItem.classList.remove("open");
    });
    // Work is a tap-to-expand accordion inside the mobile menu. Guard on menu-open
    // (only ever set on phones) and stop propagation so the smooth-scroll and
    // outside-click document handlers can't fire and close the menu.
    if (workLink) {
      workLink.addEventListener("click", (e) => {
        if (!nav.classList.contains("menu-open")) return; // desktop / closed: normal navigation + hover
        e.preventDefault();
        e.stopPropagation();
        const open = workItem.classList.toggle("open");
        workLink.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    // Tapping a real destination link closes the whole menu (Work toggle is excluded)
    nav.querySelectorAll(".nav-dropdown a, .nav-links > a").forEach(a => a.addEventListener("click", close));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    document.addEventListener("click", (e) => {
      if (nav.classList.contains("menu-open") && !e.target.closest(".nav")) close();
    });
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
    updateScrollProgress();
    updateHud();
    initNavActive();
    bindScrollSpy();
    initNavSmoothScroll();
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
