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
    const TRAIL_MAX_POINTS = 48;
    const TRAIL_FADE_MS = 1400;
    const ICON_PULSE_INTERVAL_MS = PULSE_INTERVAL_MS;
    const ICON_PULSE_DURATION_MS = PULSE_DURATION_MS;

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
    let trailPoints = [];
    let iconPulsePhase = 0;
    let lastIconPulseAt = 0;
    let iconOrganicRings = [];

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
        trailPoints = [];
        iconPulsePhase = 0;
        lastIconPulseAt = 0;
        iconOrganicRings = [];
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

    function appendTrailPoint(x, y, now) {
        const last = trailPoints[trailPoints.length - 1];
        if (last) {
            const dx = x - last.x;
            const dy = y - last.y;
            if (dx * dx + dy * dy < 4) return;
        }
        trailPoints.push({ x, y, born: now });
        if (trailPoints.length > TRAIL_MAX_POINTS) {
            trailPoints.shift();
        }
    }

    function pruneTrail(now) {
        trailPoints = trailPoints.filter((pt) => now - pt.born < TRAIL_FADE_MS);
    }

    /**
     * Stylized cedar seed / water droplet silhouette anchored at touch point.
     */
    function dropletPath(ctx, scale) {
        const s = scale;
        ctx.moveTo(0, -s * 1.05);
        ctx.bezierCurveTo(s * 0.62, -s * 0.35, s * 0.58, s * 0.55, 0, s * 0.95);
        ctx.bezierCurveTo(-s * 0.58, s * 0.55, -s * 0.62, -s * 0.35, 0, -s * 1.05);
        ctx.closePath();
    }

    function spawnOrganicRing(x, y, now, intensity) {
        iconOrganicRings.push({
            x,
            y,
            born: now,
            maxR: PULSE_MAX_RADIUS * (0.75 + intensity * 0.35),
            intensity
        });
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
        spawnOrganicRing(x, y, now, onPath ? 1 : 0.55);
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

        if (fingerActive && onPath) {
            iconPulsePhase += 0.018;
            const iconElapsed = now - lastIconPulseAt;
            if (lastIconPulseAt === 0 || iconElapsed >= ICON_PULSE_INTERVAL_MS) {
                spawnOrganicRing(fingerX, fingerY, now, 0.85 + 0.15 * Math.sin(iconPulsePhase));
                lastIconPulseAt = now;
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
        lastIconPulseAt = 0;
        trailPoints = [];
        appendTrailPoint(coords.x, coords.y, performance.now());
        setInstruction('gʷədiʔ · SLIDE SLOWLY ALONG THE SHIFTING PATH');
    }

    function onPointerMove(event) {
        if (!mifRunning || !fingerActive) return;
        event.preventDefault();
        const coords = canvasCoords(event);
        fingerX = coords.x;
        fingerY = coords.y;
        appendTrailPoint(coords.x, coords.y, performance.now());
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
        lastIconPulseAt = 0;
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

    function drawTrail(ctx, now) {
        if (trailPoints.length < 2) return;

        pruneTrail(now);
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        for (let i = 1; i < trailPoints.length; i += 1) {
            const prev = trailPoints[i - 1];
            const curr = trailPoints[i];
            const age = now - curr.born;
            const alpha = clamp(1 - age / TRAIL_FADE_MS, 0, 1) * (onPath ? 0.72 : 0.38);
            const width = 2 + (i / trailPoints.length) * 5;

            ctx.strokeStyle = onPath
                ? `rgba(118, 178, 158, ${alpha})`
                : `rgba(88, 138, 122, ${alpha * 0.65})`;
            ctx.lineWidth = width;
            ctx.shadowColor = 'rgba(100, 168, 148, 0.45)';
            ctx.shadowBlur = 12 * alpha;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawTrackingIcon(ctx) {
        if (!fingerActive) return;

        const scale = onPath ? 11 : 9;
        ctx.save();
        ctx.translate(fingerX, fingerY);

        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * 2.8);
        glow.addColorStop(0, onPath ? 'rgba(130, 190, 168, 0.55)' : 'rgba(100, 150, 132, 0.28)');
        glow.addColorStop(1, 'rgba(80, 130, 114, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, scale * 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = 'rgba(108, 168, 148, 0.65)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = onPath ? 'rgba(118, 178, 158, 0.92)' : 'rgba(92, 142, 126, 0.72)';
        ctx.beginPath();
        dropletPath(ctx, scale);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = onPath ? 'rgba(160, 210, 192, 0.75)' : 'rgba(120, 168, 152, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        dropletPath(ctx, scale * 0.88);
        ctx.stroke();
        ctx.restore();
    }

    function drawOrganicIconPulses(ctx, now) {
        iconOrganicRings = iconOrganicRings.filter((ring) => {
            const age = now - ring.born;
            if (age > ICON_PULSE_DURATION_MS) return false;

            const t = age / ICON_PULSE_DURATION_MS;
            const eased = easeOutCubic(t);
            const radius = ring.maxR * eased;
            const alpha = (1 - easeOutQuad(t)) * 0.62 * ring.intensity;

            ctx.save();
            ctx.globalAlpha = alpha * 0.5;
            ctx.strokeStyle = COLORS.pulseRing;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = alpha * 0.32;
            ctx.strokeStyle = COLORS.pulseRing;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, radius * 0.68, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = alpha * 0.22;
            const grad = ctx.createRadialGradient(ring.x, ring.y, 0, ring.x, ring.y, radius);
            grad.addColorStop(0, COLORS.pulseCore);
            grad.addColorStop(0.55, 'rgba(108, 168, 148, 0.12)');
            grad.addColorStop(1, 'rgba(108, 168, 148, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            return true;
        });
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
        drawTrail(mifCtx, now);
        drawPulses(mifCtx, now);
        drawOrganicIconPulses(mifCtx, now);
        drawTrackingIcon(mifCtx);

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
        trailPoints = [];
        iconPulsePhase = 0;
        lastIconPulseAt = 0;
        iconOrganicRings = [];

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
