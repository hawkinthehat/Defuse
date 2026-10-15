(function () {
    const EXPOSURE_MS = 90000;
    const CHARCOAL = '#0F172A';

    let iecRunning = false;
    let iecLocked = false;
    let iecCompleted = false;
    let iecRafId = 0;
    let iecStartedAt = 0;
    let savedExitHidden = false;
    let savedExitDisabled = false;
    let savedExitAriaHidden = null;
    let pushedHistoryLock = false;

    /* Exit is always voluntary — no locks, traps, or forced completion. */

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function formatClock(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;
        return `${minutes < 10 ? '0' : ''}${minutes}:${rest < 10 ? '0' : ''}${rest}`;
    }

    function exitButton() {
        return document.querySelector('.exit-btn');
    }

    function enableSecurityLock() {
        /* Intentionally no-op: youth may leave at any millisecond. */
        iecLocked = false;
        iecCompleted = false;
        window.__iecExposureLocked = false;
    }

    function disableSecurityLock() {
        iecLocked = false;
        window.__iecExposureLocked = false;
        pushedHistoryLock = false;
    }

    function stopTimer() {
        if (iecRafId) {
            cancelAnimationFrame(iecRafId);
            iecRafId = 0;
        }
    }

    function stopIEC() {
        iecRunning = false;
        stopTimer();
        disableSecurityLock();
        iecCompleted = false;
        document.getElementById('viewport')?.classList.remove('viewport-iec');
    }

    function tick(now) {
        if (!iecRunning) {
            iecRafId = 0;
            return;
        }

        const elapsed = now - iecStartedAt;
        const remaining = Math.max(0, EXPOSURE_MS - elapsed);
        const label = formatClock(remaining);
        const timer = document.getElementById('iec-countdown');
        const fill = document.getElementById('iec-countdown-fill');
        if (timer) timer.textContent = label;
        if (fill) fill.style.width = `${(remaining / EXPOSURE_MS) * 100}%`;
        setInst(`IEC · VISUAL EXPOSURE · ${label}`);

        if (remaining <= 0) {
            completeExposure();
            return;
        }

        iecRafId = requestAnimationFrame(tick);
    }

    function completeExposure() {
        if (iecCompleted) return;
        iecCompleted = true;
        iecRunning = false;
        stopTimer();
        disableSecurityLock();
        setInst('Quiet practice — stop anytime');

        const root = document.getElementById('iec-root');
        if (root) root.classList.add('iec-root--complete');
        const timer = document.getElementById('iec-countdown');
        const fill = document.getElementById('iec-countdown-fill');
        const status = document.getElementById('iec-status');
        if (timer) timer.textContent = '00:00';
        if (fill) fill.style.width = '0%';
        if (status) status.textContent = 'You can stop anytime with STOP & BACK.';
        if (typeof completeProtocolGently === 'function') {
            completeProtocolGently();
        }
    }

    function startExposure(text) {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.style.paddingTop = '0';
        stage.innerHTML = `
            <div class="iec-root iec-root--projection" id="iec-root">
                <div class="iec-countdown-shell" aria-live="polite">
                    <span class="iec-countdown-label">EXPOSURE CLOCK</span>
                    <strong class="iec-countdown" id="iec-countdown">01:30</strong>
                    <span class="iec-countdown-track" aria-hidden="true"><span class="iec-countdown-fill" id="iec-countdown-fill"></span></span>
                    <span class="iec-status" id="iec-status">You can stop anytime — nothing here is mandatory.</span>
                </div>
                <h1 class="iec-projection-text" id="iec-projection-text"></h1>
            </div>
        `;

        const projection = document.getElementById('iec-projection-text');
        if (projection) {
            projection.textContent = text;
            projection.style.color = CHARCOAL;
        }

        iecRunning = true;
        iecStartedAt = performance.now();
        enableSecurityLock();
        setInst('IEC · VISUAL EXPOSURE · 01:30');
        iecRafId = requestAnimationFrame(tick);
    }

    function renderCapture() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.removeAttribute('style');
        stage.innerHTML = `
            <div class="iec-root iec-root--capture">
                <section class="iec-card" aria-labelledby="iec-capture-title">
                    <p class="iec-kicker">IEC · Imaginal Exposure Canvas</p>
                    <h1 class="iec-title" id="iec-capture-title">Input a short text summary of your persistent worry loop.</h1>
                    <label class="iec-textarea-label" for="iec-worry-input">Worry loop summary</label>
                    <textarea class="iec-textarea" id="iec-worry-input" rows="7" maxlength="360" placeholder="Input a short text summary of your persistent worry loop."></textarea>
                    <p class="iec-validation" id="iec-validation" aria-live="polite"></p>
                    <button type="button" class="iec-submit-btn" id="iec-submit-btn">[ SUBMIT TO CANVAS ]</button>
                </section>
            </div>
        `;

        const input = document.getElementById('iec-worry-input');
        const validation = document.getElementById('iec-validation');
        const submit = document.getElementById('iec-submit-btn');
        submit?.addEventListener('click', () => {
            const raw = input?.value ?? '';
            if (!raw.trim()) {
                if (validation) validation.textContent = 'Enter a short summary before submitting.';
                input?.focus();
                return;
            }
            startExposure(raw);
        });
        input?.focus();
        setInst('IEC · TEXT CAPTURE');
    }

    function renderOnboarding() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.removeAttribute('style');
        stage.innerHTML = `
            <div class="iec-root iec-root--onboarding">
                <section class="iec-card" role="dialog" aria-modal="false" aria-labelledby="iec-title">
                    <p class="iec-kicker">Quiet focus practice · optional</p>
                    <h1 class="iec-title" id="iec-title">Stay with one thought only if it feels okay.</h1>
                    <ol class="iec-steps">
                        <li>Type one short sentence if you want — or skip and go back.</li>
                        <li>If you continue, the words can stay on screen while you breathe.</li>
                        <li>A soft timer may count down, but you can leave at any moment.</li>
                        <li>Use STOP &amp; BACK anytime. Nothing here is mandatory.</li>
                    </ol>
                    <button type="button" class="iec-start-btn" id="iec-start-btn">START WHEN READY</button>
                </section>
            </div>
        `;
        const start = document.getElementById('iec-start-btn');
        if (start) {
            start.addEventListener('click', renderCapture);
            start.focus();
        }
    }

    function launchIEC() {
        stopIEC();
        document.getElementById('viewport')?.classList.add('viewport-iec');
        if (typeof showProtocolViewport === 'function') showProtocolViewport();
        setInst('IEC · READY');
        renderOnboarding();
    }

    window.launchIEC = launchIEC;
    window.stopIEC = stopIEC;
})();
