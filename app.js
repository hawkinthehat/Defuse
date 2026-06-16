/**
 * DEFUSE — global viewport shell for protocol modules.
 * Home triage is locked to three primary routes: CRE, OBD, PRCB.
 */

const PROTOCOL_INTRO_MS = 1500;
const GLOBAL_BINAURAL_CONFIG = {
    leftHz: 200,
    rightHz: 206,
    gain: 0.05,
    clearFilterHz: 20000,
    muffledFilterHz: 90
};

/** Frequency presets for onboarding opt-in sub-selection. */
const FREQUENCY_PRESETS = {
    'theta-6': { leftHz: 200, rightHz: 206, label: 'Theta Differential Engine (6Hz Deep Relaxation Baseline)' },
    'alpha-10': { leftHz: 200, rightHz: 210, label: 'Alpha Entrainment (10Hz Baseline)' },
    none: { leftHz: 200, rightHz: 200, label: 'Opt Out — No Binaural Frequency Layer', gain: 0 }
};

let onboardingAudioEnabled = true;
let onboardingFrequencyKey = 'theta-6';

const globalBinauralState = {
    audioContext: null,
    leftOscillator: null,
    rightOscillator: null,
    masterGain: null,
    lowPassFilter: null,
    merger: null,
    started: false,
    unlocked: false
};

/**
 * Pre-session splash: PROTOCOL ENGAGED: [NAME]. FOCUS ON THE [RHYTHM TYPE] RHYTHM.
 */
const PROTOCOL_ENGAGE = {
    obd: { name: 'OBD', rhythm: 'HAPTIC AND VISUAL' },
    cre: { name: 'CRE', rhythm: 'HAPTIC AND VISUAL' },
    sam: { name: 'SAM', rhythm: 'VISUAL AND HAPTIC' },
    iec: { name: 'IEC', rhythm: 'VISUAL' },
    prcb: { name: 'PRCB', rhythm: 'HIGH-CONTRAST VISUAL' }
};

const PROTOCOL_ROUTES = {
    cre: { name: 'CRE', path: 'protocols/cre/' },
    obd: { name: 'OBD', path: 'protocols/obd/' },
    sam: { name: 'SAM', path: 'protocols/sam/' },
    iec: { name: 'IEC', path: 'protocols/iec/' },
    prcb: { name: 'PRCB', path: 'protocols/prcb/' }
};

/** Locked 3-button home triage — no alternate entry points. */
const DEFUSE_PRIMARY_TRIAGE = Object.freeze(['cre', 'obd', 'prcb']);

let protocolIntroTimeoutId = 0;
let masterInitializationInited = false;
let dashboardPrimaryInited = false;

function applyFrequencyPreset(presetKey) {
    const preset = FREQUENCY_PRESETS[presetKey] || FREQUENCY_PRESETS['theta-6'];
    GLOBAL_BINAURAL_CONFIG.leftHz = preset.leftHz;
    GLOBAL_BINAURAL_CONFIG.rightHz = preset.rightHz;

    const { leftOscillator, rightOscillator, audioContext } = globalBinauralState;
    if (!audioContext || !leftOscillator || !rightOscillator) return;

    try {
        const now = audioContext.currentTime;
        leftOscillator.frequency.setTargetAtTime(preset.leftHz, now, 0.04);
        rightOscillator.frequency.setTargetAtTime(preset.rightHz, now, 0.04);
    } catch {
        leftOscillator.frequency.value = preset.leftHz;
        rightOscillator.frequency.value = preset.rightHz;
    }
}

function getOnboardingAudioGain() {
    if (!onboardingAudioEnabled) return 0;
    const preset = FREQUENCY_PRESETS[onboardingFrequencyKey];
    if (preset && Object.prototype.hasOwnProperty.call(preset, 'gain')) return preset.gain;
    return GLOBAL_BINAURAL_CONFIG.gain;
}

