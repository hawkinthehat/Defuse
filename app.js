/**
 * Global viewport shell for protocol modules. Loaded before protocol scripts.
 */

const PROTOCOL_INTRO_MS = 1500;

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
    kcb: { name: 'KCB', rhythm: 'HIGH-CONTRAST VISUAL' },
    wmd: { name: 'WMD', rhythm: 'VISUAL' },
    cre: { name: 'CRE', rhythm: 'HAPTIC AND VISUAL' },
    mdr: { name: 'MDR', rhythm: 'HAPTIC' },
    audio: { name: 'AUDIO', rhythm: 'AUDITORY' }
};

let protocolIntroTimeoutId = 0;
let dashboardPrimaryInited = false;

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

function runProtocol(protocolKey) {
    const runners = {
        cpi: () => typeof launchCPI === 'function' && launchCPI(),
        cas: () => typeof launchCAS === 'function' && launchCAS(),
        obd: () => typeof launchOBD === 'function' && launchOBD(),
        ccd: () => typeof launchCCD === 'function' && launchCCD(),
        obs: () => typeof launchOBS === 'function' && launchOBS(),
        abm: () => typeof launchABM === 'function' && launchABM(),
        kcb: () => typeof launchKCB === 'function' && launchKCB(),
        wmd: () => typeof launchWMD === 'function' && launchWMD(),
        cre: () => typeof launchCRE === 'function' && launchCRE(),
        mdr: () => typeof launchMDR === 'function' && launchMDR(),
        audio: () => typeof launchAudio === 'function' && launchAudio()
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
    cancelProtocolIntro();
    if (typeof launchWMD === 'function') launchWMD();
}

function launchCRESession() {
    closeDischargeChoice();
    cancelProtocolIntro();
    if (typeof launchCRE === 'function') launchCRE();
}

function launchMDRSession() {
    closeDischargeChoice();
    cancelProtocolIntro();
    if (typeof launchMDR === 'function') launchMDR();
}

function launchAudioSession() {
    closeDischargeChoice();
    cancelProtocolIntro();
    if (typeof launchAudio === 'function') launchAudio();
}

function onPrimarySymptom(symptom) {
    selectionTapHaptic();
    if (symptom === 'discharge') {
        openDischargeChoice();
        return;
    }
    if (symptom === 'wmd') {
        launchWMDSession();
        return;
    }
    if (symptom === 'cre') {
        launchCRESession();
        return;
    }
    if (symptom === 'mdr') {
        launchMDRSession();
        return;
    }
    if (symptom === 'audio') {
        launchAudioSession();
        return;
    }
    const map = {
        abm: 'abm',
        cas: 'cas',
        obd: 'obd',
        obs: 'obs'
    };
    const key = map[symptom];
    if (key) launchWithIntro(key);
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
    if (typeof clearKcbStrobe === 'function') {
        clearKcbStrobe();
    }
    if (typeof stopCAS === 'function') {
        stopCAS();
    }
    if (typeof stopABM === 'function') {
        stopABM();
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
    const vp = document.getElementById('viewport');
    if (vp) {
        vp.classList.remove('viewport-obs');
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

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDashboardPrimary);
    } else {
        initDashboardPrimary();
    }
}
