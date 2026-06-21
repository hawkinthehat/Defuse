/**
 * dᶻix̌ʷ (OBD) — Acoustic bilateral panning + water background / staggered diamond grid.
 */
(function () {
    const MIN_RAMP_SEC = 0.001;
    const RESET_RAMP_SEC = 0.05;

    const GRID_LINE = 'rgba(255, 255, 255, 0.12)';
    const DIAMOND_W = 58;
    const DIAMOND_H = 50;
    const HALF_DIAMOND_W = DIAMOND_W / 2;
    const ROW_SPACING = DIAMOND_H / 2;
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
     * Bright, open river gradient — expanded mid-tones and surface teal highlights.
     */
    function drawWaterBackground(ctx, w, h, phase) {
        const shift = phase * 0.35;

        const river = ctx.createLinearGradient(0, 0, w * (0.5 + shift * 0.08), h);
        river.addColorStop(0, '#0e7490');
        river.addColorStop(0.18, '#0891b2');
        river.addColorStop(0.38, '#22d3ee');
        river.addColorStop(0.52, '#6ee7d6');
        river.addColorStop(0.64, '#5eead4');
        river.addColorStop(0.78, '#2dd4bf');
        river.addColorStop(0.92, '#14b8a6');
        river.addColorStop(1, '#0f766e');
        ctx.fillStyle = river;
        ctx.fillRect(0, 0, w, h);

        const surfaceGlow = ctx.createRadialGradient(
            w * (0.42 + shift * 0.12),
            h * 0.08,
            0,
            w * 0.5,
            h * 0.12,
            h * 0.55
        );
        surfaceGlow.addColorStop(0, 'rgba(167, 243, 232, 0.52)');
        surfaceGlow.addColorStop(0.45, 'rgba(94, 234, 212, 0.28)');
        surfaceGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = surfaceGlow;
        ctx.fillRect(0, 0, w, h);

        const depthPool = ctx.createRadialGradient(
            w * (0.58 - shift * 0.1),
            h,
            0,
            w * 0.5,
            h,
            h * 0.72
        );
        depthPool.addColorStop(0, 'rgba(45, 212, 191, 0.42)');
        depthPool.addColorStop(0.55, 'rgba(20, 184, 166, 0.18)');
        depthPool.addColorStop(1, 'transparent');
        ctx.fillStyle = depthPool;
        ctx.fillRect(0, 0, w, h);
    }

    /**
     * Organic staggered diamond net — each horizontal row alternates X by half a diamond width.
     */
    function drawStaggeredDiamondGrid(ctx, w, h, driftX, driftY) {
        ctx.save();
        ctx.strokeStyle = GRID_LINE;
        ctx.lineWidth = 0.65;
        ctx.lineJoin = 'round';

        const span = w + h + DIAMOND_W;
        let rowIndex = 0;

        for (let base = -span; base <= span; base += ROW_SPACING) {
            const rowOffset = (rowIndex % 2 === 0 ? 0 : HALF_DIAMOND_W) + driftX;
            const yStart = -20 + driftY;
            ctx.beginPath();
            ctx.moveTo(base + rowOffset, yStart);
            ctx.lineTo(base + rowOffset + h + 40, h + 20 + driftY);
            ctx.stroke();
            rowIndex += 1;
        }

        rowIndex = 0;
        for (let base = -span; base <= span; base += ROW_SPACING) {
            const rowOffset = (rowIndex % 2 === 0 ? 0 : HALF_DIAMOND_W) + driftX;
            ctx.beginPath();
            ctx.moveTo(base + rowOffset, -20 + driftY);
            ctx.lineTo(base + rowOffset - h - 40, h + 20 + driftY);
            ctx.stroke();
            rowIndex += 1;
        }

        ctx.restore();
    }

    function drawBackgroundFrame(now) {
        if (!bgRunning || !bgCtx) return;

        const phase = ((now - gradientStart) % GRADIENT_CYCLE_MS) / GRADIENT_CYCLE_MS;
        const driftPhase = phase * Math.PI * 2;
        const driftX = Math.sin(driftPhase) * 3.5;
        const driftY = Math.cos(driftPhase * 0.85) * 2.2;

        drawWaterBackground(bgCtx, bgCssW, bgCssH, phase);
        drawStaggeredDiamondGrid(bgCtx, bgCssW, bgCssH, driftX, driftY);

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
        drawStaggeredDiamondGrid
    };
})();
