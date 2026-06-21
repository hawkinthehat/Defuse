/**
 * dᶻix̌ʷ (OBD) — Acoustic Bilateral Stimulation.
 * Owns the Web Audio StereoPannerNode and maps paddle X-axis position to spatial pan.
 */
(function () {
    const MIN_RAMP_SEC = 0.001;
    const RESET_RAMP_SEC = 0.05;

    let stereoPanner = null;
    let pannerContext = null;

    function getSharedAudioContext() {
        if (typeof window.OBDAudio === 'undefined' || !window.OBDAudio.getAudioContext) return null;
        return window.OBDAudio.getAudioContext();
    }

    /**
     * Map paddle X (0 … screenWidth) to stereo pan (-1 … 1).
     * Far left → -1.0, center → 0.0, far right → +1.0.
     */
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

    /**
     * Called each tracking-loop frame while the grounding pad is held.
     * Linear-ramp pan over dt so audio sweeps in sync with the paddle.
     */
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

    window.OBDBilateralAudio = {
        paddleXToPan,
        prepare: prepareBilateralPanner,
        updateFromPaddle,
        reset: resetBilateralPan,
        teardown: teardownBilateralPanner
    };
})();
