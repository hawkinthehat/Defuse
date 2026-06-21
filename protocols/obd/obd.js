/**
 * dᶻix̌ʷ — EMDR bilateral infinity loop (lemniscate), OKN ripple field, grounding-pad gate.
 */
(function () {
    const SESSION_MS = 60000;
    const PHASE_MS = 30000;
    const LOOP_PERIOD_SLOW = 5.8;
    const LOOP_PERIOD_FAST = 3.4;
    const CENTER_HAPTIC_MS = 30;
    const MAX_DPR = 2;
    const TWO_PI = Math.PI * 2;
    const PADDLE_SRC = 'protocols/obd/assets/paddle-blade.svg';
    const PROTOCOL_LABEL = 'dᶻix̌ʷ (dzih-khw)';

    function setProtocolHeader() {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = PROTOCOL_LABEL;
    }

    function setObdInstruct(text) {
        const el = document.querySelector('.obd-instruct');
        if (el) el.textContent = text;
    }

    let obdRunning = false;
    let obdRafId = 0;
    let obdPhaseTimeoutId = 0;
    let obdExitTimeoutId = 0;
    let obdCanvas = null;
    let obdCtx = null;
    let obdCssW = 0;
    let obdCssH = 0;
    let obdResizeHandler = null;
    let paddleImage = null;
    let paddleLoadPromise = null;

    let holding = false;
    let pathT = 0;
    let loopPeriodSec = LOOP_PERIOD_SLOW;
    let lastFrame = 0;
    let lastApexIndex = -1;
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
        if (typeof window.OBDBilateralAudio !== 'undefined' && window.OBDBilateralAudio.teardown) {
            window.OBDBilateralAudio.teardown();
        }
        if (typeof window.OBDVisual !== 'undefined' && window.OBDVisual.unmount) {
            window.OBDVisual.unmount();
        }
        if (typeof window.OBDAudio !== 'undefined' && window.OBDAudio.stop) {
            window.OBDAudio.stop();
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
        setObdInstruct(text);
    }

    function centerHaptic() {
        if (!holding || typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(CENTER_HAPTIC_MS);
        } catch {
            /* ignore */
        }
    }

    function playApexFeedback() {
        centerHaptic();
        if (typeof window.OBDAudio !== 'undefined' && window.OBDAudio.playGunwaleStrike) {
            window.OBDAudio.playGunwaleStrike();
        }
    }

    function loadPaddleImage() {
        if (paddleImage && paddleImage.complete) return Promise.resolve(paddleImage);
        if (paddleLoadPromise) return paddleLoadPromise;

        paddleLoadPromise = new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                paddleImage = img;
                resolve(img);
            };
            img.onerror = () => resolve(null);
            img.src = PADDLE_SRC;
        });

        return paddleLoadPromise;
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
        const ctx = canvas.getContext('2d', { alpha: true });
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    function drawPaddle(ctx, px, py, tangentAngle) {
        const scale = Math.min(obdCssW, obdCssH) * 0.13;
        const paddleW = scale * 0.48;
        const paddleH = scale * 1.65;

        ctx.save();
        ctx.translate(px, py);
        /* Blade leads along path tangent — vertical silhouette slices through the loop */
        ctx.rotate(tangentAngle + Math.PI / 2);

        if (paddleImage && paddleImage.complete) {
            const paddleX = -paddleW * 0.5;
            const paddleY = -paddleH * 0.42;
            /* High-contrast halo — sharp silhouette against blue/teal gradient phases */
            ctx.shadowColor = 'rgba(255, 255, 255, 0.82)';
            ctx.shadowBlur = 14;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.drawImage(paddleImage, paddleX, paddleY, paddleW, paddleH);
            ctx.shadowColor = 'rgba(15, 23, 42, 0.5)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
            ctx.drawImage(paddleImage, paddleX, paddleY, paddleW, paddleH);
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
            ctx.shadowOffsetY = 0;
            ctx.drawImage(paddleImage, paddleX, paddleY, paddleW, paddleH);
        } else {
            ctx.shadowColor = 'rgba(255, 255, 255, 0.82)';
            ctx.shadowBlur = 14;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            const grad = ctx.createLinearGradient(-paddleW * 0.5, 0, paddleW * 0.5, 0);
            grad.addColorStop(0, '#5C3D24');
            grad.addColorStop(0.35, '#A67C52');
            grad.addColorStop(0.65, '#8B5E3C');
            grad.addColorStop(1, '#4A2F1A');
            ctx.fillStyle = grad;
            ctx.strokeStyle = '#2A1A0E';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -paddleH * 0.42);
            ctx.bezierCurveTo(paddleW * 0.52, -paddleH * 0.32, paddleW * 0.48, paddleH * 0.08, 0, paddleH * 0.18);
            ctx.bezierCurveTo(-paddleW * 0.48, paddleH * 0.08, -paddleW * 0.52, -paddleH * 0.32, 0, -paddleH * 0.42);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#6B4423';
            ctx.fillRect(-paddleW * 0.12, paddleH * 0.12, paddleW * 0.24, paddleH * 0.38);
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        }

        ctx.restore();
    }

    function updatePausedBanner() {
        const banner = document.getElementById('obd-paused-banner');
        if (banner) banner.classList.toggle('obd-paused-banner--visible', !holding && obdRunning);
    }

    /**
     * Fire somatic/audio feedback at figure-eight apex (peak and trough).
     * Boundaries align to vertical extrema every π/2, offset by π/4.
     */
    function checkApexCrossing(prevT, t) {
        const apexPeriod = Math.PI / 2;
        const apexOffset = Math.PI / 4;
        const idxBefore = Math.floor((prevT + apexOffset) / apexPeriod);
        const idxAfter = Math.floor((t + apexOffset) / apexPeriod);
        if (idxAfter > idxBefore && idxAfter !== lastApexIndex) {
            lastApexIndex = idxAfter;
            playApexFeedback();
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
            checkApexCrossing(prevT, pathT);
        }

        const cx = obdCssW * 0.5;
        const cy = obdCssH * 0.5;
        const A = obdCssW * 0.4;
        const B = obdCssH * 0.36;
        const p = lemniscate(pathT, A, B);
        const pAhead = lemniscate(pathT + 0.04, A, B);
        const px = cx + p.x;
        const py = cy + p.y;
        const tangentAngle = Math.atan2(pAhead.y - p.y, pAhead.x - p.x);

        const ctx = obdCtx;
        ctx.clearRect(0, 0, obdCssW, obdCssH);
        drawPaddle(ctx, px, py, tangentAngle);

        if (holding && typeof window.OBDBilateralAudio !== 'undefined' && window.OBDBilateralAudio.updateFromPaddle) {
            window.OBDBilateralAudio.updateFromPaddle(px, obdCssW, dt);
        }

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
            setInst(fastPhase ? 'Increased loop speed — maintain smooth tracking' : 'Infinity tracking — follow the paddle blade');
            if (typeof window.OBDAudio !== 'undefined') {
                if (window.OBDAudio.prime) window.OBDAudio.prime();
                if (typeof window.OBDBilateralAudio !== 'undefined' && window.OBDBilateralAudio.prepare) {
                    window.OBDBilateralAudio.prepare();
                }
                if (window.OBDAudio.startBabblingCreek) window.OBDAudio.startBabblingCreek();
            }
        };

        const onUp = (e) => {
            if (!obdRunning) return;
            e.preventDefault();
            holding = false;
            pad.classList.remove('obd-ground-pad--active');
            updatePausedBanner();
            setInst('Re-establish contact with the grounding pad');
            if (typeof window.OBDAudio !== 'undefined' && window.OBDAudio.stopBabblingCreek) {
                window.OBDAudio.stopBabblingCreek();
            }
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
                <p class="obd-instruct">Maintain contact with the grounding pad. Allow your eyes to smoothly track the paddle blade through the infinity loop.</p>
                <div class="obd-stage">
                    <canvas class="obd-bg-canvas" id="obd-bg-canvas" aria-hidden="true"></canvas>
                    <canvas class="obd-canvas" id="obd-canvas" aria-label="Infinity loop tracking field with canoe paddle blade"></canvas>
                    <p class="obd-paused-banner" id="obd-paused-banner" role="status">Paused — re-establish contact</p>
                </div>
                <div class="obd-pad-wrap">
                    <button type="button" class="obd-ground-pad" id="obd-ground-pad">Hold to stabilize view</button>
                </div>
            </div>
        `;

        obdCanvas = document.getElementById('obd-canvas');
        const bgCanvas = document.getElementById('obd-bg-canvas');
        const pad = document.getElementById('obd-ground-pad');
        if (!obdCanvas) return;

        if (typeof window.OBDVisual !== 'undefined' && window.OBDVisual.mount && bgCanvas) {
            window.OBDVisual.mount(bgCanvas);
        }

        obdCtx = fitCanvas(obdCanvas);
        bindGroundPad(pad);
        loadPaddleImage();

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
        loopPeriodSec = LOOP_PERIOD_SLOW;
        fastPhase = false;
        lastFrame = 0;
        lastApexIndex = -1;

        showProtocolViewport();
        setProtocolHeader();
        setInst('Hold the grounding pad to begin');

        renderShell();
        updatePausedBanner();
        if (typeof window.OBDAudio !== 'undefined' && window.OBDAudio.prime) {
            window.OBDAudio.prime();
        }
        if (typeof window.OBDBilateralAudio !== 'undefined' && window.OBDBilateralAudio.prepare) {
            window.OBDBilateralAudio.prepare();
        }
        obdRafId = requestAnimationFrame(frame);

        obdPhaseTimeoutId = window.setTimeout(() => {
            obdPhaseTimeoutId = 0;
            if (!obdRunning) return;
            fastPhase = true;
            loopPeriodSec = LOOP_PERIOD_FAST;
            if (holding) setInst('Increased loop speed — maintain smooth tracking');
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
