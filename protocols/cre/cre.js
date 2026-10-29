/**
 * CRE — Help Me Settle: gentle expanding/shrinking shape for paced breathing.
 * No forced timer. Youth may stop at any millisecond.
 */
(function () {
    const BREATH_CYCLE_MS = 8000; /* 4s in + 4s out */
    const PROTOCOL_HEADER = 'Help Me Settle';

    let creRunning = false;
    let creRafId = 0;
    let creStartMs = 0;
    let cueEl = null;
    let shapeEl = null;

    function setProtocolHeader() {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = PROTOCOL_HEADER;
    }

    function softHaptic() {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(18);
        } catch {
            /* ignore */
        }
    }

    function stopCRE() {
        creRunning = false;
        if (creRafId) {
            cancelAnimationFrame(creRafId);
            creRafId = 0;
        }
        cueEl = null;
        shapeEl = null;
    }

    function setCue(text) {
        if (cueEl) cueEl.textContent = text;
    }

    function tick(now) {
        if (!creRunning || !shapeEl) {
            creRafId = 0;
            return;
        }

        const elapsed = (now - creStartMs) % BREATH_CYCLE_MS;
        const half = BREATH_CYCLE_MS / 2;
        const inhaling = elapsed < half;
        const t = inhaling ? elapsed / half : (elapsed - half) / half;
        /* Ease in-out so the shape expands/contracts smoothly. */
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const scale = inhaling ? 0.55 + eased * 0.7 : 1.25 - eased * 0.7;

        shapeEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
        setCue(inhaling ? 'Breathe in…' : 'Breathe out…');

        creRafId = requestAnimationFrame(tick);
    }

    function startSession() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.innerHTML = `
            <div class="cre-root cre-root--breathe" id="cre-root">
                <p class="cre-breathe-cue" id="cre-breathe-cue" role="status">Breathe in…</p>
                <div class="cre-breathe-field" aria-hidden="true">
                    <div class="cre-breathe-shape" id="cre-breathe-shape"></div>
                </div>
                <p class="cre-breathe-hint">Soft focus on the center. Stop whenever you feel ready.</p>
            </div>
        `;

        cueEl = document.getElementById('cre-breathe-cue');
        shapeEl = document.getElementById('cre-breathe-shape');
        creRunning = true;
        creStartMs = performance.now();
        creRafId = requestAnimationFrame(tick);
    }

    function renderPreflight() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        setProtocolHeader();
        stage.innerHTML = `<div class="cre-root cre-root--preflight" id="cre-preflight-root"></div>`;
        const root = document.getElementById('cre-preflight-root');

        const begin = () => {
            softHaptic();
            startSession();
        };

        if (root && typeof window.ProtocolOnboarding !== 'undefined' && window.ProtocolOnboarding.mount) {
            window.ProtocolOnboarding.mount(root, {
                protocolKey: 'cre',
                onStart: begin,
                replace: true
            });
        } else {
            stage.innerHTML = `
                <div class="cre-root cre-root--preflight">
                    <div class="protocol-preflight-overlay">
                        <section class="protocol-preflight-card" role="dialog" aria-labelledby="cre-preflight-title">
                            <h2 class="protocol-preflight-title" id="cre-preflight-title">Help Me Settle</h2>
                            <ul class="protocol-preflight-steps">
                                <li><span class="protocol-preflight-step-label">WHAT TO DO:</span> Breathe in slowly as the shape expands; breathe out as it shrinks.</li>
                                <li><span class="protocol-preflight-step-label">TIP:</span> Keep your eyes softly focused on the center. Audio is optional—turn it on or leave it silent.</li>
                                <li><span class="protocol-preflight-step-label">CHOICE:</span> Stop or pause whenever you feel ready. There is no forced time limit.</li>
                            </ul>
                            <button type="button" class="protocol-preflight-start" id="cre-preflight-start">START WHEN READY</button>
                        </section>
                    </div>
                </div>
            `;
            document.getElementById('cre-preflight-start')?.addEventListener('click', begin);
        }
    }

    function launchCRE() {
        stopCRE();

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        setProtocolHeader();
        renderPreflight();
    }

    window.launchCRE = launchCRE;
    window.stopCRE = stopCRE;
})();
