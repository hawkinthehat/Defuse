/**
 * dᶻix̌ʷ (OBD) — Acoustic bilateral panning + dark water background / light sine-wave reflections.
 */
(function () {
    const MIN_RAMP_SEC = 0.001;
    const RESET_RAMP_SEC = 0.05;

    const WAVE_STROKE = 'rgba(45, 212, 191, 0.3)';
    const WAVE_COUNT = 7;
    const WAVE_AMP = 14;
    const WAVE_FREQ = 0.011;
    const WAVE_STEP = 6;
    const MAX_DPR = 2;
    const GRADIENT_CYCLE_MS = 24000;

    let stereoPanner = null;
    let pannerContext = null;

    let bgCanvas = null;
    let bgCtx = null;
    let bgCssW = 0;
    let bgCssH = 0;
    let bgRafId = 0;
    let bgRunning = false;
    let bgResizeHandler = null;
    let gradientStart = 0;
    let wavePhase = 0;

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
        ensureStereoPanner();
    }

    function updateFromPaddle(px, screenWidth, dtSec) {
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
     * Ultra-dark teal-to-black pool — deep water bed for light sine reflections.
     */
    function drawWaterBackground(ctx, w, h) {
        const pool = ctx.createLinearGradient(0, 0, 0, h);
        pool.addColorStop(0, '#022c22');
        pool.addColorStop(0.45, '#011916');
        pool.addColorStop(1, '#000000');
        ctx.fillStyle = pool;
        ctx.fillRect(0, 0, w, h);
    }

    /**
     * Flowing horizontal sine paths — electric-teal light reflections drifting across dark water.
     */
    function drawLightSineWaves(ctx, w, h, phase) {
        ctx.save();
        ctx.strokeStyle = WAVE_STROKE;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const drift = phase * Math.PI * 2;
        const rowSpacing = h / (WAVE_COUNT + 1);

        for (let row = 0; row < WAVE_COUNT; row += 1) {
            const baseY = rowSpacing * (row + 1);
            const rowPhase = drift + row * 0.85;
            const amp = WAVE_AMP * (0.72 + 0.28 * Math.sin(row * 0.55 + drift * 0.35));

            ctx.beginPath();
            for (let x = 0; x <= w; x += WAVE_STEP) {
                const y = baseY + Math.sin(x * WAVE_FREQ + rowPhase) * amp;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawBackgroundFrame(now) {
        if (!bgRunning || !bgCtx) return;

        const phase = ((now - gradientStart) % GRADIENT_CYCLE_MS) / GRADIENT_CYCLE_MS;
        wavePhase = phase;

        drawWaterBackground(bgCtx, bgCssW, bgCssH);
        drawLightSineWaves(bgCtx, bgCssW, bgCssH, phase);

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
    }

    window.OBDBilateralAudio = {
        paddleXToPan,
        prepare: prepareBilateralPanner,
        updateFromPaddle,
        reset: resetBilateralPan,
        teardown: teardownBilateralPanner
    };

    window.OBDVisual = {
        mount: mountBackgroundCanvas,
        unmount: unmountBackgroundCanvas,
        drawWaterBackground,
        drawLightSineWaves,
        getWavePhase: () => wavePhase,
        WAVE_FREQ,
        GRADIENT_CYCLE_MS
    };
})();
