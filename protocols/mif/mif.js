/**
 * MIF — Haptic Grounding (gʷədiʔ): rhythmic bilateral haptic pulses synced to breath phases.
 */
(function () {
    const SESSION_MS = 60000;
    const PHASE_MS = 4000;
    const PHASES = ['inhale', 'hold', 'exhale', 'rest'];
    const HAPTIC_PATTERNS = {
        inhale: [28, 40, 28],
        hold: [18],
        exhale: [36, 24, 36],
        rest: [12]
    };

    let mifRunning = false;
    let mifRafId = 0;
    let mifPhaseTimerId = 0;
    let mifStartedAt = 0;
    let mifPhaseIndex = 0;

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

    function haptic(pattern) {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(pattern);
        } catch {
            /* ignore */
        }
    }

    function clearTimers() {
        if (mifRafId) {
            cancelAnimationFrame(mifRafId);
            mifRafId = 0;
        }
        if (mifPhaseTimerId) {
            clearInterval(mifPhaseTimerId);
            mifPhaseTimerId = 0;
        }
    }

    function stopMIF() {
        mifRunning = false;
        clearTimers();
        const vp = document.getElementById('viewport');
        if (vp) vp.classList.remove('viewport-mif');
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try {
                navigator.vibrate(0);
            } catch {
                /* ignore */
            }
        }
    }

    function applyPhase(phase) {
        const root = document.getElementById('mif-root');
        const label = document.getElementById('mif-phase-label');
        if (!root || !label) return;

        root.classList.remove('mif-root--inhale', 'mif-root--exhale');
        if (phase === 'inhale') root.classList.add('mif-root--inhale');
        if (phase === 'exhale') root.classList.add('mif-root--exhale');

        const labels = {
            inhale: 'Inhale — expand',
            hold: 'Hold — stay steady',
            exhale: 'Exhale — release',
            rest: 'Rest — soften'
        };
        label.textContent = labels[phase] || phase;
        haptic(HAPTIC_PATTERNS[phase] || 14);
    }

    function advancePhase() {
        if (!mifRunning) return;
        mifPhaseIndex = (mifPhaseIndex + 1) % PHASES.length;
        applyPhase(PHASES[mifPhaseIndex]);
    }

    function renderComplete() {
        mifRunning = false;
        clearTimers();
        setInst('gʷədiʔ · HAPTIC GROUNDING COMPLETE');

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="mif-root">
                <p class="mif-phase-label">Session complete</p>
                <p class="mif-cue">Your nervous system tracked a steady haptic rhythm. Return when you need another grounding pass.</p>
                <button type="button" class="mif-ground-pad" id="mif-done-btn">Return to dashboard</button>
            </div>
        `;
        document.getElementById('mif-done-btn')?.addEventListener('click', () => exitProtocol());
    }

    function tick(now) {
        if (!mifRunning) {
            mifRafId = 0;
            return;
        }

        const elapsed = now - mifStartedAt;
        const remainingMs = Math.max(0, SESSION_MS - elapsed);
        const clock = document.getElementById('mif-clock');
        if (clock) clock.textContent = formatClock(remainingMs);
        setInst(`gʷədiʔ · HAPTIC GROUNDING · ${formatClock(remainingMs)}`);

        if (remainingMs <= 0) {
            renderComplete();
            return;
        }

        mifRafId = requestAnimationFrame(tick);
    }

    function renderSession() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.innerHTML = `
            <div class="mif-root mif-root--inhale" id="mif-root">
                <div class="mif-clock-row" aria-live="polite">
                    <span class="mif-clock-label">Grounding clock</span>
                    <strong class="mif-clock" id="mif-clock">${formatClock(SESSION_MS)}</strong>
                </div>
                <div class="mif-pulse-wrap" role="img" aria-label="Breathing pulse ring synced to haptic rhythm">
                    <div class="mif-pulse-ring" aria-hidden="true"></div>
                    <div class="mif-pulse-core" aria-hidden="true"></div>
                </div>
                <p class="mif-phase-label" id="mif-phase-label">Inhale — expand</p>
                <p class="mif-cue">Follow the pulse. Each phase delivers a short haptic tap to anchor sensation in the body.</p>
                <button type="button" class="mif-ground-pad" id="mif-ground-pad">Hold for extra grounding pulse</button>
            </div>
        `;

        const pad = document.getElementById('mif-ground-pad');
        if (pad) {
            const pulse = () => haptic([20, 30, 20, 30, 20]);
            pad.addEventListener('pointerdown', () => {
                pad.classList.add('is-held');
                pulse();
            });
            pad.addEventListener('pointerup', () => pad.classList.remove('is-held'));
            pad.addEventListener('pointerleave', () => pad.classList.remove('is-held'));
            pad.addEventListener('pointercancel', () => pad.classList.remove('is-held'));
        }

        mifRunning = true;
        mifPhaseIndex = 0;
        mifStartedAt = performance.now();
        applyPhase(PHASES[0]);
        mifPhaseTimerId = window.setInterval(advancePhase, PHASE_MS);
        mifRafId = requestAnimationFrame(tick);
    }

    function launchMIF() {
        stopMIF();
        const vp = document.getElementById('viewport');
        if (vp) vp.classList.add('viewport-mif');

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        setInst('gʷədiʔ · HAPTIC GROUNDING · READY');
        renderSession();
    }

    window.launchMIF = launchMIF;
    window.stopMIF = stopMIF;
})();
