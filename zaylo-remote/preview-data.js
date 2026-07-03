/*
 * Zaylo portfolio preview bootstrap.
 * This file makes the embedded app a safe, self-contained demo:
 * - no production Firebase project is required
 * - no real MQTT broker credentials are used
 * - devices and telemetry are seeded locally and shown online
 */
(function () {
    const DEMO_HOME_ID = 'demo-home';
    const DEMO_USER_ID = 'demo-user';
    const now = Date.now();

    window.ZAYLO_PREVIEW_MODE = true;
    window.ZAYLO_DEMO_USER = {
        uid: DEMO_USER_ID,
        email: 'demo@zaylo.local',
        displayName: 'Zaylo Demo'
    };

    try {
        sessionStorage.setItem('zaylo-demo-mode', 'true');
        sessionStorage.setItem('zaylo-session-active', 'true');
        localStorage.setItem('zaylo-activeHomeId', DEMO_HOME_ID);
        localStorage.setItem('zaylo-theme', localStorage.getItem('zaylo-theme') || 'dark');
        localStorage.setItem('zaylo-BrokerIP', 'demo-broker.local');
        localStorage.setItem('zaylo-BrokerPort', '443');
        localStorage.setItem('zaylo-BrokerPath', '/mqtt');
        localStorage.removeItem('zaylo-BrokerUser');
        localStorage.removeItem('zaylo-BrokerPass');
    } catch (e) { }

    try {
        if (/\/auth\.html$/i.test(window.location.pathname)) {
            window.location.replace('index.html');
        }
    } catch (e) { }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
            .then(regs => regs.forEach(reg => reg.unregister()))
            .catch(() => {});
    }

    try {
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: undefined
        });
    } catch (e) { }

    const devices = [
        { id: 'A1B2C3', name: 'Kitchen Presence Switch', type: 'lumibot', addedAt: now - 700000 },
        { id: 'B2C3D4', name: 'Studio Desk Switch', type: 'lumibot', addedAt: now - 650000 },
        { id: 'F6A1B2', name: 'Hallway Night Switch', type: 'lumibot', addedAt: now - 600000 },
        { id: 'C3D4E5', name: 'Bedroom Blackout Blind', type: 'blind', addedAt: now - 550000 },
        { id: 'D4E5F6', name: 'Living Room Sheer Blind', type: 'blind', addedAt: now - 500000 },
        { id: 'E5F6A1', name: 'Studio Skylight Blind', type: 'stepper', addedAt: now - 450000 }
    ];

    const switchConfig = {
        alarmEnabled: true,
        alarmHour: 7,
        alarmMin: 15,
        dayIdleEnabled: true,
        motionEnabled: true,
        twtEnabled: true,
        presenceDisplayTimeout: 45,
        motionTimeout: 180,
        manualTimeout: 900,
        radarHoldSensitivity: 82,
        angleOff: 18,
        angleOn: 154,
        servoSpeed: 65,
        sleepTargetDuration: 480,
        sleepTargetBedtimeHour: 23,
        sleepTargetBedtimeMin: 0
    };

    const verifiedBlindTelemetry = () => ({
        positionConfidence: 98,
        positionNeedsVerification: false,
        calibration: {
            topSaved: true,
            bottomSaved: true,
            travelSteps: 12800,
            confidence: 98,
            positionNeedsVerification: false,
            powerLossDuringMove: false
        }
    });

    const states = {
        A1B2C3: {
            _online: true,
            light: true,
            state: 'ON',
            mode: 0,
            motion: true,
            still: true,
            rssi: -43,
            heap: 186420,
            uptime: 86420,
            firmware: '2.4.1-demo',
            motionTimer: 126,
            timerRemaining: 0,
            temp: 21.8,
            humidity: 46,
            config: { ...switchConfig, alarmHour: 6, alarmMin: 45 }
        },
        B2C3D4: {
            _online: true,
            light: false,
            state: 'OFF',
            mode: 1,
            motion: false,
            still: false,
            rssi: -51,
            heap: 174920,
            uptime: 43210,
            firmware: '2.4.1-demo',
            motionTimer: 0,
            timerRemaining: 0,
            config: { ...switchConfig, alarmEnabled: false, angleOff: 12, angleOn: 168 }
        },
        F6A1B2: {
            _online: true,
            light: true,
            state: 'ON',
            mode: 3,
            motion: false,
            still: true,
            isSleeping: true,
            sleepStart: now - (7.4 * 60 * 60 * 1000),
            sleepHistory: [
                { start: now - (31 * 60 * 60 * 1000), end: now - (23.2 * 60 * 60 * 1000) },
                { start: now - (55 * 60 * 60 * 1000), end: now - (47.5 * 60 * 60 * 1000) },
                { start: now - (79 * 60 * 60 * 1000), end: now - (71.1 * 60 * 60 * 1000) }
            ],
            rssi: -48,
            heap: 181000,
            uptime: 120300,
            firmware: '2.4.1-demo',
            config: { ...switchConfig, alarmHour: 7, alarmMin: 30 }
        },
        C3D4E5: {
            _online: true,
            position: 72,
            blindPosition: 72,
            targetPosition: 72,
            isMoving: false,
            isCalibrated: true,
            ...verifiedBlindTelemetry(),
            blindType: 'roller',
            linkedDeviceId: 'A1B2C3',
            rssi: -46,
            firmware: 'slide-1.8.0-demo',
            config: {
                blindType: 'roller',
                twtEnabled: true,
                stepperOpenSpeed: 2200,
                stepperCloseSpeed: 2050,
                stepperAcceleration: 1800,
                stepperStopDelay: 3,
                sunsetTarget: 0,
                sunsetOffset: 15,
                morningTime: '07:10',
                morningTarget: 100,
                morningDuration: 35,
                nightTime: '22:30',
                nightTarget: 0,
                tempThreshold: 27,
                tempTarget: 25,
                presenceTimeout: 8,
                presenceTarget: 0
            },
            rules: { sunset: true, morningOpen: true, nightLock: true, presence: true, temperature: true }
        },
        D4E5F6: {
            _online: true,
            position: 38,
            blindPosition: 38,
            targetPosition: 38,
            isMoving: false,
            isCalibrated: true,
            ...verifiedBlindTelemetry(),
            blindType: 'zebra',
            linkedDeviceId: 'B2C3D4',
            rssi: -54,
            firmware: 'slide-1.8.0-demo',
            config: {
                blindType: 'zebra',
                twtEnabled: true,
                stepperOpenSpeed: 1900,
                stepperCloseSpeed: 1900,
                stepperAcceleration: 1600,
                sunsetTarget: 20,
                sunsetOffset: -5,
                morningTime: '08:00',
                morningTarget: 65,
                nightTime: '23:00',
                nightTarget: 0,
                tempThreshold: 29,
                tempTarget: 35,
                presenceTimeout: 12,
                presenceTarget: 15
            },
            rules: { sunset: true, morningOpen: true, nightLock: false, presence: true, temperature: false }
        },
        E5F6A1: {
            _online: true,
            position: 100,
            blindPosition: 100,
            targetPosition: 100,
            isMoving: false,
            isCalibrated: true,
            ...verifiedBlindTelemetry(),
            blindType: 'vertical',
            linkedDeviceId: 'A1B2C3',
            rssi: -49,
            firmware: 'slide-1.8.0-demo',
            config: {
                blindType: 'vertical',
                twtEnabled: false,
                stepperOpenSpeed: 2100,
                stepperCloseSpeed: 2000,
                stepperAcceleration: 1700,
                sunsetTarget: 10,
                sunsetOffset: 10,
                morningTime: '06:50',
                morningTarget: 100,
                nightTime: '22:15',
                nightTarget: 0,
                tempThreshold: 28,
                tempTarget: 30,
                presenceTimeout: 10,
                presenceTarget: 0
            },
            rules: { sunset: true, morningOpen: true, nightLock: true, presence: false, temperature: true }
        }
    };

    const blindState = (id, type, rules, config) => {
        const verified = verifiedBlindTelemetry();
        return {
            blindType: type,
            position: states[id].position,
            blindPosition: states[id].blindPosition,
            targetPosition: states[id].targetPosition,
            isMoving: states[id].isMoving,
            isCalibrated: true,
            isOpen: states[id].position > 0,
            linkedDeviceId: states[id].linkedDeviceId,
            positionConfidence: verified.positionConfidence,
            positionNeedsVerification: verified.positionNeedsVerification,
            rules,
            config,
            calibration: verified.calibration,
            lastSeen: now
        };
    };

    const scenes = [
        { id: 'scene-morning', name: 'Good Morning', icon: 'sunrise', scope: 'all', deviceIds: [], target: 100 },
        { id: 'scene-movie', name: 'Movie Time', icon: 'film', scope: 'devices', deviceIds: ['C3D4E5', 'D4E5F6'], target: 12 },
        { id: 'scene-daylight', name: 'Balanced Daylight', icon: 'sun', scope: 'all', deviceIds: [], target: 55 },
        { id: 'scene-night', name: 'Good Night', icon: 'moon', scope: 'all', deviceIds: [], target: 0 }
    ];

    const groups = [
        { id: 'group-bedroom', name: 'Bedroom Suite', deviceIds: ['C3D4E5', 'E5F6A1'] },
        { id: 'group-living', name: 'Living Spaces', deviceIds: ['D4E5F6'] }
    ];

    const automations = [
        { id: 'auto-sunset', enabled: true, type: 'sunset', name: 'Sunset Privacy', cfg: { offset: 15, target: 0 }, groupId: null, deviceIds: ['C3D4E5', 'D4E5F6', 'E5F6A1'] },
        { id: 'auto-morning', enabled: true, type: 'morning', name: 'Gentle Wake', cfg: { time: '07:10', days: [true, true, true, true, true, true, true], target: 100, duration: 35 }, groupId: 'group-bedroom', deviceIds: ['C3D4E5', 'E5F6A1'] },
        { id: 'auto-heat', enabled: true, type: 'temperature', name: 'Heat Shield', cfg: { threshold: 28, target: 30 }, groupId: null, deviceIds: ['C3D4E5', 'D4E5F6', 'E5F6A1'] },
        { id: 'auto-night', enabled: true, type: 'night', name: 'Night Lock', cfg: { time: '22:30', days: [true, true, true, true, true, true, true], target: 0 }, groupId: null, deviceIds: ['C3D4E5', 'E5F6A1'] }
    ];

    try {
        localStorage.setItem(`zaylo-devices-${DEMO_HOME_ID}`, JSON.stringify(devices));
        localStorage.setItem('zaylo-devices-temp', JSON.stringify(devices));
        localStorage.setItem('zaylo-deviceOrder', JSON.stringify(devices.map(d => d.id)));
        sessionStorage.setItem('zaylo-state-store', JSON.stringify(states));
        localStorage.setItem(`blind-state-C3D4E5`, JSON.stringify(blindState('C3D4E5', 'roller', states.C3D4E5.rules, states.C3D4E5.config)));
        localStorage.setItem(`blind-state-D4E5F6`, JSON.stringify(blindState('D4E5F6', 'zebra', states.D4E5F6.rules, states.D4E5F6.config)));
        localStorage.setItem(`blind-state-E5F6A1`, JSON.stringify(blindState('E5F6A1', 'vertical', states.E5F6A1.rules, states.E5F6A1.config)));
        localStorage.setItem(`zaylo-scenes-${DEMO_HOME_ID}`, JSON.stringify(scenes));
        localStorage.setItem(`zaylo-groups-${DEMO_HOME_ID}`, JSON.stringify(groups));
        localStorage.setItem(`zaylo-automations-${DEMO_HOME_ID}`, JSON.stringify(automations));
        localStorage.setItem(`zaylo-spaces-seed-${DEMO_HOME_ID}`, '1');
        localStorage.setItem('zaylo-LocationCity', 'London');
        localStorage.setItem('zaylo-LocationLat', '51.5072');
        localStorage.setItem('zaylo-LocationLon', '-0.1276');
        localStorage.setItem('zaylo-Latitude', '51.5072');
        localStorage.setItem('zaylo-Longitude', '-0.1276');
    } catch (e) { }
})();
