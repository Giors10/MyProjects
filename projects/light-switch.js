/* ============================================================
   light-switch.js · v5
   Tabs · accordion · sleep rings · diagram draw-ins
   ============================================================ */
(function () {
  // Synchronously check local storage and apply selectability class early to prevent flashes
  const isSelectionEnabled = localStorage.getItem("gs-text-selection") === "true";
  document.documentElement.classList.toggle("selection-enabled", isSelectionEnabled);

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));


  /* ---------- Edge telemetry highlight helper ---------- */
  function updateActiveEdges(mode) {
    const edgeMap = {
      auto: ["7", "9", "10", "11", "12", "13", "14", "15", "16", "17"],
      manual: ["9", "10"],
      alarm: ["11", "12"],
      bedtime: ["13", "14"],
      locked: ["15", "16"],
      daylight: ["18", "19"]
    };
    const activeEdges = edgeMap[mode] || [];
    $$(".sd-edge").forEach(edge => {
      edge.classList.toggle("active", activeEdges.includes(edge.dataset.d));
    });
    $$(".sd-edge-label").forEach(label => {
      label.classList.toggle("active", activeEdges.includes(label.dataset.d));
    });
  }

  document.addEventListener("click", (e) => {
    const node = e.target.closest("[data-sd-node]");
    if (!node) return;
    const k = node.dataset.sdNode;
    $$("[data-sd-node]").forEach(n => n.classList.toggle("active", n === node));
    updateActiveEdges(k);
  });

  /* ---------- Accordion (radar info) ---------- */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-acc]");
    if (!btn) return;
    const body = btn.nextElementSibling;
    if (!body || !body.classList.contains("acc-body")) return;
    const isOpen = body.classList.contains("open");
    const parent = btn.parentElement;
    parent.querySelectorAll(".acc-row.open, .acc-body.open").forEach(el => el.classList.remove("open"));
    if (!isOpen) { body.classList.add("open"); btn.classList.add("open"); }
  });

  /* ---------- Sleep rings draw + count-up on reveal ---------- */
  function animateRing(circle) {
    const r = parseFloat(circle.getAttribute("r"));
    const C = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, parseFloat(circle.dataset.pct || "0")));
    circle.style.strokeDasharray = C;
    circle.style.strokeDashoffset = C;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        circle.style.strokeDashoffset = C - (C * pct) / 100;
      });
    });
  }
  function animateCountUp(el) {
    const tgt = parseInt(el.dataset.countUp, 10);
    if (isNaN(tgt)) return;
    const dur = 1500;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(tgt * eased);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = tgt;
    }
    requestAnimationFrame(step);
  }

  /* ---------- Reveal observer ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const t = en.target;
      t.classList.add("in");
      if (t.matches(".sleep-wrap")) {
        t.querySelectorAll(".ring-fill[data-pct]").forEach(animateRing);
        t.querySelectorAll("[data-count-up]").forEach(animateCountUp);
      }
      io.unobserve(t);
    });
  }, { threshold: 0, rootMargin: "0px 0px -5% 0px" });

  document.addEventListener("DOMContentLoaded", () => {
    // Initialize active state diagram node highlight & edge flow animation
    const defaultNode = $("[data-sd-node='auto']");
    if (defaultNode) {
      defaultNode.classList.add("active");
      updateActiveEdges("auto");
    }

    // Initialize text selectability toggle checkbox inside Help Overlay
    const textSelectToggle = document.getElementById("textSelectToggle");
    if (textSelectToggle) {
      textSelectToggle.checked = isSelectionEnabled;
      textSelectToggle.addEventListener("change", (e) => {
        const active = e.target.checked;
        document.documentElement.classList.toggle("selection-enabled", active);
        localStorage.setItem("gs-text-selection", active);
      });
    }

    $$(".block, .ls-hero, .layout-figure, .sleep-wrap, .eeprom-figure")
      .forEach(el => {
        const r = el.getBoundingClientRect();
        const inView = r.top < window.innerHeight && r.bottom > 0;
        if (!inView) {
          el.classList.add("pre-reveal");
          io.observe(el);
        } else {
          el.classList.add("in");
          if (el.matches(".sleep-wrap")) {
            el.querySelectorAll(".ring-fill[data-pct]").forEach(animateRing);
            el.querySelectorAll("[data-count-up]").forEach(animateCountUp);
          }
        }
      });

    // Block-head divider draw
    const headIo = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.querySelector(".block-head")?.classList.add("in");
          headIo.unobserve(en.target);
        }
      });
    }, { threshold: 0.05 });
    $$(".block").forEach(b => headIo.observe(b));
  });
})();
