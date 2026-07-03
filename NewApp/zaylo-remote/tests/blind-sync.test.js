'use strict';

/**
 * BlindCommandQueue / BlindSync behaviour: offline queueing, stale-command
 * expiry (H4 regression), ack & rejection handling (C1-class regression),
 * queue dedupe, and stop-command non-persistence.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { installBrowserStubs, loadScript } = require('./helpers/stubs');

const { storage } = installBrowserStubs();
loadScript('blind-sync.js');

const QUEUE_KEY = 'blind-command-queue-v2';
const DEVICE = 'A1B2C3';

function queue() {
    return JSON.parse(storage.getItem(QUEUE_KEY) || '[]');
}

function savedState() {
    return JSON.parse(storage.getItem(`blind-state-${DEVICE}`) || '{}');
}

test.beforeEach(() => {
    storage.clear();
    delete globalThis.MQTTClient;
});

test('position command sent while offline is queued durably', () => {
    const result = BlindCommandQueue.sendPosition(DEVICE, 40, { source: 'test' });
    assert.equal(result.sent, false);
    assert.equal(result.queued, true);
    assert.ok(result.commandId);

    const q = queue();
    assert.equal(q.length, 1);
    assert.equal(q[0].deviceId, DEVICE);
    assert.equal(q[0].kind, 'position');
    assert.equal(q[0].target, 40);

    const saved = savedState();
    assert.equal(saved.pendingTargetPosition, 40);
    assert.equal(saved.lastCommandStatus, 'queued');
});

test('offline position commands expire after 5 minutes, not hours (H4)', () => {
    BlindCommandQueue.sendPosition(DEVICE, 75, { source: 'test' });
    const item = queue()[0];
    const ttl = item.expiresAt - item.createdAt;
    assert.ok(ttl > 0 && ttl <= 5 * 60 * 1000,
        'POSITION_EXPIRY_MS must stay a short window — a 12h window let stale taps move blinds at night');
});

test('expired queued commands are dropped as "expired" and never published', () => {
    BlindCommandQueue.sendPosition(DEVICE, 60, { source: 'test' });
    const q = queue();
    q[0].expiresAt = Date.now() - 1000; // simulate the outage lasting past the window
    storage.setItem(QUEUE_KEY, JSON.stringify(q));

    let published = 0;
    globalThis.MQTTClient = {
        connected: true,
        publishStepperControl() { published++; return true; }
    };
    BlindCommandQueue.flush();

    assert.equal(published, 0, 'an expired command must NEVER reach the device');
    assert.equal(queue().length, 0);
    const saved = savedState();
    assert.equal(saved.lastCommandStatus, 'rejected');
    assert.equal(saved.lastCommandRejectReason, 'expired');
});

test('fresh queued commands are published on flush and await their ack', () => {
    BlindCommandQueue.sendPosition(DEVICE, 30, { source: 'test' });
    const calls = [];
    globalThis.MQTTClient = {
        connected: true,
        publishStepperControl(id, payload) { calls.push({ id, payload }); return true; }
    };
    BlindCommandQueue.flush();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, DEVICE);
    assert.equal(calls[0].payload.blindPosition, 30);
    // Position commands stay queued (attempts counted) until the device acks.
    const q = queue();
    assert.equal(q.length, 1);
    assert.equal(q[0].attempts, 1);
});

test('device ack by commandId clears the queued command', () => {
    const result = BlindCommandQueue.sendPosition(DEVICE, 55, { source: 'test' });
    assert.equal(queue().length, 1);

    BlindCommandQueue.handleState(DEVICE, { lastCommandId: result.commandId, lastCommandResult: 'accepted' });
    assert.equal(queue().length, 0);
});

test('blind physically reaching the target confirms and clears the pending state', () => {
    BlindCommandQueue.sendPosition(DEVICE, 80, { source: 'test' });
    BlindCommandQueue.handleState(DEVICE, { position: 81, isMoving: false });

    const saved = savedState();
    assert.equal(saved.pendingTargetPosition, undefined);
    assert.equal(saved.lastCommandStatus, 'confirmed');
    assert.equal(queue().length, 0);
});

test('stale rejection telemetry (already-handled seq) is NOT re-handled — C1 class', () => {
    // Firmware echoes lastCommandRejected/-Seq in EVERY state publish for the
    // rest of its boot. Only a HIGHER seq is a fresh rejection.
    const key = `blind-state-${DEVICE}`;
    storage.setItem(key, JSON.stringify({ _handledRejectSeq: 5, lastCommandStatus: 'confirmed' }));

    BlindCommandQueue.handleState(DEVICE, {
        lastCommandRejected: 'not_calibrated',
        lastCommandRejectedSeq: 5,
        position: 50
    });
    assert.equal(savedState().lastCommandStatus, 'confirmed',
        'an old rejection echo must not flip the status back to rejected');

    BlindCommandQueue.handleState(DEVICE, {
        lastCommandRejected: 'not_calibrated',
        lastCommandRejectedSeq: 6,
        position: 50
    });
    const saved = savedState();
    assert.equal(saved.lastCommandStatus, 'rejected');
    assert.equal(saved._handledRejectSeq, 6);
});

test('a new rejection clears queued position commands (no doomed replays)', () => {
    BlindCommandQueue.sendPosition(DEVICE, 20, { source: 'test' });
    assert.equal(queue().length, 1);
    BlindCommandQueue.handleState(DEVICE, {
        lastCommandRejected: 'not_calibrated',
        lastCommandRejectedSeq: 1
    });
    assert.equal(queue().length, 0);
});

test('newest offline position wins — intermediate targets are not replayed', () => {
    BlindCommandQueue.sendPosition(DEVICE, 10, { source: 'test' });
    BlindCommandQueue.sendPosition(DEVICE, 90, { source: 'test' });
    const q = queue();
    assert.equal(q.length, 1, 'position commands for a device must dedupe to the latest');
    assert.equal(q[0].target, 90);
});

test('stop with persist:false is never queued for later replay', () => {
    const result = BlindCommandQueue.send(DEVICE, { command: 'stop' }, { persist: false });
    assert.equal(result.sent, false);
    assert.equal(result.queued, false, 'a stale stop minutes later is dangerous — must not persist');
    assert.equal(queue().length, 0);
});

test('stop cancels queued and pending position intent for the same blind', () => {
    BlindCommandQueue.sendPosition(DEVICE, 70, { source: 'test' });
    assert.equal(queue().length, 1);
    assert.equal(savedState().pendingTargetPosition, 70);

    const result = BlindCommandQueue.send(DEVICE, { command: 'stop' }, { persist: false });

    assert.equal(result.queued, false);
    assert.equal(queue().length, 0, 'a stopped blind must not replay the old target on reconnect');
    const saved = savedState();
    assert.equal(saved.pendingTargetPosition, undefined);
    assert.equal(saved.pendingCommandId, undefined);
    assert.equal(saved.lastCommandStatus, 'stopped');
});

test('emergency stop cancels sent-but-unacked position replay', () => {
    const calls = [];
    globalThis.MQTTClient = {
        connected: true,
        publishStepperControl(id, payload) { calls.push({ id, payload }); return true; }
    };

    BlindCommandQueue.sendPosition(DEVICE, 85, { source: 'test' });
    assert.equal(queue().length, 1, 'sent position remains queued until firmware ack');

    BlindCommandQueue.send(DEVICE, { command: 'emergencyStop' }, { persist: false });

    assert.equal(queue().length, 0, 'emergency stop must cancel pending replayed position targets');
    assert.equal(savedState().lastCommandStatus, 'emergency_stopped');
    assert.equal(calls.length, 2);
});

test('position verification telemetry blocks normal queued movement', () => {
    storage.setItem(`blind-state-${DEVICE}`, JSON.stringify({
        positionNeedsVerification: true,
        calibration: { confidence: 65, positionNeedsVerification: true }
    }));

    const result = BlindCommandQueue.sendPosition(DEVICE, 40, { source: 'test' });

    assert.equal(result.sent, false);
    assert.equal(result.queued, false);
    assert.equal(result.reason, 'position_verification_required');
    assert.equal(queue().length, 0);
    assert.equal(savedState().lastCommandStatus, 'rejected');
    assert.equal(savedState().lastCommandRejectReason, 'position_verification_required');
});

test('calibration-session position moves bypass verification queue gate', () => {
    storage.setItem(`blind-state-${DEVICE}`, JSON.stringify({
        positionNeedsVerification: true,
        calibration: { positionNeedsVerification: true }
    }));

    const result = BlindCommandQueue.send(DEVICE, {
        blindPosition: 40,
        calibrationSession: true
    }, { source: 'calibration-self-test' });

    assert.equal(result.sent, false);
    assert.equal(result.queued, true);
    assert.equal(queue().length, 1);
});

test('online position command with persist:false is not retained after publish', () => {
    const calls = [];
    globalThis.MQTTClient = {
        connected: true,
        publishStepperControl(id, payload) { calls.push({ id, payload }); return true; }
    };

    const result = BlindCommandQueue.send(DEVICE, { blindPosition: 45 }, {
        source: 'calibration-self-test',
        persist: false
    });

    assert.equal(result.sent, true);
    assert.equal(result.queued, false);
    assert.equal(calls.length, 1);
    assert.equal(queue().length, 0, 'calibration self-test moves must not remain in the durable replay queue');
});

test('position values are clamped to 0..100', () => {
    BlindCommandQueue.sendPosition(DEVICE, 250, { source: 'test' });
    assert.equal(queue()[0].target, 100);
    storage.clear();
    BlindCommandQueue.sendPosition(DEVICE, -40, { source: 'test' });
    assert.equal(queue()[0].target, 0);
    storage.clear();
    const bad = BlindCommandQueue.sendPosition(DEVICE, 'not-a-number');
    assert.equal(bad.sent, false);
    assert.equal(bad.queued, false);
});
