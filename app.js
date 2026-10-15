/**
 * dᶻix̌ʷ — trauma-informed youth shell.
 * Immediate home access, plain-language choices, voluntary exercises, offline-first.
 * Published by the Tribal Resilience Studio.
 */

const STUDIO_NAME = 'Š̌aqʷ x̌ax̌aʔ Studio';
const STUDIO_ATTRIBUTION = 'Š̌aqʷ x̌ax̌aʔ Studio';

/** Plain-language outcome labels for the home choice menu. */
const TRIAGE_RETRAIN_LABELS = Object.freeze({
    cre: { term: 'Help me settle', action: 'A short guided reset' },
    obd: { term: 'I need to move', action: 'Release some energy gently' },
    aed: { term: 'Help me focus', action: 'Ground in the present' },
    mif: { term: 'I need a quiet moment', action: 'Choose a low-stimulation option' }
});

const PROTOCOL_INTRO_MS = 900;
const GLOBAL_BINAURAL_CONFIG = {
    leftHz: 200,
    rightHz: 206,
    gain: 0.05,
    clearFilterHz: 20000,
    muffledFilterHz: 90
};

/** Soft optional sound presets — never framed as medical neuromodulation. */
const FREQUENCY_PRESETS = {
    soft: { leftHz: 200, rightHz: 206, label: 'Soft optional tone' },
    calm: { leftHz: 200, rightHz: 210, label: 'Calm optional tone' },
    none: { leftHz: 200, rightHz: 200, label: 'No tone', gain: 0 }
};

/** Audio is always optional and defaults OFF. */
let onboardingAudioEnabled = false;
let onboardingFrequencyKey = 'soft';

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

const PROTOCOL_ENGAGE = {
    obd: { name: 'I need to move', rhythm: 'gentle tracking', retrain: 'Release some energy gently' },
    cre: { name: 'Help me settle', rhythm: 'guided reset', retrain: 'A short guided reset' },
    mif: { name: 'Quiet moment', rhythm: 'soft touch', retrain: 'A low-stimulation option' },
    aed: { name: 'Help me focus', rhythm: 'present focus', retrain: 'Ground in the present' },
    sam: { name: 'SAM', rhythm: 'attention', retrain: 'Attention practice' },
    iec: { name: 'IEC', rhythm: 'visual', retrain: 'Visual practice' },
    prcb: { name: 'Stability practice', rhythm: 'high-contrast', retrain: 'Stability practice' }
};

const PROTOCOL_ROUTES = {
    cre: { name: 'Help me settle', path: 'protocols/cre/' },
    obd: { name: 'I need to move', path: 'protocols/obd/' },
    mif: { name: 'Quiet moment', path: 'protocols/mif/' },
    aed: { name: 'Help me focus', path: 'protocols/aed/' },
    sam: { name: 'SAM', path: 'protocols/sam/' },
    iec: { name: 'IEC', path: 'protocols/iec/' },
    prcb: { name: 'Stability', path: 'protocols/prcb/' }
};

/** Locked 4-button home triage — plain-language outcomes. */
const DZIXW_PRIMARY_TRIAGE = Object.freeze(['cre', 'obd', 'aed', 'mif']);

const TRIAGE_BUTTON_IDS = Object.freeze({
    'protocol-cre': 'cre',
    'protocol-obd': 'obd',
    'protocol-mif': 'mif',
    'protocol-aed': 'aed'
});

let protocolIntroTimeoutId = 0;
let dashboardPrimaryInited = false;
let checkInPending = false;

function applyFrequencyPreset(presetKey) {
    const preset = FREQUENCY_PRESETS[presetKey] || FREQUENCY_PRESETS.soft;
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
        'Need support right now?\n\nTap OK to dial 988 (Lifeline).\nTap Cancel to dial 911 instead.'
    );
    const number = choice ? '988' : '911';
    window.location.href = `tel:${number}`;
}

