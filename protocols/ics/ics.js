/**
 * ICS - Interoceptive Conditioning Sandbox: 40s respiratory visual calibration.
 */
(function () {
    const SESSION_MS = 40000;
    const SUBTEXT_MS = 10000;
    const SUBTEXTS = [
        'Your system is operating safely.',
        'Matching this rhythm builds autonomic resilience.',
        'Sensation is data, not danger.'
    ];

    let icsRunning = false;
    let icsRafId = 0;
    let icsSubtextTimerId = 0;
    let icsStartedAt = 0;
    let icsSubtextIndex = 0;

    function getViewport() {
        return document.getElementById('viewport');
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function formatClock(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;
        return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
    }

    function cancelTimers() {
        if (icsRafId) {
            cancelAnimationFrame(icsRafId);
            icsRafId = 0;
        }
        if (icsSubtextTimerId) {
            clearInterval(icsSubtextTimerId);
            icsSubtextTimerId = 0;
        }
    }

    function stopICS() {
        icsRunning = false;
        cancelTimers();
        const vp = getViewport();
        if (vp) vp.classList.remove('viewport-ics');
    }

    function renderSessionShell() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="ics-root ics-root--idle" id="ics-root">
                <section class="ics-session" aria-labelledby="ics-heading">
                    <div class="ics-clock-row" aria-live="polite">
                        <span class="ics-clock-label">Calibration clock</span>
                        <strong class="ics-clock" id="ics-clock">${formatClock(SESSION_MS)}</strong>
                    </div>
                    <div class="ics-lung-wrap" role="img" aria-label="Geometric lung expanding and contracting at a steady breathing rhythm">
                        <div class="ics-lung" aria-hidden="true">
                            <span class="ics-lobe ics-lobe--left"></span>
                            <span class="ics-lobe ics-lobe--right"></span>
                            <span class="ics-trachea"></span>
                            <span class="ics-bronchus ics-bronchus--left"></span>
                            <span class="ics-bronchus ics-bronchus--right"></span>
                            <span class="ics-center-node"></span>
                        </div>
                    </div>
                    <h1 class="ics-subtext" id="ics-heading">${SUBTEXTS[0]}</h1>
                    <p class="ics-breath-cue">Let your breath gently follow the expansion and release. No forcing. Just matching.</p>
                </section>
                <section class="ics-onboarding" id="ics-onboarding" role="dialog" aria-modal="true" aria-labelledby="ics-onboarding-title">
                    <div class="ics-onboarding-card">
                        <p class="ics-kicker">ICS · Interoceptive Conditioning Sandbox</p>
                        <h2 class="ics-onboarding-title" id="ics-onboarding-title">Calibrate with a safe body rhythm.</h2>
                        <p class="ics-onboarding-copy">For the next 40 seconds, watch the lung shape expand and contract at a moderate pace. Let sensation be information, not an alarm.</p>
                        <ol class="ics-onboarding-list">
                            <li>Keep breathing comfortable and easy.</li>
                            <li>Match the visual rhythm only as much as feels safe.</li>
                            <li>If your body shifts, label it as data and stay with the clock.</li>
                        </ol>
                        <button type="button" class="ics-start-btn" id="ics-start-btn">Begin 40-second calibration</button>
                    </div>
                </section>
            </div>
        `;

        const startBtn = document.getElementById('ics-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', startCalibration);
            startBtn.focus();
        }
    }

    function updateSubtext() {
        const el = document.getElementById('ics-heading');
        if (!el) return;

        icsSubtextIndex = (icsSubtextIndex + 1) % SUBTEXTS.length;
        el.classList.add('is-changing');
        window.setTimeout(() => {
            if (!icsRunning || !el.isConnected) return;
            el.textContent = SUBTEXTS[icsSubtextIndex];
            el.classList.remove('is-changing');
        }, 220);
    }

    function updateClock(remainingMs) {
        const clock = document.getElementById('ics-clock');
        const label = formatClock(remainingMs);
        if (clock) clock.textContent = label;
        setInst(`ICS · CALIBRATING · ${label}`);
    }

    function renderComplete() {
        icsRunning = false;
        cancelTimers();
        setInst('ICS · CALIBRATION COMPLETE');

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="ics-root ics-root--complete">
                <section class="ics-complete-card" aria-labelledby="ics-complete-title">
                    <p class="ics-kicker">ICS complete</p>
                    <h2 class="ics-complete-title" id="ics-complete-title">Calibration clock completed.</h2>
                    <p class="ics-complete-copy">You stayed with a safe rhythm while body sensations moved through the system. Sensation can be noticed without becoming danger.</p>
                    <button type="button" class="ics-done-btn" id="ics-done-btn">Return to dashboard</button>
                </section>
            </div>
        `;

        const done = document.getElementById('ics-done-btn');
        if (done) {
            done.addEventListener('click', () => exitProtocol());
            done.focus();
        }
    }

    function tick(now) {
        if (!icsRunning) {
            icsRafId = 0;
            return;
        }

        const elapsed = now - icsStartedAt;
        const remainingMs = Math.max(0, SESSION_MS - elapsed);
        updateClock(remainingMs);

        if (remainingMs <= 0) {
            renderComplete();
            return;
        }

        icsRafId = requestAnimationFrame(tick);
    }

    function startCalibration() {
        if (icsRunning) return;

        const root = document.getElementById('ics-root');
        const overlay = document.getElementById('ics-onboarding');
        if (root) root.classList.remove('ics-root--idle');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
        }

        icsRunning = true;
        icsSubtextIndex = 0;
        icsStartedAt = performance.now();
        updateClock(SESSION_MS);
        icsSubtextTimerId = window.setInterval(updateSubtext, SUBTEXT_MS);
        icsRafId = requestAnimationFrame(tick);
    }

    function launchICS() {
        stopICS();
        const vp = getViewport();
        if (vp) vp.classList.add('viewport-ics');

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        setInst('ICS · READY');
        renderSessionShell();
    }

    window.launchICS = launchICS;
    window.stopICS = stopICS;
})();