function promptEmergencyDial() {
    const choice = window.confirm(
        'EMERGENCY CRISIS SUPPORT\n\nTap OK to dial 988 (Suicide & Crisis Lifeline).\nTap Cancel to dial 911 instead.'
    );
    const number = choice ? '988' : '911';
    window.location.href = `tel:${number}`;
}

function ensureEmergencyBypassFooter() {
    const footer = document.getElementById('emergency-bypass-footer');
    if (!footer) return;

    footer.classList.remove('hidden');
    footer.removeAttribute('aria-hidden');
    footer.style.removeProperty('display');
    footer.style.removeProperty('visibility');
    footer.style.removeProperty('opacity');
    footer.style.removeProperty('pointer-events');

    footer.querySelectorAll('[data-emergency-dial]').forEach((el) => {
        el.classList.remove('hidden', 'iec-exit-locked');
        el.removeAttribute('disabled');
        el.removeAttribute('aria-hidden');
        el.style.removeProperty('pointer-events');
        el.style.removeProperty('opacity');
    });
}

let emergencyExitLinksInited = false;

function initEmergencyExitLinks() {
    if (emergencyExitLinksInited) return;
    emergencyExitLinksInited = true;

    document.addEventListener(
        'click',
        (event) => {
            const trigger = event.target.closest('[data-emergency-dial]');
            if (!trigger) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            promptEmergencyDial();
        },
        true
    );

    ensureEmergencyBypassFooter();
    window.setInterval(ensureEmergencyBypassFooter, 1000);
}

function syncOnboardingFrequencyPanel() {
    const audioToggle = document.getElementById('onboarding-audio-toggle');
    const frequencySelect = document.getElementById('onboarding-frequency-select');
    if (!frequencySelect) return;

    const audioOn = audioToggle ? audioToggle.checked : true;
    frequencySelect.disabled = !audioOn;
    frequencySelect.setAttribute('aria-disabled', audioOn ? 'false' : 'true');
}

function getGlobalBinauralAudioContext() {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    if (!globalBinauralState.audioContext || globalBinauralState.audioContext.state === 'closed') {
        try {
            globalBinauralState.audioContext = new Ctx();
            globalBinauralState.started = false;
            globalBinauralState.unlocked = false;
        } catch {
            globalBinauralState.audioContext = null;
        }
    }

    return globalBinauralState.audioContext;
}

function initializeGlobalBinauralEngine() {
    const audioContext = getGlobalBinauralAudioContext();
    if (!audioContext) return false;
    if (globalBinauralState.started) return true;

    try {
        const leftOscillator = audioContext.createOscillator();
        const rightOscillator = audioContext.createOscillator();
        const leftGain = audioContext.createGain();
        const rightGain = audioContext.createGain();
        const merger = audioContext.createChannelMerger(2);
        const masterGain = audioContext.createGain();
        const lowPassFilter = audioContext.createBiquadFilter();

        leftOscillator.type = 'sine';
        rightOscillator.type = 'sine';
        leftOscillator.frequency.value = GLOBAL_BINAURAL_CONFIG.leftHz;
        rightOscillator.frequency.value = GLOBAL_BINAURAL_CONFIG.rightHz;
        leftGain.gain.value = 1;
        rightGain.gain.value = 1;
        masterGain.gain.value = 0;
        lowPassFilter.type = 'lowpass';
        lowPassFilter.frequency.value = GLOBAL_BINAURAL_CONFIG.clearFilterHz;
        lowPassFilter.Q.value = 0.7;

        leftOscillator.connect(leftGain);
        rightOscillator.connect(rightGain);
        leftGain.connect(merger, 0, 0);
        rightGain.connect(merger, 0, 1);
        merger.connect(masterGain);
        masterGain.connect(lowPassFilter);
        lowPassFilter.connect(audioContext.destination);

        const now = audioContext.currentTime;
        leftOscillator.start(now);
        rightOscillator.start(now);

        globalBinauralState.leftOscillator = leftOscillator;
        globalBinauralState.rightOscillator = rightOscillator;
        globalBinauralState.masterGain = masterGain;
        globalBinauralState.lowPassFilter = lowPassFilter;
        globalBinauralState.merger = merger;
        globalBinauralState.started = true;
        return true;
    } catch {
        globalBinauralState.started = false;
        return false;
    }
}

