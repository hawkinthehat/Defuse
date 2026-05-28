/**
 * OBD — EMDR bilateral infinity loop (lemniscate), OKN field, grounding-pad gate.
 */
(function () {
    const SESSION_MS = 60000;
    const PHASE_MS = 30000;
    const LOOP_PERIOD_SLOW = 5.8;
    const LOOP_PERIOD_FAST = 3.4;
    const OKN_SCROLL_PX_PER_SEC = 36;
    const CENTER_HAPTIC_MS = 30;
    const MAX_DPR = 2;
    const TWO_PI = Math.PI * 2;

    let obdRunning = false;
    let obdRafId = 0;
    let obdPhaseTimeoutId = 0;
    let obdExitTimeoutId = 0;
    let obdCanvas = null;
    let obdCtx = null;
    let obdCssW = 0;
    let obdCssH = 0;
    let obdResizeHandler = null;

    let holding = false;
    let pathT = 0;
    let oknOffset = 0;
    let loopPeriodSec = LOOP_PERIOD_SLOW;
    let lastFrame = 0;
    let lastCrossIndex = -1;
    let fastPhase = false;

    function stopOBD() {
        obdRunning = false;
        holding = false;
        if (obdRafId) {
            cancelAnimationFrame(obdRafId);
            obdRafId = 0;
        }
        if (obdPhaseTimeoutId) {
            clearTimeout(obdPhaseTimeoutId);
            obdPhaseTimeoutId = 0;
        }
        if (obdExitTimeoutId) {
            clearTimeout(obdExitTimeoutId);
            obdExitTimeoutId = 0;
        }
        if (obdResizeHandler) {
            window.removeEventListener('resize', obdResizeHandler);
            obdResizeHandler = null;
        }
        if (obdCanvas && obdCanvas._obdPadDown) {
            const pad = document.getElementById('obd-ground-pad');
            if (pad) {
                pad.removeEventListener('pointerdown', obdCanvas._obdPadDown);
                pad.removeEventListener('pointerup', obdCanvas._obdPadUp);
                pad.removeEventListener('pointerleave', obdCanvas._obdPadUp);
                pad.removeEventListener('pointercancel', obdCanvas._obdPadUp);
            }
        }
        obdCanvas = null;
        obdCtx = null;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try {
                navigator.vibrate(0);
            } catch {
                /* ignore */
            }
        }
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function centerHaptic() {
        if (!holding || typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(CENTER_HAPTIC_MS);
        } catch {
            /* ignore */
        }
    }

    /**
     * Lemniscate of Bernoulli (parametric).
     * x = (A * cos(t)) / (1 + sin(t)^2)
     * y = (B * sin(t) * cos(t)) / (1 + sin(t)^2)
     */
    function lemniscate(t, A, B) {
        const st = Math.sin(t);
        const ct = Math.cos(t);
        const denom = 1 + st * st;
        return {
            x: (A * ct) / denom,
            y: (B * st * ct) / denom
        };
    }

    function fitCanvas(canvas) {
        const stage = canvas.parentElement;
        const rect = (stage || canvas).getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        obdCssW = Math.max(1, Math.floor(rect.width));
        obdCssH = Math.max(1, Math.floor(rect.height));
        canvas.width = Math.floor(obdCssW * dpr);
        canvas.height = Math.floor(obdCssH * dpr);
        canvas.style.width = `${obdCssW}px`;
        canvas.style.height = `${obdCssH}px`;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    function drawOkn(ctx) {
        const spacing = 22;
        const start = -(oknOffset % spacing);
        ctx.lineWidth = 1;
        for (let x = start; x < obdCssW + spacing; x += spacing) {
            const fade = 0.55 + 0.25 * (0.5 + 0.5 * Math.sin(x * 0.08));
            ctx.strokeStyle = `rgba(226, 232, 240, ${fade})`;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, obdCssH);
            ctx.stroke();
        }
        for (let y = 0; y < obdCssH; y += 48) {
            ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)';
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(obdCssW, y);
            ctx.stroke();
        }
    }

    function drawDot(ctx, px, py) {
        const r = Math.min(obdCssW, obdCssH) * 0.028;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
        grad.addColorStop(0, '#93c5fd');
        grad.addColorStop(0.45, '#2563eb');
        grad.addColorStop(1, 'rgba(37, 99, 235, 0.12)');
        ctx.save();
        ctx.shadowColor = 'rgba(37, 99, 235, 0.45)';
        ctx.shadowBlur = 18;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(10, r), 0, TWO_PI);
        ctx.fill();
        ctx.restore();
    }

    function updatePausedBanner() {
        const banner = document.getElementById('obd-paused-banner');
        if (banner) banner.classList.toggle('obd-paused-banner--visible', !holding && obdRunning);
    }

    function checkCenterCrossing(prevT, t) {
        const idxBefore = Math.floor((prevT - Math.PI / 2) / Math.PI);
        const idxAfter = Math.floor((t - Math.PI / 2) / Math.PI);
        if (idxAfter > idxBefore && idxAfter !== lastCrossIndex) {
            lastCrossIndex = idxAfter;
            centerHaptic();
        }
    }

    function frame(now) {
        if (!obdRunning) {
            obdRafId = 0;
            return;
        }

        const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0.016;
        lastFrame = now;

        const prevT = pathT;
        if (holding) {
            pathT += (TWO_PI / loopPeriodSec) * dt;
            oknOffset += OKN_SCROLL_PX_PER_SEC * dt;
            checkCenterCrossing(prevT, pathT);
        }

        const cx = obdCssW * 0.5;
        const cy = obdCssH * 0.5;
        const A = obdCssW * 0.4;
        const B = obdCssH * 0.36;
        const p = lemniscate(pathT, A, B);
        const px = cx + p.x;
        const py = cy + p.y;

        const ctx = obdCtx;
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, obdCssW, obdCssH);
        drawOkn(ctx);
        drawDot(ctx, px, py);

        obdRafId = requestAnimationFrame(frame);
    }

    function bindGroundPad(pad) {
        const opts = { passive: false };

        const onDown = (e) => {
            if (!obdRunning) return;
            e.preventDefault();
            holding = true;
            lastFrame = performance.now();
            pad.classList.add('obd-ground-pad--active');
            updatePausedBanner();
            setInst(fastPhase ? 'OBD · INCREASED LOOP SPEED' : 'OBD · INFINITY TRACKING');
        };

        const onUp = (e) => {
            if (!obdRunning) return;
            e.preventDefault();
            holding = false;
            pad.classList.remove('obd-ground-pad--active');
            updatePausedBanner();
            setInst('OBD · RE-ESTABLISH CONTACT');
        };

        pad.addEventListener('pointerdown', onDown, opts);
        pad.addEventListener('pointerup', onUp, opts);
        pad.addEventListener('pointerleave', onUp, opts);
        pad.addEventListener('pointercancel', onUp, opts);
        pad.addEventListener('contextmenu', (e) => e.preventDefault());

        if (obdCanvas) {
            obdCanvas._obdPadDown = onDown;
            obdCanvas._obdPadUp = onUp;
        }
    }

    function renderShell() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.innerHTML = `
            <div class="obd-root">
                <p class="obd-instruct">Maintain contact with the grounding pad. Allow your eyes to smoothly track the focal point through the infinity loop.</p>
                <div class="obd-stage">
                    <canvas class="obd-canvas" id="obd-canvas" aria-label="Infinity loop tracking field"></canvas>
                    <p class="obd-paused-banner" id="obd-paused-banner" role="status">Paused — re-establish contact</p>
                </div>
                <div class="obd-pad-wrap">
                    <button type="button" class="obd-ground-pad" id="obd-ground-pad">Hold to stabilize view</button>
                </div>
            </div>
        `;

        obdCanvas = document.getElementById('obd-canvas');
        const pad = document.getElementById('obd-ground-pad');
        if (!obdCanvas) return;

        obdCtx = fitCanvas(obdCanvas);
        bindGroundPad(pad);

        obdResizeHandler = () => {
            if (!obdRunning || !obdCanvas) return;
            obdCtx = fitCanvas(obdCanvas);
        };
        window.addEventListener('resize', obdResizeHandler);
    }

    function launchOBD() {
        stopOBD();
        obdRunning = true;
        holding = false;
        pathT = 0;
        oknOffset = 0;
        loopPeriodSec = LOOP_PERIOD_SLOW;
        fastPhase = false;
        lastFrame = 0;
        lastCrossIndex = -1;

        showProtocolViewport();
        setInst('OBD · HOLD GROUNDING PAD TO BEGIN');

        renderShell();
        updatePausedBanner();
        obdRafId = requestAnimationFrame(frame);

        obdPhaseTimeoutId = window.setTimeout(() => {
            obdPhaseTimeoutId = 0;
            if (!obdRunning) return;
            fastPhase = true;
            loopPeriodSec = LOOP_PERIOD_FAST;
            if (holding) setInst('OBD · INCREASED LOOP SPEED');
        }, PHASE_MS);

        obdExitTimeoutId = window.setTimeout(() => {
            obdExitTimeoutId = 0;
            stopOBD();
            exitProtocol();
        }, SESSION_MS);
    }

    window.launchOBD = launchOBD;
    window.stopOBD = stopOBD;
})();
