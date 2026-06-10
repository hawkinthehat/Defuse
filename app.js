/**
 * Global viewport shell for protocol modules. Loaded before protocol scripts.
 */

const PROTOCOL_INTRO_MS = 1500;
const GLOBAL_BINAURAL_CONFIG = {
    leftHz: 200,
    rightHz: 206,
    gain: 0.05,
    clearFilterHz: 20000,
    muffledFilterHz: 90
};

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
 * rhythm = words inserted before final " RHYTHM." (e.g. VISUAL, HAPTIC AND VISUAL).
 */
const PROTOCOL_ENGAGE = {
    cpi: { name: 'CPI', rhythm: 'VISUAL' },
    cas: { name: 'CAS', rhythm: 'VISUAL' },
    obd: { name: 'OBD', rhythm: 'HAPTIC AND VISUAL' },
    ccd: { name: 'CCD', rhythm: 'VISUAL' },
    obs: { name: 'OBS', rhythm: 'VISUAL' },
    abm: { name: 'ABM', rhythm: 'HAPTIC AND VISUAL' },
    ics: { name: 'ICS', rhythm: 'RESPIRATORY VISUAL' },
    sam: { name: 'SAM', rhythm: 'HAPTIC' },
    iec: { name: 'IEC', rhythm: 'VISUAL AND HAPTIC' },
    kcb: { name: 'KCB', rhythm: 'HIGH-CONTRAST VISUAL' },
    wmd: { name: 'WMD', rhythm: 'VISUAL' },
    cre: { name: 'CRE', rhythm: 'HAPTIC AND VISUAL' },
    mdr: { name: 'MDR', rhythm: 'HAPTIC' },
    audio: { name: 'AUDIO', rhythm: 'AUDITORY' },
    vsd: { name: 'VSD', rhythm: 'HAPTIC AND VISUAL' },
    gcm: { name: 'GCM', rhythm: 'AUDITORY AND VISUAL' }
};

const PROTOCOL_ROUTES = {
    abm: { name: 'ABM', path: 'protocols/abm/' },
    ics: { name: 'ICS', path: 'protocols/ics/' },
    sam: { name: 'SAM', path: 'protocols/sam/' },
    iec: { name: 'IEC', path: 'protocols/iec/' },
    cre: { name: 'CRE', path: 'protocols/cre/' },
    mdr: { name: 'MDR', path: 'protocols/mdr/' },
    audio: { name: 'AUDIO', path: 'protocols/audio/' },
    cas: { name: 'CAS', path: 'protocols/cas/' },
    obd: { name: 'OBD', path: 'protocols/obd/' },
    gcm: { name: 'GCM', path: 'protocols/gcm/' }
};

let protocolIntroTimeoutId = 0;
let masterInitializationInited = false;
let dashboardPrimaryInited = false;
let masterStartInited = false;

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

function resumeGlobalBinauralEngine() {
    if (!initializeGlobalBinauralEngine()) return Promise.resolve(false);

    const audioContext = globalBinauralState.audioContext;
    if (!audioContext || audioContext.state !== 'suspended') {
        globalBinauralState.unlocked = !!audioContext;
        if (globalBinauralState.unlocked) setGlobalBinauralGain(GLOBAL_BINAURAL_CONFIG.gain);
        return Promise.resolve(!!audioContext);
    }

    return audioContext
        .resume()
        .then(() => {
            globalBinauralState.unlocked = true;
            setGlobalBinauralGain(GLOBAL_BINAURAL_CONFIG.gain);
            return true;
        })
        .catch(() => false);
}

function initializationHapticTap() {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    try {
        navigator.vibrate(40);
    } catch {
        /* ignore */
    }
}