function setGlobalBinauralGain(value) {
    const { audioContext, masterGain } = globalBinauralState;
    if (!audioContext || !masterGain) return;

    try {
        masterGain.gain.cancelScheduledValues(audioContext.currentTime);
        masterGain.gain.setTargetAtTime(value, audioContext.currentTime, 0.03);
    } catch {
        masterGain.gain.value = value;
    }
}

function setGlobalBinauralLowPass(frequencyHz) {
    const { audioContext, lowPassFilter } = globalBinauralState;
    if (!audioContext || !lowPassFilter) return;

    const nextHz = Math.max(40, Math.min(22000, Number(frequencyHz) || GLOBAL_BINAURAL_CONFIG.clearFilterHz));
    try {
        lowPassFilter.frequency.cancelScheduledValues(audioContext.currentTime);
        lowPassFilter.frequency.setTargetAtTime(nextHz, audioContext.currentTime, 0.018);
    } catch {
        lowPassFilter.frequency.value = nextHz;
    }
}

function resetGlobalBinauralFilter() {
    setGlobalBinauralLowPass(GLOBAL_BINAURAL_CONFIG.clearFilterHz);
}

function resumeGlobalBinauralEngine(targetGain) {
    if (!initializeGlobalBinauralEngine()) return Promise.resolve(false);

    const gain = typeof targetGain === 'number' ? targetGain : GLOBAL_BINAURAL_CONFIG.gain;
    const audioContext = globalBinauralState.audioContext;
    if (!audioContext || audioContext.state !== 'suspended') {
        globalBinauralState.unlocked = !!audioContext;
        if (globalBinauralState.unlocked && gain > 0) setGlobalBinauralGain(gain);
        return Promise.resolve(!!audioContext && gain > 0);
    }

    return audioContext
        .resume()
        .then(() => {
            globalBinauralState.unlocked = true;
            if (gain > 0) setGlobalBinauralGain(gain);
            return gain > 0;
        })
        .catch(() => false);
}

function readOnboardingAudioPreferences() {
    const audioToggle = document.getElementById('onboarding-audio-toggle');
    const frequencySelect = document.getElementById('onboarding-frequency-select');

    onboardingAudioEnabled = audioToggle ? audioToggle.checked : false;
    onboardingFrequencyKey = frequencySelect ? frequencySelect.value : 'theta-6';

    const preset = FREQUENCY_PRESETS[onboardingFrequencyKey] || FREQUENCY_PRESETS['theta-6'];
    GLOBAL_BINAURAL_CONFIG.leftHz = preset.leftHz;
    GLOBAL_BINAURAL_CONFIG.rightHz = preset.rightHz;
}

function startOnboardingBinauralIfEnabled() {
    if (!onboardingAudioEnabled) return Promise.resolve(false);

    initializeGlobalBinauralEngine();
    applyFrequencyPreset(onboardingFrequencyKey);
    return resumeGlobalBinauralEngine(getOnboardingAudioGain());
}

function initializationHapticTap() {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
        navigator.vibrate(40);
    } catch {
        /* ignore */
    }
}

function selectionTapHaptic() {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
        navigator.vibrate(14);
    } catch {
        /* ignore */
    }
}

function cancelProtocolIntro() {
    if (protocolIntroTimeoutId) {
        clearTimeout(protocolIntroTimeoutId);
        protocolIntroTimeoutId = 0;
    }
    const overlay = document.getElementById('protocol-intro-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
    }
}

