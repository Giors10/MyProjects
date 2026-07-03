'use strict';

/**
 * Regression tests for the v444 fix release.
 *
 * Covers the two most subtle behavioral contracts introduced by the review
 * fixes, plus source-level guards for the firmware-side changes:
 *   M1 — provisional rules are OMITTED from config payloads (never pushed),
 *        and only explicit rules ride along.
 *   M8 — temperature unit helpers convert display-only; storage stays °C.
 *   L4 — the computed POSIX TZ engine emits correct offsets/transition rules
 *        for zones outside the verified map.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { installBrowserStubs, loadScript, readFirmwareFile, readAppFile } = require('./helpers/stubs');
const fs = require('node:fs');
const path = require('node:path');

const { storage } = installBrowserStubs();
loadScript('blind-schema.js');

test('M1: buildConfigPayload OMITS rules when none are explicit', () => {
    storage.clear();
    // No saved state at all → payload must not carry a rules object that would
    // enable the optimistic defaults (sunset/presence/morning ON) on a firmware
    // whose own defaults are all OFF.
    const payload = BlindSchema.buildConfigPayload('AABBCC', null, 7);
    assert.equal(payload.cfgRev, 7);
    assert.ok(payload.config, 'config must always be present');
    assert.ok(!('rules' in payload), 'rules must be OMITTED while provisional');

    // Explicit null (the device page passes this while provisional) → omitted.
    const p2 = BlindSchema.buildConfigPayload('AABBCC', { rules: null, config: {} }, 8);
    assert.ok(!('rules' in p2), 'rules:null must also omit the rules object');
});

test('M1: buildConfigPayload INCLUDES explicit rules, default-filled', () => {
    storage.clear();
    const payload = BlindSchema.buildConfigPayload('AABBCC', {
        rules: { nightLock: true, sunset: false },
        config: {}
    }, 9);
    assert.ok(payload.rules, 'explicit rules must be included');
    assert.equal(payload.rules.nightLock, true);
    assert.equal(payload.rules.sunset, false);
    // Gap-filling from DEFAULT_RULES still applies for explicit rule sets.
    assert.equal(typeof payload.rules.morningOpen, 'boolean');
});

test('M8: temperature helpers convert display-only and round-trip sanely', () => {
    storage.clear(); // default unit = C
    assert.equal(BlindSchema.tempUnit(), 'C');
    assert.equal(BlindSchema.cToDisplay(28), 28);
    assert.equal(BlindSchema.formatTemp(28), '28°C');

    BlindSchema.setTempUnit('F');
    assert.equal(BlindSchema.tempUnit(), 'F');
    assert.equal(BlindSchema.cToDisplay(28), 82);     // 82.4 → 82
    assert.equal(BlindSchema.displayToC(82), 28);     // round-trip stable
    assert.equal(BlindSchema.formatTemp(28), '82°F');

    // Round-trip stability across the firmware's full clamp range (20..80 °C):
    // converting to °F and back must reproduce the same integer °C.
    for (let c = 20; c <= 80; c++) {
        assert.equal(BlindSchema.displayToC(BlindSchema.cToDisplay(c)), c,
            `°C→°F→°C round-trip drifted at ${c}°C`);
    }
    BlindSchema.setTempUnit('C');
});

test('L4: computed POSIX TZ yields correct offsets and transition rules', () => {
    // mqtt.js exports MQTTClient under CommonJS (its module.exports guard);
    // top-level only builds an object literal, so requiring it under the
    // browser stubs is safe (no DOM access until methods are called).
    const { MQTTClient } = require('../mqtt.js');

    // US zones have real abbreviations in Node's en-US ICU → exact match with
    // the hand-verified strings.
    assert.equal(MQTTClient._computePosixTz('America/New_York'), 'EST5EDT,M3.2.0,M11.1.0');
    assert.equal(MQTTClient._computePosixTz('America/Los_Angeles'), 'PST8PDT,M3.2.0,M11.1.0');

    // Unmapped zones — the actual gap this engine closes. Names fall back to
    // POSIX <±HHMM> numeric form; offsets and M-rules must be exact.
    assert.equal(MQTTClient._computePosixTz('Asia/Kolkata'), '<+0530>-5:30');
    assert.equal(MQTTClient._computePosixTz('Pacific/Auckland'), '<+12>-12<+13>,M9.5.0,M4.1.0/3');
    assert.equal(MQTTClient._computePosixTz('America/St_Johns'), '<-0330>3:30<-0230>,M3.2.0,M11.1.0');

    // Every computed string must fit the firmware's 48-byte tz_posix buffer.
    for (const tz of ['Europe/London', 'Australia/Lord_Howe', 'Pacific/Chatham', 'America/Santiago']) {
        const s = MQTTClient._computePosixTz(tz);
        assert.ok(s.length < 48, `${tz} → "${s}" exceeds the firmware buffer`);
    }
});

// ── Firmware source contracts for the v444 fixes ───────────────────────────

const FIRMWARE_ROOT = path.join(__dirname, '..', '..', '..', 'StepperMote');
const firmwareAvailable = fs.existsSync(FIRMWARE_ROOT);

test('H1: storage.flushPending runs mode-independently and restarts saveNow first', { skip: !firmwareAvailable }, () => {
    const ino = readFirmwareFile('StepperMote.ino');
    // flushPending must live in the common loop section (before the mode branch).
    const loopBody = ino.slice(ino.indexOf('void loop()'));
    const flushAt = loopBody.indexOf('storage.flushPending()');
    const branchAt = loopBody.indexOf('bleProvisioning.isActive()');
    assert.ok(flushAt > -1 && branchAt > -1 && flushAt < branchAt,
        'storage.flushPending() must run before the provisioning/rescue/normal branch');
    // Every rescue/provisioning restart path persists first.
    assert.ok(/config\.boot_crash_count = 0;[^]*?storage\.saveNow\(\);[^]*?ESP\.restart\(\)/.test(ino),
        'rescue restarts must saveNow() before ESP.restart()');
});

test('H3: automation catch-up window + persisted fired-day stamps exist', { skip: !firmwareAvailable }, () => {
    const hdr = readFirmwareFile('AutomationManager.h');
    assert.ok(hdr.includes('AUTOMATION_CATCHUP_WINDOW_S'), 'catch-up window constant must exist');
    const cpp = readFirmwareFile('AutomationManager.cpp');
    assert.ok(cpp.includes('markRuleFired'), 'fired-day stamping must exist');
    assert.ok(cpp.includes('Night Lock (catch-up)'), 'night lock must have a catch-up path');
    assert.ok(cpp.includes('Sunset Auto-Close (catch-up)'), 'sunset must have a catch-up path');
    assert.ok(cpp.includes('Morning wake-up (catch-up)'), 'morning must have a catch-up path');
});

test('H4: captive-portal DNS + OS probe redirects exist in setup mode', { skip: !firmwareAvailable }, () => {
    const ino = readFirmwareFile('StepperMote.ino');
    assert.ok(ino.includes('#include <DNSServer.h>'), 'DNSServer include missing');
    assert.ok(ino.includes('setupDnsServer->start(53'), 'wildcard DNS must start on port 53');
    for (const probe of ['/generate_204', '/hotspot-detect.html', '/connecttest.txt']) {
        assert.ok(ino.includes(probe), `captive probe handler missing: ${probe}`);
    }
    assert.ok(ino.includes('processNextRequest'), 'DNS pump missing from the provisioning loop');
});

test('M2/L9: app->device publishes are QoS 1; blinds skip switch-only backup topics', () => {
    const mqtt = readAppFile('mqtt.js');
    assert.ok(/message\.qos = 1;/.test(mqtt), 'commands must publish at QoS 1');
    assert.ok(mqtt.includes("t === 'blind' || t === 'stepper'"),
        'subscribeDevice must gate the config-export topics by device type');
});

test('M12: Matter lift commands are rejected (not silently dropped) when uncalibrated', { skip: !firmwareAvailable }, () => {
    const cpp = readFirmwareFile('matter_manager.cpp');
    // Anchor on the DEFINITION (the registration in begin() appears earlier).
    const defAt = cpp.indexOf('bool MatterManager::onGoToLiftPercentageCallback');
    assert.ok(defAt > -1, 'lift callback definition must exist');
    const cb = cpp.slice(defAt, defAt + 1600);
    assert.ok(/isCalibrated\(\)[^]*?return false;/.test(cb),
        'lift callback must return false when the blind is not calibrated');
});
