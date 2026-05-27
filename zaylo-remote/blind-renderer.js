/**
 * Zaylo - Blind Rendering Engine
 * Handles SVG/DOM animation interpolation and physics constraints for blind types.
 * Requires BlindState, BLIND_TYPE_LABELS, SLAT_COUNT, VERTICAL_SLAT_COUNT, and _vizAnimFrameId to be defined in global scope.
 */

var _vizAnimFrameId = _vizAnimFrameId || null;

// ============================================
// Multi-Type Visualization Dispatcher
// ============================================
function generateVisualization() {
    const container = document.getElementById('blindsSlats');
    if (!container) return;
    container.innerHTML = '';
    container.className = 'blinds-inner'; // reset classes

    switch (BlindState.blindType) {
        case 'roller': generateRoller(container); break;
        case 'venetian': generateVenetian(container); break;
        case 'vertical': generateVertical(container); break;
        case 'zebra': generateZebra(container); break;
        default: generateRoller(container);
    }
    // Update type badge
    const badge = document.getElementById('typeBadge');
    if (badge) badge.textContent = BLIND_TYPE_LABELS[BlindState.blindType] || 'Blind';
}

function updateVisualization(position) {
    _applyVisualization(position);
    const frame = document.getElementById('blindsFrame');
    if (frame) frame.classList.toggle('open', position > 20);
}

/** Apply the visualization directly at a given position (no animation). */
function _applyVisualization(position) {
    switch (BlindState.blindType) {
        case 'roller': updateRoller(position); break;
        case 'venetian': updateVenetian(position); break;
        case 'vertical': updateVertical(position); break;
        case 'zebra': updateZebra(position); break;
    }
}

/**
 * Calculates the animation speed in percent-per-millisecond based on the
 * stepper motor's physical configuration. When config is available, the
 * animation moves at the exact same constant speed as the real blind.
 *
 * @param {number} diff - The signed difference (target − current) in percent.
 * @returns {number} Speed in %/ms (always positive).
 */
function _calculateAnimationSpeed(diff) {
    const FALLBACK_FULL_TRAVEL_MS = 2000; // 2.0s to perfectly sync with simulated telemetry

    if (!BlindState.config || BlindState.config.stepperTop === undefined || BlindState.config.stepperBottom === undefined) {
        return 100 / FALLBACK_FULL_TRAVEL_MS;
    }

    const range = Math.abs(BlindState.config.stepperTop - BlindState.config.stepperBottom);
    if (range === 0) return 100 / FALLBACK_FULL_TRAVEL_MS;

    // Pick the correct motor speed for the direction of travel
    const movingUp = diff > 0;
    const stepsPerSecond = movingUp
        ? BlindState.config.stepperOpenSpeed
        : BlindState.config.stepperCloseSpeed;

    if (!stepsPerSecond || stepsPerSecond <= 0) return 100 / FALLBACK_FULL_TRAVEL_MS;

    // Full travel time in milliseconds
    const fullTravelMs = (range / stepsPerSecond) * 1000;

    return 100 / fullTravelMs;
}

/**
 * Extrapolated Strict MQTT Animation Engine
 * 
 * Animates the visuals STRICTLY towards `BlindState.position` (the confirmed
 * physical state from the hardware). It NEVER animates toward `targetPosition`.
 * Because the hardware only publishes position every 1 second while moving,
 * this engine uses physical motor speed to smoothly interpolate visual frames
 * between those 1-second MQTT snapshots, ensuring perfect smoothness without
 * ever predicting unconfirmed future states.
 */
function animateVisualization() {
    if (_vizAnimFrameId) return; // tick loop already running

    let lastTime = performance.now();

    function tick(now) {
        if (BlindState.isDragging) {
            _vizAnimFrameId = null;
            return;
        }

        const dt = Math.min(now - lastTime, 50); // cap to 50 ms
        lastTime = now;

        // The only truth is the actual confirmed hardware position
        const target = BlindState.position !== undefined ? BlindState.position : 0;
        const diff = target - BlindState._visualPos;

        if (Math.abs(diff) < 0.1) {
            BlindState._visualPos = target;
            _applyVisualization(target);
            const frame = document.getElementById('blindsFrame');
            if (frame) frame.classList.toggle('open', target > 20);
            
            if (!BlindState.isMoving) {
                _vizAnimFrameId = null;
                return;
            }
        }

        // Calculate maximum physical speed the motor could be moving
        const maxSpeedPerMs = _calculateAnimationSpeed(diff);
        const maxStep = maxSpeedPerMs * dt;
        
        // Move _visualPos toward target, capped at the physical motor's speed
        if (maxStep >= Math.abs(diff)) {
            BlindState._visualPos = target;
        } else {
            BlindState._visualPos += Math.sign(diff) * maxStep;
        }

        _applyVisualization(BlindState._visualPos);

        const frame = document.getElementById('blindsFrame');
        if (frame) frame.classList.toggle('open', BlindState._visualPos > 20);

        _vizAnimFrameId = requestAnimationFrame(tick);
    }

    _vizAnimFrameId = requestAnimationFrame(tick);
}

