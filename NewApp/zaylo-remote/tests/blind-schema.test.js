'use strict';

/**
 * BlindSchema: defaults, unit conversions, inheritance, day-schedule
 * normalisation, config revisions, and the cfgRev ack handshake.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { installBrowserStubs, loadScript } = require('./helpers/stubs');

const { storage } = installBrowserStubs();
loadScript('blind-schema.js');

const DEVICE = 'D4E5F6';

test.beforeEach(() => {
    storage.clear();
    delete globalThis.MQTTClient;
    delete globalThis.BlindConfigSync; // exercise BlindSchema's own fallback paths
});

test('buildConfigPayload merges defaults with saved overrides', () => {
    const payload = BlindSchema.buildConfigPayload(DEVICE, {
        rules: { nightLock: true },
        config: { morningTime: '06:30' }
    }, 7);

    assert.equal(payload.cfgRev, 7);
    assert.equal(payload.rules.nightLock, true);     // override kept
    assert.equal(payload.rules.sunset, true);        // default filled in
    assert.equal(payload.config.morningTime, '06:30');
    assert.equal(payload.config.nightTime, '22:00'); // default filled in
});

test('motionTimeout converts UI minutes to firmware seconds', () => {
    const cfg = BlindSchema.toFirmwareConfig({ motionTimeout: 5 });
    assert.equal(cfg.motionTimeout, 300);
    // and is floored at 1 minute
    const tiny = BlindSchema.toFirmwareConfig({ motionTimeout: 0.2 });
    assert.equal(tiny.motionTimeout, 60);
});

test('per-device sunsetOffset overrides the home-wide global; null inherits it', () => {
    storage.setItem('zaylo-SunsetOffset', '-30');

    const inherited = BlindSchema.toFirmwareConfig({ sunsetOffset: null });
    assert.equal(inherited.sunsetOffset, -30);

    const overridden = BlindSchema.toFirmwareConfig({ sunsetOffset: 15 });
    assert.equal(overridden.sunsetOffset, 15);

    const zeroOverride = BlindSchema.toFirmwareConfig({ sunsetOffset: 0 });
    assert.equal(zeroOverride.sunsetOffset, 0, 'an explicit 0 is an override, not "inherit"');
});

test('device without coordinates inherits the home-wide location', () => {
    storage.setItem('zaylo-LocationLat', '51.5074');
    storage.setItem('zaylo-LocationLon', '-0.1278');
    const cfg = BlindSchema.toFirmwareConfig({ lat: null, lon: null });
    assert.equal(cfg.lat, 51.5074);
    assert.equal(cfg.lon, -0.1278);
});

test('UI-only "city" label is stripped from the firmware payload', () => {
    const cfg = BlindSchema.toFirmwareConfig({ city: 'London' });
    assert.equal('city' in cfg, false);
});

test('day schedules normalise booleans into full per-day objects', () => {
    const cfg = BlindSchema.toFirmwareConfig({
        morningTime: '07:15',
        morningDuration: 20,
        morningTarget: 90,
        morningDays: [true, false, true, true, true, true, false],
        nightTime: '21:30',
        nightTarget: 0,
        nightDays: [true, true, true, true, true, false, false]
    });

    assert.equal(cfg.morningDays.length, 7);
    assert.deepEqual(cfg.morningDays[0], { enabled: true, time: '07:15', target: 90, duration: 20 });
    assert.equal(cfg.morningDays[1].enabled, false);
    // night schedule has no duration field
    assert.deepEqual(cfg.nightDays[5], { enabled: false, time: '21:30', target: 0 });
    assert.equal('duration' in cfg.nightDays[0], false);

    // A non-7-length value passes through untouched (legacy/absent)
    const passthrough = BlindSchema.toFirmwareConfig({ morningDays: null });
    assert.equal(passthrough.morningDays, null);
});

test('nextRevision increments and wraps before overflowing the firmware int', () => {
    assert.equal(BlindSchema.nextRevision(DEVICE), 1);
    assert.equal(BlindSchema.nextRevision(DEVICE), 2);

    storage.setItem(`blind-cfgsync-rev-${DEVICE}`, String(0x7ffffffe));
    assert.equal(BlindSchema.nextRevision(DEVICE), 1, 'must wrap to 1, never exceed 0x7ffffffe');
});

test('handleConfigAck clears the pending sync only when the device echoes the right rev', () => {
    storage.setItem(`blind-cfgsync-${DEVICE}`, JSON.stringify({
        rev: 12, payload: { cfgRev: 12 }, acked: false
    }));

    assert.equal(BlindSchema.handleConfigAck(DEVICE, { cfgRev: 11 }), false, 'older echo must not ack');
    assert.ok(storage.getItem(`blind-cfgsync-${DEVICE}`), 'pending sync must survive a wrong-rev echo');

    assert.equal(BlindSchema.handleConfigAck(DEVICE, { cfgRev: 12 }), true);
    assert.equal(storage.getItem(`blind-cfgsync-${DEVICE}`), null, 'acked sync must be cleared');
});
