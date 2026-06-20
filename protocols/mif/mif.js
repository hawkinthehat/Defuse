/**
 * MIF — Haptic Grounding (gʷədiʔ): rhythmic bilateral haptic pulses synced to breath phases.
 * On iOS, haptics are replaced by a visual pulse overlay at touch coordinates.
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
    let lastTouchCoords = null;

    function isIOS() {
        if (typeof navigator === 'undefined') return false;
        const ua = navigator.userAgent || '';
        const platform = navigator.platform || '';
        if (/iPad|iPhone|iPod/.test(ua) || /iPad|iPhone|iPod/.test(platform)) return true;
        return platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    }

    const useVisualPulse = isIOS();

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

    function defaultPulseCoords() {
        const wrap = document.querySelector('.mif-pulse-wrap');
        if (wrap) {
            const rect = wrap.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    function resolveCoords(coords) {
        if (coords && Number.isFinite(coords.x) && Number.isFinite(coords.y)) {
            return coords;
        }
        if (lastTouchCoords) return lastTouchCoords;
        return defaultPulseCoords();
    }

    function visualPulseAt(x, y, durationMs) {
        const layer = document.getElementById('mif-visual-pulse-layer');
        if (!layer) return;

        const pulse = document.createElement('div');
        pulse.className = 'mif-visual-pulse';
        pulse.style.left = `${x}px`;
        pulse.style.top = `${y}px`;
        pulse.style.setProperty('--mif-pulse-ms', `${durationMs}ms`);
        layer.appendChild(pulse);

        const cleanup = () => pulse.remove();
        pulse.addEventListener('animationend', cleanup, { once: true });
        window.setTimeout(cleanup, durationMs + 120);
    }

    function visualPulsePattern(coords, pattern) {
        const { x, y } = resolveCoords(coords);
        const segments = Array.isArray(pattern) ? pattern : [pattern];
        let delay = 0;

        segments.forEach((segmentMs, index) => {
            if (index % 2 === 0) {
                window.setTimeout(() => visualPulseAt(x, y, segmentMs), delay);
            }
            delay += segmentMs;
        });
    }

    function haptic(pattern, coords) {
        if (useVisualPulse) {
            visualPulsePattern(coords, pattern);
            return;
        }
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(pattern);
        } catch {
            /* ignore */
        }
    }

    function clearVisualPulseLayer() {
        const layer = document.getElementById('mif-visual-pulse-layer');
        if (layer) layer.innerHTML = '';
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
        clearVisualPulseLayer();
        lastTouchCoords = null;
        const vp = document.getElementById('viewport');
        if (vp) vp.classList.remove('viewport-mif');
        if (!useVisualPulse && typeof navigator !== 'undefined' && navigator.vibrate) {
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
        clearVisualPulseLayer();
        setInst('gʷədiʔ · HAPTIC GROUNDING COMPLETE');

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="mif-root">
                <p class="mif-phase-label">Session complete</p>
                <p class="mif-cue">Your nervous system tracked a steady ${useVisualPulse ? 'visual' : 'haptic'} rhythm. Return when you need another grounding pass.</p>
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

        const cueText = useVisualPulse
            ? 'Follow the pulse. On this device, each phase delivers a brief visual flash at your touch point instead of vibration.'
            : 'Follow the pulse. Each phase delivers a short haptic tap to anchor sensation in the body.';

        stage.innerHTML = `
            <div class="mif-visual-pulse-layer${useVisualPulse ? ' mif-visual-pulse-layer--active' : ''}" id="mif-visual-pulse-layer" aria-hidden="true"></div>
            <div class="mif-root mif-root--inhale${useVisualPulse ? ' mif-root--visual-fallback' : ''}" id="mif-root">
                <div class="mif-clock-row" aria-live="polite">
                    <span class="mif-clock-label">Grounding clock</span>
                    <strong class="mif-clock" id="mif-clock">${formatClock(SESSION_MS)}</strong>
                </div>
                <div class="mif-pulse-wrap" role="img" aria-label="Breathing pulse ring synced to ${useVisualPulse ? 'visual' : 'haptic'} rhythm">
                    <div class="mif-pulse-ring" aria-hidden="true"></div>
                    <div class="mif-pulse-core" aria-hidden="true"></div>
                </div>
                <p class="mif-phase-label" id="mif-phase-label">Inhale — expand</p>
                <p class="mif-cue">${cueText}</p>
                <button type="button" class="mif-ground-pad" id="mif-ground-pad">Hold for extra grounding pulse</button>
            </div>
        `;

        const pad = document.getElementById('mif-ground-pad');
        if (pad) {
            const pulseAt = (event) => {
                const coords = { x: event.clientX, y: event.clientY };
                lastTouchCoords = coords;
                haptic([20, 30, 20, 30, 20], coords);
            };

            pad.addEventListener('pointerdown', (event) => {
                pad.classList.add('is-held');
                lastTouchCoords = { x: event.clientX, y: event.clientY };
                pulseAt(event);
            });
            pad.addEventListener('pointermove', (event) => {
                if (!pad.classList.contains('is-held')) return;
                lastTouchCoords = { x: event.clientX, y: event.clientY };
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
