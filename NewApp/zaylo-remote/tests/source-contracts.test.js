'use strict';

/**
 * Cross-layer source contracts.
 *
 * The firmware (C++) and the PWA (JS) share protocol constants and endpoint
 * names that no compiler checks across the boundary. These tests parse both
 * sources and fail when one side drifts — they would have caught several of
 * the shipped bugs (missing service-worker precache entry, the 12-hour offline
 * replay window, the reconnect give-up cap).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readAppFile, readFirmwareFile, APP_ROOT, FIRMWARE_ROOT } = require('./helpers/stubs');

const firmwareAvailable = fs.existsSync(FIRMWARE_ROOT);
const CURRENT_FIRMWARE_ROOT = path.join(APP_ROOT, '..');

test('service worker precaches every core runtime script (M10)', () => {
    const sw = readAppFile('sw.js');
    const listMatch = sw.match(/ASSETS_TO_CACHE\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(listMatch, 'ASSETS_TO_CACHE must exist in sw.js');
    const assets = Array.from(listMatch[1].matchAll(/'(\.\/[^']+)'/g)).map(m => m[1]);

    for (const required of ['./blind-sync.js', './blind-schema.js', './mqtt.js', './blind-device.js', './state-store.js']) {
        assert.ok(assets.includes(required), `${required} missing from the service-worker precache`);
    }
    // every precached local file must actually exist (a typo here 404s the whole install)
    for (const asset of assets) {
        const p = path.join(APP_ROOT, asset.replace('./', ''));
        assert.ok(fs.existsSync(p), `precached asset does not exist on disk: ${asset}`);
    }
});

test('PWA cache and script versions are bumped for the production fix release', () => {
    const sw = readAppFile('sw.js');
    assert.ok(sw.includes("APP_VERSION = '449'"), 'service-worker cache key must be bumped for this release');

    // Every script CHANGED in this release must be re-versioned in every page
    // that loads it (browsers HTTP-cache each ?v= URL independently of the SW).
    // Unchanged scripts deliberately keep their old ?v= — do not assert on them.
    const expect = {
        'index.html': ['mqtt.js?v=447.0', 'blind-sync.js?v=449.0', 'blind-schema.js?v=446.0', 'device-service.js?v=446.0', 'index.js?v=448.0', 'automation-engine.js?v=444.0'],
        'groups.html': ['mqtt.js?v=447.0', 'blind-sync.js?v=449.0', 'blind-schema.js?v=446.0', 'device-service.js?v=446.0', 'groups.js?v=448.0'],
        'setup.html': ['mqtt.js?v=447.0', 'blind-schema.js?v=446.0', 'device-service.js?v=446.0', 'setup.js?v=449.0'],
        'blind-device.html': ['mqtt.js?v=447.0', 'blind-sync.js?v=449.0', 'blind-schema.js?v=446.0', 'device-service.js?v=446.0', 'blind-device.js?v=449.0', 'automation-engine.js?v=444.0'],
        'device.html': ['mqtt.js?v=447.0', 'device-service.js?v=446.0'],
        'diagnostics.html': ['mqtt.js?v=447.0', 'device-service.js?v=446.0']
    };
    for (const [file, refs] of Object.entries(expect)) {
        const html = readAppFile(file);
        for (const ref of refs) {
            assert.ok(html.includes(ref), `${file} must reference ${ref} (changed in this release)`);
        }
    }
});

test('main control pages load the bundled MQTT runtime, not a CDN-only copy', () => {
    for (const file of ['index.html', 'groups.html', 'diagnostics.html', 'device.html', 'blind-device.html', 'setup.html']) {
        const html = readAppFile(file);
        assert.ok(html.includes('paho-mqtt.min.js'), `${file} must load the bundled Paho runtime`);
        assert.ok(!/cdnjs\.cloudflare\.com\/ajax\/libs\/paho-mqtt/.test(html),
            `${file} must not depend on CDN Paho for MQTT boot`);
    }
});

test('current Zaylo firmware has no stale WiFiManager dependency', (t) => {
    for (const file of ['async_network.cpp', 'async_network.h']) {
        if (!fs.existsSync(path.join(CURRENT_FIRMWARE_ROOT, file))) {
            t.skip('firmware files are not present in this website mirror');
            return;
        }
    }
    for (const file of ['async_network.cpp', 'async_network.h']) {
        const source = fs.readFileSync(path.join(CURRENT_FIRMWARE_ROOT, file), 'utf8');
        assert.ok(!source.includes('WiFiManager'), `${file} must not require the unused WiFiManager library`);
    }
});

test('Arduino setup guide lists every non-core sketch library', (t) => {
    if (!fs.existsSync(path.join(CURRENT_FIRMWARE_ROOT, 'README_ARDUINO.md'))) {
        t.skip('firmware setup guide is not present in this website mirror');
        return;
    }
    const guide = fs.readFileSync(path.join(CURRENT_FIRMWARE_ROOT, 'README_ARDUINO.md'), 'utf8');
    for (const lib of ['NimBLE-Arduino', 'ArduinoJson', 'U8g2', 'PubSubClient', 'ESP32Servo', 'SinricPro']) {
        assert.ok(guide.includes(lib), `README_ARDUINO.md must list ${lib}`);
    }
});

test('firmware clamps automation config before assigning packed numeric fields', (t) => {
    for (const file of ['mqtt_manager.cpp', 'storage.cpp', 'storage.h']) {
        if (!fs.existsSync(path.join(CURRENT_FIRMWARE_ROOT, file))) {
            t.skip('firmware files are not present in this website mirror');
            return;
        }
    }
    const mqtt = fs.readFileSync(path.join(CURRENT_FIRMWARE_ROOT, 'mqtt_manager.cpp'), 'utf8');
    const storage = fs.readFileSync(path.join(CURRENT_FIRMWARE_ROOT, 'storage.cpp'), 'utf8');
    const header = fs.readFileSync(path.join(CURRENT_FIRMWARE_ROOT, 'storage.h'), 'utf8');

    assert.ok(mqtt.includes('cfg["presenceTarget"].as<int>()'),
        'MQTT config updates must range-check presenceTarget before uint8_t assignment');
    assert.ok(mqtt.includes('duration >= 1 && duration <= 120'),
        'per-day morning durations must be checked before uint8_t assignment');
    assert.ok(mqtt.includes('target >= 0 && target <= 100'),
        'per-day morning targets must be checked before uint8_t assignment');
    assert.ok(!mqtt.includes('day["duration"].as<uint8_t>()'),
        'per-day morning duration must not be cast directly into uint8_t');
    assert.ok(!mqtt.includes('day["target"].as<uint8_t>()'),
        'per-day morning target must not be cast directly into uint8_t');
    assert.ok(header.includes('void sanitize();') && mqtt.includes('storage.sanitize();'),
        'imported or MQTT-updated config must run through storage validation before persistence');
    assert.ok(storage.includes('presence_open_target > 100') &&
        storage.includes('morning_duration[i] < 1') &&
        storage.includes('validTime'),
        'storage validation must repair persisted automation config bounds and time strings');
});

test('offline position replay window stays a short bounded window (H4)', () => {
    const sync = readAppFile('blind-sync.js');
    const m = sync.match(/POSITION_EXPIRY_MS\s*=\s*([0-9*\s]+);/);
    assert.ok(m, 'POSITION_EXPIRY_MS must be defined');
    // eslint-disable-next-line no-eval
    const value = eval(m[1]);
    assert.ok(value <= 10 * 60 * 1000,
        `POSITION_EXPIRY_MS is ${value} ms — must stay minutes, not hours (stale taps must never move blinds later)`);

    const device = readAppFile('blind-device.js');
    assert.ok(/pendingCommandTs\)\)\s*<\s*5\s*\*\s*60\s*\*\s*1000/.test(device),
        'blind-device.js pending-target freshness must match the 5-minute queue window');
});

test('MQTT reconnect has no give-up cap (H8)', () => {
    const mqtt = readAppFile('mqtt.js');
    assert.ok(!mqtt.includes('maxReconnectAttempts'),
        'the reconnect attempt cap must not return — always-on clients stranded offline');
});

test('calibration minimum range (500 steps) agrees across firmware and both wizards (H2/H5)', { skip: !firmwareAvailable }, () => {
    const fw = readFirmwareFile('mqtt_manager.cpp');
    assert.ok(/<\s*500\b/.test(fw), 'firmware narrow-range guard (< 500 steps) must exist in processConfigCommand');

    const setup = readAppFile('setup.js');
    assert.ok(/MIN_CALIBRATION_RANGE_STEPS\s*=\s*500\b/.test(setup),
        'setup wizard must validate the SAME 500-step minimum the firmware enforces');

    const device = readAppFile('blind-device.js');
    assert.ok(/range\s*>=\s*500\b/.test(device),
        'device-page wizard must validate the SAME 500-step minimum');
});

test('setup-link config ack is emitted by firmware and consumed by the wizard (H2)', { skip: !firmwareAvailable }, () => {
    const ino = readFirmwareFile('StepperMote.ino');
    assert.ok(ino.includes('configAck'), 'firmware must emit the configAck calibration snapshot');
    assert.ok(/api\/config/.test(ino), 'firmware must serve /api/config');

    const setup = readAppFile('setup.js');
    assert.ok(setup.includes('configAck'), 'setup wizard must consume the configAck');
    assert.ok(setup.includes('sendConfigAcked'), 'save buttons must use the acked send path');
});

test('setup page loads MQTT runtime before portal verification (C3)', () => {
    const html = readAppFile('setup.html');
    assert.ok(html.includes('paho-mqtt.min.js'), 'portal verification needs Paho MQTT on setup.html');
    assert.ok(html.includes('mqtt.js'), 'portal verification needs MQTTClient on setup.html');
    assert.ok(html.indexOf('mqtt.js') < html.indexOf('setup.js'),
        'mqtt.js must load before setup.js so portal verification can run');
});

test('portal setup accepts only valid device IDs and verifies online before redirect (C3)', () => {
    const setup = readAppFile('setup.js');
    assert.ok(setup.includes('^[A-F0-9]{6}$|^[A-F0-9]{12}$'),
        'portal setup must reject placeholder, partial, malformed, or overlong device IDs');
    assert.ok(setup.includes('_verifyPortalDeviceOnline'),
        'portal setup must wait for the blind to appear online before registering it');
    assert.ok(setup.includes('calibrate=1'),
        'successful portal setup must send the customer straight into calibration');
});

test('calibration and Wi-Fi setup commands are never queued for stale replay (C2/C4/H1)', () => {
    const device = readAppFile('blind-device.js');
    for (const token of ['calibration_start', 'calibration_end', 'scan_wifi', 'change_wifi']) {
        assert.ok(device.includes(token), `${token} path must exist`);
    }
    assert.ok(/publishCalibrationConfig[\s\S]*?queue:\s*false,\s*localFallback:\s*false/.test(device),
        'calibration config commands must be live-only');
    assert.ok(/if\s*\(\s*!publishCalibrationConfig\(\{\s*cmd:\s*'calibration_start'\s*\}\)\s*\)/.test(device),
        'wizard must not proceed unless calibration_start is actually sent');
    assert.ok(/publishConfig\([^)]*scan_wifi[\s\S]*?\{\s*queue:\s*false,\s*localFallback:\s*false\s*\}/.test(device),
        'Wi-Fi scans must be live-only');
    assert.ok(/publishConfig\([^)]*change_wifi[\s\S]*?\{\s*queue:\s*false,\s*localFallback:\s*false\s*\}/.test(device),
        'Wi-Fi credential changes must be live-only');
    assert.ok(device.includes('clearBySource'),
        'calibration queues must be cleared when entering/leaving calibration');
});

test('Wi-Fi change timeout cannot later flip failed UI to success (setup reliability)', () => {
    const device = readAppFile('blind-device.js');
    assert.ok(device.includes('up to 60 seconds'), 'Wi-Fi change copy must match the real timeout window');
    assert.ok(/wifiChangeTimeout\s*=\s*setTimeout\(\(\)\s*=>\s*\{[\s\S]*?awaitingWifiChange\s*=\s*false;[\s\S]*?handleWiFiChangeAck\(\{\s*status:\s*'failed'\s*\}\)/.test(device),
        'Wi-Fi timeout must clear awaitingWifiChange before rendering failure');
    assert.ok(device.includes('confirmedSsidFromState'),
        'Wi-Fi change fallback success must require state telemetry proving the selected SSID');
    assert.ok(!device.includes('if (online && (Date.now() - wifiChangeStartTs > 6000))'),
        'availability-only online messages must not mark Wi-Fi changes successful');
});

test('async SoftAP provisioning endpoint exists on both sides (H3/C4)', { skip: !firmwareAvailable }, () => {
    const ino = readFirmwareFile('StepperMote.ino');
    assert.ok(ino.includes('/api/setup-status'), 'firmware must serve the provisioning status poll');
    assert.ok(ino.includes('manageSoftApProvisioning'), 'the Wi-Fi join must run outside the HTTP handler');

    const setup = readAppFile('setup.js');
    assert.ok(setup.includes('/api/setup-status'), 'the in-app Wi-Fi-Direct flow must poll the async status');

    const portal = readFirmwareFile('setup_portal.h');
    assert.ok(portal.includes('/api/setup-status'), 'the device-hosted portal must poll the async status');
});

test('device-hosted setup portal can refresh Wi-Fi scans after boot (M1)', { skip: !firmwareAvailable }, () => {
    const ino = readFirmwareFile('StepperMote.ino');
    const portal = readFirmwareFile('setup_portal.h');
    assert.ok(ino.includes('/api/scan'), 'firmware must serve the Wi-Fi scan endpoint');
    assert.ok(ino.includes('hasArg("refresh")') && ino.includes('arg("refresh") == "1"'),
        'firmware must support explicit scan refreshes');
    assert.ok(portal.includes('loadScan(true)'), 'portal must expose a rescan action');
    assert.ok(portal.includes('?refresh=1'), 'portal rescan must request a fresh firmware scan');
    assert.ok(ino.includes('X-Scan-Age-Seconds'), 'firmware should expose scan age metadata');
    assert.ok(portal.includes('scanAge'), 'portal should show whether scan results are fresh');
});

test('rescue Wi-Fi credential changes are verified before being saved (M2)', { skip: !firmwareAvailable }, () => {
    const ino = readFirmwareFile('StepperMote.ino');
    assert.ok(ino.includes('startRescueCredentialVerification'),
        'rescue Wi-Fi credentials must enter a non-blocking verification flow');
    assert.ok(ino.includes('processRescueCredentialVerification'),
        'rescue Wi-Fi verification must be progressed from the main loop');
    assert.ok(ino.includes('rescueCredentialOldSSID') && ino.includes('rescueCredentialOldPass'),
        'failed rescue credentials must restore the previous working network');
});

test('Wi-Fi change ack JSON is serialized safely for unusual SSIDs', { skip: !firmwareAvailable }, () => {
    const fw = readFirmwareFile('mqtt_manager.cpp');
    const fn = fw.match(/void MqttManager::publishWiFiChangeAck[\s\S]*?\n}/);
    assert.ok(fn, 'publishWiFiChangeAck must exist');
    assert.ok(fn[0].includes('serializeJson'), 'Wi-Fi change ack must escape SSIDs via JSON serialization');
    assert.ok(!fn[0].includes('"{\\"status\\":\\"'),
        'Wi-Fi change ack must not be built by string concatenation');
});

test('firmware reports honest position diagnostics, not physical stall claims (M5)', { skip: !firmwareAvailable }, () => {
    const diag = readFirmwareFile('diagnostics_manager.cpp');
    const device = readAppFile('blind-device.js');
    assert.ok(diag.includes('openLoopPositionModel'), 'diagnostics must disclose open-loop position tracking');
    assert.ok(diag.includes('physicalStallDetection') && diag.includes('false'),
        'diagnostics must not imply physical stall detection exists');
    assert.ok(device.includes('positionModelAnomalies'),
        'PWA diagnostics must label model anomalies honestly');
});

test('firmware state fallbacks keep app recovery fields (C4/H7)', { skip: !firmwareAvailable }, () => {
    const fw = readFirmwareFile('mqtt_manager.cpp');
    assert.ok(/lowHeap[\s\S]*?calibrationMode[\s\S]*?localIp/.test(fw),
        'low-heap state fallback must still expose calibrationMode and localIp');
    assert.ok(/stateTruncated[\s\S]*?calibrationMode[\s\S]*?localIp/.test(fw),
        'oversized state fallback must still expose calibrationMode and localIp');
    assert.ok(/lowHeap[\s\S]*?positionNeedsVerification[\s\S]*?powerLossDuringMove/.test(fw),
        'low-heap state fallback must retain position-verification telemetry');
    assert.ok(/stateTruncated[\s\S]*?positionNeedsVerification[\s\S]*?powerLossDuringMove/.test(fw),
        'oversized state fallback must retain position-verification telemetry');
});

test('firmware reports calibration-mode rejects consistently across MQTT command topics', { skip: !firmwareAvailable }, () => {
    const fw = readFirmwareFile('mqtt_manager.cpp');
    const stepper = readFirmwareFile('StepperManager.cpp');
    assert.ok(stepper.includes('movementRejectReason') &&
        stepper.includes('calibration_mode_active') &&
        fw.includes('movementRejectReason()') &&
        fw.includes('movementRejectReason(calibrationSession)'),
        'open/close and position command rejects must use the shared firmware reject reason');
});

test('local LAN fallback cannot replay a command that already executed locally', () => {
    const mqtt = readAppFile('mqtt.js');
    const sync = readAppFile('blind-sync.js');
    assert.ok(sync.includes('function clearExecutedCommand'),
        'blind-sync must expose a durable-queue removal path for locally executed commands');
    assert.ok(sync.includes('clearExecuted: clearExecutedCommand'),
        'BlindCommandQueue must export clearExecuted for MQTT local fallback');
    assert.ok(/pendingMessages\.delete\(topic\)[\s\S]*BlindCommandQueue\.clearExecuted\(deviceId,\s*fallbackPayload\)/.test(mqtt),
        'successful LAN control must clear both the short MQTT queue and the durable BlindCommandQueue entry');
});

test('local LAN status mirrors movement and drift telemetry until the blind stops', { skip: !firmwareAvailable }, () => {
    const mqtt = readAppFile('mqtt.js');
    const ino = readFirmwareFile('StepperMote.ino');
    assert.ok(/data\.isMoving\s*===\s*true[\s\S]*_pollStepperLocalStatus\(deviceId,\s*localControlUrl,\s*1000/.test(mqtt),
        'local fallback must keep polling /api/status while the motor is still moving');
    assert.ok(mqtt.includes('status.positionConfidence') && mqtt.includes('status.calibration') && mqtt.includes('status.calibrationMode'),
        'MQTT local-status ingest must carry position confidence, drift telemetry, and calibration mode into app state');
    assert.ok(/statusDoc\["positionConfidence"\][\s\S]*statusDoc\["calibration"\][\s\S]*calibration\["driftSteps"\]/.test(ino),
        '/api/status must expose the same drift/confidence telemetry used by MQTT state');
    assert.ok(/resp\["positionConfidence"\][\s\S]*resp\["calibration"\][\s\S]*calibration\["driftSteps"\]/.test(ino),
        '/api/local-control responses must expose drift/confidence telemetry immediately after LAN commands');
});

test('local calibration-mode rejects are not treated as missing calibration', { skip: !firmwareAvailable }, () => {
    const device = readAppFile('blind-device.js');
    const ino = readFirmwareFile('StepperMote.ino');
    assert.ok(device.includes("clean === 'calibration_mode_active'"),
        'PWA rejection copy must have a first-class calibration-mode-active message');
    assert.ok(!device.includes('detail.status === 409 || /calibration required/i.test(responseMessage)'),
        'local feedback must not treat every 409 as not-calibrated');
    assert.ok(/if\s*\(\s*reason\s*===\s*'not_calibrated'\s*\)\s*BlindState\.isCalibrated\s*=\s*false/.test(device),
        'only not_calibrated rejections may clear the app calibration state');
    assert.ok(ino.includes('movementRejectReason(calibrationSession)') &&
        ino.includes('safeReason') &&
        ino.includes('position_verification_required'),
        'firmware local-control 409 responses must include a machine-readable reason');
});

test('stepper movement APIs reject unsafe calibration jog and ambiguous payloads', { skip: !firmwareAvailable }, () => {
    const mqtt = readFirmwareFile('mqtt_manager.cpp');
    const ino = readFirmwareFile('StepperMote.ino');
    assert.ok(mqtt.includes('validCalibrationSession(doc["calibrationSession"])'),
        'MQTT control must parse calibrationSession truthfully, not by key presence');
    assert.ok(ino.includes('validCalibrationSessionValue(doc["calibrationSession"])'),
        'local-control must parse calibrationSession truthfully, not by key presence');
    assert.ok(mqtt.includes('ambiguous_command') && ino.includes('ambiguous_command'),
        'MQTT and local-control must reject payloads that combine movement command types');
    assert.ok(mqtt.includes('calibration_session_required') && mqtt.includes('calibration_mode_required'),
        'MQTT jog movement must require an active calibration session and mode');
    assert.ok(ino.includes('calibration_session_required') && ino.includes('calibration_mode_required'),
        'local-control jog movement must require an active calibration session and mode');
});

test('setup and manual add accept new full-MAC device IDs while preserving legacy IDs', () => {
    const setup = readAppFile('setup.js');
    const index = readAppFile('index.js');
    assert.ok(setup.includes("maxlength=\"12\""), 'portal setup Device ID entry must allow full-MAC IDs');
    assert.ok(setup.includes('^[A-F0-9]{6}$|^[A-F0-9]{12}$'),
        'portal setup must accept both legacy 6-char and new 12-char hex IDs');
    assert.ok(index.includes('maxlength="12"'), 'manual add modal must allow full-MAC IDs');
    assert.ok(index.includes('^[A-F0-9]{6}$|^[A-F0-9]{12}$'),
        'manual add modal must accept both legacy 6-char and new 12-char hex IDs');
});

test('manual Wi-Fi setup supports open or hidden networks without forcing a password', () => {
    const setupHtml = readAppFile('setup.html');
    const setupJs = readAppFile('setup.js');
    assert.ok(setupHtml.includes('manualWifiOpen'), 'manual setup must expose an open-network selector');
    assert.ok(setupJs.includes('const secured = !(openToggle && openToggle.checked)'),
        'manual SSID handler must derive security from the open-network selector');
    assert.ok(setupJs.includes('pwd?.classList.toggle') && setupJs.includes('SetupState.selectedNetwork.secured && !password'),
        'password field and validation must be conditional on selected network security');
});

test('pending position commands are displayed as intent, not confirmed position', () => {
    const device = readAppFile('blind-device.js');
    const index = readAppFile('index.js');
    assert.ok(device.includes('Queued to ${pendingIntent.target}%') &&
        device.includes('Sent to ${pendingIntent.target}%'),
        'device page must label queued targets without making them the live position');
    assert.ok(device.includes('BlindState.targetPosition = BlindState.position') &&
        device.includes('BlindState._visualTargetPos = BlindState.position'),
        'queued/offline commands must keep the visual anchored to the last live position');
    assert.ok(!index.includes('if (hasPendingTarget) displayPosition = pendingTarget'),
        'dashboard card must not replace live position with an unconfirmed pending target');
    assert.ok(index.includes('queued ${_badgeLabel(pendingTarget)}'),
        'dashboard card must surface pending intent separately');
});

test('low-confidence stepper position requires user verification before normal movement', { skip: !firmwareAvailable }, () => {
    const device = readAppFile('blind-device.js');
    const stepper = readFirmwareFile('StepperManager.cpp');
    const mqtt = readFirmwareFile('mqtt_manager.cpp');
    assert.ok(device.includes('function _positionVerificationIssue()'),
        'device page must centralize low-confidence movement gating');
    assert.ok(device.includes("c.powerLossDuringMove === true") && device.includes('confidence < 70'),
        'movement gate must cover power-loss-during-move and low-confidence telemetry');
    assert.ok(device.includes('const verificationIssue = _positionVerificationIssue()'),
        'setPosition must check position verification before queuing movement');
    assert.ok(stepper.includes('positionVerificationRequired()') &&
        stepper.includes('position_verification_required') &&
        stepper.includes('POSITION_VERIFICATION_MIN_CONFIDENCE'),
        'firmware must reject normal motion while position confidence needs user verification');
    assert.ok(mqtt.includes('movementRejectReason(calibrationSession)') &&
        mqtt.includes('positionNeedsVerification'),
        'MQTT state/reject telemetry must expose firmware position-verification blocks');
});

test('storage migration preserves Wi-Fi credentials while forcing recalibration (M3)', { skip: !firmwareAvailable }, () => {
    const storage = readFirmwareFile('storage.cpp');
    assert.ok(storage.includes('WiFi.SSID()') && storage.includes('WiFi.psk()'),
        'migration must capture known Wi-Fi credentials before resetting config');
    assert.ok(storage.includes('config.stepper_top_position = 0') &&
        storage.includes('config.stepper_bottom_position = 0'),
        'migration reset must invalidate old calibration limits');
});

test('stepper setup exposes and persists anti-droop idle hold (M7)', () => {
    const setup = readAppFile('setup.js');
    assert.ok(setup.includes('stepperIdleHold: false'), 'idle hold must default off during setup');
    assert.ok(setup.includes('idleHoldToggle'), 'setup must expose an explicit idle-hold customer choice');
    assert.ok(setup.includes('Anti-droop motor hold'), 'idle-hold setting must be labeled clearly');
    assert.ok(/stepperIdleHold:\s*!!SetupState\.stepperIdleHold/.test(setup),
        'idle hold choice must be included in the setup config payload');
});

test('MQTT default broker is the configured host and stays overridable (M8)', () => {
    const mqtt = readAppFile('mqtt.js');
    const index = readAppFile('index.js');
    // The deployment default broker host. Overridable at runtime via the
    // zaylo-BrokerIP localStorage key, so a deployed app can be repointed
    // without a code change.
  assert.ok(/broker:\s*'demo-broker\.local'/.test(mqtt),
      'broker default must be the demo placeholder host');
    assert.ok(mqtt.includes("localStorage.getItem('zaylo-BrokerIP')"),
        'broker host must remain overridable via the zaylo-BrokerIP localStorage key');
    assert.ok(mqtt.includes('_defaultBrokerHost'),
        'app should still derive a same-origin fallback broker host');
    assert.ok(index.includes('Default: ${Utils.escapeHtml(defaultBrokerHost)}'),
        'settings UI must render the runtime default broker host');
});

test('no simulator or fabricated device IDs in the production setup flow (C3)', () => {
    const setup = readAppFile('setup.js');
    assert.ok(!/isSimulated|Setup Simulator|SIMULATOR/.test(setup),
        'the setup simulator must never ship in the customer flow');
    assert.ok(!/'XXXX'|'5E1B'/.test(setup),
        'placeholder device IDs must never be registrable');
});

test('rejection handling is sequence-gated, never presence-gated (C1)', () => {
    const device = readAppFile('blind-device.js');
    assert.ok(!/snapshot\.lastCommandRejected\s*\|\|\s*snapshot\.lastCommandRejectedSeq/.test(device),
        'the wizard must not fail on the mere presence of (historical) rejection telemetry');
    assert.ok(device.includes('baselineRejectSeq'),
        'the wizard must baseline the rejection seq before waiting on a test move');
});