function fadeOutMasterStartOverlay() {
    const overlay = document.getElementById('master-start-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;

    overlay.setAttribute('aria-hidden', 'true');
    overlay.classList.add('master-start-overlay--exiting');

    const hideOverlay = () => {
        overlay.classList.add('hidden');
        overlay.classList.remove('master-start-overlay--exiting');
    };

    overlay.addEventListener('transitionend', hideOverlay, { once: true });
    window.setTimeout(hideOverlay, 700);
}

function initMasterStartOverlay() {
    if (masterStartInited) return;
    masterStartInited = true;
    initializeGlobalBinauralEngine();

    const button = document.getElementById('master-start-button');
    if (!button) return;

    button.addEventListener('click', () => {
        button.disabled = true;
        initializationHapticTap();
        resumeGlobalBinauralEngine().finally(() => {
            fadeOutMasterStartOverlay();
        });
    });
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
        cpi: () => typeof launchCPI === 'function' && launchCPI(),
        cas: () => (typeof launchCAS === 'function' ? launchCAS() : showProtocolPending('cas')),
        obd: () => (typeof launchOBD === 'function' ? launchOBD() : showProtocolPending('obd')),
        ccd: () => typeof launchCCD === 'function' && launchCCD(),
        obs: () => typeof launchOBS === 'function' && launchOBS(),
        abm: () => (typeof launchABM === 'function' ? launchABM() : showProtocolPending('abm')),
        ics: () => (typeof launchICS === 'function' ? launchICS() : showProtocolPending('ics')),
        sam: () => (typeof launchSAM === 'function' ? launchSAM() : showProtocolPending('sam')),
        iec: () => (typeof launchIEC === 'function' ? launchIEC() : showProtocolPending('iec')),
        kcb: () => typeof launchKCB === 'function' && launchKCB(),
        wmd: () => typeof launchWMD === 'function' && launchWMD(),
        cre: () => (typeof launchCRE === 'function' ? launchCRE() : showProtocolPending('cre')),
        mdr: () => (typeof launchMDR === 'function' ? launchMDR() : showProtocolPending('mdr')),
        audio: () => (typeof launchAudio === 'function' ? launchAudio() : showProtocolPending('audio')),
        vsd: () => typeof launchVSD === 'function' && launchVSD(),
        gcm: () => (typeof launchGCM === 'function' ? launchGCM() : showProtocolPending('gcm'))
    };
    const fn = runners[protocolKey];
    if (fn) fn();
}

/**
 * Shows a 1.5-second engage overlay, then launches the protocol.
 * @param {string} protocolKey cpi | cas | obd | ccd | obs | abm | kcb
 */
function launchWithIntro(protocolKey) {
    closeDischargeChoice();
    closeMemoryChoice();
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
}

function closeMemoryChoice() {
    const el = document.getElementById('memory-choice-overlay');
    if (el) {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
    }
}

function openMemoryChoice() {
    const el = document.getElementById('memory-choice-overlay');
    if (el) {
        el.classList.remove('hidden');
        el.setAttribute('aria-hidden', 'false');
    }
}

function closeDischargeChoice() {
    const el = document.getElementById('discharge-choice-overlay');
    if (el) {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
    }
}

function openDischargeChoice() {
    const el = document.getElementById('discharge-choice-overlay');
    if (el) {
        el.classList.remove('hidden');
        el.setAttribute('aria-hidden', 'false');
    }
}

function launchWMDSession() {
    closeDischargeChoice();
    closeMemoryChoice();
    cancelProtocolIntro();
    if (typeof launchWMD === 'function') launchWMD();
}

function launchCRESession() {
    closeDischargeChoice();
    closeMemoryChoice();
    cancelProtocolIntro();
    if (typeof launchCRE === 'function') launchCRE();
}

function launchMDRSession() {
    closeDischargeChoice();
    closeMemoryChoice();
    cancelProtocolIntro();
    if (typeof launchMDR === 'function') launchMDR();
}

function launchAudioSession() {
    closeDischargeChoice();
    closeMemoryChoice();
    cancelProtocolIntro();
    if (typeof launchAudio === 'function') launchAudio();
}

function launchVSDSession() {
    closeDischargeChoice();
    closeMemoryChoice();
    cancelProtocolIntro();
    if (typeof launchVSD === 'function') launchVSD();
}

function launchGCMSession() {
    closeDischargeChoice();
    closeMemoryChoice();
    cancelProtocolIntro();
    if (typeof launchGCM === 'function') launchGCM();
}

/** Direct-launch modules (custom intro / no engage splash). */
const DIRECT_SESSION_LAUNCHERS = {
    cre: launchCRESession,
    mdr: launchMDRSession,
    audio: launchAudioSession,
    gcm: launchGCMSession
};

/** Standard engage-splash protocols. */
const INTRO_SESSION_KEYS = {
    abm: 'abm',
    ics: 'ics',
    sam: 'sam',
    iec: 'iec',
    cas: 'cas',
    obd: 'obd',
    obs: 'obs'
};

