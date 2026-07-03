'use strict';

/**
 * MQTTClient reconnect policy (H8 regression), broker config overrides (H6),
 * and the mixed-content guard for local HTTP fallback (C4).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { installBrowserStubs } = require('./helpers/stubs');

const { storage } = installBrowserStubs();
// mqtt.js exports via module.exports when require()d.
const { MQTTClient } = require('../mqtt.js');
const DEVICE = 'A1B2C3';
const DEFAULT_BROKER = 'demo-broker.local';

/** Capture scheduled timers without running them. */
function withCapturedTimers(fn) {
    const captured = [];
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    global.setTimeout = (cb, delay, ...args) => {
        captured.push({ cb, delay });
        return { unref() {} };
    };
    global.clearTimeout = () => {};
    try {
        fn(captured);
    } finally {
        global.setTimeout = realSetTimeout;
        global.clearTimeout = realClearTimeout;
    }
    return captured;
}

test.beforeEach(() => {
    storage.clear();
    MQTTClient.pendingMessages.clear();
    MQTTClient.reconnectAttempts = 0;
    MQTTClient.reconnectTimer = null;
    MQTTClient.intentionalDisconnect = false;
});

test('reconnect NEVER gives up — attempt 100 still schedules a retry (H8)', () => {
    MQTTClient.reconnectAttempts = 100;
    const timers = withCapturedTimers(() => MQTTClient._attemptReconnect());
    assert.equal(timers.length, 1,
        'the old 15-attempt cap left always-on clients permanently offline after a long outage');
    assert.equal(timers[0].delay, 60000, 'steady-state retry settles at 60 s');
});

test('reconnect backoff ramps but stays finite and bounded for any attempt count', () => {
    for (const attempts of [0, 1, 5, 10, 20, 500, 10000]) {
        MQTTClient.reconnectAttempts = attempts;
        MQTTClient.reconnectTimer = null;
        const timers = withCapturedTimers(() => MQTTClient._attemptReconnect());
        assert.equal(timers.length, 1, `attempt ${attempts} must schedule a retry`);
        const delay = timers[0].delay;
        assert.ok(Number.isFinite(delay) && delay > 0, `delay must be finite (attempt ${attempts})`);
        assert.ok(delay <= 60000, `delay must be capped at 60 s (attempt ${attempts}, got ${delay})`);
    }
});

test('first retry is fast (seconds, not the cap)', () => {
    MQTTClient.reconnectAttempts = 0;
    const timers = withCapturedTimers(() => MQTTClient._attemptReconnect());
    assert.ok(timers[0].delay <= 5000, `first retry should be quick, got ${timers[0].delay}`);
});

test('broker credentials: localStorage override wins over the dev default (H6)', () => {
    // reset any override set by a previous test
    MQTTClient.config.username = undefined;
    assert.equal(MQTTClient.config.username, MQTTClient.BROKER_DEFAULTS.username);

    storage.setItem('zaylo-BrokerUser', 'fleet-user');
    assert.equal(MQTTClient.config.username, 'fleet-user');

    // an explicit connect({username}) override outranks both
    MQTTClient.config.username = 'session-user';
    assert.equal(MQTTClient.config.username, 'session-user');
    MQTTClient.config.username = undefined; // back to inherited
    assert.equal(MQTTClient.config.username, 'fleet-user');
});

test('broker host/path: requested default is overridable (H6/M8)', () => {
    assert.notEqual(MQTTClient.config.broker, '');
    assert.equal(MQTTClient.config.broker, DEFAULT_BROKER);
    storage.setItem('zaylo-BrokerIP', 'mqtt.example.com');
    assert.equal(MQTTClient.config.broker, 'mqtt.example.com');

    assert.equal(MQTTClient.config.wsPath, MQTTClient.BROKER_DEFAULTS.wsPath);
    storage.setItem('zaylo-BrokerPath', '');
    assert.equal(MQTTClient.config.wsPath, '', 'empty path must be respected, not replaced by the default');
});

test('queue:false publishes are never stored for later replay (C2/C4)', () => {
    const ok = MQTTClient.publishConfig(DEVICE, { cmd: 'scan_wifi' }, { queue: false, localFallback: false });
    assert.equal(ok, false);
    assert.equal(MQTTClient.pendingMessages.size, 0,
        'setup/calibration requests must fail visibly when offline, not replay later in a different context');
});