function showProtocolPending(protocolKey) {
    const route = PROTOCOL_ROUTES[protocolKey];
    const name = route ? route.name : String(protocolKey || '').toUpperCase();
    const path = route ? route.path : 'protocols/';

    if (typeof showProtocolViewport === 'function') {
        showProtocolViewport();
    }

    const inst = document.getElementById('inst');
    if (inst) inst.textContent = `${name} · PROTOCOL ROUTE READY`;

    const stage = document.getElementById('protocol-stage');
    if (!stage) return;
    stage.innerHTML = `
        <div class="protocol-pending-root">
            <p class="protocol-pending-kicker">${name}</p>
            <p class="protocol-pending-line">Protocol route linked to <span>${path}</span>.</p>
            <p class="protocol-pending-sub">The dashboard entry is ready for the ${name} module launcher when this protocol subfolder is installed.</p>
            <button type="button" class="protocol-pending-done" id="protocol-pending-done">RETURN TO DASHBOARD</button>
        </div>
    `;
    document.getElementById('protocol-pending-done')?.addEventListener('click', () => exitProtocol());
}

function runProtocol(protocolKey) {
    const runners = {
        obd: () => (typeof launchOBD === 'function' ? launchOBD() : showProtocolPending('obd')),
        cre: () => (typeof launchCRE === 'function' ? launchCRE() : showProtocolPending('cre')),
        sam: () => (typeof launchSAM === 'function' ? launchSAM() : showProtocolPending('sam')),
        iec: () => (typeof launchIEC === 'function' ? launchIEC() : showProtocolPending('iec')),
        prcb: () => (typeof launchPRCB === 'function' ? launchPRCB() : showProtocolPending('prcb'))
    };
    const fn = runners[protocolKey];
    if (fn) fn();
}

function launchWithIntro(protocolKey) {
    cancelProtocolIntro();

    const meta = PROTOCOL_ENGAGE[protocolKey];
    const overlay = document.getElementById('protocol-intro-overlay');
    const body = document.getElementById('protocol-intro-body');
    if (!meta || !overlay || !body) {
        runProtocol(protocolKey);
        return;
    }

    const line = `PROTOCOL ENGAGED: ${meta.name}. FOCUS ON THE ${meta.rhythm} RHYTHM.`;
    body.textContent = line;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');

    protocolIntroTimeoutId = window.setTimeout(() => {
        protocolIntroTimeoutId = 0;
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
        runProtocol(protocolKey);
    }, PROTOCOL_INTRO_MS);
    ensureEmergencyBypassFooter();
}

function launchCRESession() {
    cancelProtocolIntro();
    if (typeof launchCRE === 'function') launchCRE();
}

function launchPRCBSession() {
    cancelProtocolIntro();
    if (typeof launchPRCB === 'function') launchPRCB();
}

const DIRECT_SESSION_LAUNCHERS = {
    cre: launchCRESession,
    prcb: launchPRCBSession
};

const INTRO_SESSION_KEYS = {
    obd: 'obd',
    sam: 'sam',
    iec: 'iec'
};

function onPrimarySymptom(symptom) {
    if (!DEFUSE_PRIMARY_TRIAGE.includes(symptom)) return;
    selectionTapHaptic();
    const direct = DIRECT_SESSION_LAUNCHERS[symptom];
    if (direct) {
        direct();
        return;
    }
    const introKey = INTRO_SESSION_KEYS[symptom];
    if (introKey) {
        launchWithIntro(introKey);
    }
}

function revealDashboardFromMasterInit() {
    const overlay = document.getElementById('master-init-overlay');
    const dash = document.getElementById('dashboard');

    if (overlay) {
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
    }
    if (dash) {
        dash.classList.remove('hidden');
        dash.setAttribute('aria-hidden', 'false');
    }
}

