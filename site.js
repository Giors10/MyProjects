/* Shared bits for every page: theme, menus, the contents list and wide tables. */
(() => {
  const root = document.documentElement;
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function setTheme(theme, save) {
    const dark = theme === "dark";
    root.dataset.theme = dark ? "dark" : "light";
    root.style.colorScheme = root.dataset.theme;
    $$(".theme-toggle").forEach(button => {
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.title = dark ? "Light mode" : "Dark mode";
    });
    $$('meta[name="theme-color"]').forEach(meta => { meta.content = dark ? "#121417" : "#fbfbf8"; });
    if (save) {
      try { localStorage.setItem("gs-theme", root.dataset.theme); } catch (_) {}
    }
  }

  function bindTheme() {
    setTheme(root.dataset.theme);
    $$(".theme-toggle").forEach(button => button.addEventListener("click", () => {
      setTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    }));
    // Follow the system setting until someone picks a theme themselves.
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    system.addEventListener?.("change", event => {
      let saved = null;
      try { saved = localStorage.getItem("gs-theme"); } catch (_) {}
      if (!saved) setTheme(event.matches ? "dark" : "light");
    });
  }

  function bindMenus() {
    const nav = document.querySelector(".nav");
    const toggle = document.querySelector(".nav-toggle");
    const links = document.querySelector("#primary-links");
    const work = document.querySelector(".nav-work");
    const workToggle = document.querySelector(".work-toggle");
    const mobile = window.matchMedia("(max-width: 820px)");
    if (!nav) return;

    const setWork = (open, focusToggle) => {
      if (!work || !workToggle) return;
      work.classList.toggle("work-open", open);
      workToggle.setAttribute("aria-expanded", String(open));
      workToggle.setAttribute("aria-label", open ? "Hide the project list" : "Show the project list");
      if (focusToggle) workToggle.focus();
    };
    const setMenu = (open, focusToggle) => {
      if (!toggle) return;
      nav.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (links) links.inert = mobile.matches && !open;
      if (!open) setWork(false);
      if (focusToggle) toggle.focus();
    };

    if (workToggle) {
      setWork(false);
      workToggle.addEventListener("click", () => setWork(!work.classList.contains("work-open")));
      workToggle.addEventListener("keydown", event => {
        if (event.key !== "ArrowDown") return;
        event.preventDefault();
        setWork(true);
        work.querySelector(".work-dropdown a")?.focus();
      });
      work.addEventListener("focusout", event => {
        if (!mobile.matches && !work.contains(event.relatedTarget)) setWork(false);
      });
    }
    toggle?.addEventListener("click", () => setMenu(!nav.classList.contains("menu-open")));
    $$(".nav-links a", nav).forEach(link => link.addEventListener("click", () => setMenu(false)));
    document.addEventListener("click", event => {
      if (!nav.contains(event.target)) setMenu(false);
      else if (work && !work.contains(event.target) && !mobile.matches) setWork(false);
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (work?.classList.contains("work-open")) setWork(false, true);
      else if (nav.classList.contains("menu-open")) setMenu(false, true);
    });
    mobile.addEventListener?.("change", () => setMenu(false));
    setMenu(false);
  }

  // Highlights the nav item for the part of the home page you're reading.
  function bindHomeSections() {
    const links = $$(".nav-links a[data-section]");
    const mark = id => links.forEach(link => {
      const on = link.dataset.section === id;
      link.classList.toggle("active", on);
      if (on) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    if (location.pathname.includes("/projects/")) { mark("work"); return; }
    const sections = ["work", "about", "track", "contact"].map(id => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.35;
      let current = "";
      sections.forEach(section => { if (section.getBoundingClientRect().top <= line) current = section.id; });
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) current = sections[sections.length - 1].id;
      mark(current);
    };
    window.addEventListener("scroll", () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
  }

  // The little blue ball under the nav. It sits on the nav's bottom line (like the
  // ball on the logo's ground line) and bounces from link to link as you scroll the
  // home page, squashing when it lands and stretching in the air. Desktop only.
  function bindNavBall() {
    const nav = document.querySelector(".nav");
    const inner = nav && nav.querySelector(".nav-inner");
    if (!inner || reducedMotion.matches || !window.requestAnimationFrame) return;
    const ids = ["work", "about", "track", "contact"];
    const links = ids.map(id => nav.querySelector(`a[data-section="${id}"]`)).filter(Boolean);
    if (links.length !== ids.length) return;

    const isHome = !location.pathname.includes("/projects/") && ids.every(id => document.getElementById(id));
    const sections = isHome ? ids.map(id => document.getElementById(id)) : [];
    const desktop = window.matchMedia("(min-width: 821px)");

    const make = (cls, tag = "span") => {
      const el = document.createElement(tag);
      el.className = cls;
      el.setAttribute("aria-hidden", "true");
      inner.append(el);
      return el;
    };
    const shadow = make("nav-ball-shadow");
    const trails = [make("nav-trail t1"), make("nav-trail t2"), make("nav-trail t3")];
    const ball = make("nav-ball");
    nav.classList.add("has-ball");

    const R = 4.5;      // ball radius
    const LIFT = 3;     // how far the resting ball sits above the nav's bottom line
    let centers = [], ground = 64, width = 0, box = null;
    const measure = () => {
      box = inner.getBoundingClientRect();
      width = box.width;
      ground = box.height - LIFT;
      centers = links.map(a => {
        const range = document.createRange();
        range.selectNodeContents(a);
        const r = range.getBoundingClientRect();
        return r.left - box.left + r.width / 2;
      });
    };

    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const smooth = t => t * t * (3 - 2 * t);

    // Where the ball belongs, as a number: -1 hidden (top of the page), 0 Projects,
    // 1 About, 2 Experience, 3 Contact. It uses the same reading line as the nav
    // highlight, and each hop is centred on the moment a section crosses that line,
    // so the ball and the highlighted link always agree once the page is still.
    const scrubbed = () => {
      if (!isHome) return 0;
      const vh = window.innerHeight;
      const line = vh * 0.35;
      if (window.scrollY + vh >= document.documentElement.scrollHeight - 4) return ids.length - 1;
      const w = Math.min(170, vh * 0.2);
      let pos = -1;
      sections.forEach(section => {
        pos += smooth(clamp((line - (section.getBoundingClientRect().top - w)) / (2 * w)));
      });
      return pos;
    };

    const xAt = p => {
      if (p <= 0) return centers[0];
      const i = Math.min(Math.floor(p), centers.length - 2);
      return centers[i] + (centers[i + 1] - centers[i]) * (p - i);
    };
    // Height while travelling between two links: longer trips get more, smaller bounces.
    const hopAt = p => {
      if (p <= 0) return 0;
      const i = Math.min(Math.floor(p), centers.length - 2);
      const f = clamp(p - i);
      const hops = Math.max(1, Math.round(Math.abs(centers[i + 1] - centers[i]) / 85));
      const k = Math.min(hops - 1, Math.floor(f * hops));
      return (16 - k * 4) * Math.abs(Math.sin(Math.PI * hops * f));
    };
    // A bounce that dies away: used for the drop-in, the idle hop and clicks.
    const bounce = (t, height, count, fromTop) => {
      if (t >= 1 || t < 0) return 0;
      return height * Math.pow(1 - t, 1.7) * Math.abs(Math.sin(Math.PI * (t * count + (fromTop ? 0.5 : 0))));
    };

    let p = scrubbed(), v = 0;
    let lastScroll = 0, raf = 0, lastT = 0, lastX = null, lastY = 0;
    let idleTimer = 0, settleTimer = 0;
    // Cursor dodging: the ball scoots away from the mouse and springs back after.
    let mouse = null, dodge = 0, dodgeV = 0, lastStartle = 0;
    const effects = []; // { start, duration, height, count, fromTop }
    const trailPts = trails.map(() => ({ x: 0, y: 0 }));
    let nextIdle = performance.now() + 6000;
    const scheduleIdle = () => { nextIdle = performance.now() + (isHome ? 6000 : 9000) + Math.random() * 5000; };
    if (p > -0.5) effects.push({ start: performance.now() + 150, duration: 1150, height: 30, count: 2.6, fromTop: true });

    const frame = now => {
      raf = 0;
      if (!desktop.matches) { lastT = 0; return; }
      const dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 1 / 60);
      lastT = now;

      // While the page scrolls the ball follows it; once it stops, the ball
      // finishes the hop to the nearest link instead of hanging in the air.
      let target = scrubbed();
      if (now - lastScroll > 240) target = Math.round(target);
      const accel = 150 * (target - p) - 16 * v;
      v += accel * dt;
      p += v * dt;

      let y = hopAt(p);
      let opacity = 1;
      if (p < 0) { opacity = clamp((p + 1) * 1.8 - 0.8); y += -p * 30; }
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];
        const t = (now - e.start) / e.duration;
        if (t >= 1) { effects.splice(i, 1); continue; }
        y += bounce(t, e.height, e.count, e.fromTop);
      }
      const settled = Math.abs(v) < 0.02 && Math.abs(target - p) < 0.01;
      if (!effects.length && settled && now > nextIdle && now - lastScroll > 2400 && opacity > 0.99) {
        effects.push({ start: now, duration: 900, height: 10, count: 2, fromTop: false });
        scheduleIdle();
      }

      // Stay out of the cursor's way.
      const restX = xAt(p);
      let dodgeTarget = 0;
      if (mouse && opacity > 0.5) {
        const by = ground - R - y;
        const dist = Math.hypot(mouse.x - (restX + dodge), (mouse.y - by) * 1.25);
        const reach = 74;
        if (dist < reach) {
          const side = Math.sign(restX + dodge - mouse.x) || (restX > width / 2 ? -1 : 1);
          dodgeTarget = side * Math.pow(1 - dist / reach, 1.2) * 58;
          if (dist < 46 && now - lastStartle > 700 && !effects.length) {
            effects.push({ start: now, duration: 520, height: 8, count: 1, fromTop: false });
            lastStartle = now;
          }
        }
        // Keep it inside the nav even when cornered.
        dodgeTarget = clamp(restX + dodgeTarget, R + 4, width - R - 4) - restX;
      }
      dodgeV += (240 * (dodgeTarget - dodge) - 19 * dodgeV) * dt;
      dodge += dodgeV * dt;

      const x = restX + dodge;
      if (lastX === null) trailPts.forEach(pt => { pt.x = x; pt.y = y; });
      const vx = lastX === null ? 0 : (x - lastX) / dt;
      const vy = (y - lastY) / dt;
      lastX = x;
      lastY = y;

      // Squash when it touches down, stretch while it flies.
      let sx = 1, sy = 1;
      const contact = clamp(1 - y / 2.5);
      if (contact > 0) {
        const q = Math.min(0.5, Math.abs(vy) * 0.002 + Math.abs(vx) * 0.0004) * contact;
        sx = 1 + q; sy = 1 - q * 0.7;
      } else {
        const q = Math.min(0.36, Math.abs(vy) * 0.0015 + Math.abs(vx) * 0.0002);
        sy = 1 + q; sx = 1 - q * 0.45;
      }
      ball.style.opacity = opacity.toFixed(3);
      ball.style.transform = `translate(${(x - R).toFixed(2)}px, ${(ground - 2 * R - y).toFixed(2)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
      ball.classList.toggle("is-live", opacity > 0.5);
      const lift = clamp(y / 20);
      shadow.style.opacity = (0.3 * (1 - lift) * opacity).toFixed(3);
      shadow.style.transform = `translate(${(x - 7).toFixed(2)}px, ${(ground - 1.5).toFixed(2)}px) scaleX(${(1 - lift * 0.6).toFixed(3)})`;

      let px = x, py = y, motion = Math.abs(vx) + Math.abs(vy);
      trailPts.forEach((pt, i) => {
        const ease = 0.4 - i * 0.1;
        pt.x += (px - pt.x) * ease;
        pt.y += (py - pt.y) * ease;
        const gap = Math.hypot(pt.x - px, pt.y - py);
        const size = 3 - i * 0.5;
        trails[i].style.opacity = (clamp(gap / 7) * (0.34 - i * 0.09) * opacity).toFixed(3);
        trails[i].style.transform = `translate(${(pt.x - size).toFixed(2)}px, ${(ground - R - size - pt.y).toFixed(2)}px)`;
        motion += gap;
        px = pt.x;
        py = pt.y;
      });

      if (motion > 0.3 || !settled || effects.length || Math.abs(dodgeTarget - dodge) > 0.2 || Math.abs(dodgeV) > 0.5) raf = requestAnimationFrame(frame);
      else {
        lastT = 0;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(wake, Math.max(200, nextIdle - performance.now()));
      }
    };
    const wake = () => { if (!raf && desktop.matches) raf = requestAnimationFrame(frame); };

    document.addEventListener("mousemove", event => {
      if (!box) return;
      const x = event.clientX - box.left, y = event.clientY - box.top;
      mouse = y > -20 && y < box.height + 70 ? { x, y } : null;
      wake();
    }, { passive: true });
    document.addEventListener("mouseleave", () => { mouse = null; wake(); });
    window.addEventListener("scroll", () => {
      lastScroll = performance.now();
      wake();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(wake, 260);
    }, { passive: true });
    window.addEventListener("resize", () => { measure(); wake(); }, { passive: true });
    desktop.addEventListener?.("change", () => { lastX = null; measure(); wake(); });
    measure();
    (document.fonts?.ready || Promise.resolve()).then(() => { measure(); wake(); });
    wake();
  }

  // Same-page anchors scroll smoothly and move focus to the target.
  function bindAnchors() {
    $$('a[href*="#"]').forEach(link => link.addEventListener("click", event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = new URL(link.href, location.href);
      const samePage = url.pathname.replace(/index\.html$/, "") === location.pathname.replace(/index\.html$/, "");
      if (!url.hash || url.origin !== location.origin || !samePage) return;
      let target;
      try { target = document.getElementById(decodeURIComponent(url.hash.slice(1))); } catch (_) { return; }
      if (!target) return;
      event.preventDefault();
      if (location.hash !== url.hash) history.pushState(null, "", url.hash);
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      requestAnimationFrame(() => target.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" }));
    }));
  }

  // "On this page": always open on wide screens, collapsible on phones,
  // and it marks the section you're currently reading.
  function bindContents() {
    const toc = document.querySelector(".toc details");
    if (!toc) return;
    const wide = window.matchMedia("(min-width: 901px)");
    const sync = () => { toc.open = wide.matches; };
    sync();
    wide.addEventListener?.("change", sync);
    $$("a", toc).forEach(link => link.addEventListener("click", () => { if (!wide.matches) toc.open = false; }));

    const links = $$('a[href^="#"]', toc);
    const targets = links.map(link => document.getElementById(link.getAttribute("href").slice(1))).filter(Boolean);
    if (!targets.length || !("IntersectionObserver" in window)) return;
    const visible = new Set();
    const spy = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      const current = targets.find(target => visible.has(target));
      if (!current) return;
      links.forEach(link => link.classList.toggle("active", link.getAttribute("href") === "#" + current.id));
    }, { rootMargin: "-15% 0px -70% 0px" });
    targets.forEach(target => spy.observe(target));
  }

  // Drop-downs (GCSE results, programmes, the light switch modes) slide open and
  // shut instead of snapping, and each one opens by itself the first time you
  // scroll down to it. Once someone closes one, it's left alone.
  function bindDisclosures() {
    const items = $$("details.xp-more, details.disclose, details.mode-item");
    if (!items.length) return;

    items.forEach(details => {
      const summary = details.querySelector(":scope > summary");
      if (!summary || details.querySelector(":scope > .details-body")) return;
      const body = document.createElement("div");
      body.className = "details-body";
      while (summary.nextSibling) body.append(summary.nextSibling);
      details.append(body);

      summary.addEventListener("click", event => {
        event.preventDefault();
        details.dataset.touched = "1";
        animate(details, !details.open || details.classList.contains("is-closing"));
      });
    });

    // The pieces inside a drop-down (each GCSE row, each programme, each line of
    // a mode) so they can come in one after another.
    const pieces = body => {
      const inner = body.children.length === 1 ? body.firstElementChild : body;
      const kids = Array.from(inner.children);
      return kids.length === 1 && kids[0].children.length > 1 ? Array.from(kids[0].children) : kids;
    };

    function animate(details, open) {
      const body = details.querySelector(":scope > .details-body");
      (details._anims || []).forEach(a => a.cancel());
      details._anims = [];
      if (reducedMotion.matches || !body.animate) {
        details.classList.remove("is-closing");
        details.open = open;
        return;
      }
      const from = details.open ? body.getBoundingClientRect().height : 0;
      let height;
      if (open) {
        details.classList.remove("is-closing");
        details.open = true;
        const to = body.scrollHeight;
        height = body.animate([{ height: from + "px" }, { height: to + "px" }],
          { duration: 620, easing: "cubic-bezier(.16, 1, .3, 1)" });
        pieces(body).forEach((piece, i) => {
          details._anims.push(piece.animate([
            { opacity: 0, transform: "translateY(14px)" },
            { opacity: 1, transform: "none" }
          ], { duration: 520, delay: 70 + i * 60, easing: "cubic-bezier(.2, .8, .2, 1)", fill: "backwards" }));
        });
      } else {
        details.classList.add("is-closing");
        pieces(body).forEach(piece => {
          details._anims.push(piece.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: 160, easing: "ease-out", fill: "forwards" }));
        });
        height = body.animate([{ height: from + "px" }, { height: "0px" }],
          { duration: 360, delay: 60, easing: "cubic-bezier(.65, 0, .35, 1)", fill: "forwards" });
      }
      details._anims.push(height);
      height.onfinish = () => {
        if (!open) {
          details.open = false;
          details.classList.remove("is-closing");
          details._anims.forEach(a => a.cancel());
        }
        details._anims = [];
      };
    }

    if (!("IntersectionObserver" in window)) return;
    let queue = [];
    let flushing = false;
    const flush = () => {
      if (flushing) return;
      flushing = true;
      const step = () => {
        const next = queue.shift();
        if (!next) { flushing = false; return; }
        if (!next.open && !next.dataset.touched) animate(next, true);
        setTimeout(step, 140);
      };
      step();
    };
    const watcher = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        watcher.unobserve(entry.target);
        // Only when it comes up from below, i.e. while scrolling down.
        if (entry.boundingClientRect.top > 0) queue.push(entry.target);
      });
      queue.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      flush();
    }, { rootMargin: "0px 0px -22% 0px" });
    items.forEach(details => { if (!details.open) watcher.observe(details); });
  }

  // The Zaylo demo always renders at a real phone size (390 x 844) and is scaled
  // to whatever width the frame has, so the app's own layout is never squashed.
  function bindPhoneScreens() {
    $$(".device-screen").forEach(screen => {
      const frame = screen.querySelector("iframe");
      if (!frame) return;
      const fit = () => {
        const scale = screen.clientWidth / 390;
        if (scale > 0) screen.style.setProperty("--screen-scale", scale.toFixed(4));
      };
      fit();
      if ("ResizeObserver" in window) new ResizeObserver(fit).observe(screen);
      else window.addEventListener("resize", fit, { passive: true });
    });
  }

  // Wide technical tables scroll sideways instead of stretching the page on phones.
  function wrapTables() {
    $$("main table").forEach(table => {
      if (table.parentElement.classList.contains("table-scroll")) return;
      const box = document.createElement("div");
      box.className = "table-scroll";
      box.tabIndex = 0;
      box.setAttribute("role", "region");
      box.setAttribute("aria-label", table.caption?.textContent.trim() || "Table");
      table.before(box);
      box.append(table);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindTheme();
    bindMenus();
    bindHomeSections();
    bindNavBall();
    bindAnchors();
    bindContents();
    bindDisclosures();
    bindPhoneScreens();
    wrapTables();
  });
})();