test('stepper controls use the shared firmware control topic for deployed-device compatibility', () => {
    const ok = MQTTClient.publishStepperControl(DEVICE, { blindPosition: 25 }, { localFallback: false });
    assert.equal(ok, false);
    assert.equal(MQTTClient.pendingMessages.size, 1);
    assert.ok(MQTTClient.pendingMessages.has(`lumibot/${DEVICE}/set`),
        'blind moves must publish on the control topic accepted by both old and new StepperMote firmware');
    assert.ok(!MQTTClient.pendingMessages.has(`lumibot/${DEVICE}/stepper/set_position`),
        'the app must not rely only on the newer stepper/set_position topic');
});

test('local fallback preserves calibrationSession for calibration-mode moves', () => {
    const normalized = MQTTClient._normalizeStepperLocalPayload({
        blindPosition: 45,
        commandId: 'cmd-1',
        calibrationSession: 'cal-A1'
    });

    assert.equal(normalized.position, 45);
    assert.equal(normalized.commandId, 'cmd-1');
    assert.equal(normalized.calibrationSession, 'cal-A1');
});

test('local fallback tries .local address after a stale cached IP fails', async () => {
    const originalFetch = global.fetch;
    const originalPoll = MQTTClient._pollStepperLocalStatus;
    const originalSuccess = MQTTClient._notifyLocalControlSuccess;
    const originalFailure = MQTTClient._notifyLocalControlFailure;
    const originalLocation = global.window.location;
    const calls = [];
    let successDetail = null;
    let failureCount = 0;

    try {
        global.window.location = { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/' };
        storage.setItem(`zaylo-local-ip-${DEVICE}`, '192.168.1.44');
        MQTTClient._pollStepperLocalStatus = () => {};
        MQTTClient._notifyLocalControlSuccess = detail => { successDetail = detail; };
        MQTTClient._notifyLocalControlFailure = () => { failureCount++; };
        global.fetch = async (url, opts) => {
            calls.push({ url, body: opts && opts.body });
            if (String(url).includes('192.168.1.44')) {
                return {
                    ok: false,
                    status: 404,
                    clone() { return this; },
                    async json() { return { message: 'wrong host' }; },
                    async text() { return 'wrong host'; }
                };
            }
            return {
                ok: true,
                status: 200,
                clone() { return this; },
                async json() { return { position: 45, isCalibrated: true, localIp: '192.168.1.50' }; }
            };
        };

        MQTTClient.publishStepperControl(DEVICE, {
            blindPosition: 45,
            commandId: 'cmd-2',
            calibrationSession: 'cal-B2'
        });

        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => setTimeout(resolve, 0));

        assert.equal(calls.length, 2, 'stale cached IP must not prevent the mDNS fallback attempt');
        assert.ok(calls[0].url.includes('192.168.1.44'));
        assert.ok(calls[1].url.includes(`StepperMote-${DEVICE}.local`));
        assert.equal(JSON.parse(calls[1].body).calibrationSession, 'cal-B2');
        assert.equal(failureCount, 0, 'intermediate cached-IP failures should not surface if mDNS succeeds');
        assert.equal(successDetail && successDetail.deviceId, DEVICE);
        assert.equal(MQTTClient.pendingMessages.size, 0, 'successful local execution must remove the queued MQTT replay');
    } finally {
        global.fetch = originalFetch;
        MQTTClient._pollStepperLocalStatus = originalPoll;
        MQTTClient._notifyLocalControlSuccess = originalSuccess;
        MQTTClient._notifyLocalControlFailure = originalFailure;
        global.window.location = originalLocation;
    }
});

test('local HTTP fallback is disabled on HTTPS pages — mixed content can never succeed (C4)', () => {
    const original = global.window.location;
    try {
        global.window.location = { protocol: 'https:' };
        assert.equal(MQTTClient._localHttpBlocked(), true);
        global.window.location = { protocol: 'http:' };
        assert.equal(MQTTClient._localHttpBlocked(), false);
    } finally {
        global.window.location = original;
    }
});
