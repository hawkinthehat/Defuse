/**
 * GCM — Gaze-Contingent Music Segmentation: moving 3x3 target with binaural clarity reward.
 */
(function () {
    const SESSION_MS = 40000;
    const MOVE_MS = 1500;
    const GRID_CELLS = 9;
    const CLEAR_FILTER_HZ = 20000;
    const MUFFLED_FILTER_HZ = 90;

    let gcmRunning = false;
    let sessionEnded = false;
    let moveTimerId = 0;
    let tickTimerId = 0;
    let sessionEndAt = 0;
    let targetSlot = 4;
    let activePointerId = null;
    let lastPointer = null;
    let audioClear = false;

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function formatTimeLeft(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        return `0:${s < 10 ? '0' : ''}${s}`;
    }

    function getAudioEngine() {
        return typeof window !== 'undefined' ? window.GlobalBinauralEngine : null;
    }

    function setAudioMuffled(muffled) {
        const engine = getAudioEngine();
        if (!engine || typeof engine.setLowPassFrequency !== 'function') return;
        const frequency = muffled ? MUFFLED_FILTER_HZ : CLEAR_FILTER_HZ;
        engine.setLowPassFrequency(frequency);
    }

    function resetAudioFilter() {
        const engine = getAudioEngine();
        if (engine && typeof engine.resetFilter === 'function') {
            engine.resetFilter();
        } else {
            setAudioMuffled(false);
        }
        audioClear = false;
    }

    function stopTimers() {
        if (moveTimerId) {
            clearInterval(moveTimerId);
            moveTimerId = 0;
        }
        if (tickTimerId) {
            clearInterval(tickTimerId);
            tickTimerId = 0;
        }
    }

    function stopGCM() {
        gcmRunning = false;
        sessionEnded = false;
        activePointerId = null;
        lastPointer = null;
        stopTimers();
        resetAudioFilter();
    }

    function targetElement() {
        return document.getElementById('gcm-target');
    }

    function gridElement() {
        return document.getElementById('gcm-grid');
    }

    function pointInsideTarget(point) {
        const target = targetElement();
        if (!target || !point) return false;
        const rect = target.getBoundingClientRect();
        return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    }

    function updateAudioGate() {
        if (!gcmRunning || sessionEnded) return;
        const holdingTarget = activePointerId !== null && pointInsideTarget(lastPointer);
        if (holdingTarget === audioClear) return;

        audioClear = holdingTarget;
        setAudioMuffled(!holdingTarget);

        const root = document.getElementById('gcm-root');
        if (root) root.classList.toggle('gcm-root--locked', holdingTarget);

        const state = document.getElementById('gcm-lock-state');
        if (state) state.textContent = holdingTarget ? 'Audio clear' : 'Audio muffled';
    }

    function nextTargetSlot() {
        let next = targetSlot;
        while (next === targetSlot) {
            next = Math.floor(Math.random() * GRID_CELLS);
        }
        return next;
    }

    function positionTarget() {
        const target = targetElement();
        if (!target) return;

        const row = Math.floor(targetSlot / 3);
        const col = targetSlot % 3;
        target.dataset.slot = String(targetSlot);
        target.setAttribute('aria-label', `Healing blue target, row ${row + 1}, column ${col + 1}`);
        updateAudioGate();
    }

    function moveTarget() {
        if (!gcmRunning || sessionEnded) return;
        targetSlot = nextTargetSlot();
        positionTarget();
    }

    function updateClock() {
        if (!gcmRunning || sessionEnded) return;

        const left = sessionEndAt - Date.now();
        const progress = Math.max(0, Math.min(1, left / SESSION_MS));
        const fill = document.getElementById('gcm-timer-fill');
        const time = document.getElementById('gcm-time');

        if (fill) fill.style.width = `${progress * 100}%`;
        if (time) time.textContent = formatTimeLeft(left);
        setInst(`GCM · ${formatTimeLeft(left)} · ${audioClear ? 'CLEAR AUDIO' : 'HOLD TARGET'}`);

        if (left <= 0) endSession();
    }

    function onPointerDown(e) {
        if (!gcmRunning || sessionEnded || activePointerId !== null) return;
        e.preventDefault();

        activePointerId = e.pointerId;
        lastPointer = { x: e.clientX, y: e.clientY };
        const grid = gridElement();
        if (grid && typeof grid.setPointerCapture === 'function') {
            try {
                grid.setPointerCapture(e.pointerId);
            } catch {
                /* Pointer capture can fail if the browser has already cancelled the pointer. */
            }
        }
        updateAudioGate();
    }

    function onPointerMove(e) {
        if (!gcmRunning || sessionEnded || e.pointerId !== activePointerId) return;
        e.preventDefault();
        lastPointer = { x: e.clientX, y: e.clientY };
        updateAudioGate();
    }

    function releasePointer(e) {
        if (activePointerId === null || e.pointerId !== activePointerId) return;
        activePointerId = null;
        lastPointer = null;
        updateAudioGate();
    }

    function bindGrid() {
        const grid = gridElement();
        if (!grid) return;
        grid.addEventListener('pointerdown', onPointerDown, { passive: false });
        grid.addEventListener('pointermove', onPointerMove, { passive: false });
        grid.addEventListener('pointerup', releasePointer);
        grid.addEventListener('pointercancel', releasePointer);
        grid.addEventListener('lostpointercapture', releasePointer);
    }

    function renderComplete() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        setInst('GCM · SESSION COMPLETE');
        stage.innerHTML = `
            <div class="gcm-root gcm-root--complete">
                <section class="gcm-complete-card" aria-labelledby="gcm-complete-title">
                    <p class="gcm-kicker">GCM COMPLETE</p>
                    <h2 id="gcm-complete-title" class="gcm-complete-title">Focused attention sequence complete.</h2>
                    <p class="gcm-complete-line">You practiced holding steady contact with the moving target to unlock clear, crisp binaural audio.</p>
                    <button type="button" class="gcm-done-btn" id="gcm-done">RETURN TO MAIN SCREEN</button>
                </section>
            </div>
        `;
        document.getElementById('gcm-done')?.addEventListener('click', () => exitProtocol());
    }

    function endSession() {
        if (sessionEnded) return;
        sessionEnded = true;
        gcmRunning = false;
        activePointerId = null;
        lastPointer = null;
        stopTimers();
        resetAudioFilter();
        renderComplete();
    }

    function startMovementAndAudio() {
        if (gcmRunning) return;

        const engine = getAudioEngine();
        const acousticEnabled = engine && engine.isThetaEnabled;
        const start =
            acousticEnabled && engine && typeof engine.resume === 'function'
                ? engine.resume()
                : Promise.resolve(false);
        start.finally(() => {
            if (sessionEnded) return;

            gcmRunning = true;
            sessionEnded = false;
            audioClear = false;
            activePointerId = null;
            lastPointer = null;
            sessionEndAt = Date.now() + SESSION_MS;
            targetSlot = Math.floor(Math.random() * GRID_CELLS);

            setAudioMuffled(true);
            renderTask();
            bindGrid();
            positionTarget();
            updateClock();
            moveTimerId = window.setInterval(moveTarget, MOVE_MS);
            tickTimerId = window.setInterval(() => {
                updateAudioGate();
                updateClock();
            }, 120);
        });
    }

    function renderTask() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        const cells = Array.from({ length: GRID_CELLS }, (_, index) => `<div class="gcm-cell" aria-hidden="true" data-cell="${index}"></div>`).join('');
        stage.innerHTML = `
            <div class="gcm-root" id="gcm-root">
                <div class="gcm-shell" aria-live="polite">
                    <div class="gcm-hud">
                        <div>
                            <p class="gcm-kicker">Gaze-Contingent Music Segmentation</p>
                            <h1 class="gcm-title">Hold the moving blue target.</h1>
                        </div>
                        <div class="gcm-status-pill" id="gcm-lock-state">Audio muffled</div>
                    </div>
                    <div class="gcm-timer-row">
                        <span class="gcm-time" id="gcm-time">0:40</span>
                        <div class="gcm-timer-bar" aria-hidden="true"><div class="gcm-timer-fill" id="gcm-timer-fill"></div></div>
                    </div>
                    <div class="gcm-grid-wrap">
                        <div class="gcm-grid" id="gcm-grid" role="application" aria-label="3 by 3 moving target attention grid">
                            ${cells}
                            <div class="gcm-target" id="gcm-target" role="img" aria-label="Healing blue target"></div>
                        </div>
                    </div>
                    <p class="gcm-hint">Keep active touch contact on the blue square to keep the audio clear.</p>
                </div>
            </div>
        `;
    }

    function renderOnboarding() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.innerHTML = `
            <div class="gcm-root gcm-root--onboarding">
                <section class="gcm-onboarding-card" role="dialog" aria-modal="false" aria-labelledby="gcm-onboarding-title">
                    <p class="gcm-kicker">GCM · Focus retraining</p>
                    <h1 id="gcm-onboarding-title" class="gcm-onboarding-title">HOW TO FOCUS</h1>
                    <ol class="gcm-instructions">
                        <li>A blue target square will begin moving through the grid.</li>
                        <li>Press and hold your finger directly on the moving target.</li>
                        <li>Keeping your focus on the target unlocks clear, crisp audio.</li>
                        <li>Drifting off the target will muffle the sound. Train your brain to hold steady focus.</li>
                    </ol>
                    <button type="button" class="gcm-start-btn" id="gcm-start-btn">[ START TASK ]</button>
                </section>
            </div>
        `;
        document.getElementById('gcm-start-btn')?.addEventListener('click', startMovementAndAudio);
    }

    function launchGCM() {
        stopGCM();
        sessionEnded = false;
        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }
        setInst('GCM · READY');
        renderOnboarding();
    }

    window.launchGCM = launchGCM;
    window.stopGCM = stopGCM;
})();