function onPrimarySymptom(symptom) {
    selectionTapHaptic();
    if (symptom === 'memory') {
        openMemoryChoice();
        return;
    }
    if (symptom === 'discharge') {
        openDischargeChoice();
        return;
    }
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

function toggleProtocolManual() {
    const wrap = document.getElementById('protocol-manual');
    const btn = document.getElementById('manual-override-btn');
    const dash = document.getElementById('dashboard');
    if (!wrap || !btn) return;
    const opening = wrap.classList.contains('hidden');
    selectionTapHaptic();
    if (opening) {
        wrap.classList.remove('hidden');
        wrap.setAttribute('aria-hidden', 'false');
        btn.setAttribute('aria-expanded', 'true');
        if (dash) dash.classList.add('dashboard--manual-open');
    } else {
        wrap.classList.add('hidden');
        wrap.setAttribute('aria-hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
        if (dash) dash.classList.remove('dashboard--manual-open');
    }
}

function revealDashboardFromMasterInit() {
    selectionTapHaptic();

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

    btn.addEventListener('click', revealDashboardFromMasterInit);
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

    document.querySelectorAll('[data-discharge-pick]').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectionTapHaptic();
            const key = btn.getAttribute('data-discharge-pick');
            closeDischargeChoice();
            if (key === 'ccd' || key === 'kcb') launchWithIntro(key);
        });
    });

    document.querySelectorAll('[data-memory-pick]').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectionTapHaptic();
            const key = btn.getAttribute('data-memory-pick');
            closeMemoryChoice();
            if (key === 'vsd') launchVSDSession();
            else if (key === 'wmd') launchWMDSession();
        });
    });

    const cancelMemory = document.getElementById('memory-choice-cancel');
    if (cancelMemory) {
        cancelMemory.addEventListener('click', () => {
            selectionTapHaptic();
            closeMemoryChoice();
        });
    }

    const cancelDischarge = document.getElementById('discharge-choice-cancel');
    if (cancelDischarge) {
        cancelDischarge.addEventListener('click', () => {
            selectionTapHaptic();
            closeDischargeChoice();
        });
    }

    const manualBtn = document.getElementById('manual-override-btn');
    if (manualBtn) {
        manualBtn.addEventListener('click', () => toggleProtocolManual());
    }

    const dischargeOverlay = document.getElementById('discharge-choice-overlay');
    if (dischargeOverlay) {
        dischargeOverlay.addEventListener('click', (e) => {
            if (e.target === dischargeOverlay) closeDischargeChoice();
        });
    }

    const memoryOverlay = document.getElementById('memory-choice-overlay');
    if (memoryOverlay) {
        memoryOverlay.addEventListener('click', (e) => {
            if (e.target === memoryOverlay) closeMemoryChoice();
        });
    }
}

function showProtocolViewport() {
    const vp = document.getElementById('viewport');
    if (!vp) return;
    vp.classList.remove('hidden');
    vp.setAttribute('aria-hidden', 'false');
    vp.style.removeProperty('display');
}

/** Sets status text and shows the protocol viewport (used by CPI and similar modules). */
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
    closeDischargeChoice();
    closeMemoryChoice();
    if (typeof clearKcbStrobe === 'function') {
        clearKcbStrobe();
    }
    if (typeof stopCAS === 'function') {
        stopCAS();
    }
    if (typeof stopABM === 'function') {
        stopABM();
    }
    if (typeof stopICS === 'function') {
        stopICS();
    }
    if (typeof stopOBD === 'function') {
        stopOBD();
    }
    if (typeof stopOBS === 'function') {
        stopOBS();
    }
    if (typeof stopWMD === 'function') {
        stopWMD();
    }
    if (typeof stopCRE === 'function') {
        stopCRE();
    }
    if (typeof stopMDR === 'function') {
        stopMDR();
    }
    if (typeof stopAudio === 'function') {
        stopAudio();
    }
    if (typeof stopVSD === 'function') {
        stopVSD();
    }
    if (typeof stopGCM === 'function') {
        stopGCM();
    }
    if (typeof stopSAM === 'function') {
        stopSAM();
    }
    if (typeof stopIEC === 'function') {
        stopIEC();
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
}

function initAppShell() {
    initMasterStartOverlay();
    initDashboardPrimary();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initMasterInitializationOverlay();
            initDashboardPrimary();
        });
    } else {
        initMasterInitializationOverlay();
        initDashboardPrimary();
    }
}
