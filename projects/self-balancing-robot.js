/* ============================================================
   SELF-BALANCING DESK ROBOT INTERACTIVE SIMULATOR CORE
   Engineering Physics Engine · LQR & PID Controls · Kalman Filter
   ============================================================ */

(function () {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  // --- AUDIO SYNTHESIZER (Web Audio API) ---
  let audioCtx = null;

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {}
  }

  function playClick() {
    initAudio();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  }

  function playSuccess() {
    initAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.05, now + idx * 0.08);
      gain.gain.setValueAtTime(0.05, now + idx * 0.08 + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);
      
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.2);
    });
  }

  // Continuous alarm sound variables
  let alarmOsc = null;
  let alarmGain = null;

  function startAlarmSiren() {
    initAudio();
    if (!audioCtx || alarmOsc) return;
    alarmOsc = audioCtx.createOscillator();
    alarmGain = audioCtx.createGain();
    alarmOsc.connect(alarmGain);
    alarmGain.connect(audioCtx.destination);

    alarmOsc.frequency.setValueAtTime(600, audioCtx.currentTime);
    alarmGain.gain.setValueAtTime(0.03, audioCtx.currentTime);

    // Dynamic pitch modulation (siren)
    const mod = audioCtx.createOscillator();
    const modGain = audioCtx.createGain();
    mod.frequency.setValueAtTime(2.5, audioCtx.currentTime); // 2.5Hz siren rate
    modGain.gain.setValueAtTime(200, audioCtx.currentTime); // swing 400Hz to 800Hz
    mod.connect(modGain);
    modGain.connect(alarmOsc.frequency);

    mod.start();
    alarmOsc.start();
  }

  function stopAlarmSiren() {
    if (alarmOsc) {
      try { alarmOsc.stop(); } catch (_) {}
      alarmOsc = null;
    }
  }

  // Motor hum variables
  let motorOsc = null;
  let motorGain = null;

  function setMotorHum(velocity) {
    initAudio();
    if (!audioCtx) return;
    const isMuted = !$("#btnAudioMute") || $("#btnAudioMute").classList.contains("active");
    
    if (isMuted || Math.abs(velocity) < 0.01) {
      if (motorOsc) {
        try { motorOsc.stop(); } catch (_) {}
        motorOsc = null;
      }
      return;
    }

    if (!motorOsc) {
      motorOsc = audioCtx.createOscillator();
      motorGain = audioCtx.createGain();
      motorOsc.type = "sawtooth";
      motorOsc.connect(motorGain);
      motorGain.connect(audioCtx.destination);
      motorOsc.start();
    }

    const freq = Math.min(220, Math.max(55, 55 + Math.abs(velocity) * 80));
    const volume = Math.min(0.02, Math.abs(velocity) * 0.012);

    motorOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.05);
    motorGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.05);
  }

  function stopMotorHum() {
    if (motorOsc) {
      try { motorOsc.stop(); } catch (_) {}
      motorOsc = null;
    }
  }

  // --- SIMULATOR CONFIGURATION ---
  // Physics States
  let x = 0.0;          // cart position (meters)
  let x_dot = 0.0;      // cart velocity (m/s)
  let theta = 0.0;      // tilt angle (radians)
  let theta_dot = 0.0;  // angular velocity (rad/s)
  let control_u = 0.0;  // control action (applied horizontal force)
  
  // Physical parameters
  const M = 0.55;       // chassis mass (kg)
  const m = 0.12;       // wheel mass (kg)
  const l = 0.085;      // COM half-length (m)
  const g = 9.81;       // gravity
  const dt = 0.016;     // sub-step size (~60Hz)

  // Simulation parameters
  let activeStrategy = "lqr"; // "lqr", "pid", "off"
  let noiseLevel = 0.15;       // raw noise scale
  let isKalmanActive = true;
  let dockState = "standby";   // "standby", "docking", "docked"
  let batteryCharge = 28;     // starting percentage when charging
  let isMuted = false;

  // Sensor noise and Kalman Filter
  let rawAngle = 0.0;
  let rawGyro = 0.0;
  let estimatedAngle = 0.0;
  let kalmanBias = 0.0;
  let P = [[0.1, 0.0], [0.0, 0.1]]; // covariance matrix
  const Q_angle_cov = 0.001;
  const Q_bias_cov = 0.003;
  const R_measure_cov = 0.03;

  // LQR Parameters
  let q_pos = 100.0;
  let q_ang = 450.0;
  let r_ctrl = 1.0;
  let K_lqr = [0.0, 0.0, 0.0, 0.0];

  // PID Parameters
  let pid_kp = 35.0;
  let pid_ki = 8.0;
  let pid_kd = 5.0;
  let pid_integral = 0.0;

  // Telemetry buffer
  const telemetryHistory = [];
  const maxHistoryPoints = 180;

  // Interactive mouse dragging
  let isDragging = false;
  let dragX = 0.0;
  let targetDragX = 0.0;

  // Canvas elements
  let simCanvas = null;
  let simCtx = null;
  let angleChartCanvas = null;
  let angleChartCtx = null;
  let voltChartCanvas = null;
  let voltChartCtx = null;

  // Update loop RAF reference
  let rafRef = null;

  // --- LQR SOLVER (Algebraic Approximation) ---
  function updateLQRGains() {
    // Calculates stabilizing state-feedback gains K based on Q and R weights
    const k1 = Math.sqrt(q_pos / r_ctrl);
    const k2 = 1.25 * Math.sqrt(k1);
    const k3 = -26.0 * Math.sqrt(q_ang / r_ctrl);
    const k4 = -3.2 * Math.sqrt(Math.abs(k3));
    K_lqr = [k1, k2, k3, k4];
  }

  // --- KALMAN FILTER CALCULATOR ---
  function kalmanStep(newAngle, newGyroRate) {
    // 1. Time Update (Predict)
    const rate = newGyroRate - kalmanBias;
    estimatedAngle += dt * rate;

    P[0][0] += dt * (dt * P[1][1] - P[0][1] - P[1][0] + Q_angle_cov);
    P[0][1] -= dt * P[1][1];
    P[1][0] -= dt * P[1][1];
    P[1][1] += Q_bias_cov * dt;

    // 2. Measurement Update (Correct)
    const y = newAngle - estimatedAngle; // innovation
    const S = P[0][0] + R_measure_cov;   // innovation covariance
    const K_gain = [P[0][0] / S, P[1][0] / S];

    estimatedAngle += K_gain[0] * y;
    kalmanBias += K_gain[1] * y;

    const P00_temp = P[0][0];
    const P01_temp = P[0][1];

    P[0][0] -= K_gain[0] * P00_temp;
    P[0][1] -= K_gain[0] * P01_temp;
    P[1][0] -= K_gain[1] * P00_temp;
    P[1][1] -= K_gain[1] * P01_temp;
  }

  // --- PHYSICS ENGINE STEP ---
  function physicsStep() {
    // Docking trajectory logic
    if (dockState === "docking") {
      const dockPosition = -1.8; // meter coordinate of the dock
      const dist = dockPosition - x;
      if (Math.abs(dist) < 0.05) {
        dockState = "docked";
        batteryCharge = 28;
        playSuccess();
        stopMotorHum();
      } else {
        // Virtual steering command
        const speedLimit = 0.5;
        const targetVel = Math.min(speedLimit, Math.max(-speedLimit, dist * 1.5));
        // Add a bias to the controller to steer it towards target position
        x_dot += (targetVel - x_dot) * 0.15;
      }
    }

    // Apply Drag Impulse Force
    if (isDragging) {
      // Drag coordinates mapped to physics coordinates
      const dragTargetPos = (dragX - simCanvas.width / 2) / 80;
      x += (dragTargetPos - x) * 0.25;
      x_dot = 0.0;
      theta += (0.28 * Math.sin(dragTargetPos - x) - theta) * 0.2;
      theta_dot = 0.0;
      control_u = 0.0;
      pid_integral = 0.0;
      return;
    }

    if (Math.abs(theta) > 0.8) {
      // Fallen over (exceeds 45°) -> trigger Alarm state
      control_u = 0.0;
      x_dot *= 0.85; // friction on side
      theta_dot += (g / l * Math.sin(theta) - 0.2 * theta_dot) * dt;
      theta += theta_dot * dt;
      // Cap angle
      if (theta > 1.4) { theta = 1.4; theta_dot = 0; }
      if (theta < -1.4) { theta = -1.4; theta_dot = 0; }
      
      if (dockState !== "standby") dockState = "standby";

      // Alarm triggers if unmuted
      if (!isMuted) {
        startAlarmSiren();
      } else {
        stopAlarmSiren();
      }
      stopMotorHum();
      return;
    }

    // Compute Control Output
    let inputSensorAngle = isKalmanActive ? estimatedAngle : rawAngle;
    if (activeStrategy === "lqr") {
      stopAlarmSiren();
      control_u = -(K_lqr[0] * x + K_lqr[1] * x_dot + K_lqr[2] * inputSensorAngle + K_lqr[3] * theta_dot);
    } else if (activeStrategy === "pid") {
      stopAlarmSiren();
      pid_integral += inputSensorAngle * dt;
      // Cap integral to prevent windup
      pid_integral = Math.min(1.5, Math.max(-1.5, pid_integral));
      // Base PID action
      let pid_action = pid_kp * inputSensorAngle + pid_ki * pid_integral + pid_kd * theta_dot;
      // Secondary minor position damping to keep it from drifting away
      pid_action += 0.25 * x + 0.45 * x_dot;
      control_u = pid_action;
    } else {
      control_u = 0.0;
    }

    // Actuator limit (Max motor voltage/force)
    const max_u = 24.0;
    control_u = Math.min(max_u, Math.max(-max_u, control_u));

    // Dynamic Equations of Inverted Pendulum on Cart
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    
    // Auxiliary variables
    const temp = (control_u + m * l * theta_dot * theta_dot * sinT) / (M + m);
    const theta_ddot = (g * sinT - cosT * temp) / (l * (4.0/3.0 - m * cosT * cosT / (M + m)));
    const x_ddot = temp - m * l * theta_ddot * cosT / (M + m);

    // Semi-Implicit Euler integration step
    x_dot += x_ddot * dt;
    x += x_dot * dt;
    theta_dot += theta_ddot * dt;
    theta += theta_dot * dt;

    // Apply soft friction on wheels/cart
    x_dot *= 0.995;

    // Add sensor noise updates
    const randWalk = (Math.random() - 0.5) * noiseLevel;
    const randGyro = (Math.random() - 0.5) * noiseLevel;
    rawAngle = theta + 0.1 * randWalk;
    rawGyro = theta_dot + 0.8 * randGyro;

    // Run Kalman step
    kalmanStep(rawAngle, rawGyro);

    // Set motor hum pitch based on speed
    setMotorHum(x_dot);
  }

  // --- RENDER VISUAL SIMULATION CANVAS ---
  function drawSimulation() {
    if (!simCtx) return;
    const ctx = simCtx;
    const w = simCanvas.width;
    const h = simCanvas.height;

    // Theme compliance check
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const isBlueprint = document.documentElement.classList.contains("blueprint");

    // Colors mapping
    let bgCol = "#ecead9";
    let gridCol = "#dad7bf";
    let groundCol = "#c9c6b1";
    let bodyCol = "#15140f";
    let bodyHighlight = "#8c8a7d";
    let signalCol = isDark ? "#ff6b3d" : "#d94924";
    let accentCol = isDark ? "#00e676" : "#10b981";

    if (isDark) {
      bgCol = "#15140f";
      gridCol = "#2a2823";
      groundCol = "#1c1b16";
      bodyCol = "#f4f1e4";
      bodyHighlight = "#a6a498";
    }

    if (isBlueprint) {
      bgCol = "#0a2540";
      gridCol = "rgba(255, 255, 255, 0.08)";
      groundCol = "#133057";
      bodyCol = "#ffd166";
      bodyHighlight = "#ffe6a3";
      accentCol = "#ffd166";
      signalCol = "#ffd166";
    }

    // 1. Draw grid background
    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = gridCol;
    ctx.lineWidth = 1;
    const gridSize = 20;
    for (let i = 0; i < w; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
    for (let j = 0; j < h; j += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(w, j);
      ctx.stroke();
    }

    // 2. Draw Tabletop Ground
    const groundY = h * 0.72;
    ctx.fillStyle = groundCol;
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.beginPath();
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = 2;
    ctx.moveTo(0, groundY);
    ctx.lineTo(w, groundY);
    ctx.stroke();

    // 3. Draw Charging Beacon Station (Left Side)
    const dockX = 50;
    const dockY = groundY - 30;
    ctx.fillStyle = groundCol;
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(dockX - 30, groundY);
    ctx.lineTo(dockX - 15, dockY);
    ctx.lineTo(dockX + 15, dockY);
    ctx.lineTo(dockX + 30, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Beacon LED Light
    ctx.beginPath();
    ctx.arc(dockX, dockY + 8, 4, 0, Math.PI * 2);
    if (dockState === "docked") {
      ctx.fillStyle = accentCol;
      ctx.shadowColor = accentCol;
      ctx.shadowBlur = 8;
    } else {
      ctx.fillStyle = signalCol;
      ctx.shadowColor = signalCol;
      ctx.shadowBlur = 4;
    }
    ctx.fill();
    ctx.shadowBlur = 0; // reset glow

    // 4. Draw Inverted Pendulum Robot
    // Map coordinate x (meters) to pixels
    const centerX = w / 2 + x * 80;
    const robotY = groundY;

    // Check bounds to ensure it stays on screen
    if (centerX < 0 || centerX > w) {
      // Collapse state reset
      x = 0;
      x_dot = 0;
      theta = 0.1;
      theta_dot = 0;
    }

    ctx.save();
    ctx.translate(centerX, robotY);
    ctx.rotate(theta);

    // Chassis center of mass translation
    const COM_offsetY = -75;

    // Draw wheels (radius 22px)
    const wheelRad = 22;
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = 3;
    ctx.fillStyle = bgCol;
    
    // Draw wheel shadow / tire
    ctx.beginPath();
    ctx.arc(0, 0, wheelRad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw wheel spokes rolling with position x
    const spokeAngle = (x * 80) / wheelRad;
    ctx.beginPath();
    ctx.lineWidth = 2;
    for (let angleIdx = 0; angleIdx < 4; angleIdx++) {
      const finalAngle = spokeAngle + (angleIdx * Math.PI / 2);
      ctx.moveTo(0, 0);
      ctx.lineTo(wheelRad * Math.cos(finalAngle), wheelRad * Math.sin(finalAngle));
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = bodyCol;
    ctx.fill();

    // Draw pendulum chassis rod
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, COM_offsetY);
    ctx.stroke();

    // Draw Chassis Capsule body
    const robotW = 42;
    const robotH = 70;
    ctx.fillStyle = isDark ? "rgba(21, 20, 15, 0.95)" : "rgba(246, 244, 237, 0.95)";
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.roundRect(-robotW/2, COM_offsetY - robotH/2, robotW, robotH, 14);
    ctx.fill();
    ctx.stroke();

    // Decorative inner border accent lines (blueprint aesthetic)
    ctx.strokeStyle = gridCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-robotW/2 + 3, COM_offsetY - robotH/2 + 3, robotW - 6, robotH - 6, 11);
    ctx.stroke();

    // Face / Expression indicators
    const faceY = COM_offsetY - 14;
    
    // Draw screen eye displays
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.roundRect(-14, faceY - 5, 28, 12, 4);
    ctx.fill();

    // Active screen pixels (eyes)
    let eyeCol = accentCol;
    if (Math.abs(theta) > 0.45) {
      eyeCol = signalCol; // scared / angry
    }
    ctx.fillStyle = eyeCol;

    if (Math.abs(theta) > 0.8) {
      // Dead eyes (xx)
      ctx.strokeStyle = eyeCol;
      ctx.lineWidth = 1.5;
      // Left eye X
      ctx.beginPath();
      ctx.moveTo(-10, faceY - 2); ctx.lineTo(-6, faceY + 2);
      ctx.moveTo(-6, faceY - 2); ctx.lineTo(-10, faceY + 2);
      // Right eye X
      ctx.moveTo(6, faceY - 2); ctx.lineTo(10, faceY + 2);
      ctx.moveTo(10, faceY - 2); ctx.lineTo(6, faceY + 2);
      ctx.stroke();
    } else {
      // Normal blinking / tracking eyes
      ctx.beginPath();
      // left pupil
      ctx.arc(-8, faceY + (theta_dot * 1.5), 2.5, 0, Math.PI * 2);
      // right pupil
      ctx.arc(8, faceY + (theta_dot * 1.5), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dynamic battery indicator inside chassis
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = bodyHighlight;
    ctx.beginPath();
    ctx.rect(-8, COM_offsetY + 16, 16, 8);
    ctx.stroke();
    
    // Battery level fill
    ctx.fillStyle = (dockState === "docked") ? accentCol : bodyHighlight;
    let bFill = 0.55; // 55% normal
    if (dockState === "docked") {
      bFill = batteryCharge / 100.0;
    }
    ctx.fillRect(-6, COM_offsetY + 18, 12 * bFill, 4);

    ctx.restore();

    // 5. Draw Interactive spring cord when dragging
    if (isDragging) {
      ctx.strokeStyle = signalCol;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(dragX, h * 0.42);
      // Approximate translation of COM in global space
      const chassisCOMX = w / 2 + x * 80 + COM_offsetY * Math.sin(theta);
      const chassisCOMY = groundY + COM_offsetY * Math.cos(theta);
      ctx.lineTo(chassisCOMX, chassisCOMY);
      ctx.stroke();
      ctx.setLineDash([]); // reset dash

      // Mouse attachment node glow
      ctx.beginPath();
      ctx.arc(dragX, h * 0.42, 5, 0, Math.PI * 2);
      ctx.fillStyle = signalCol;
      ctx.fill();
    }
  }

  // --- REAL-TIME GRAPH PLOTTER ---
  function updateTelemetryHistory() {
    telemetryHistory.push({
      time: Date.now(),
      theta: theta * (180 / Math.PI), // degrees
      estTheta: estimatedAngle * (180 / Math.PI),
      volt: control_u
    });
    if (telemetryHistory.length > maxHistoryPoints) {
      telemetryHistory.shift();
    }
  }

  function drawCharts() {
    // 1. Draw Angle Graph Canvas
    if (angleChartCtx) {
      const ctx = angleChartCtx;
      const w = angleChartCanvas.width;
      const h = angleChartCanvas.height;

      // Theme colors
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const isBlueprint = document.documentElement.classList.contains("blueprint");
      let lineColTrue = isDark ? "#ff6b3d" : "#d94924";
      let lineColEst = isDark ? "#00e676" : "#10b981";
      if (isBlueprint) {
        lineColTrue = "#ffd166";
        lineColEst = "#ffffff";
      }

      ctx.fillStyle = isDark ? "#1c1b16" : "#ecead9";
      ctx.fillRect(0, 0, w, h);

      // Midline reference
      ctx.strokeStyle = isDark ? "#2a2823" : "#dad7bf";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (telemetryHistory.length > 1) {
        // Draw True Angle
        ctx.strokeStyle = lineColTrue;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let idx = 0; idx < telemetryHistory.length; idx++) {
          const pt = telemetryHistory[idx];
          const plotX = (idx / maxHistoryPoints) * w;
          // scale angle to fit vertical canvas (-30 to +30 degrees)
          const plotY = h / 2 - (pt.theta / 30) * (h / 2);
          if (idx === 0) ctx.moveTo(plotX, plotY);
          else ctx.lineTo(plotX, plotY);
        }
        ctx.stroke();

        // Draw Estimated Angle (Kalman Filter)
        if (isKalmanActive) {
          ctx.strokeStyle = lineColEst;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          for (let idx = 0; idx < telemetryHistory.length; idx++) {
            const pt = telemetryHistory[idx];
            const plotX = (idx / maxHistoryPoints) * w;
            const plotY = h / 2 - (pt.estTheta / 30) * (h / 2);
            if (idx === 0) ctx.moveTo(plotX, plotY);
            else ctx.lineTo(plotX, plotY);
          }
          ctx.stroke();
        }
      }
    }

    // 2. Draw Voltage / Control Input Graph Canvas
    if (voltChartCtx) {
      const ctx = voltChartCtx;
      const w = voltChartCanvas.width;
      const h = voltChartCanvas.height;

      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const isBlueprint = document.documentElement.classList.contains("blueprint");
      let lineCol = isDark ? "#ff6b3d" : "#d94924";
      if (isBlueprint) lineCol = "#ffd166";

      ctx.fillStyle = isDark ? "#1c1b16" : "#ecead9";
      ctx.fillRect(0, 0, w, h);

      // Midline
      ctx.strokeStyle = isDark ? "#2a2823" : "#dad7bf";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (telemetryHistory.length > 1) {
        ctx.strokeStyle = lineCol;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let idx = 0; idx < telemetryHistory.length; idx++) {
          const pt = telemetryHistory[idx];
          const plotX = (idx / maxHistoryPoints) * w;
          // scale control voltage (-24 to +24 Volts)
          const plotY = h / 2 - (pt.volt / 24) * (h / 2);
          if (idx === 0) ctx.moveTo(plotX, plotY);
          else ctx.lineTo(plotX, plotY);
        }
        ctx.stroke();
      }
    }
  }

  // --- DYNAMIC TELEMETRY LABELS UPDATE ---
  function updateTelemetryLabels() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const isBlueprint = document.documentElement.classList.contains("blueprint");

    // Live state status text mapping
    const dotBalance = $("#dotBalance");
    const dotKalman = $("#dotKalman");
    const dotBattery = $("#dotBattery");
    const alertOverlay = $("#faultOverlay");
    
    // Numeric readouts
    const txtAngle = $("#txtAngle");
    const txtEstAngle = $("#txtEstAngle");
    const txtPosition = $("#txtPosition");
    const txtControl = $("#txtControl");

    const degAngle = theta * (180 / Math.PI);
    const degEstAngle = estimatedAngle * (180 / Math.PI);

    if (txtAngle) txtAngle.textContent = (degAngle >= 0 ? "+" : "") + degAngle.toFixed(2) + "°";
    if (txtEstAngle) txtEstAngle.textContent = (degEstAngle >= 0 ? "+" : "") + degEstAngle.toFixed(2) + "°";
    if (txtPosition) txtPosition.textContent = x.toFixed(2) + " m";
    if (txtControl) txtControl.textContent = control_u.toFixed(2) + " V";

    // 1. Balance state
    if (dotBalance) {
      dotBalance.className = "status-glow-dot";
      const lbl = $("#txtBalanceLabel");
      if (Math.abs(theta) > 0.8) {
        dotBalance.classList.add("glow-danger");
        if (lbl) lbl.textContent = "CRITICAL FAULT";
        if (alertOverlay) alertOverlay.classList.add("active");
      } else if (dockState === "docked") {
        dotBalance.classList.add("glow-active");
        if (lbl) lbl.textContent = "STANDBY (DOCKED)";
        if (alertOverlay) alertOverlay.classList.remove("active");
      } else if (dockState === "docking") {
        dotBalance.classList.add("glow-warning");
        if (lbl) lbl.textContent = "GUIDING TO DOCK";
        if (alertOverlay) alertOverlay.classList.remove("active");
      } else {
        dotBalance.classList.add("glow-active");
        if (lbl) lbl.textContent = "BALANCING ACTIVE";
        if (alertOverlay) alertOverlay.classList.remove("active");
      }
    }

    // 2. Kalman filter state
    if (dotKalman) {
      dotKalman.className = "status-glow-dot";
      const lbl = $("#txtKalmanLabel");
      if (isKalmanActive) {
        dotKalman.classList.add("glow-active");
        if (lbl) lbl.textContent = "FUSION ON";
      } else {
        dotKalman.classList.add("glow-warning");
        if (lbl) lbl.textContent = "RAW ACCEL / RAW GYRO";
      }
    }

    // 3. Charging battery status
    if (dotBattery) {
      dotBattery.className = "status-glow-dot";
      const lbl = $("#txtBatteryLabel");
      if (dockState === "docked") {
        dotBattery.classList.add("glow-active");
        if (lbl) lbl.textContent = "CHARGING (" + Math.round(batteryCharge) + "%)";
        
        // Slow trickle increase
        batteryCharge += 0.08;
        if (batteryCharge > 100) batteryCharge = 100;
      } else {
        if (lbl) lbl.textContent = "DISCHARGING (55%)";
      }
    }
  }

  // --- CORE TICK SIMULATOR ITERATOR ---
  function simTick() {
    physicsStep();
    updateTelemetryHistory();
    updateTelemetryLabels();
    drawSimulation();
    drawCharts();
    rafRef = requestAnimationFrame(simTick);
  }

  // --- BIND EVENT HANDLERS & LISTENERS ---
  function bindSimulatorUI() {
    // 1. Control Strategy buttons
    const stratButtons = $$("[data-strat]");
    stratButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        playClick();
        stratButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        activeStrategy = btn.dataset.strat;
        pid_integral = 0.0; // reset integration
        if (activeStrategy === "off") {
          stopMotorHum();
        }
      });
    });

    // 2. Sliders
    const sliderQPos = $("#sliderQPos");
    const labelQPos = $("#lblQPos");
    if (sliderQPos) {
      sliderQPos.addEventListener("input", (e) => {
        q_pos = parseFloat(e.target.value);
        if (labelQPos) labelQPos.textContent = q_pos.toFixed(0);
        updateLQRGains();
      });
    }

    const sliderQAng = $("#sliderQAng");
    const labelQAng = $("#lblQAng");
    if (sliderQAng) {
      sliderQAng.addEventListener("input", (e) => {
        q_ang = parseFloat(e.target.value);
        if (labelQAng) labelQAng.textContent = q_ang.toFixed(0);
        updateLQRGains();
      });
    }

    const sliderRCtrl = $("#sliderRCtrl");
    const labelRCtrl = $("#lblRCtrl");
    if (sliderRCtrl) {
      sliderRCtrl.addEventListener("input", (e) => {
        r_ctrl = parseFloat(e.target.value);
        if (labelRCtrl) labelRCtrl.textContent = r_ctrl.toFixed(1);
        updateLQRGains();
      });
    }

    const sliderNoise = $("#sliderNoise");
    const labelNoise = $("#lblNoise");
    if (sliderNoise) {
      sliderNoise.addEventListener("input", (e) => {
        noiseLevel = parseFloat(e.target.value);
        if (labelNoise) labelNoise.textContent = noiseLevel.toFixed(2);
      });
    }

    // 3. Actions / Switches
    const btnToggleKalman = $("#btnToggleKalman");
    if (btnToggleKalman) {
      btnToggleKalman.addEventListener("click", () => {
        playClick();
        isKalmanActive = !isKalmanActive;
        btnToggleKalman.classList.toggle("active", isKalmanActive);
      });
    }

    const btnSelfDock = $("#btnSelfDock");
    if (btnSelfDock) {
      btnSelfDock.addEventListener("click", () => {
        playClick();
        if (Math.abs(theta) > 0.8) return; // ignore if fallen
        if (dockState === "docked") {
          dockState = "standby";
          x = -1.5; // kick off dock slightly
          x_dot = 0.5;
        } else {
          dockState = "docking";
        }
      });
    }

    const btnResetBalance = $("#btnResetBalance");
    const btnResetBalanceOverlay = $("#btnResetBalanceOverlay");
    const handleReset = () => {
      playClick();
      theta = 0.05 * (Math.random() - 0.5); // small initial lean
      theta_dot = 0.0;
      x = 0.0;
      x_dot = 0.0;
      control_u = 0.0;
      pid_integral = 0.0;
      dockState = "standby";
      stopAlarmSiren();
    };
    if (btnResetBalance) btnResetBalance.addEventListener("click", handleReset);
    if (btnResetBalanceOverlay) btnResetBalanceOverlay.addEventListener("click", handleReset);

    // Audio Mute toggle
    const btnAudioMute = $("#btnAudioMute");
    if (btnAudioMute) {
      btnAudioMute.addEventListener("click", () => {
        isMuted = !isMuted;
        btnAudioMute.classList.toggle("active", isMuted);
        if (isMuted) {
          stopAlarmSiren();
          stopMotorHum();
        } else {
          playClick();
        }
      });
    }

    // 4. Interactive canvas dragging mouse listeners
    if (simCanvas) {
      const getMousePos = (e) => {
        const r = simCanvas.getBoundingClientRect();
        return {
          x: (e.clientX - r.left) * (simCanvas.width / r.width),
          y: (e.clientY - r.top) * (simCanvas.height / r.height)
        };
      };

      const startDrag = (clientX, clientY) => {
        initAudio();
        const coords = getMousePos({ clientX, clientY });
        const COM_chassisX = simCanvas.width / 2 + x * 80;
        const COM_chassisY = simCanvas.height * 0.72 - 75;

        // Click radius detection around Center of Mass (capsule)
        const dx = coords.x - COM_chassisX;
        const dy = coords.y - COM_chassisY;
        if (Math.sqrt(dx * dx + dy * dy) < 65) {
          isDragging = true;
          dragX = coords.x;
          dockState = "standby";
        }
      };

      const moveDrag = (clientX, clientY) => {
        if (!isDragging) return;
        const coords = getMousePos({ clientX, clientY });
        dragX = Math.min(simCanvas.width - 20, Math.max(20, coords.x));
      };

      const endDrag = () => {
        isDragging = false;
      };

      simCanvas.addEventListener("mousedown", (e) => startDrag(e.clientX, e.clientY));
      window.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY));
      window.addEventListener("mouseup", endDrag);

      // Touch screen support
      simCanvas.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      window.addEventListener("touchmove", (e) => {
        if (e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      window.addEventListener("touchend", endDrag);
    }
  }

  // --- INITIALIZE GRAPH & SIMULATOR CANVASES ---
  function resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;

    // Rescale Canvas pixels to match layout dimensions for high resolution
    const fixDpr = (cv, ctxObj) => {
      if (!cv) return null;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      const ctx = cv.getContext("2d");
      ctx.scale(dpr, dpr);
      return ctx;
    };

    simCtx = fixDpr(simCanvas);
    angleChartCtx = fixDpr(angleChartCanvas);
    voltChartCtx = fixDpr(voltChartCanvas);
  }

  // Boot initialization
  document.addEventListener("DOMContentLoaded", () => {
    // Check elements
    simCanvas = $("#simCanvas");
    angleChartCanvas = $("#angleChartCanvas");
    voltChartCanvas = $("#voltChartCanvas");

    if (simCanvas) {
      resizeCanvases();
      window.addEventListener("resize", () => {
        resizeCanvases();
        drawSimulation();
        drawCharts();
      });

      // Prepare gains and boot tick loop
      updateLQRGains();
      bindSimulatorUI();
      simTick();
    }
  });

  // Export properties if needed globally
  window.GS_RobotSimulator = {
    reset: () => {
      theta = 0.05; x = 0; x_dot = 0; theta_dot = 0; control_u = 0;
    }
  };
})();
