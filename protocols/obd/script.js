/**
 * dᶻix̌ʷ (OBD) — Acoustic Bilateral Stimulation via paddle X-axis spatial panning.
 * Maps the moving paddle's horizontal screen position to a StereoPannerNode on the creek drone.
 */
(function () {
    const MIN_RAMP_SEC = 0.001;

    /**
     * Map paddle X (0 … screenWidth) to stereo pan (-1 … 1).
     * Left edge → -1, center → 0, right edge → +1.
     */
    function paddleXToPan(px, screenWidth) {
        if (!screenWidth || screenWidth <= 0) return 0;
        return Math.max(-1, Math.min(1, (px / screenWidth) * 2 - 1));
    }

    /**
     * Drive the creek drone pan with a linear ramp over the frame interval
     * so audio glides in sync with the visual paddle without clicks or pops.
     */
    function updateFromPaddle(px, screenWidth, dtSec) {
        if (typeof window.OBDAudio === 'undefined' || !window.OBDAudio.setBilateralPan) return;

        const pan = paddleXToPan(px, screenWidth);
        const rampSec = Math.max(MIN_RAMP_SEC, dtSec || 0.016);
        window.OBDAudio.setBilateralPan(pan, rampSec);
    }

    function resetBilateralPan() {
        if (typeof window.OBDAudio === 'undefined' || !window.OBDAudio.setBilateralPan) return;
        window.OBDAudio.setBilateralPan(0, 0.05);
    }

    window.OBDBilateralAudio = {
        paddleXToPan,
        updateFromPaddle,
        reset: resetBilateralPan
    };
})();
