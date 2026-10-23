/* Everything that moves on giorgi.uk. No libraries, it all starts at the bottom of the file. */
(() => {
  const root = document.documentElement;
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const EASE = "cubic-bezier(.2, .7, .2, 1)";

  // ---------- theme ----------

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
    document.dispatchEvent(new Event("themechange"));
  }

  function bindTheme() {
    setTheme(root.dataset.theme);
    $$(".theme-toggle").forEach(button => button.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      if (!document.startViewTransition || calm.matches) return setTheme(next, true);
      // the new theme grows out of the button in a circle (see themeIn in site.css)
      const r = button.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      root.style.setProperty("--tx", x + "px");
      root.style.setProperty("--ty", y + "px");
      root.style.setProperty("--tr", Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + "px");
      root.classList.add("theme-anim");
      document.startViewTransition(() => setTheme(next, true)).finished
        .finally(() => root.classList.remove("theme-anim"));
    }));
    // follow the system setting until someone picks one themselves
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    system.addEventListener?.("change", event => {
      let saved = null;
      try { saved = localStorage.getItem("gs-theme"); } catch (_) {}
      if (!saved) setTheme(event.matches ? "dark" : "light");
    });
  }

  // ---------- menus ----------

  function bindMenus() {
    const nav = document.querySelector(".nav");
    const toggle = document.querySelector(".nav-toggle");
    const links = document.querySelector("#primary-links");
    const work = document.querySelector(".nav-work");
    const workToggle = document.querySelector(".work-toggle");
    const phone = window.matchMedia("(max-width: 820px)");
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
      if (links) links.inert = phone.matches && !open;
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
        if (!phone.matches && !work.contains(event.relatedTarget)) setWork(false);
      });
    }
    toggle?.addEventListener("click", () => setMenu(!nav.classList.contains("menu-open")));
    $$(".nav-links a", nav).forEach(link => link.addEventListener("click", () => setMenu(false)));
    document.addEventListener("click", event => {
      if (!nav.contains(event.target)) setMenu(false);
      else if (work && !work.contains(event.target) && !phone.matches) setWork(false);
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (work?.classList.contains("work-open")) setWork(false, true);
      else if (nav.classList.contains("menu-open")) setMenu(false, true);
    });
    phone.addEventListener?.("change", () => setMenu(false));
    setMenu(false);
  }

  // Frosted nav once you've scrolled, and the reading bar on project pages.
  function bindNavState() {
    const nav = document.querySelector(".nav");
    if (!nav) return;
    const article = document.querySelector(".p-main");
    let bar = null;
    if (article) {
      bar = document.createElement("span");
      bar.className = "nav-progress";
      bar.setAttribute("aria-hidden", "true");
      nav.append(bar);
    }
    let queued = false;
    const update = () => {
      queued = false;
      nav.classList.toggle("is-stuck", window.scrollY > 8);
      if (!bar) return;
      const r = article.getBoundingClientRect();
      const top = nav.offsetHeight;
      bar.style.setProperty("--read", clamp((top - r.top) / Math.max(1, r.height - innerHeight + top)).toFixed(4));
    };
    const later = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", later, { passive: true });
    window.addEventListener("resize", later, { passive: true });
    update();
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
    const sections = ["about", "work", "track", "contact"].map(id => document.getElementById(id)).filter(Boolean);
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

  // The little blue ball under the nav. It sits on the nav's bottom line and
  // bounces from link to link as you scroll the home page, squashing when it
  // lands and stretching in the air. It also runs away from the mouse.
  // Desktop only.
  function bindNavBall() {
    const nav = document.querySelector(".nav");
    const inner = nav && nav.querySelector(".nav-inner");
    if (!inner || calm.matches || !window.requestAnimationFrame) return;
    const ids = ["about", "work", "track", "contact"];
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
    const LIFT = 3;     // how far the resting ball sits above the bottom line
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

    const smooth = t => t * t * (3 - 2 * t);

    // Where the ball should be as one number: -1 hidden (top of the page),
    // 0 About, 1 Projects, 2 Experience, 3 Contact. Uses the same reading line
    // as the nav highlight so they agree once the page stops. On a project
    // page it just sits under Projects.
    const scrubbed = () => {
      if (!isHome) return ids.indexOf("work");
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
    // height while travelling between two links: longer trips get more, smaller hops
    const hopAt = p => {
      if (p <= 0) return 0;
      const i = Math.min(Math.floor(p), centers.length - 2);
      const f = clamp(p - i);
      const hops = Math.max(1, Math.round(Math.abs(centers[i + 1] - centers[i]) / 85));
      const k = Math.min(hops - 1, Math.floor(f * hops));
      return (16 - k * 4) * Math.abs(Math.sin(Math.PI * hops * f));
    };
    // a bounce that dies away, for the drop-in, the idle hop and the startle
    const bounce = (t, height, count, fromTop) => {
      if (t >= 1 || t < 0) return 0;
      return height * Math.pow(1 - t, 1.7) * Math.abs(Math.sin(Math.PI * (t * count + (fromTop ? 0.5 : 0))));
    };

    let p = scrubbed(), v = 0;
    let lastScroll = 0, raf = 0, lastT = 0, lastX = null, lastY = 0;
    let idleTimer = 0, settleTimer = 0;
    let pointer = null, dodge = 0, dodgeV = 0, lastStartle = 0;
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

      // follow the page while it scrolls, then finish the hop to the nearest
      // link once it stops instead of hanging in mid air
      let target = scrubbed();
      if (now - lastScroll > 240) target = Math.round(target);
      v += (150 * (target - p) - 16 * v) * dt;
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

      // stay out of the cursor's way
      const restX = xAt(p);
      let dodgeTarget = 0;
      if (pointer && opacity > 0.5) {
        const by = ground - R - y;
        const dist = Math.hypot(pointer.x - (restX + dodge), (pointer.y - by) * 1.25);
        const reach = 74;
        if (dist < reach) {
          const side = Math.sign(restX + dodge - pointer.x) || (restX > width / 2 ? -1 : 1);
          dodgeTarget = side * Math.pow(1 - dist / reach, 1.2) * 58;
          if (dist < 46 && now - lastStartle > 700 && !effects.length) {
            effects.push({ start: now, duration: 520, height: 8, count: 1, fromTop: false });
            lastStartle = now;
          }
        }
        // don't let it get pushed out of the nav when it's cornered
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

      // squash when it touches down, stretch while it flies
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
      pointer = y > -20 && y < box.height + 70 ? { x, y } : null;
      wake();
    }, { passive: true });
    document.addEventListener("mouseleave", () => { pointer = null; wake(); });
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

  // ---------- the cube ----------
  //
  // The orientation is a quaternion [w, x, y, z] rather than three angles,
  // so it can tumble round any axis without locking up. Spinning works like a
  // flywheel with a bit of friction. Once it slows down, a spring pulls it
  // onto the nearest of the 24 ways a cube can sit that look exactly like the
  // logo, so it always comes to rest the right way up without spinning back.

  const qmul = (a, b) => [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
  ];
  const qturn = (x, y, z, angle) => {
    const n = Math.hypot(x, y, z) || 1, s = Math.sin(angle / 2);
    return [Math.cos(angle / 2), x / n * s, y / n * s, z / n * s];
  };
  const qunit = q => { const n = Math.hypot(...q); return q.map(v => v / n); };
  const qdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const qmatrix = ([w, x, y, z]) => [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]
  ];

  // the logo pose: turned 45° round, then tipped forward by atan(1/√2)
  const REST = qmul(qturn(1, 0, 0, -Math.atan(Math.SQRT1_2)), qturn(0, 1, 0, Math.PI / 4));

  // the 24 rotations that leave a cube looking the same
  const SAME = [];
  for (let i = 0; i < 4; i++) { const q = [0, 0, 0, 0]; q[i] = 1; SAME.push(q); }
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (const s of [1, -1]) {
    const q = [0, 0, 0, 0]; q[i] = Math.SQRT1_2; q[j] = s * Math.SQRT1_2; SAME.push(q);
  }
  for (let k = 0; k < 8; k++) SAME.push([0.5, k & 1 ? -0.5 : 0.5, k & 2 ? -0.5 : 0.5, k & 4 ? -0.5 : 0.5]);
  const POSES = SAME.map(s => qmul(REST, s));

  // face normals in the order of .f1 to .f6 in the HTML (y points down, like CSS)
  const NORMALS = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 1, 0]];
  const LIGHT = (() => { const l = [-0.45, -0.75, 0.5], n = Math.hypot(...l); return l.map(v => v / n); })();

  function makeCube(cube) {
    const faces = Array.from(cube.children);
    let q = REST.slice();
    let w = [0, 0, 0];          // spin, rad/s, about the screen's axes
    let goal = null;            // a pose to go to on purpose (a quarter turn)
    let raf = 0, last = 0, held = false;

    const nearest = () => {
      let best = POSES[0], score = -1;
      for (const pose of POSES) {
        const d = Math.abs(qdot(q, pose));
        if (d > score) { score = d; best = pose; }
      }
      return qdot(q, best) < 0 ? best.map(v => -v) : best;
    };
    // the turn still needed to get from where it is to `target`, as axis × angle
    const errorTo = target => {
      let e = qmul(target, [q[0], -q[1], -q[2], -q[3]]);
      if (e[0] < 0) e = e.map(v => -v);
      const half = Math.acos(clamp(e[0], -1, 1));
      const k = half > 1e-6 ? (2 * half) / Math.sin(half) : 2;
      return [e[1] * k, e[2] * k, e[3] * k];
    };

    const draw = () => {
      const m = qmatrix(q);
      cube.style.transform = `matrix3d(${m[0][0]},${m[1][0]},${m[2][0]},0,${m[0][1]},${m[1][1]},${m[2][1]},0,${m[0][2]},${m[1][2]},${m[2][2]},0,0,0,0,1)`;
      // each face is lit by how directly it faces the light (up, left and towards you)
      faces.forEach((face, i) => {
        const [x, y, z] = NORMALS[i];
        let d = 0;
        for (let r = 0; r < 3; r++) d += (m[r][0] * x + m[r][1] * y + m[r][2] * z) * LIGHT[r];
        face.style.setProperty("--lit", clamp(42 + 31 * d, 16, 76).toFixed(1) + "%");
      });
    };

    const step = now => {
      raf = 0;
      if (held) return;
      const dt = Math.min(0.032, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      const target = goal || nearest();
      const e = errorTo(target);
      const speed = Math.hypot(...w);
      // no pull at all while it's flying round, full pull once it's slow
      const pull = goal ? 1 : clamp((7 - speed) / 4);
      const friction = Math.exp(-1.1 * dt);
      for (let i = 0; i < 3; i++) w[i] = (w[i] + (70 * e[i] - 12 * w[i]) * pull * dt) * friction;
      const spin = Math.hypot(...w);
      if (spin > 1e-6) q = qunit(qmul(qturn(w[0], w[1], w[2], spin * dt), q));
      draw();
      if (spin < 0.03 && Math.hypot(...e) < 0.004) {
        q = target; w = [0, 0, 0]; goal = null; last = 0;
        draw();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    const wake = () => { if (!raf) { last = 0; raf = requestAnimationFrame(step); } };

    draw();
    return {
      // a quarter turn round its own up-down axis
      turn(n = 1) {
        goal = qmul(goal || nearest(), qturn(0, 1, 0, n * Math.PI / 2));
        wake();
      },
      // a proper spin, mostly round the vertical with a bit of wobble
      spin(speed) {
        goal = null;
        const going = Math.hypot(...w) > 2 ? Math.sign(w[1]) || 1 : (Math.random() < 0.5 ? -1 : 1);
        const axis = [Math.random() * 0.9 - 0.45, 1, Math.random() * 0.6 - 0.3];
        const n = Math.hypot(...axis);
        for (let i = 0; i < 3; i++) w[i] += axis[i] / n * speed * going;
        const s = Math.hypot(...w);
        if (s > 60) w = w.map(v => v * 60 / s);
        wake();
      },
      // dragging: rotate it directly, then let go with whatever speed it had
      hold() { held = true; goal = null; cancelAnimationFrame(raf); raf = 0; },
      drag(axis, angle, velocity) {
        q = qunit(qmul(qturn(axis[0], axis[1], axis[2], angle), q));
        w = velocity;
        draw();
      },
      release(still) {
        held = false;
        if (still) w = [0, 0, 0];
        wake();
      }
    };
  }

  function bindCubes() {
    const brand = document.querySelector(".brand");
    const brandCube = brand?.querySelector(".cube");
    if (brandCube) {
      const logo = makeCube(brandCube);
      let lastTurn = 0;
      brand.addEventListener("pointerenter", () => {
        if (calm.matches || performance.now() - lastTurn < 700) return;
        lastTurn = performance.now();
        logo.turn(1);
      });
    }

    $$(".cube-toy").forEach(button => {
      const cube = makeCube(button.querySelector(".cube"));
      let down = null, moved = false, ignoreClick = false, lastPress = 0, streak = 0;

      button.addEventListener("click", () => {
        if (ignoreClick) { ignoreClick = false; return; }
        if (calm.matches) return cube.turn(1);
        // keep pressing and it goes faster
        const now = performance.now();
        streak = now - lastPress < 900 ? streak + 1 : 0;
        lastPress = now;
        cube.spin(16 + streak * 7);
      });

      // flick it with a finger or the mouse
      button.addEventListener("pointerdown", event => {
        if (event.button !== 0 || calm.matches) return;
        down = { x: event.clientX, y: event.clientY, t: event.timeStamp };
        moved = false;
        button.setPointerCapture?.(event.pointerId);
      });
      button.addEventListener("pointermove", event => {
        if (!down) return;
        const dx = event.clientX - down.x, dy = event.clientY - down.y;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        if (!moved) { moved = true; cube.hold(); }
        const size = button.getBoundingClientRect().width;
        const perPixel = 2.2 / size;
        const dt = Math.max(0.008, (event.timeStamp - down.t) / 1000);
        const angle = Math.hypot(dx, dy) * perPixel;
        // dragging right turns it about +y, dragging down about -x
        const axis = [-dy, dx, 0];
        const speed = angle / dt;
        const n = Math.hypot(...axis) || 1;
        cube.drag(axis, angle, axis.map(v => v / n * Math.min(speed, 50)));
        down = { x: event.clientX, y: event.clientY, t: event.timeStamp };
      });
      const finish = event => {
        if (!down) return;
        const still = event.timeStamp - down.t > 90;
        down = null;
        if (moved) { ignoreClick = true; cube.release(still); }
      };
      button.addEventListener("pointerup", finish);
      button.addEventListener("pointercancel", finish);
    });
  }

  // ---------- scrolling ----------

  // Only a few things on the home page do anything as they come into view:
  // the headings (their underline draws in), the pictures and my photo.
  // Anything already on screen when the page loads is left alone.
  function bindReveals() {
    if (calm.matches || !("IntersectionObserver" in window)) return;
    const pick = ".section-head, .project-media, .card-media, .about-photo";
    const fold = window.innerHeight;
    const items = $$(pick).filter(el => el.getBoundingClientRect().top > fold - 40);
    if (!items.length) return;
    items.forEach(el => el.classList.add("will-reveal"));

    // Tidy up only once the slide has really finished. Taking the classes off
    // any earlier makes the element jump the rest of the way in one frame.
    const done = el => {
      if (!el.classList.contains("is-in")) return;
      el.classList.remove("will-reveal", "is-in");
      el.style.removeProperty("--delay");
    };
    const io = new IntersectionObserver(entries => {
      const coming = entries.filter(e => e.isIntersecting).map(e => e.target)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      coming.forEach((el, i) => {
        io.unobserve(el);
        const delay = Math.min(i * 0.08, 0.24);
        el.style.setProperty("--delay", delay + "s");
        el.classList.add("is-in");
        const finished = event => {
          if (event.target !== el || event.propertyName !== "transform") return;
          el.removeEventListener("transitionend", finished);
          done(el);
        };
        el.addEventListener("transitionend", finished);
        // backstop in case transitionend never comes (e.g. the tab was hidden)
        setTimeout(() => { el.removeEventListener("transitionend", finished); done(el); }, 3000);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach(el => io.observe(el));
  }

  // The first time you scroll to one of the diagrams, the boxes appear and
  // the wires draw themselves in. Just once, then it's a normal picture.
  function bindDiagrams() {
    if (calm.matches || !("IntersectionObserver" in window)) return;
    const dashed = ".diagram-line.wireless, .d-dim[stroke-dasharray]";
    const drawn = ".diagram-line:not(.wireless), path.d-bad, path.d-good, path.d-accent, path.d-pole, polyline.d-accent";

    // only the ones that start off screen and are actually showing
    const figures = $$(".diagram").filter(fig => {
      const svg = fig.querySelector("svg");
      return svg && svg.getClientRects().length && fig.getBoundingClientRect().top > innerHeight;
    });
    if (!figures.length) return;

    figures.forEach(fig => {
      const svg = fig.querySelector("svg");
      fig._lines = $$(drawn, svg).filter(el => !el.getAttribute("stroke-dasharray")).map(el => {
        const length = el.getTotalLength ? el.getTotalLength() : 0;
        el.style.strokeDasharray = `${length} ${length}`;
        el.style.strokeDashoffset = length;
        el.style.markerStart = "none";
        el.style.markerEnd = "none";
        return { el, length };
      });
      fig._fade = $$(".diagram-node, .diagram-label, .diagram-label-bg, " + dashed, svg);
      fig._fade.forEach(el => { el.style.opacity = "0"; });
    });

    const play = fig => {
      const nodes = fig._fade.filter(el => el.matches(".diagram-node"));
      const rest = fig._fade.filter(el => !el.matches(".diagram-node"));
      nodes.forEach((el, i) => {
        el.style.opacity = "";
        el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
          { duration: 450, delay: i * 40, easing: EASE, fill: "backwards" });
      });
      const start = 120 + nodes.length * 30;
      fig._lines.forEach(({ el, length }, i) => {
        el.style.strokeDashoffset = "0";
        const anim = el.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
          { duration: 600, delay: start + i * 60, easing: "cubic-bezier(.6, 0, .25, 1)", fill: "backwards" });
        anim.onfinish = () => {
          el.style.strokeDasharray = el.style.strokeDashoffset = "";
          el.style.markerStart = el.style.markerEnd = "";
        };
      });
      const after = start + fig._lines.length * 60 + 250;
      rest.forEach(el => {
        el.style.opacity = "";
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: after, fill: "backwards" });
      });
    };

    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      play(entry.target);
    }), { threshold: 0.3 });
    figures.forEach(fig => io.observe(fig));
  }

  // Same-page links scroll smoothly and move focus to where you land.
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
      requestAnimationFrame(() => target.scrollIntoView({ behavior: calm.matches ? "auto" : "smooth", block: "start" }));
    }));
  }

  // "On this page": open on wide screens, folds away on phones, and a blue
  // marker slides down it to the section you're reading.
  function bindContents() {
    const toc = document.querySelector(".toc details");
    if (!toc) return;
    const wide = window.matchMedia("(min-width: 901px)");
    const sync = () => { toc.open = wide.matches; };
    sync();
    wide.addEventListener?.("change", sync);
    $$("a", toc).forEach(link => link.addEventListener("click", () => { if (!wide.matches) toc.open = false; }));

    const list = toc.querySelector("ol");
    const links = $$('a[href^="#"]', toc);
    const targets = links.map(link => document.getElementById(link.getAttribute("href").slice(1))).filter(Boolean);
    if (!list || !targets.length || !("IntersectionObserver" in window)) return;
    const marker = document.createElement("span");
    marker.className = "toc-marker";
    marker.setAttribute("aria-hidden", "true");
    list.append(marker);
    let active = null;
    const place = () => {
      if (!active || !active.offsetHeight) return;
      marker.style.setProperty("--y", active.offsetTop + "px");
      marker.style.setProperty("--h", active.offsetHeight + "px");
      marker.classList.add("on");
    };
    toc.addEventListener("toggle", place);
    window.addEventListener("resize", place, { passive: true });

    const visible = new Set();
    const spy = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      const current = targets.find(target => visible.has(target));
      if (!current) return;
      links.forEach(link => {
        const on = link.getAttribute("href") === "#" + current.id;
        link.classList.toggle("active", on);
        if (on) active = link;
      });
      place();
    }, { rootMargin: "-15% 0px -70% 0px" });
    targets.forEach(target => spy.observe(target));
  }

  // Drop-downs (GCSE results, programmes, the light switch modes) slide open
  // and shut instead of snapping, and each one opens by itself the first time
  // you scroll down to it. Once someone closes one it's left alone.
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

    // the pieces inside a drop-down, so they can come in one after another
    const pieces = body => {
      const inner = body.children.length === 1 ? body.firstElementChild : body;
      const kids = Array.from(inner.children);
      return kids.length === 1 && kids[0].children.length > 1 ? Array.from(kids[0].children) : kids;
    };

    function animate(details, open) {
      const body = details.querySelector(":scope > .details-body");
      (details._anims || []).forEach(a => a.cancel());
      details._anims = [];
      if (calm.matches || !body.animate) {
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
          ], { duration: 520, delay: 70 + i * 60, easing: EASE, fill: "backwards" }));
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
    const queue = [];
    let flushing = false;
    const flush = () => {
      if (flushing) return;
      flushing = true;
      const next = () => {
        const item = queue.shift();
        if (!item) { flushing = false; return; }
        if (!item.open && !item.dataset.touched) animate(item, true);
        setTimeout(next, 140);
      };
      next();
    };
    const watcher = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        watcher.unobserve(entry.target);
        // only when it comes up from below, i.e. while scrolling down
        if (entry.boundingClientRect.top > 0) queue.push(entry.target);
      });
      queue.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      flush();
    }, { rootMargin: "0px 0px -22% 0px" });
    items.forEach(details => { if (!details.open) watcher.observe(details); });
  }

  // The Zaylo demo always runs at a real phone size (390 x 844) and gets scaled
  // to fit the frame, so the app's own layout never gets squashed.
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

  // Wide tables scroll sideways on phones instead of stretching the page.
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
    bindNavState();
    bindHomeSections();
    bindNavBall();
    bindCubes();
    bindAnchors();
    bindContents();
    bindDisclosures();
    bindPhoneScreens();
    wrapTables();
    bindReveals();
    bindDiagrams();
  });
})();