function initMasterInitializationOverlay() {
    if (masterInitializationInited) return;
    masterInitializationInited = true;

    const overlay = document.getElementById('master-init-overlay');
    const btn = document.getElementById('master-init-btn');
    const dash = document.getElementById('dashboard');
    const audioToggle = document.getElementById('onboarding-audio-toggle');
    const frequencySelect = document.getElementById('onboarding-frequency-select');

    if (!overlay || !btn) {
        if (dash) {
            dash.classList.remove('hidden');
            dash.setAttribute('aria-hidden', 'false');
        }
        return;
    }

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    if (dash) {
        dash.classList.add('hidden');
        dash.setAttribute('aria-hidden', 'true');
    }

    syncOnboardingFrequencyPanel();
    audioToggle?.addEventListener('change', syncOnboardingFrequencyPanel);
    frequencySelect?.addEventListener('change', () => {
        onboardingFrequencyKey = frequencySelect.value;
    });

    btn.addEventListener('click', () => {
        btn.disabled = true;
        initializationHapticTap();
        readOnboardingAudioPreferences();
        startOnboardingBinauralIfEnabled().finally(() => {
            revealDashboardFromMasterInit();
        });
    });
}

function initDashboardPrimary() {
    if (dashboardPrimaryInited) return;
    dashboardPrimaryInited = true;

    document.querySelectorAll('.symptom-tile[data-symptom]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const s = btn.getAttribute('data-symptom');
            if (s) onPrimarySymptom(s);
        });
    });
}

function showProtocolViewport() {
    const vp = document.getElementById('viewport');
    if (!vp) return;
    vp.classList.remove('hidden');
    vp.setAttribute('aria-hidden', 'false');
    vp.style.removeProperty('display');
    ensureEmergencyBypassFooter();
}

function openSession(message) {
    showProtocolViewport();
    const inst = document.getElementById('inst');
    if (inst) {
        inst.textContent = message;
        inst.removeAttribute('style');
    }
}

function exitProtocol() {
    cancelProtocolIntro();
    if (typeof stopOBD === 'function') {
        stopOBD();
    }
    if (typeof stopCRE === 'function') {
        stopCRE();
    }
    if (typeof stopSAM === 'function') {
        stopSAM();
    }
    if (typeof stopIEC === 'function') {
        stopIEC();
    }
    if (typeof stopPRCB === 'function') {
        stopPRCB();
    }
    const vp = document.getElementById('viewport');
    if (vp) {
        vp.classList.remove('viewport-obs', 'viewport-ics', 'viewport-sam', 'viewport-iec');
        vp.classList.add('hidden');
        vp.setAttribute('aria-hidden', 'true');
        vp.style.removeProperty('display');
    }
    const stage = document.getElementById('protocol-stage');
    if (stage) {
        stage.innerHTML = '';
        stage.removeAttribute('style');
    }
    const inst = document.getElementById('inst');
    if (inst) {
        inst.textContent = '';
        inst.removeAttribute('style');
    }
}

if (typeof window !== 'undefined') {
    window.GlobalBinauralEngine = {
        config: GLOBAL_BINAURAL_CONFIG,
        initialize: initializeGlobalBinauralEngine,
        resume: resumeGlobalBinauralEngine,
        setGain: setGlobalBinauralGain,
        setLowPassFrequency: setGlobalBinauralLowPass,
        resetFilter: resetGlobalBinauralFilter,
        get audioContext() {
            return globalBinauralState.audioContext;
        },
        get isActive() {
            return globalBinauralState.started && globalBinauralState.unlocked;
        }
    };
    window.ProtocolRoutes = PROTOCOL_ROUTES;
    window.launchWithIntro = launchWithIntro;
    window.exitProtocol = exitProtocol;
    window.openSession = openSession;
    window.showProtocolViewport = showProtocolViewport;
    window.promptEmergencyDial = promptEmergencyDial;
    window.ensureEmergencyBypassFooter = ensureEmergencyBypassFooter;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initMasterInitializationOverlay();
            initDashboardPrimary();
            initEmergencyExitLinks();
        });
    } else {
        initMasterInitializationOverlay();
        initDashboardPrimary();
        initEmergencyExitLinks();
    }
}
