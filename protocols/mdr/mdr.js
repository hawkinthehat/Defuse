/**
 * MDR — Mammalian Dive Reflex: hold-to-calibrate with pause-on-release.
 */
(function () {
    const CALIBRATION_MS = 60000;

    let mdrRunning = false;
    let mdrRafId = 0;
    let holding = false;
    let remainingMs = CALIBRATION_MS;
    let lastFrame = 0;
    let completed = false;

    function stopMDR() {
        mdrRunning = false;
        holding = false;
        completed = false;
        if (mdrRafId) {
            cancelAnimationFrame(mdrRafId);
            mdrRafId = 0;
        }
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function formatCountdown(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${r < 10 ? '0' : ''}${r}`;
    }

    function completionHaptic() {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(500);
        } catch {
            /* ignore */
        }
    }

    function renderComplete() {
        stopMDR();
        completed = true;
        setInst('MDR · CALIBRATION COMPLETE');

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="mdr-root mdr-root--complete">
                <p class="mdr-complete-line">Vagal nerve stimulation complete. Autonomic balance restored.</p>
                <button type="button" class="mdr-done-btn" id="mdr-done">RETURN TO MAIN SCREEN</button>
            </div>
        `;
        const done = document.getElementById('mdr-done');
        if (done) {
            done.addEventListener('click', () => exitProtocol());
        }
    }

    function updateUI() {
        const countdown = document.getElementById('mdr-countdown');
        const instruct = document.getElementById('mdr-instruct');
        const interrupt = document.getElementById('mdr-interrupt');
        const btn = document.getElementById('mdr-hold-btn');

        if (countdown) countdown.textContent = formatCountdown(remainingMs);
        if (instruct) {
            instruct.classList.toggle('mdr-instruct--active', holding);
        }
        if (interrupt) {
            interrupt.classList.toggle('hidden', holding || completed);
        }
        if (btn) {
            btn.classList.toggle('mdr-hold-btn--active', holding);
        }

        setInst(holding ? `MDR · CALIBRATING · ${formatCountdown(remainingMs)}` : 'MDR · AWAITING CONTACT');
    }

    function onHoldStart(e) {
        if (!mdrRunning || completed) return;
        e.preventDefault();
        holding = true;
        lastFrame = performance.now();
        updateUI();
    }

    function onHoldEnd(e) {
        if (!mdrRunning || completed) return;
        e.preventDefault();
        holding = false;
        updateUI();
    }

    function tick(now) {
        if (!mdrRunning || completed) {
            mdrRafId = 0;
            return;
        }

        if (holding) {
            const dt = lastFrame ? now - lastFrame : 0;
            lastFrame = now;
            if (dt > 0 && dt < 200) {
                remainingMs -= dt;
                if (remainingMs <= 0) {
                    remainingMs = 0;
                    updateUI();
                    completionHaptic();
                    renderComplete();
                    return;
                }
            }
            updateUI();
        } else {
            lastFrame = now;
        }

        mdrRafId = requestAnimationFrame(tick);
    }

    function bindHoldButton(btn) {
        if (!btn) return;
        const opts = { passive: false };

        btn.addEventListener('pointerdown', onHoldStart, opts);
        btn.addEventListener('pointerup', onHoldEnd, opts);
        btn.addEventListener('pointerleave', onHoldEnd, opts);
        btn.addEventListener('pointercancel', onHoldEnd, opts);
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    function renderSession() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        remainingMs = CALIBRATION_MS;
        holding = false;
        completed = false;
        lastFrame = 0;

        stage.innerHTML = `
            <div class="mdr-root">
                <p class="mdr-countdown" id="mdr-countdown" aria-live="polite">${formatCountdown(remainingMs)}</p>
                <p class="mdr-instruct" id="mdr-instruct">Apply cold compress or ice to eyes/upper cheeks. Maintaining contact&hellip;</p>
                <p class="mdr-interrupt hidden" id="mdr-interrupt" role="alert">
                    Signal interrupted. Re-establish contact to resume calibration.
                </p>
                <button type="button" class="mdr-hold-btn" id="mdr-hold-btn">
                    Hold to Calibrate System State
                </button>
            </div>
        `;

        const btn = document.getElementById('mdr-hold-btn');
        bindHoldButton(btn);
        updateUI();
        mdrRafId = requestAnimationFrame(tick);
    }

    function launchMDR() {
        stopMDR();
        mdrRunning = true;

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        setInst('MDR · DIVE REFLEX');
        renderSession();
    }

    window.launchMDR = launchMDR;
    window.stopMDR = stopMDR;
})();
