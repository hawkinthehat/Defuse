/**
 * PRCB — Perceptual Rivalry Circuit Breaker: competing hemifield patterns to interrupt racing cognition.
 */
(function () {
    const SESSION_MS = 45000;
    const TOTAL_RESET_HOLD_MS = 480;
    const MAX_DPR = 2;

    let prcbRafId = 0;
    let prcbResetTimerId = 0;
    let prcbRunning = false;
    let prcbCanvas = null;
    let prcbCtx = null;
    let prcbResizeHandler = null;

    function clearTimers() {
        if (prcbRafId) {
            cancelAnimationFrame(prcbRafId);
            prcbRafId = 0;
        }
        if (prcbResetTimerId) {
            clearTimeout(prcbResetTimerId);
            prcbResetTimerId = 0;
        }
        if (prcbResizeHandler) {
            window.removeEventListener('resize', prcbResizeHandler);
            prcbResizeHandler = null;
        }
        prcbRunning = false;
    }

    function stopPRCB() {
        clearTimers();
        prcbCanvas = null;
        prcbCtx = null;
    }

    window.stopPRCB = stopPRCB;

    function resizeCanvas() {
        if (!prcbCanvas || !prcbCtx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const rect = prcbCanvas.getBoundingClientRect();
        prcbCanvas.width = Math.floor(rect.width * dpr);
        prcbCanvas.height = Math.floor(rect.height * dpr);
        prcbCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawRivalryFrame(ctx, w, h, t, intensity) {
        const leftPattern = Math.sin(t * 0.0045 + intensity * 2.4);
        const rightPattern = Math.cos(t * 0.0052 + intensity * 1.8);
        const dominance = Math.sin(t * 0.0018 * (1 + intensity * 2));

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        const mid = w * 0.5;
        const stripeW = 14 + intensity * 10;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, mid, h);
        ctx.clip();
        for (let x = -stripeW; x < mid + stripeW; x += stripeW) {
            const phase = (x + t * (0.35 + intensity)) % (stripeW * 2);
            ctx.fillStyle = phase < stripeW
                ? `rgba(220, 38, 38, ${0.55 + leftPattern * 0.25 + intensity * 0.2})`
                : `rgba(15, 23, 42, ${0.85 - intensity * 0.15})`;
            ctx.fillRect(x, 0, stripeW, h);
        }
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(mid, 0, mid, h);
        ctx.clip();
        for (let y = -stripeW; y < h + stripeW; y += stripeW) {
            const phase = (y - t * (0.42 + intensity)) % (stripeW * 2);
            ctx.fillStyle = phase < stripeW
                ? `rgba(37, 99, 235, ${0.55 + rightPattern * 0.25 + intensity * 0.2})`
                : `rgba(15, 23, 42, ${0.85 - intensity * 0.15})`;
            ctx.fillRect(mid, y, mid, stripeW);
        }
        ctx.restore();

        const pulse = 0.5 + 0.5 * dominance;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.04 + pulse * intensity * 0.12})`;
        ctx.fillRect(mid - 2, 0, 4, h);

        const orbR = Math.min(w, h) * (0.08 + intensity * 0.06);
        const orbX = mid + Math.sin(t * 0.003) * w * 0.18 * intensity;
        const orbY = h * 0.5 + Math.cos(t * 0.0026) * h * 0.12;
        const grad = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, orbR);
        grad.addColorStop(0, `rgba(248, 250, 252, ${0.35 + intensity * 0.35})`);
        grad.addColorStop(1, 'rgba(248, 250, 252, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbR, 0, Math.PI * 2);
        ctx.fill();
    }

    function startPrcbSequence() {
        clearTimers();

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        const inst = document.getElementById('inst');
        if (inst) inst.textContent = 'PERCEPTUAL RIVALRY · CIRCUIT BREAKER ACTIVE';

        stage.innerHTML = `
            <div class="prcb-root" id="prcb-root">
                <canvas class="prcb-rivalry-canvas" id="prcb-canvas" aria-hidden="true"></canvas>
                <div class="prcb-charge-ui" id="prcb-charge-ui">
                    <div class="prcb-circuit-head">
                        <span class="prcb-circuit-label">Rivalry load</span>
                        <span class="prcb-circuit-pct" id="prcb-charge-pct">0%</span>
                    </div>
                    <div class="prcb-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="prcb-progress-track">
                        <div class="prcb-progress-fill" id="prcb-progress-fill"></div>
                    </div>
                    <p class="prcb-charge-hint">Competing visual fields — hold gaze center until reset</p>
                </div>
                <div class="prcb-hud" id="prcb-hud">
                    <h1 class="prcb-status" id="prcb-status">CIRCUIT BREAK</h1>
                </div>
                <div class="prcb-total-reset hidden" id="prcb-total-reset" aria-hidden="true"></div>
            </div>
        `;

        prcbCanvas = document.getElementById('prcb-canvas');
        if (!prcbCanvas) return;
        prcbCtx = prcbCanvas.getContext('2d');
        if (!prcbCtx) return;

        const fillEl = document.getElementById('prcb-progress-fill');
        const pctEl = document.getElementById('prcb-charge-pct');
        const trackEl = document.getElementById('prcb-progress-track');
        const chargeUi = document.getElementById('prcb-charge-ui');
        const totalResetEl = document.getElementById('prcb-total-reset');

        prcbResizeHandler = () => resizeCanvas();
        window.addEventListener('resize', prcbResizeHandler);
        resizeCanvas();

        const tStart = performance.now();
        prcbRunning = true;

        function triggerTotalReset() {
            clearTimers();
            if (chargeUi) chargeUi.classList.add('hidden');
            const hud = document.getElementById('prcb-hud');
            if (hud) hud.classList.add('hidden');
            if (totalResetEl) totalResetEl.classList.remove('hidden');

            prcbResetTimerId = setTimeout(() => {
                prcbResetTimerId = 0;
                if (typeof exitProtocol === 'function') exitProtocol();
            }, TOTAL_RESET_HOLD_MS);
        }

        function frame(now) {
            if (!prcbRunning || !prcbCanvas?.isConnected || !prcbCtx) {
                clearTimers();
                return;
            }

            const elapsed = now - tStart;
            const charge = Math.min(1, elapsed / SESSION_MS);
            const pct = Math.round(charge * 100);

            if (fillEl) fillEl.style.width = `${pct}%`;
            if (pctEl) pctEl.textContent = `${pct}%`;
            if (trackEl) trackEl.setAttribute('aria-valuenow', String(pct));

            const rect = prcbCanvas.getBoundingClientRect();
            drawRivalryFrame(prcbCtx, rect.width, rect.height, now, charge);

            if (charge >= 1) {
                triggerTotalReset();
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

        const inst = document.getElementById('inst');
        if (inst) inst.textContent = 'Emergency circuit breaker — read safety notice.';

        if (!stage) return;

        stage.innerHTML = `
            <div class="prcb-warning-screen" id="prcb-warning-screen">
                <div class="prcb-warning-panel" role="dialog" aria-labelledby="prcb-warning-heading" aria-modal="true">
                    <p class="prcb-warning-kicker">tix̌ix̌dubut · Emergency reset</p>
                    <h2 class="prcb-warning-title" id="prcb-warning-heading">High-intensity visual override</h2>
                    <p class="prcb-warning-text">
                        This module uses <strong>competing high-contrast visual fields</strong> and rapid perceptual switching
                        to interrupt a locked racing mind. It is <strong>not appropriate</strong> if you have photosensitive epilepsy,
                        a history of seizures, or migraines triggered by visual patterns.
                    </p>
                    <p class="prcb-warning-text">
                        If you are unsure, choose <strong>Cancel</strong> and return to the dashboard. By continuing, you confirm you accept this sensory load.
                    </p>
                    <div class="prcb-warning-actions">
                        <button type="button" class="prcb-warn-btn prcb-warn-btn-cancel" id="prcb-warning-cancel">Cancel</button>
                        <button type="button" class="prcb-warn-btn prcb-warn-btn-ok" id="prcb-warning-continue">I understand — begin</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('prcb-warning-cancel')?.addEventListener('click', () => {
            if (typeof exitProtocol === 'function') exitProtocol();
        });

        document.getElementById('prcb-warning-continue')?.addEventListener('click', () => {
            startPrcbSequence();
        });
    };
})();
