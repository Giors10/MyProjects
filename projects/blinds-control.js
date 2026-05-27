/* ============================================================
   blinds-control.js · v2 — PREMIUM INTERACTIVE EDITION
   Touch FSM tabs · accordion · diagram draw-ins · reveal
   Stepper dashboard · EEPROM Dual-Slot Atomic Simulator
   ============================================================ */
(function () {
  // Synchronously check local storage and apply selectability class early
  const isSelectionEnabled = localStorage.getItem("gs-text-selection") === "true";
  document.documentElement.classList.toggle("selection-enabled", isSelectionEnabled);

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* ---------- Touch FSM tabs (with sliding indicator) ---------- */
  function placeIndicator(rail) {
    const ind = rail.querySelector("[data-touch-indicator]");
    const active = rail.querySelector(".touch-tab.active");
    if (!ind || !active) return;
    const isHorizontal = window.matchMedia("(max-width: 1100px)").matches;
    if (isHorizontal) {
      ind.style.transform = `translateX(${active.offsetLeft}px)`;
      ind.style.width = active.offsetWidth + "px";
      ind.style.height = "3px";
    } else {
      ind.style.transform = `translateY(${active.offsetTop}px)`;
      ind.style.height = active.offsetHeight + "px";
      ind.style.width = "3px";
    }
  }

  function bindTouchTabs() {
    const rail = $(".touch-rail");
    if (!rail) return;
    placeIndicator(rail);
    window.addEventListener("resize", () => placeIndicator(rail), { passive: true });
  }

  /* ---------- Tab click handler & Bi-directional SVG Sync ---------- */
  document.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-touch-tab]");
    if (!tab) return;
    const k = tab.dataset.touchTab;
    
    // Toggle active state on tabs
    $$(".touch-tab").forEach(b => b.classList.toggle("active", b === tab));
    // Toggle active state on panes
    $$(".touch-pane").forEach(p => p.classList.toggle("active", p.dataset.touchPane === k));
    
    // Sync with SVG state diagram nodes
    $$(".sd-node[data-touch-state]").forEach(node => {
      node.classList.toggle("active", node.dataset.touchState === k);
    });

    placeIndicator($(".touch-rail"));
  });

  /* ---------- Diagram node click handler ---------- */
  document.addEventListener("click", (e) => {
    const node = e.target.closest("[data-touch-state]");
    if (!node) return;
    const k = node.dataset.touchState;
    const tab = $(`[data-touch-tab="${k}"]`);
    if (tab) {
      tab.click();
      const target = $("#touchTabs");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  });

  /* ---------- Automations tabs (with sliding indicator) ---------- */
  function placeAutoIndicator(rail) {
    const ind = rail.querySelector("[data-auto-indicator]");
    const active = rail.querySelector(".auto-tab.active");
    if (!ind || !active) return;
    const isHorizontal = window.matchMedia("(max-width: 900px)").matches;
    if (isHorizontal) {
      ind.style.transform = `translateX(${active.offsetLeft}px)`;
      ind.style.width = active.offsetWidth + "px";
      ind.style.height = "3px";
    } else {
      ind.style.transform = `translateY(${active.offsetTop}px)`;
      ind.style.height = active.offsetHeight + "px";
      ind.style.width = "";
    }
  }

  document.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-auto-tab]");
    if (!tab) return;
    const k = tab.dataset.autoTab;
    $$(".auto-tab").forEach(b => b.classList.toggle("active", b === tab));
    
    // Set parent data-active-pane for color shifting glows
    const container = tab.closest(".auto-tabs");
    if (container) container.setAttribute("data-active-pane", k);

    // Re-trigger pane animation by toggling active class
    $$(".auto-pane").forEach(p => {
      p.classList.remove("active");
      p.style.animation = "none";
    });
    const target = document.querySelector(`.auto-pane[data-auto-pane="${k}"]`);
    if (target) {
      // Force reflow to restart animation
      void target.offsetHeight;
      target.style.animation = "";
      target.classList.add("active");
    }
    placeAutoIndicator($(".auto-rail"));
  });

  /* ---------- Accordion ---------- */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-acc]");
    if (!btn) return;
    const body = btn.nextElementSibling;
    if (!body || !body.classList.contains("acc-body")) return;
    const isOpen = body.classList.contains("open");
    const parent = btn.parentElement;
    parent.querySelectorAll(".acc-row.open, .acc-body.open").forEach(el => el.classList.remove("open"));
    if (!isOpen) { 
      body.classList.add("open"); 
      btn.classList.add("open"); 
    }
  });

  /* ---------- Stepper Motor Controls Dashboard ---------- */
  let motorDir = 1; // 1 = normal, -1 = reverse
  let motorHalted = false;
  let motorMode = "stealth"; // "stealth" or "spread"

  const btnReverse = $("#btnReverse");
  const btnHalt = $("#btnHalt");
  const btnStealth = $("#btnStealth");
  const btnSpread = $("#btnSpread");
  const modeText = $("#stepperModeText");

  if (btnReverse) {
    btnReverse.addEventListener("click", () => {
      motorDir *= -1;
      document.documentElement.style.setProperty("--motor-direction", motorDir === 1 ? "normal" : "reverse");
      btnReverse.classList.toggle("active", motorDir === -1);
    });
  }

  if (btnHalt) {
    btnHalt.addEventListener("click", () => {
      motorHalted = !motorHalted;
      document.documentElement.style.setProperty("--motor-play-state", motorHalted ? "paused" : "running");
      btnHalt.classList.toggle("active", motorHalted);
    });
  }

  if (btnStealth) {
    btnStealth.addEventListener("click", () => {
      if (motorMode !== "stealth") {
        motorMode = "stealth";
        btnStealth.classList.add("active");
        if (btnSpread) btnSpread.classList.remove("active");
        document.documentElement.style.setProperty("--motor-speed", "6s");
        document.documentElement.style.setProperty("--chain-speed", "0.75s");
        if (modeText) modeText.textContent = "Silent";
      }
    });
  }

  if (btnSpread) {
    btnSpread.addEventListener("click", () => {
      if (motorMode !== "spread") {
        motorMode = "spread";
        btnSpread.classList.add("active");
        if (btnStealth) btnStealth.classList.remove("active");
        document.documentElement.style.setProperty("--motor-speed", "2s");
        document.documentElement.style.setProperty("--chain-speed", "0.25s");
        if (modeText) modeText.textContent = "Torque";
      }
    });
  }

  /* ---------- EEPROM Dual-Slot Atomic Simulator ---------- */
  let simState = "ready"; // "ready", "writing", "interrupted", "healing"
  let commitTimeouts = [];

  const btnSimulateCommit = $("#btnSimulateCommit");
  const btnSimulatePowerCut = $("#btnSimulatePowerCut");
  const btnResetCommit = $("#btnResetCommit");
  
  const eepromLed = $("#eepromLed");
  const eepromLedLabel = $("#eepromLedLabel");
  const slotA = $("#slotA");
  const slotAMeta = $("#slotAMeta");
  const slotBMeta = $("#slotBMeta");
  const writeFlag = $("#writeFlag");
  const writeFlagMeta = $("#writeFlagMeta");
  const eepromBar = $("#eepromBar");
  const consoleBody = $("#eepromConsoleBody");

  function logToConsole(text, type = "info") {
    if (!consoleBody) return;
    const row = document.createElement("div");
    row.className = `log-row ${type}`;
    row.textContent = `> ${text}`;
    consoleBody.appendChild(row);
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }

  function clearAllCommitTimeouts() {
    commitTimeouts.forEach(t => clearTimeout(t));
    commitTimeouts = [];
  }

  if (btnSimulateCommit) {
    btnSimulateCommit.addEventListener("click", () => {
      if (simState !== "ready") return;
      simState = "writing";

      // Reset prior states
      if (slotA) slotA.classList.remove("corrupt-slot");
      if (writeFlag) writeFlag.classList.remove("active-flag");
      
      // Update UI buttons
      btnSimulateCommit.disabled = true;
      if (btnResetCommit) btnResetCommit.disabled = true;
      if (btnSimulatePowerCut) btnSimulatePowerCut.disabled = false;

      // Update LED & Bar
      if (eepromLed) {
        eepromLed.className = "ef-led writing";
      }
      if (eepromLedLabel) eepromLedLabel.textContent = "WRITING";
      if (eepromBar) eepromBar.classList.add("writing-flow");

      clearAllCommitTimeouts();

      // Step 1: Initializing
      logToConsole("Initializing commit transaction...", "info");

      // Step 2: Set Write Flag (400ms)
      commitTimeouts.push(setTimeout(() => {
        logToConsole("Setting WRITE FLAG to 0xDEADBEEF...", "warning");
        if (writeFlagMeta) writeFlagMeta.textContent = "0xDEADBEEF";
        if (writeFlag) writeFlag.classList.add("active-flag");
      }, 400));

      // Step 3: Erasing Slot A (800ms)
      commitTimeouts.push(setTimeout(() => {
        logToConsole("Erasing Slot A sector...", "info");
        if (slotAMeta) slotAMeta.textContent = "MAGIC: 0x0000 | PAYLOAD: ERASED | CRC32: 0x00000000";
      }, 800));

      // Step 4: Writing Slot A (1200ms)
      commitTimeouts.push(setTimeout(() => {
        logToConsole("Writing payload V1.3.0 to Slot A...", "info");
        if (slotAMeta) slotAMeta.textContent = "MAGIC: 0x5A5A | PAYLOAD: V1.3.0 | CRC32: 0x9B2A8C1F";
      }, 1200));

      // Step 5: Mirroring to Slot B (1600ms)
      commitTimeouts.push(setTimeout(() => {
        logToConsole("Mirroring commit to Slot B backup...", "info");
        if (slotBMeta) slotBMeta.textContent = "MAGIC: 0x5A5A | PAYLOAD: V1.3.0 | CRC32: 0x9B2A8C1F";
      }, 1600));

      // Step 6: Success Completion (2000ms)
      commitTimeouts.push(setTimeout(() => {
        logToConsole("Transaction successful! Clearing WRITE FLAG...", "success");
        if (writeFlagMeta) writeFlagMeta.textContent = "0x00000000";
        if (writeFlag) writeFlag.classList.remove("active-flag");
        logToConsole("Commit complete. System in STANDBY.", "success");

        // Restore LED
        if (eepromLed) {
          eepromLed.className = "ef-led ready";
        }
        if (eepromLedLabel) eepromLedLabel.textContent = "READY";
        if (eepromBar) eepromBar.classList.remove("writing-flow");

        btnSimulateCommit.disabled = false;
        if (btnResetCommit) btnResetCommit.disabled = false;
        if (btnSimulatePowerCut) btnSimulatePowerCut.disabled = true;
        simState = "ready";
      }, 2000));
    });
  }

  if (btnSimulatePowerCut) {
    btnSimulatePowerCut.addEventListener("click", () => {
      if (simState !== "writing") return;
      simState = "interrupted";

      clearAllCommitTimeouts();

      // Stop flow and disable power cut
      btnSimulatePowerCut.disabled = true;
      if (eepromBar) eepromBar.classList.remove("writing-flow");

      // Corrupt Slot A & LED
      if (eepromLed) {
        eepromLed.className = "ef-led corrupt";
      }
      if (eepromLedLabel) eepromLedLabel.textContent = "CORRUPT";
      if (slotA) slotA.classList.add("corrupt-slot");
      if (slotAMeta) slotAMeta.textContent = "MAGIC: 0xFFFF | PAYLOAD: CORRUPT_ERR | CRC32: 0x00000000";

      logToConsole("*** CRITICAL ERROR: POWER BROWNOUT DETECTED mid-write! ***", "danger");
      logToConsole("Power interrupted before write completion. Write flag remains 0xDEADBEEF.", "danger");
      logToConsole("System forced reboot. Initializing self-healing boot recovery...", "warning");

      // Set timeout for reboot & heal (1800ms)
      setTimeout(() => {
        if (eepromLed) {
          eepromLed.className = "ef-led recovering";
        }
        if (eepromLedLabel) eepromLedLabel.textContent = "RECOVERING";

        logToConsole("Boot cycle detected unclean shutdown. Checking WRITE FLAG...", "info");
        
        setTimeout(() => {
          logToConsole("WRITE FLAG equals 0xDEADBEEF. Verifying Slot A CRC32...", "warning");
          
          setTimeout(() => {
            logToConsole("Slot A CRC32 failed verification (expected 0x9B2A8C1F, got 0x00000000)!", "danger");
            logToConsole("Slot A is CORRUPTED. Rolling back to Slot B backup configuration...", "warning");

            setTimeout(() => {
              // Rollback
              if (slotAMeta) slotAMeta.textContent = "MAGIC: 0x5A5A | PAYLOAD: V1.2.0 | CRC32: 0x7E3A9C12";
              if (slotA) slotA.classList.remove("corrupt-slot");
              if (writeFlagMeta) writeFlagMeta.textContent = "0x00000000";
              if (writeFlag) writeFlag.classList.remove("active-flag");

              logToConsole("Slot A restored from Slot B baseline successfully.", "success");
              logToConsole("Storage engine self-healed. Boot complete in STANDBY.", "success");

              // Restore LED
              if (eepromLed) {
                eepromLed.className = "ef-led ready";
              }
              if (eepromLedLabel) eepromLedLabel.textContent = "READY";

              btnSimulateCommit.disabled = false;
              if (btnResetCommit) btnResetCommit.disabled = false;
              simState = "ready";
            }, 1200);
          }, 800);
        }, 800);
      }, 1800);
    });
  }

  if (btnResetCommit) {
    btnResetCommit.addEventListener("click", () => {
      clearAllCommitTimeouts();
      simState = "ready";

      // Reset slot content
      if (slotAMeta) slotAMeta.textContent = "MAGIC: 0x5A5A | PAYLOAD: V1.2.0 | CRC32: 0x7E3A9C12";
      if (slotBMeta) slotBMeta.textContent = "MAGIC: 0x5A5A | PAYLOAD: V1.2.0 | CRC32: 0x7E3A9C12";
      if (writeFlagMeta) writeFlagMeta.textContent = "0x00000000";

      // Reset classes
      if (slotA) slotA.classList.remove("corrupt-slot");
      if (writeFlag) writeFlag.classList.remove("active-flag");
      if (eepromBar) eepromBar.classList.remove("writing-flow");

      // Reset LED
      if (eepromLed) {
        eepromLed.className = "ef-led ready";
      }
      if (eepromLedLabel) eepromLedLabel.textContent = "READY";

      // Reset buttons
      btnSimulateCommit.disabled = false;
      btnSimulatePowerCut.disabled = true;

      // Clear console and print header
      if (consoleBody) {
        consoleBody.innerHTML = `
          <div class="log-row info">&gt; System initialized. Storage engine in STANDBY.</div>
          <div class="log-row info">&gt; Slot A: VALID (CRC OK) | Slot B: VALID (CRC OK)</div>
        `;
      }
    });
  }

  /* ---------- Reveal observer ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const t = en.target;
      t.classList.add("in");
      io.unobserve(t);
    });
  }, { threshold: 0, rootMargin: "0px 0px -5% 0px" });

  document.addEventListener("DOMContentLoaded", () => {
    bindTouchTabs();

    // Initialize automations tab indicator
    const autoRail = $(".auto-rail");
    if (autoRail) {
      placeAutoIndicator(autoRail);
      window.addEventListener("resize", () => placeAutoIndicator(autoRail), { passive: true });
    }

    // Set parent data-active-pane on load
    const activeAutoTab = $(".auto-tab.active");
    if (activeAutoTab) {
      const k = activeAutoTab.dataset.autoTab;
      const container = activeAutoTab.closest(".auto-tabs");
      if (container) container.setAttribute("data-active-pane", k);
    }

    // Default highlight FSM SVG node on load based on active tab
    const activeTab = $(".touch-tab.active");
    if (activeTab) {
      const k = activeTab.dataset.touchTab;
      $$(".sd-node[data-touch-state]").forEach(node => {
        node.classList.toggle("active", node.dataset.touchState === k);
      });
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

    $$(".block, .bc-hero, .layout-figure, .eeprom-figure")
      .forEach(el => {
        const r = el.getBoundingClientRect();
        const inView = r.top < window.innerHeight && r.bottom > 0;
        if (!inView) {
          el.classList.add("pre-reveal");
          io.observe(el);
        } else {
          el.classList.add("in");
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

    // Diagram SVG path draw-in animation
    const diagIo = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add("draw-in");
          diagIo.unobserve(en.target);
        }
      });
    }, { threshold: 0.15 });
    $$(".arch-diagram, .state-diagram").forEach(d => diagIo.observe(d));

    // Recalibrate indicators on window load to ensure custom web fonts are fully loaded and rendered
    window.addEventListener("load", () => {
      const autoRail = $(".auto-rail");
      if (autoRail) placeAutoIndicator(autoRail);
      const touchRail = $(".touch-rail");
      if (touchRail) placeIndicator(touchRail);
    });
  });
})();