// --- Roller Blind ---
function generateRoller(container) {
    container.innerHTML = `
        <div class="roller-tube">
            <div class="roller-tube-end-l"></div>
            <div class="roller-tube-end-r"></div>
        </div>
        <div class="roller-sheet" id="rollerSheet">
            <div class="roller-wrapper" style="position: absolute; inset: 0;">
                <div class="roller-fabric"></div>
                <div class="roller-texture"></div>
                <div class="roller-bottom-bar"></div>
            </div>
        </div>
    `;
}
function updateRoller(position) {
    const wrapper = document.querySelector('#rollerSheet .roller-wrapper');
    if (!wrapper) return;
    
    // position 0 = fully closed (translateY 0%)
    // position 100 = fully open (translateY -100%, fabric retracted to top)
    const openPercent = position;
    
    // Move the entire wrapper up together so the fabric and bottom bar stay aligned
    wrapper.style.transform = `translateY(-${openPercent}%)`;
}

// --- Venetian Blind ---
function generateVenetian(container) {
    container.innerHTML = '';
    container.className = 'blinds-inner venetian-mode';
    for (let i = 0; i < SLAT_COUNT; i++) {
        const slat = document.createElement('div');
        slat.className = 'blind-slat';
        slat.style.transitionDelay = `${i * 0.025}s`;
        container.appendChild(slat);
    }
}
function updateVenetian(position) {
    const slats = document.querySelectorAll('.blind-slat');
    
    // Phase 1 (Tilt): 0% to 30% position
    const tiltProgress = Math.min(1, position / 30);
    // Phase 2 (Retract): 30% to 100% position
    const retractProgress = Math.max(0, (position - 30) / 70);

    const rotateX = tiltProgress * 80;
    const scaleY = 1 - (tiltProgress * 0.82);
    // Keep them solid when stacking, only a minor opacity fade for realism
    const opacity = 1 - (tiltProgress * 0.1);
    const shadowBlur = 3 - (tiltProgress * 2);

    slats.forEach((slat, i) => {
        // Squeeze each slat upwards towards the top frame (y = 0)
        // Proportional stacking translation in percentage of its own height
        const translateY = -i * 0.85 * retractProgress * 100;
        
        slat.style.transform = `translateY(${translateY}%) rotateX(${rotateX}deg) scaleY(${scaleY})`;
        slat.style.opacity = opacity;
        slat.style.boxShadow = `0 1px ${Math.max(0, shadowBlur)}px rgba(0,0,0,${0.25 - tiltProgress * 0.2})`;
    });
}

// --- Vertical Blind ---
function generateVertical(container) {
    container.innerHTML = '';
    container.className = 'blinds-inner vertical-mode';
    // Add track rail
    const track = document.createElement('div');
    track.className = 'vertical-track';
    container.appendChild(track);
    for (let i = 0; i < VERTICAL_SLAT_COUNT; i++) {
        const slat = document.createElement('div');
        slat.className = 'vertical-slat';
        slat.style.transitionDelay = `${i * 0.035}s`;
        container.appendChild(slat);
    }
}
function updateVertical(position) {
    const slats = document.querySelectorAll('.vertical-slat');
    
    // Phase 1 (Tilt): 0% to 30% position
    const tiltProgress = Math.min(1, position / 30);
    // Phase 2 (Retract): 30% to 100% position
    const retractProgress = Math.max(0, (position - 30) / 70);

    const rotateY = tiltProgress * 88;
    const scaleX = 1 - (tiltProgress * 0.85);
    const opacity = 1 - (tiltProgress * 0.1);

    slats.forEach((slat, i) => {
        // Squeeze each slat leftwards towards the left edge
        // Proportional stacking translation in percentage of its own width
        const translateX = -i * 0.85 * retractProgress * 100;

        slat.style.transform = `translateX(${translateX}%) rotateY(${rotateY}deg) scaleX(${scaleX})`;
        slat.style.opacity = opacity;
    });
}

// --- Zebra / Day-Night Blind ---
function generateZebra(container) {
    container.innerHTML = '';
    container.className = 'blinds-inner zebra-mode';
    const bandCount = 14; // enough to fill the container
    for (let layer = 0; layer < 2; layer++) {
        const layerEl = document.createElement('div');
        layerEl.className = `zebra-layer zebra-layer-${layer}`;
        layerEl.id = `zebraLayer${layer}`;
        for (let i = 0; i < bandCount; i++) {
            const band = document.createElement('div');
            band.className = i % 2 === 0 ? 'zebra-band opaque' : 'zebra-band sheer';
            layerEl.appendChild(band);
        }
        container.appendChild(layerEl);
    }
}
function updateZebra(position) {
    const layer0 = document.getElementById('zebraLayer0');
    const layer1 = document.getElementById('zebraLayer1');
    if (!layer0 || !layer1) return;

    let shift = 0;
    let retractProgress = 0;

    // Phase 1 (Align): 0% to 15% position
    if (position <= 15) {
        shift = (position / 15) * 24;
        retractProgress = 0;
    } else {
        // Phase 2 (Retract): 15% to 100% position
        shift = 24;
        retractProgress = (position - 15) / 85;
    }

    // Both layers retract completely upwards to stack at the top frame
    layer0.style.transform = `translateY(${-retractProgress * 100}%)`;
    layer1.style.transform = `translateY(${-retractProgress * 100}%) translateY(${shift}px)`;
}
