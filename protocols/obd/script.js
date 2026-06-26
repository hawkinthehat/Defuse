/**
 * dᶻix̌ʷ (OBD) — Acoustic bilateral panning + dark water background / vertical tracking sine-wave grid.
 */
(function () {
    const MIN_RAMP_SEC = 0.001;
    const RESET_RAMP_SEC = 0.05;

    const SINE_STROKE = 'rgba(45, 212, 191, 0.25)';
    const SINE_COLUMN_GAP = 70;
    const SINE_SEGMENT_STEP = 6;
    const GRADIENT_CYCLE_MS = 24000;
    const SINE_TRACK_CYCLE_MS = 24000;
    const MAX_DPR = 2;

    let stereoPanner = null;
    let pannerContext = null;
    /** Default-off — bilateral panning stays disconnected until global acoustic entrainment is enabled. */
    let bilateralAudioEnabled = false;

    function isBilateralAudioAllowed() {
        if (typeof window.GlobalBinauralEngine !== 'undefined' && window.GlobalBinauralEngine.isThetaEnabled) {
            return true;
        }
        return bilateralAudioEnabled;
    }

    function setBilateralAudioEnabled(enabled) {
        bilateralAudioEnabled = Boolean(enabled);
        if (!bilateralAudioEnabled) {
            disconnectStereoPanner();
        }
    }

    let bgCanvas = null;
    let bgCtx = null;
    let bgCssW = 0;
    let bgCssH = 0;
    let bgRafId = 0;
    let bgRunning = false;
    let bgResizeHandler = null;
    let gradientStart = 0;
    let wavePhase = 0;
    let paddleX = 0;
    let frameCount = 0;

    function getSharedAudioContext() {
        if (typeof window.OBDAudio === 'undefined' || !window.OBDAudio.getAudioContext) return null;
        return window.OBDAudio.getAudioContext();
    }

    function paddleXToPan(px, screenWidth) {
        if (!screenWidth || screenWidth <= 0) return 0;
        return Math.max(-1, Math.min(1, (px / screenWidth) * 2 - 1));
    }

    function disconnectStereoPanner() {
        if (!stereoPanner) return;

        try {
            stereoPanner.disconnect();
        } catch {
            /* ignore */
        }

        stereoPanner = null;
        pannerContext = null;

        if (typeof window.OBDAudio !== 'undefined' && window.OBDAudio.setCreekSink) {
            window.OBDAudio.setCreekSink(null);
        }
    }

    function ensureStereoPanner() {
        if (!isBilateralAudioAllowed()) return null;

        const ctx = getSharedAudioContext();
        if (!ctx) return null;

        if (stereoPanner && pannerContext === ctx) return stereoPanner;

        disconnectStereoPanner();

        stereoPanner = ctx.createStereoPanner();
        stereoPanner.pan.setValueAtTime(0, ctx.currentTime);
        stereoPanner.connect(ctx.destination);
        pannerContext = ctx;

        if (typeof window.OBDAudio !== 'undefined') {
            if (window.OBDAudio.setCreekSink) window.OBDAudio.setCreekSink(stereoPanner);
            if (window.OBDAudio.reconnectCreekOutput) window.OBDAudio.reconnectCreekOutput();
        }

        return stereoPanner;
    }

    function rampPanTo(pan, rampSec) {
        const panner = ensureStereoPanner();
        const ctx = getSharedAudioContext();
        if (!panner || !ctx) return;

        const clamped = Math.max(-1, Math.min(1, pan));
        const now = ctx.currentTime;
        const ramp = Math.max(MIN_RAMP_SEC, rampSec || 0.016);
        const panParam = panner.pan;

        panParam.cancelScheduledValues(now);
        panParam.setValueAtTime(panParam.value, now);
        panParam.linearRampToValueAtTime(clamped, now + ramp);
    }

    function prepareBilateralPanner() {
        if (!isBilateralAudioAllowed()) return;
        ensureStereoPanner();
    }

    function updateFromPaddle(px, screenWidth, dtSec) {
        if (!isBilateralAudioAllowed()) return;
        rampPanTo(paddleXToPan(px, screenWidth), dtSec);
    }

    function resetBilateralPan() {
        if (!stereoPanner) return;
        rampPanTo(0, RESET_RAMP_SEC);
    }

    function teardownBilateralPanner() {
        disconnectStereoPanner();
    }

    function fitBackgroundCanvas(canvas) {
        const stage = canvas.parentElement;
        const rect = (stage || canvas).getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        bgCssW = Math.max(1, Math.floor(rect.width));
        bgCssH = Math.max(1, Math.floor(rect.height));
        canvas.width = Math.floor(bgCssW * dpr);
        canvas.height = Math.floor(bgCssH * dpr);
        canvas.style.width = `${bgCssW}px`;
        canvas.style.height = `${bgCssH}px`;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    /**
     * Ultra-dark water pool — rich teal depth fading to black.
     */
    function drawWaterBackground(ctx, w, h, phase) {
        const shift = phase * 0.35;

        const pool = ctx.createLinearGradient(0, 0, 0, h);
        pool.addColorStop(0, '#022c22');
        pool.addColorStop(0.42, '#011916');
        pool.addColorStop(0.72, '#010a08');
        pool.addColorStop(1, '#000000');
        ctx.fillStyle = pool;
        ctx.fillRect(0, 0, w, h);

        const surfaceSheen = ctx.createLinearGradient(
            w * (0.18 + shift * 0.06),
            0,
            w * (0.82 - shift * 0.05),
            h * 0.38
        );
        surfaceSheen.addColorStop(0, 'rgba(45, 212, 191, 0.06)');
        surfaceSheen.addColorStop(0.5, 'rgba(20, 184, 166, 0.04)');
        surfaceSheen.addColorStop(1, 'transparent');
        ctx.fillStyle = surfaceSheen;
        ctx.fillRect(0, 0, w, h);

        const depthVeil = ctx.createRadialGradient(
            w * (0.52 - shift * 0.08),
            h * 0.92,
            0,
            w * 0.5,
            h,
            h * 0.78
        );
        depthVeil.addColorStop(0, 'rgba(2, 44, 34, 0.55)');
        depthVeil.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
        depthVeil.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
        ctx.fillStyle = depthVeil;
        ctx.fillRect(0, 0, w, h);
    }

    /**
     * Vertical sine-wave tracking columns — paddle-linked phase shift ripples each column.
     * Phase is shared with the creek LFO baseline for future audio-visual sync.
     */
    function drawLightSineWaves(ctx, w, h, paddleXPos, currentFrame) {
        ctx.save();
        ctx.strokeStyle = SINE_STROKE;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const phaseShift = (paddleXPos * 0.05) + (currentFrame * 0.02);

        for (let baseX = SINE_COLUMN_GAP * 0.5; baseX <= w + SINE_COLUMN_GAP; baseX += SINE_COLUMN_GAP) {
            const col = Math.round(baseX / SINE_COLUMN_GAP);
            const waveAmplitude = 10 + (col % 3) * 4;
            const waveFrequency = 28 + (col % 4) * 8;

            ctx.beginPath();
            for (let y = 0; y <= h; y += SINE_SEGMENT_STEP) {
                const xOffset = Math.sin((y / waveFrequency) + phaseShift) * waveAmplitude;
                const x = baseX + xOffset;
                if (y === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawBackgroundFrame(now) {
        if (!bgRunning || !bgCtx) return;

        const phase = ((now - gradientStart) % GRADIENT_CYCLE_MS) / GRADIENT_CYCLE_MS;
        const driftPhase = phase * Math.PI * 2;
        wavePhase = driftPhase;

        drawWaterBackground(bgCtx, bgCssW, bgCssH, phase);
        drawLightSineWaves(bgCtx, bgCssW, bgCssH, paddleX, frameCount);
        frameCount += 1;

        if (typeof window.OBDAudio !== 'undefined' && window.OBDAudio.syncCreekLfoToWavePhase) {
            window.OBDAudio.syncCreekLfoToWavePhase(driftPhase);
        }

        bgRafId = requestAnimationFrame(drawBackgroundFrame);
    }

    function mountBackgroundCanvas(canvas) {
        if (!canvas) return;
        unmountBackgroundCanvas();

        bgCanvas = canvas;
        bgCtx = fitBackgroundCanvas(canvas);
        bgRunning = true;
        gradientStart = performance.now();

        bgResizeHandler = () => {
            if (!bgCanvas || !bgRunning) return;
            bgCtx = fitBackgroundCanvas(bgCanvas);
        };
        window.addEventListener('resize', bgResizeHandler);

        if (bgRafId) cancelAnimationFrame(bgRafId);
        bgRafId = requestAnimationFrame(drawBackgroundFrame);
    }

    function unmountBackgroundCanvas() {
        bgRunning = false;
        if (bgRafId) {
            cancelAnimationFrame(bgRafId);
            bgRafId = 0;
        }
        if (bgResizeHandler) {
            window.removeEventListener('resize', bgResizeHandler);
            bgResizeHandler = null;
        }
        if (bgCtx && bgCanvas) {
            bgCtx.clearRect(0, 0, bgCssW, bgCssH);
        }
        bgCanvas = null;
        bgCtx = null;
        bgCssW = 0;
        bgCssH = 0;
        paddleX = 0;
        frameCount = 0;
    }

    function setPaddleX(x) {
        paddleX = x;
    }

    window.OBDBilateralAudio = {
        paddleXToPan,
        prepare: prepareBilateralPanner,
        updateFromPaddle,
        reset: resetBilateralPan,
        teardown: teardownBilateralPanner,
        setEnabled: setBilateralAudioEnabled,
        isEnabled: () => isBilateralAudioAllowed()
    };

    window.OBDVisual = {
        mount: mountBackgroundCanvas,
        unmount: unmountBackgroundCanvas,
        setPaddleX,
        drawWaterBackground,
        drawLightSineWaves,
        getWavePhase: () => wavePhase,
        SINE_TRACK_CYCLE_MS
    };
})();