function setEmergencyFooterHomeMode(isHome) {
    const footer = document.getElementById('emergency-bypass-footer');
    if (!footer) return;
    footer.classList.toggle('home-footer', isHome);
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

function isDisclaimerRoute() {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    return (
        path.endsWith('/terms.html') ||
        path.endsWith('terms.html') ||
        path.endsWith('/legal.html') ||
        path.endsWith('legal.html')
    );
}

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

function muteGlobalBinauralEngine() {
    setGlobalBinauralGain(0);
}

function isOptionalSoundAvailable() {
    return onboardingFrequencyKey !== 'none';
}

function applyRuntimeAudioState(enabled) {
    if (!isOptionalSoundAvailable()) {
        onboardingAudioEnabled = false;
        muteGlobalBinauralEngine();
        return Promise.resolve(false);
    }

    onboardingAudioEnabled = Boolean(enabled);

    if (!onboardingAudioEnabled) {
        muteGlobalBinauralEngine();
        return Promise.resolve(true);
    }

    initializeGlobalBinauralEngine();
    applyFrequencyPreset(onboardingFrequencyKey);
    return resumeGlobalBinauralEngine(getOnboardingAudioGain());
}

/** @deprecated Alias kept for protocol compatibility — defaults remain OFF. */
function applyRuntimeThetaWaveState(enabled) {
    return applyRuntimeAudioState(enabled);
}

function isThetaFrequencyActive() {
    return isOptionalSoundAvailable();
}

function getAudioToggleEl() {
    return (
        document.getElementById('gameplay-audio-toggle') ||
        document.getElementById('gameplay-theta-toggle')
    );
}

function syncGameplayAudioToggleUI() {
    const toggle = getAudioToggleEl();
    if (!toggle) return;

    const active = onboardingAudioEnabled && isOptionalSoundAvailable();
    toggle.classList.toggle('gameplay-theta-toggle--on', active);
    toggle.classList.toggle('gameplay-audio-toggle--on', active);
    toggle.setAttribute('aria-pressed', active ? 'true' : 'false');
    toggle.setAttribute(
        'aria-label',
        active ? 'Sound on. Tap to turn off.' : 'Sound off. Tap to turn on.'
    );

    const stateEl = toggle.querySelector('.gameplay-theta-toggle-state');
    if (stateEl) stateEl.textContent = active ? 'ON' : 'OFF';
}

function showGameplayAudioToggle() {
    const toggle = getAudioToggleEl();
    if (!toggle) return;
    toggle.classList.remove('hidden');
    toggle.removeAttribute('aria-hidden');
    /* Always default OFF when entering a protocol view. */
    onboardingAudioEnabled = false;
    muteGlobalBinauralEngine();
    syncGameplayAudioToggleUI();
}

function hideGameplayAudioToggle() {
    const toggle = getAudioToggleEl();
    if (!toggle) return;
    toggle.classList.add('hidden');
    toggle.setAttribute('aria-hidden', 'true');
    onboardingAudioEnabled = false;
    muteGlobalBinauralEngine();
}

let gameplayAudioToggleInited = false;

function initGameplayAudioToggle() {
    if (gameplayAudioToggleInited) return;
    gameplayAudioToggleInited = true;

    const toggle = getAudioToggleEl();
    if (!toggle) return;

    toggle.addEventListener('click', () => {
        const active = onboardingAudioEnabled;
        applyRuntimeAudioState(!active);
        syncGameplayAudioToggleUI();
        selectionTapHaptic();
    });
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
    if (inst) inst.textContent = name;

    const stage = document.getElementById('protocol-stage');
    if (!stage) return;
    stage.innerHTML = `
        <div class="protocol-pending-root">
            <p class="protocol-pending-kicker">${name}</p>
            <p class="protocol-pending-line">This practice is linked to <span>${path}</span>.</p>
            <p class="protocol-pending-sub">You can go back anytime.</p>
            <button type="button" class="protocol-pending-done" id="protocol-pending-done">STOP &amp; BACK</button>
        </div>
    `;
    document.getElementById('protocol-pending-done')?.addEventListener('click', () => requestStopProtocol());
}

function runProtocol(protocolKey) {
    const runners = {
        obd: () => (typeof launchOBD === 'function' ? launchOBD() : showProtocolPending('obd')),
        cre: () => (typeof launchCRE === 'function' ? launchCRE() : showProtocolPending('cre')),
        mif: () => (typeof launchMIF === 'function' ? launchMIF() : showProtocolPending('mif')),
        aed: () => (typeof launchAED === 'function' ? launchAED() : showProtocolPending('aed')),
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

    body.textContent = `${meta.name}. ${meta.retrain}. You can stop anytime.`;
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

function loadProtocol(symptom) {
    if (!DZIXW_PRIMARY_TRIAGE.includes(symptom)) return;
    selectionTapHaptic();
    hideCheckInCard();
    runProtocol(symptom);
}

function initDashboardPrimary() {
    if (dashboardPrimaryInited) return;
    dashboardPrimaryInited = true;

    Object.entries(TRIAGE_BUTTON_IDS).forEach(([elementId, symptomKey]) => {
        const btn = document.getElementById(elementId);
        if (!btn) return;
        btn.addEventListener('click', () => loadProtocol(symptomKey));
    });
}

function revealDashboardImmediately() {
    const dash = document.getElementById('dashboard');
    if (dash) {
        dash.classList.remove('hidden');
        dash.setAttribute('aria-hidden', 'false');
    }
    const overlay = document.getElementById('master-init-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.remove();
    }
    setEmergencyFooterHomeMode(true);
}

function initStudioBrandHeader() {
    const header = document.getElementById('studio-brand-header');
    if (!header) return;

    header.textContent = STUDIO_ATTRIBUTION;
    header.setAttribute('aria-label', `Developer attribution — ${STUDIO_NAME}`);
}

function showProtocolViewport() {
    const vp = document.getElementById('viewport');
    if (!vp) return;
    document.documentElement.classList.add('protocol-viewport-active');
    vp.classList.remove('hidden');
    vp.setAttribute('aria-hidden', 'false');
    vp.style.removeProperty('display');
    const dash = document.getElementById('dashboard');
    if (dash) {
        dash.classList.add('hidden');
        dash.setAttribute('aria-hidden', 'true');
    }
    setEmergencyFooterHomeMode(false);
    ensureEmergencyBypassFooter();
    showGameplayAudioToggle();
}

function openSession(message) {
    showProtocolViewport();
    const inst = document.getElementById('inst');
    if (inst) {
        inst.textContent = message;
        inst.removeAttribute('style');
    }
}

function stopAllProtocols() {
    if (typeof stopOBD === 'function') stopOBD();
    if (typeof stopCRE === 'function') stopCRE();
    if (typeof stopSAM === 'function') stopSAM();
    if (typeof stopIEC === 'function') stopIEC();
    if (typeof stopPRCB === 'function') stopPRCB();
    if (typeof stopMIF === 'function') stopMIF();
    if (typeof stopAED === 'function') stopAED();
}

/**
 * Gentle non-judgmental check-in. Responses are NEVER written to localStorage
 * or transmitted to any remote endpoint.
 */
function showCheckInCard() {
    checkInPending = true;
    stopAllProtocols();
    muteGlobalBinauralEngine();
    onboardingAudioEnabled = false;
    syncGameplayAudioToggleUI();

    const overlay = document.getElementById('checkin-overlay');
    if (!overlay) {
        finishExitToHome();
        return;
    }

    const vp = document.getElementById('viewport');
    if (vp) {
        vp.classList.add('hidden');
        vp.setAttribute('aria-hidden', 'true');
    }

    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
}

function hideCheckInCard() {
    checkInPending = false;
    const overlay = document.getElementById('checkin-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
}

function finishExitToHome() {
    hideCheckInCard();
    cancelProtocolIntro();
    stopAllProtocols();
    muteGlobalBinauralEngine();
    onboardingAudioEnabled = false;
    document.documentElement.classList.remove('protocol-viewport-active');
    const vp = document.getElementById('viewport');
    if (vp) {
        vp.classList.remove('viewport-obs', 'viewport-ics', 'viewport-sam', 'viewport-iec', 'viewport-mif');
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
    hideGameplayAudioToggle();
    const dash = document.getElementById('dashboard');
    if (dash) {
        dash.classList.remove('hidden');
        dash.setAttribute('aria-hidden', 'false');
    }
    setEmergencyFooterHomeMode(true);
}

/**
 * STOP & BACK / natural finish — always offer check-in; never punish early exit.
 * Check-in answers are discarded (not persisted).
 */
function requestStopProtocol() {
    if (checkInPending) {
        finishExitToHome();
        return;
    }
    showCheckInCard();
}

function exitProtocol() {
    requestStopProtocol();
}

/**
 * Called by protocols when an exercise ends naturally (no failure framing).
 */
function completeProtocolGently() {
    requestStopProtocol();
}

function initCheckInChoices() {
    const overlay = document.getElementById('checkin-overlay');
    if (!overlay) return;

    overlay.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-checkin]');
        if (!btn) return;
        /* Intentionally discard — do not store or transmit check-in responses. */
        void btn.getAttribute('data-checkin');
        selectionTapHaptic();
        finishExitToHome();
    });
}

if (typeof window !== 'undefined') {
    window.StudioBrand = { name: STUDIO_NAME, attribution: STUDIO_ATTRIBUTION };
    window.TriageRetrainLabels = TRIAGE_RETRAIN_LABELS;
    window.GlobalBinauralEngine = {
        config: GLOBAL_BINAURAL_CONFIG,
        initialize: initializeGlobalBinauralEngine,
        resume: resumeGlobalBinauralEngine,
        setGain: setGlobalBinauralGain,
        mute: muteGlobalBinauralEngine,
        setEnabled: applyRuntimeAudioState,
        setLowPassFrequency: setGlobalBinauralLowPass,
        resetFilter: resetGlobalBinauralFilter,
        get audioContext() {
            return globalBinauralState.audioContext;
        },
        get isActive() {
            return globalBinauralState.started && globalBinauralState.unlocked && onboardingAudioEnabled;
        },
        get isThetaEnabled() {
            return onboardingAudioEnabled && isOptionalSoundAvailable();
        },
        get isSoundEnabled() {
            return onboardingAudioEnabled && isOptionalSoundAvailable();
        }
    };
    window.ProtocolRoutes = PROTOCOL_ROUTES;
    window.launchWithIntro = launchWithIntro;
    window.loadProtocol = loadProtocol;
    window.exitProtocol = exitProtocol;
    window.requestStopProtocol = requestStopProtocol;
    window.completeProtocolGently = completeProtocolGently;
    window.showCheckInCard = showCheckInCard;
    window.openSession = openSession;
    window.showProtocolViewport = showProtocolViewport;
    window.promptEmergencyDial = promptEmergencyDial;
    window.ensureEmergencyBypassFooter = ensureEmergencyBypassFooter;
    window.isDisclaimerRoute = isDisclaimerRoute;
}

if (typeof document !== 'undefined') {
    const boot = () => {
        revealDashboardImmediately();
        initDashboardPrimary();
        initStudioBrandHeader();
        initEmergencyExitLinks();
        initGameplayAudioToggle();
        initCheckInChoices();
        /* Ensure optional audio stays OFF on cold start. */
        onboardingAudioEnabled = false;
        muteGlobalBinauralEngine();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}
