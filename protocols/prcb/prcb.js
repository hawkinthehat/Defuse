/**
 * PRCB — Emergency Reset: press-and-hold central pad until visuals settle.
 * Release or exit at any millisecond. No forced completion.
 */
(function () {
    const HOLD_TO_SETTLE_MS = 4200;
    const MAX_DPR = 2;
    const PROTOCOL_HEADER = 'Emergency Reset';

    let prcbRafId = 0;
    let prcbRunning = false;
    let prcbCanvas = null;
    let prcbCtx = null;
    let prcbResizeHandler = null;
    let holdActive = false;
    let holdAccumMs = 0;
    let lastFrameMs = 0;
    let settled = false;

    function setProtocolHeader() {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = PROTOCOL_HEADER;
    }

    function clearTimers() {
        if (prcbRafId) {
            cancelAnimationFrame(prcbRafId);
            prcbRafId = 0;
        }
        if (prcbResizeHandler) {
            window.removeEventListener('resize', prcbResizeHandler);
            prcbResizeHandler = null;
        }
        prcbRunning = false;
        holdActive = false;
        holdAccumMs = 0;
        lastFrameMs = 0;
        settled = false;
    }

    function stopPRCB() {
        clearTimers();
        prcbCanvas = null;
        prcbCtx = null;
    }

    window.stopPRCB = stopPRCB;

    function softHaptic(ms) {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(ms || 20);
        } catch {
            /* ignore */
        }
    }

    function resizeCanvas() {
        if (!prcbCanvas || !prcbCtx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const rect = prcbCanvas.getBoundingClientRect();
        prcbCanvas.width = Math.floor(rect.width * dpr);
        prcbCanvas.height = Math.floor(rect.height * dpr);
        prcbCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawSettleFrame(ctx, w, h, intensity, now) {
        const calm = Math.min(1, Math.max(0, intensity));
        const chaos = 1 - calm;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        const stripeW = 10 + chaos * 14;
        const mid = w * 0.5;
        const sway = Math.sin(now * 0.0035) * chaos * 18;

        ctx.save();
        ctx.globalAlpha = 0.35 + chaos * 0.45;
        for (let x = -stripeW; x < w + stripeW; x += stripeW) {
            const phase = (x + now * (0.2 + chaos * 0.4) + sway) % (stripeW * 2);
            ctx.fillStyle = phase < stripeW
                ? `rgba(220, 38, 38, ${0.25 + chaos * 0.4})`
                : `rgba(37, 99, 235, ${0.22 + chaos * 0.35})`;
            ctx.fillRect(x, 0, stripeW, h);
        }
        ctx.restore();

        /* Softening veil as hold progresses */
        ctx.fillStyle = `rgba(2, 6, 23, ${0.15 + calm * 0.72})`;
        ctx.fillRect(0, 0, w, h);

        const orbR = Math.min(w, h) * (0.1 + calm * 0.08);
        const grad = ctx.createRadialGradient(mid, h * 0.42, 0, mid, h * 0.42, orbR * 2.2);
        grad.addColorStop(0, `rgba(226, 232, 240, ${0.18 + calm * 0.35})`);
        grad.addColorStop(1, 'rgba(226, 232, 240, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mid, h * 0.42, orbR * 2.2, 0, Math.PI * 2);
        ctx.fill();
    }

    function finishGently() {
        if (settled) return;
        settled = true;
        prcbRunning = false;
        holdActive = false;
        softHaptic(30);
        if (typeof completeProtocolGently === 'function') {
            completeProtocolGently();
        } else if (typeof requestStopProtocol === 'function') {
            requestStopProtocol();
        } else if (typeof exitProtocol === 'function') {
            exitProtocol();
        }
    }

    function startPrcbSequence() {
        clearTimers();

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        setProtocolHeader();

        stage.innerHTML = `
            <div class="prcb-root" id="prcb-root">
                <canvas class="prcb-rivalry-canvas" id="prcb-canvas" aria-hidden="true"></canvas>
                <div class="prcb-charge-ui" id="prcb-charge-ui">
                    <div class="prcb-circuit-head">
                        <span class="prcb-circuit-label">Settling</span>
                        <span class="prcb-circuit-pct" id="prcb-charge-pct">0%</span>
                    </div>
                    <div class="prcb-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="prcb-progress-track">
                        <div class="prcb-progress-fill" id="prcb-progress-fill"></div>
                    </div>
                    <p class="prcb-charge-hint">Press and hold the pad. Release anytime.</p>
                </div>
                <div class="prcb-hold-wrap">
                    <button type="button" class="prcb-hold-pad" id="prcb-hold-pad" aria-pressed="false">
                        Hold to settle
                    </button>
                </div>
            </div>
        `;

        prcbCanvas = document.getElementById('prcb-canvas');
        if (!prcbCanvas) return;
        prcbCtx = prcbCanvas.getContext('2d');
        if (!prcbCtx) return;

        const fillEl = document.getElementById('prcb-progress-fill');
        const pctEl = document.getElementById('prcb-charge-pct');
        const trackEl = document.getElementById('prcb-progress-track');
        const pad = document.getElementById('prcb-hold-pad');

        prcbResizeHandler = () => resizeCanvas();
        window.addEventListener('resize', prcbResizeHandler);
        resizeCanvas();

        const setHolding = (active) => {
            if (!prcbRunning || settled) return;
            holdActive = active;
            if (pad) {
                pad.classList.toggle('is-holding', active);
                pad.setAttribute('aria-pressed', active ? 'true' : 'false');
                pad.textContent = active ? 'Holding…' : 'Hold to settle';
            }
            if (active) softHaptic(14);
        };

        if (pad) {
            const onDown = (event) => {
                event.preventDefault();
                try {
                    pad.setPointerCapture(event.pointerId);
                } catch {
                    /* ignore */
                }
                setHolding(true);
            };
            const onUp = (event) => {
                event.preventDefault();
                setHolding(false);
            };
            pad.addEventListener('pointerdown', onDown);
            pad.addEventListener('pointerup', onUp);
            pad.addEventListener('pointercancel', onUp);
            pad.addEventListener('pointerleave', onUp);
        }

        prcbRunning = true;
        holdAccumMs = 0;
        lastFrameMs = 0;

        function frame(now) {
            if (!prcbRunning || !prcbCanvas?.isConnected || !prcbCtx) {
                clearTimers();
                return;
            }

            if (!lastFrameMs) lastFrameMs = now;
            const dt = Math.min(50, now - lastFrameMs);
            lastFrameMs = now;

            if (holdActive) {
                holdAccumMs = Math.min(HOLD_TO_SETTLE_MS, holdAccumMs + dt);
            }

            const charge = Math.min(1, holdAccumMs / HOLD_TO_SETTLE_MS);
            const pct = Math.round(charge * 100);

            if (fillEl) fillEl.style.width = `${pct}%`;
            if (pctEl) pctEl.textContent = `${pct}%`;
            if (trackEl) trackEl.setAttribute('aria-valuenow', String(pct));

            const rect = prcbCanvas.getBoundingClientRect();
            drawSettleFrame(prcbCtx, rect.width, rect.height, charge, now);

            if (charge >= 1) {
                finishGently();
                return;
            }

            prcbRafId = requestAnimationFrame(frame);
        }

        prcbRafId = requestAnimationFrame(frame);
    }

    window.launchPRCB = function launchPRCB() {
        clearTimers();

        const stage = document.getElementById('protocol-stage');
        if (typeof showProtocolViewport === 'function') showProtocolViewport();

        setProtocolHeader();
        if (!stage) return;

        /* No heavy pre-entry legal wall — youth instruction card only. */
        stage.innerHTML = `<div class="prcb-root prcb-root--onboarding" id="prcb-onboarding-root"></div>`;
        const root = document.getElementById('prcb-onboarding-root');

        if (root && typeof window.ProtocolOnboarding !== 'undefined' && window.ProtocolOnboarding.mount) {
            window.ProtocolOnboarding.mount(root, {
                protocolKey: 'prcb',
                onStart: startPrcbSequence,
                replace: true
            });
        } else {
            startPrcbSequence();
        }
    };
})();
