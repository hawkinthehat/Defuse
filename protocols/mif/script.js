/**
 * MIF — gʷədiʔ (Micro-Interoceptive Focus)
 * Visual-haptic interoceptive grounding: track a shifting geometric path with slow finger slides;
 * rhythmic fingertip pulses simulate calm resting heart rate to occupy spatial bandwidth.
 */
(function () {
    const MAX_DPR = 2;
    const PATH_SAMPLES = 160;
    const PATH_TOLERANCE = 38;
    const RESTING_BPM = 65;
    const PULSE_INTERVAL_MS = Math.round(60000 / RESTING_BPM);
    const PULSE_DURATION_MS = 920;
    const PULSE_MAX_RADIUS = 56;
    const TRACK_HAPTIC_MS = 12;
    const CONSECUTIVE_ON_PATH_FOR_SYNC = 3;

    const COLORS = {
        bg: '#040506',
        path: 'rgba(88, 142, 126, 0.42)',
        pathGlow: 'rgba(68, 118, 104, 0.16)',
        pathCore: 'rgba(118, 172, 152, 0.62)',
        pulseRing: 'rgba(108, 168, 148, 0.55)',
        pulseCore: 'rgba(130, 188, 168, 0.35)',
        wave: 'rgba(72, 118, 104, 0.08)'
    };

    let mifRunning = false;
    let mifRafId = 0;
    let mifCanvas = null;
    let mifCtx = null;
    let mifInst = null;
    let mifResizeHandler = null;
    let mifPointerDownHandler = null;
    let mifPointerMoveHandler = null;
    let mifPointerUpHandler = null;

    let width = 0;
    let height = 0;
    let cx = 0;
    let cy = 0;
    let baseRadius = 0;

    let fingerActive = false;
    let fingerX = 0;
    let fingerY = 0;
    let onPathStreak = 0;
    let onPath = false;
    let lastPulseAt = 0;
    let synced = false;
    let successfulPulses = 0;

    let pulses = [];
    let pathPoints = [];
    let wavePhase = 0;

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function easeOutQuad(t) {
        return 1 - (1 - t) * (1 - t);
    }

    function injectMifStyles() {
        if (document.getElementById('mif-spa-styles')) return;
        const style = document.createElement('style');
        style.id = 'mif-spa-styles';
        style.textContent = `
            .mif-root {
                width: 100%;
                height: 100%;
                min-height: 100%;
                align-self: stretch;
                display: flex;
                flex-direction: column;
                background: #040506;
                position: relative;
                overflow: hidden;
                padding-bottom: 80px;
                box-sizing: border-box;
            }
            .mif-root .mif-shell {
                flex: 1;
                position: relative;
                width: 100%;
                min-height: 0;
                overflow: hidden;
            }
            .mif-root #mif-canvas {
                display: block;
                width: 100%;
                height: 100%;
                touch-action: none;
                -webkit-user-select: none;
                user-select: none;
            }
        `;
        document.head.appendChild(style);
    }

    function clearMifTimers() {
        if (mifRafId) {
            cancelAnimationFrame(mifRafId);
            mifRafId = 0;
        }
        if (mifResizeHandler) {
            window.removeEventListener('resize', mifResizeHandler);
            mifResizeHandler = null;
        }
        if (mifCanvas) {
            if (mifPointerDownHandler) {
                mifCanvas.removeEventListener('pointerdown', mifPointerDownHandler);
            }
            if (mifPointerMoveHandler) {
                mifCanvas.removeEventListener('pointermove', mifPointerMoveHandler);
            }
            if (mifPointerUpHandler) {
                mifCanvas.removeEventListener('pointerup', mifPointerUpHandler);
                mifCanvas.removeEventListener('pointercancel', mifPointerUpHandler);
                mifCanvas.removeEventListener('pointerleave', mifPointerUpHandler);
            }
        }
        mifPointerDownHandler = null;
        mifPointerMoveHandler = null;
        mifPointerUpHandler = null;
        mifRunning = false;
    }

    function stopMIF() {
        clearMifTimers();
        mifCanvas = null;
        mifCtx = null;
        mifInst = null;
        fingerActive = false;
        onPath = false;
        onPathStreak = 0;
        synced = false;
        pulses = [];
        pathPoints = [];
        successfulPulses = 0;
        lastPulseAt = 0;
    }

    function setInstruction(text) {
        if (mifInst) mifInst.textContent = text;
        const globalInst = document.getElementById('inst');
        if (globalInst) globalInst.textContent = text;
    }

    function resizeCanvas() {
        if (!mifCanvas || !mifCtx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const rect = mifCanvas.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        cx = width * 0.5;
        cy = height * 0.48;
        baseRadius = Math.min(width, height) * 0.28;
        mifCanvas.width = Math.floor(width * dpr);
        mifCanvas.height = Math.floor(height * dpr);
        mifCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /**
     * Morphing rose / concentric-wave hybrid path.
     * The curve slowly rotates and breathes to require continuous spatial tracking.
     */
    function samplePath(now) {
        const tSec = now * 0.001;
        const rot = tSec * 0.09;
        const breathe = 0.88 + 0.12 * Math.sin(tSec * 0.35);
        const waveShift = Math.sin(tSec * 0.22) * 0.18;
        const petals = 4;
        const points = [];

        for (let i = 0; i < PATH_SAMPLES; i += 1) {
            const theta = (i / PATH_SAMPLES) * Math.PI * 2;
            const petalMod = 1 + 0.24 * Math.cos(petals * theta + tSec * 0.28);
            const innerWave = 1 + waveShift * Math.sin(theta * 2.5 - tSec * 0.45);
            const r = baseRadius * breathe * petalMod * innerWave;
            points.push({
                x: cx + r * Math.cos(theta + rot),
                y: cy + r * Math.sin(theta + rot),
                theta: theta + rot
            });
        }

        pathPoints = points;
        return points;
    }

    function nearestPathDistance(px, py, points) {
        let minDist = Infinity;
        let nearest = null;

        for (let i = 0; i < points.length; i += 1) {
            const pt = points[i];
            const dx = px - pt.x;
            const dy = py - pt.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                nearest = pt;
            }
        }

        return { dist: minDist, nearest };
    }

    function canvasCoords(event) {
        const rect = mifCanvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    function softHaptic() {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(TRACK_HAPTIC_MS);
        } catch {
            /* ignore */
        }
    }

    function spawnPulse(x, y, now) {
        pulses.push({
            x,
            y,
            born: now,
            maxR: PULSE_MAX_RADIUS * (0.85 + Math.random() * 0.2)
        });
        successfulPulses += 1;
        softHaptic();
        lastPulseAt = now;

        if (successfulPulses >= 4 && synced) {
            setInstruction('gʷədiʔ · STEADY RHYTHM · STAY WITH THE PATH');
        } else if (synced) {
            setInstruction('gʷədiʔ · SYNCHRONIZED · FOLLOW THE SHIFTING LINE');
        }
    }

    function evaluateTracking(now) {
        if (!fingerActive || pathPoints.length === 0) {
            onPath = false;
            onPathStreak = 0;
            return;
        }

        const { dist } = nearestPathDistance(fingerX, fingerY, pathPoints);
        const within = dist <= PATH_TOLERANCE;

        if (within) {
            onPathStreak += 1;
            onPath = true;
            if (onPathStreak >= CONSECUTIVE_ON_PATH_FOR_SYNC) {
                synced = true;
            }
        } else {
            onPathStreak = 0;
            onPath = false;
            if (fingerActive) {
                setInstruction('gʷədiʔ · RETURN TO THE PATH · SLIDE SLOWLY');
            }
        }

        if (onPath && synced) {
            const elapsed = now - lastPulseAt;
            if (lastPulseAt === 0 || elapsed >= PULSE_INTERVAL_MS) {
                spawnPulse(fingerX, fingerY, now);
            }
        }
    }

    function onPointerDown(event) {
        if (!mifRunning || !mifCanvas) return;
        event.preventDefault();
        if (mifCanvas.setPointerCapture) {
            try {
                mifCanvas.setPointerCapture(event.pointerId);
            } catch {
                /* ignore */
            }
        }
        const coords = canvasCoords(event);
        fingerX = coords.x;
        fingerY = coords.y;
        fingerActive = true;
        onPathStreak = 0;
        synced = false;
        lastPulseAt = 0;
        setInstruction('gʷədiʔ · SLIDE SLOWLY ALONG THE SHIFTING PATH');
    }

    function onPointerMove(event) {
        if (!mifRunning || !fingerActive) return;
        event.preventDefault();
        const coords = canvasCoords(event);
        fingerX = coords.x;
        fingerY = coords.y;
    }

    function onPointerUp(event) {
        if (!mifRunning) return;
        event.preventDefault();
        if (mifCanvas.releasePointerCapture) {
            try {
                mifCanvas.releasePointerCapture(event.pointerId);
            } catch {
                /* ignore */
            }
        }
        fingerActive = false;
        onPath = false;
        onPathStreak = 0;
        synced = false;
        setInstruction('gʷədiʔ · SLIDE SLOWLY ALONG THE SHIFTING PATH');
    }

    function drawBackground(ctx) {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, width, height);

        const vignette = ctx.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, Math.max(width, height) * 0.75);
        vignette.addColorStop(0, 'rgba(10, 14, 12, 0.12)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
    }

    function drawConcentricWaves(ctx, now) {
        const tSec = now * 0.001;
        wavePhase = tSec * 0.35;
        const ringCount = 4;

        for (let i = 0; i < ringCount; i += 1) {
            const phase = (wavePhase + i * 0.55) % (Math.PI * 2);
            const expand = 0.72 + 0.28 * Math.sin(phase);
            const r = baseRadius * (0.35 + i * 0.22) * expand;
            ctx.strokeStyle = COLORS.wave;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function drawPath(ctx, points, now) {
        if (points.length < 3) return;

        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.shadowColor = COLORS.pathGlow;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = COLORS.path;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = COLORS.pathCore;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.72 + 0.12 * Math.sin(now * 0.002);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawFingerGuide(ctx) {
        if (!fingerActive) return;

        const alpha = onPath ? 0.55 : 0.28;
        const r = onPath ? 14 : 10;
        const grad = ctx.createRadialGradient(fingerX, fingerY, 0, fingerX, fingerY, r * 2.2);
        grad.addColorStop(0, `rgba(120, 178, 158, ${alpha})`);
        grad.addColorStop(1, 'rgba(80, 130, 114, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(fingerX, fingerY, r * 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = onPath ? 'rgba(130, 188, 168, 0.65)' : 'rgba(100, 140, 124, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(fingerX, fingerY, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    function drawPulses(ctx, now) {
        pulses = pulses.filter((pulse) => {
            const age = now - pulse.born;
            if (age > PULSE_DURATION_MS) return false;

            const t = age / PULSE_DURATION_MS;
            const eased = easeOutCubic(t);
            const radius = pulse.maxR * eased;
            const alpha = (1 - easeOutQuad(t)) * 0.72;

            ctx.save();
            ctx.globalAlpha = alpha * 0.55;
            ctx.strokeStyle = COLORS.pulseRing;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = alpha * 0.35;
            ctx.strokeStyle = COLORS.pulseRing;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(pulse.x, pulse.y, radius * 0.62, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = alpha * 0.28;
            ctx.fillStyle = COLORS.pulseCore;
            ctx.beginPath();
            ctx.arc(pulse.x, pulse.y, radius * 0.22, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            return true;
        });
    }

    function drawFrame(now) {
        if (!mifRunning || !mifCtx || !mifCanvas?.isConnected) {
            clearMifTimers();
            return;
        }

        const points = samplePath(now);
        evaluateTracking(now);

        drawBackground(mifCtx);
        drawConcentricWaves(mifCtx, now);
        drawPath(mifCtx, points, now);
        drawPulses(mifCtx, now);
        drawFingerGuide(mifCtx);

        mifRafId = requestAnimationFrame(drawFrame);
    }

    function bindEngine(root) {
        mifCanvas = root.querySelector('#mif-canvas');
        mifInst = root.querySelector('#mif-inst');

        if (!mifCanvas) return false;
        mifCtx = mifCanvas.getContext('2d');
        if (!mifCtx) return false;

        fingerActive = false;
        onPath = false;
        onPathStreak = 0;
        synced = false;
        pulses = [];
        successfulPulses = 0;
        lastPulseAt = 0;

        resizeCanvas();

        mifResizeHandler = () => resizeCanvas();
        window.addEventListener('resize', mifResizeHandler);

        mifPointerDownHandler = onPointerDown;
        mifPointerMoveHandler = onPointerMove;
        mifPointerUpHandler = onPointerUp;

        mifCanvas.addEventListener('pointerdown', mifPointerDownHandler, { passive: false });
        mifCanvas.addEventListener('pointermove', mifPointerMoveHandler, { passive: false });
        mifCanvas.addEventListener('pointerup', mifPointerUpHandler, { passive: false });
        mifCanvas.addEventListener('pointercancel', mifPointerUpHandler, { passive: false });
        mifCanvas.addEventListener('pointerleave', mifPointerUpHandler, { passive: false });

        mifRunning = true;
        setInstruction('gʷədiʔ · SLIDE SLOWLY ALONG THE SHIFTING PATH');
        mifRafId = requestAnimationFrame(drawFrame);
        return true;
    }

    function mountStandalone() {
        const canvas = document.getElementById('mif-canvas');
        if (!canvas) return false;
        const page = document.getElementById('mif-page') || document.body;
        return bindEngine(page);
    }

    function mountSpaStage() {
        injectMifStyles();
        const stage = document.getElementById('protocol-stage');
        if (!stage) return false;

        stage.innerHTML = `
            <div class="mif-root" id="mif-root">
                <main class="mif-shell" id="mif-shell" aria-label="Micro-interoceptive focus touch canvas">
                    <canvas id="mif-canvas" aria-hidden="true"></canvas>
                </main>
            </div>
        `;

        return bindEngine(stage);
    }

    function launchMIF() {
        stopMIF();
        if (typeof showProtocolViewport === 'function') showProtocolViewport();
        if (typeof ensureEmergencyBypassFooter === 'function') ensureEmergencyBypassFooter();

        const inst = document.getElementById('inst');
        if (inst) inst.textContent = 'gʷədiʔ · SLIDE SLOWLY ALONG THE SHIFTING PATH';

        if (!mountSpaStage()) mountStandalone();
    }

    window.launchMIF = launchMIF;
    window.stopMIF = stopMIF;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.getElementById('mif-canvas') && !document.getElementById('protocol-stage')) {
                mountStandalone();
            }
        });
    } else if (document.getElementById('mif-canvas') && !document.getElementById('protocol-stage')?.querySelector('#mif-canvas')) {
        mountStandalone();
    }
})();
