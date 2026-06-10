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

    function lockExitButton() {
        const btn = exitButton();
        if (!btn) return;
        savedExitHidden = btn.classList.contains('hidden');
        savedExitDisabled = !!btn.disabled;
        savedExitAriaHidden = btn.getAttribute('aria-hidden');
        btn.classList.add('iec-exit-locked');
        btn.classList.add('hidden');
        btn.disabled = true;
        btn.setAttribute('aria-hidden', 'true');
        btn.setAttribute('tabindex', '-1');
    }

    function unlockExitButton() {
        const btn = exitButton();
        if (!btn) return;
        btn.classList.remove('iec-exit-locked');
        if (!savedExitHidden) btn.classList.remove('hidden');
        btn.disabled = savedExitDisabled;
        if (savedExitAriaHidden === null) {
            btn.removeAttribute('aria-hidden');
        } else {
            btn.setAttribute('aria-hidden', savedExitAriaHidden);
        }
        btn.removeAttribute('tabindex');
    }

    function blockBackNavigation() {
        if (typeof window === 'undefined' || !window.history || pushedHistoryLock) return;
        try {
            window.history.pushState({ iecExposureLock: true }, '', window.location.href);
            pushedHistoryLock = true;
        } catch {
            pushedHistoryLock = false;
        }
    }

    function onPopState() {
        if (!iecLocked || iecCompleted) return;
        try {
            window.history.pushState({ iecExposureLock: true }, '', window.location.href);
        } catch {
            /* ignore */
        }
        setInst(`IEC · EXPOSURE LOCK ACTIVE · ${formatClock(Math.max(0, EXPOSURE_MS - (performance.now() - iecStartedAt)))}`);
    }

    function onBeforeUnload(e) {
        if (!iecLocked || iecCompleted) return;
        e.preventDefault();
        e.returnValue = '';
    }

    function onKeydown(e) {
        if (!iecLocked || iecCompleted) return;
        if (e.key === 'Backspace' && !e.target?.matches?.('textarea,input,[contenteditable="true"]')) {
            e.preventDefault();
        }
    }

    function enableSecurityLock() {
        iecLocked = true;
        iecCompleted = false;
        lockExitButton();
        blockBackNavigation();
        window.addEventListener('popstate', onPopState);
        window.addEventListener('beforeunload', onBeforeUnload);
        document.addEventListener('keydown', onKeydown, true);
    }

    function disableSecurityLock() {
        iecLocked = false;
        pushedHistoryLock = false;
        window.removeEventListener('popstate', onPopState);
        window.removeEventListener('beforeunload', onBeforeUnload);
        document.removeEventListener('keydown', onKeydown, true);
        unlockExitButton();
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
        setInst('IEC · EXPOSURE COMPLETE · EXIT ENABLED');

        const root = document.getElementById('iec-root');
        if (root) root.classList.add('iec-root--complete');
        const timer = document.getElementById('iec-countdown');
        const fill = document.getElementById('iec-countdown-fill');
        const status = document.getElementById('iec-status');
        if (timer) timer.textContent = '00:00';
        if (fill) fill.style.width = '0%';
        if (status) status.textContent = 'Exposure complete. EXIT is now available.';
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
                    <span class="iec-status" id="iec-status">EXIT locked until timer reaches 00:00.</span>
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
                    <p class="iec-kicker">IEC · Imaginal Exposure Canvas</p>
                    <h1 class="iec-title" id="iec-title">Hold the image without escaping.</h1>
                    <ol class="iec-steps">
                        <li>Type one short sentence that represents the persistent worry loop.</li>
                        <li>Submit it to the canvas. The exact text will remain centered on screen.</li>
                        <li>For 90 seconds, EXIT and back navigation are locked to support visual exposure.</li>
                        <li>When the timer reaches 00:00, the EXIT button returns automatically.</li>
                    </ol>
                    <button type="button" class="iec-start-btn" id="iec-start-btn">[ START TASK ]</button>
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
        if (typeof showProtocolViewport === 'function') showProtocolViewport();
        setInst('IEC · READY');
        renderOnboarding();
    }

    window.launchIEC = launchIEC;
    window.stopIEC = stopIEC;
})();
