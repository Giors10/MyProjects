'use strict';

/**
 * Release 446 — "every blind action stuck pending" regression tests.
 *
 * Root cause shipped in 444/445: mqtt.js declares `const MQTTClient` at the
 * top level. A top-level `const` is a global LEXICAL binding, not a window
 * property — so blind-sync.js / blind-schema.js, which resolve the client as
 * `global.MQTTClient` (their IIFE `global` === window), always saw undefined
 * in a real browser. Every movement/config publish returned sent:false and
 * queued forever ("pending"), while inbound state kept flowing and Matter
 * kept working. Earlier tests missed it because the stubs set
 * `window.MQTTClient` themselves.
 *
 * These tests run the REAL scripts in an isolated vm context whose `window`
 * is a plain object (true browser semantics: lexical bindings do NOT become
 * window properties) and assert the explicit exports plus the end-to-end
 * command path.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { LocalStorageStub, APP_ROOT } = require('./helpers/stubs');

// A sandbox where `window` is a separate plain object — exactly like a
// browser, a top-level `const` in a loaded script is visible lexically to
// later scripts but does NOT appear on `window`.
function makeBrowserLikeContext() {
    const storage = new LocalStorageStub();
    const windowObj = {
        DEBUG: false,
        localStorage: storage,
        navigator: { onLine: true },
        location: { protocol: 'https:', hostname: 'app.test', search: '' },
        addEventListener() {},
        dispatchEvent() { return true; },
        CustomEvent: class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
    };
    const sandbox = {
        console,
        setTimeout: (fn, ms, ...a) => { const t = setTimeout(fn, ms, ...a); if (t.unref) t.unref(); return t; },
        clearTimeout, setInterval, clearInterval,
        Date, Math, JSON, Promise,
        localStorage: storage,
        navigator: windowObj.navigator,
        location: windowObj.location,
        document: { addEventListener() {}, visibilityState: 'visible', getElementById() { return null; } },
        CustomEvent: windowObj.CustomEvent,
        window: windowObj
    };
    const ctx = vm.createContext(sandbox);
    return { ctx, windowObj, storage };
}

function loadInContext(ctx, relPath) {
    const file = path.join(APP_ROOT, relPath);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}

test('mqtt.js explicitly exports MQTTClient onto window (root cause of stuck-pending commands)', () => {
    const { ctx, windowObj } = makeBrowserLikeContext();
    loadInContext(ctx, 'mqtt.js');
    assert.ok(windowObj.MQTTClient, 'window.MQTTClient must be set by mqtt.js itself');
    assert.equal(typeof windowObj.MQTTClient.publishStepperControl, 'function');
    assert.equal(typeof windowObj.MQTTClient.publishConfig, 'function');
});

test('device-service.js explicitly exports DeviceService onto window (index.js/device.js gate on it)', () => {
    const { ctx, windowObj } = makeBrowserLikeContext();
    loadInContext(ctx, 'device-service.js');
    assert.ok(windowObj.DeviceService, 'window.DeviceService must be set by device-service.js itself');
});

test('BlindCommandQueue.sendPosition publishes for real under true browser globals', () => {
    const { ctx, windowObj } = makeBrowserLikeContext();
    loadInContext(ctx, 'mqtt.js');
    loadInContext(ctx, 'blind-schema.js');
    loadInContext(ctx, 'blind-sync.js');

    // Make the real MQTTClient believe it is connected and capture the wire
    // publish at the lowest level the queue uses.
    const published = [];
    windowObj.MQTTClient.publishStepperControl = (deviceId, payload) => {
        published.push({ deviceId, payload });
        return true;
    };

    const result = windowObj.BlindCommandQueue.sendPosition('TEST01', 42, { source: 'release-446-test' });
    assert.equal(result.sent, true, 'sendPosition must actually publish when the client can send');
    assert.equal(published.length, 1, 'exactly one wire publish expected');
    assert.equal(published[0].deviceId, 'TEST01');
    assert.equal(published[0].payload.blindPosition, 42);
    assert.ok(published[0].payload.commandId, 'wire payload must carry a commandId for the firmware receipt echo');
});

test('BlindConfigSync delivers config under true browser globals', () => {
    const { ctx, windowObj } = makeBrowserLikeContext();
    loadInContext(ctx, 'mqtt.js');
    loadInContext(ctx, 'blind-schema.js');
    loadInContext(ctx, 'blind-sync.js');

    const published = [];
    windowObj.MQTTClient.publishConfig = (deviceId, payload) => {
        published.push({ deviceId, payload });
        return true;
    };
    // attemptConfigSync checks client.connected before publishing.
    windowObj.MQTTClient.client = { isConnected: () => true };

    const res = windowObj.BlindConfigSync.queue('TEST01', { rules: { sunset: true }, config: {} }, { source: 'release-446-test' });
    assert.equal(res.sent, true, 'config sync must actually publish when connected');
    assert.equal(published.length, 1);
    assert.equal(published[0].deviceId, 'TEST01');
    assert.ok(published[0].payload.cfgRev, 'config payload must carry the cfgRev ack token');
});
