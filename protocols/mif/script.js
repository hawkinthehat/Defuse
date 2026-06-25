/**
 * MIF — gʷədiʔ (Micro-Interoceptive Focus)
 * Visual-haptic interoceptive grounding: track a shifting geometric path with slow finger slides;
 * rhythmic fingertip pulses simulate calm resting heart rate to occupy spatial bandwidth.
 */
(function () {
    const MAX_DPR = 2;
    const PROTOCOL_HEADER = 'gʷədiʔ (gwuh-dee)';
    const PATH_SAMPLES = 160;
    const PATH_TOLERANCE = 38;
    const RESTING_BPM = 65;
    const PULSE_INTERVAL_MS = Math.round(60000 / RESTING_BPM);
    const PULSE_DURATION_MS = 920;
    const PULSE_MAX_RADIUS = 56;
    const TRACK_HAPTIC_MS = 12;
    const CONSECUTIVE_ON_PATH_FOR_SYNC = 3;
    const TRAIL_LENGTH = 15;

    const THETA_LEFT_HZ = 200;
    const THETA_RIGHT_HZ = 206;
    const THETA_MAX_GAIN = 0.18;
    const THETA_FADE_IN_SEC = 0.85;
    const THETA_FADE_OUT_SEC = 0.12;

    const TRACE_ROOT_HZ = 220;
    const TRACE_MAX_GAIN = 0.14;
    const TRACE_FADE_IN_SEC = 0.06;

    const COLORS = {
        bg: '#040506',
        path: 'rgba(88, 142, 126, 0.42)',
        pathGlow: 'rgba(68, 118, 104, 0.16)',
        pathCore: 'rgba(118, 172, 152, 0.62)',
        pulseRing: 'rgba(108, 168, 148, 0.55)',
        pulseCore: 'rgba(130, 188, 168, 0.35)',
        wave: 'rgba(72, 118, 104, 0.08)',
        trail: 'rgba(108, 168, 148, 0.55)',
        anchorCore: 'rgba(140, 198, 178, 0.92)',
        anchorGlow: 'rgba(96, 152, 134, 0.38)'
    };

    let mifRunning = false;
    let mifRafId = 0;
    let mifCanvas = null;
    let mifCtx = null;
    let mifInst = null;
    let mifStatus = null;
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
    let touchTrail = [];
    let wavePhase = 0;

    let isAudioPlaying = false;
    let thetaNodes = null;
    let thetaToggleBtn = null;
    let thetaToggleHandler = null;

    let traceAudioCtx = null;
    let traceOscillator = null;
    let traceGainNode = null;
    let traceAudioReady = false;
    let lastTraceX = 0;
    let lastTraceY = 0;
    let lastTraceAt = 0;

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
            .mif-root .mif-status {
                position: absolute;
                top: calc(env(safe-area-inset-top, 0px) + 2.75rem);
                left: max(16px, env(safe-area-inset-left, 0px));
                right: calc(max(20px, env(safe-area-inset-right, 0px)) + 5.75rem);
                margin: 0;
                z-index: 4;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: clamp(0.58rem, 2.2vw, 0.68rem);
                font-weight: 600;
                line-height: 1.35;
                letter-spacing: 0.06em;
                text-align: center;
                color: rgba(148, 163, 184, 0.72);
                pointer-events: none;
            }
            .mif-root #mif-canvas {
                position: absolute;
                top: 0;
                left: 0;
                width: 100vw !important;
                height: 100vh !important;
                display: block;
                z-index: 1;
                touch-action: none;
                -webkit-user-select: none;
                user-select: none;
            }
            .mif-theta-audio-toggle {
                position: absolute;
                top: calc(env(safe-area-inset-top, 0px) + 3.35rem);
                right: max(12px, env(safe-area-inset-right, 12px));
                z-index: 6;
                min-height: 2rem;
                padding: 0.45rem 0.65rem;
                border: 1px solid rgba(148, 163, 184, 0.28);
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.42);
                color: rgba(148, 163, 184, 0.72);
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: 0.56rem;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                cursor: pointer;
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
                transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
            }
            .mif-theta-audio-toggle--active {
                border-color: rgba(94, 234, 212, 0.42);
                color: rgba(153, 246, 228, 0.88);
                background: rgba(4, 47, 46, 0.45);
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

    function getMifAudioContext() {
        if (traceAudioCtx && traceAudioCtx.state !== 'closed') return traceAudioCtx;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try {
            traceAudioCtx = new Ctx();
        } catch {
            traceAudioCtx = null;
        }
        return traceAudioCtx;
    }

    function resumeMifAudio() {
        const ctx = getMifAudioContext();
        if (!ctx) return Promise.resolve(false);
        if (ctx.state === 'suspended') {
            return ctx.resume().then(() => true).catch(() => false);
        }
        return Promise.resolve(true);
    }

    function syncThetaToggleLabel() {
        if (!thetaToggleBtn) return;
        thetaToggleBtn.textContent = isAudioPlaying ? 'θ hum on' : 'θ hum off';
        thetaToggleBtn.setAttribute('aria-pressed', isAudioPlaying ? 'true' : 'false');
        thetaToggleBtn.classList.toggle('mif-theta-audio-toggle--active', isAudioPlaying);
    }

    function setThetaGain(value, rampSec) {
        if (!thetaNodes) return;
        const ctx = getMifAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const ramp = Math.max(0.001, rampSec || 0.03);
        const { gainNode } = thetaNodes;

        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(Math.max(0, Math.min(THETA_MAX_GAIN, value)), now + ramp);
    }

    function teardownThetaHum() {
        isAudioPlaying = false;

        if (thetaToggleBtn && thetaToggleHandler) {
            thetaToggleBtn.removeEventListener('click', thetaToggleHandler);
        }
        if (thetaToggleBtn) {
            thetaToggleBtn.remove();
        }
        thetaToggleBtn = null;
        thetaToggleHandler = null;

        if (!thetaNodes) return;

        const { leftOsc, rightOsc, gainNode } = thetaNodes;
        const ctx = getMifAudioContext();
        if (ctx) {
            const now = ctx.currentTime;
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(0, now);
        }

        [leftOsc, rightOsc].forEach((node) => {
            try {
                node.stop();
            } catch {
                /* ignore */
            }
        });
        [leftOsc, rightOsc, gainNode, thetaNodes.merger, thetaNodes.leftGain, thetaNodes.rightGain].forEach((node) => {
            try {
                node.disconnect();
            } catch {
                /* ignore */
            }
        });

        thetaNodes = null;
    }

    function initializeThetaHum() {
        if (thetaNodes) return resumeMifAudio();

        return resumeMifAudio().then((ready) => {
            if (!ready || thetaNodes) return !!thetaNodes;

            const ctx = getMifAudioContext();
            if (!ctx) return false;

            const leftOsc = ctx.createOscillator();
            const rightOsc = ctx.createOscillator();
            const leftGain = ctx.createGain();
            const rightGain = ctx.createGain();
            const merger = ctx.createChannelMerger(2);
            const gainNode = ctx.createGain();
            const now = ctx.currentTime;

            leftOsc.type = 'sine';
            rightOsc.type = 'sine';
            leftOsc.frequency.setValueAtTime(THETA_LEFT_HZ, now);
            rightOsc.frequency.setValueAtTime(THETA_RIGHT_HZ, now);
            leftGain.gain.setValueAtTime(1, now);
            rightGain.gain.setValueAtTime(1, now);
            gainNode.gain.setValueAtTime(0, now);

            leftOsc.connect(leftGain);
            rightOsc.connect(rightGain);
            leftGain.connect(merger, 0, 0);
            rightGain.connect(merger, 0, 1);
            merger.connect(gainNode);
            gainNode.connect(ctx.destination);

            leftOsc.start(now);
            rightOsc.start(now);

            thetaNodes = { leftOsc, rightOsc, leftGain, rightGain, merger, gainNode };
            isAudioPlaying = false;
            return true;
        });
    }

    function toggleThetaHum() {
        if (!thetaNodes) {
            initializeThetaHum().then(() => {
                if (thetaNodes) toggleThetaHum();
            });
            return;
        }

        isAudioPlaying = !isAudioPlaying;
        setThetaGain(isAudioPlaying ? THETA_MAX_GAIN : 0, isAudioPlaying ? THETA_FADE_IN_SEC : THETA_FADE_OUT_SEC);
        syncThetaToggleLabel();
    }

    function mountThetaToggle(root) {
        const host = root || document.getElementById('viewport');
        if (!host || thetaToggleBtn) return;

        thetaToggleBtn = document.createElement('button');
        thetaToggleBtn.type = 'button';
        thetaToggleBtn.className = 'mif-theta-audio-toggle';
        thetaToggleBtn.setAttribute('aria-label', 'Toggle theta background hum');
        syncThetaToggleLabel();

        thetaToggleHandler = () => toggleThetaHum();
        thetaToggleBtn.addEventListener('click', thetaToggleHandler);
        host.appendChild(thetaToggleBtn);
    }

    function prepareThetaHum(root) {
        isAudioPlaying = false;
        initializeThetaHum().then(() => {
            const ctx = getMifAudioContext();
            if (thetaNodes && ctx) {
                thetaNodes.gainNode.gain.setValueAtTime(0, ctx.currentTime);
            }
            mountThetaToggle(root);
        });
    }

    function teardownTracingAudio() {
        if (traceGainNode && traceAudioCtx) {
            traceGainNode.gain.setValueAtTime(0, traceAudioCtx.currentTime);
        }
        if (traceOscillator) {
            try {
                traceOscillator.stop();
            } catch {
                /* ignore */
            }
            try {
                traceOscillator.disconnect();
            } catch {
                /* ignore */
            }
        }
        if (traceGainNode) {
            try {
                traceGainNode.disconnect();
            } catch {
                /* ignore */
            }
        }
        traceOscillator = null;
        traceGainNode = null;
        traceAudioReady = false;
        lastTraceAt = 0;

        if (traceAudioCtx && traceAudioCtx.state !== 'closed') {
            traceAudioCtx.close().catch(() => {});
        }
        traceAudioCtx = null;
    }

    function ensureTracingAudio() {
        if (traceOscillator && traceGainNode && traceAudioReady) {
            return resumeMifAudio();
        }

        return resumeMifAudio().then((ready) => {
            if (!ready) return false;

            const ctx = getMifAudioContext();
            if (!ctx) return false;

            if (traceOscillator) {
                try {
                    traceOscillator.stop();
                } catch {
                    /* ignore */
                }
                try {
                    traceOscillator.disconnect();
                } catch {
                    /* ignore */
                }
            }
            if (traceGainNode) {
                try {
                    traceGainNode.disconnect();
                } catch {
                    /* ignore */
                }
            }

            const now = ctx.currentTime;
            traceOscillator = ctx.createOscillator();
            traceGainNode = ctx.createGain();

            traceOscillator.type = 'triangle';
            traceOscillator.frequency.setValueAtTime(TRACE_ROOT_HZ, now);
            traceGainNode.gain.setValueAtTime(0, now);

            traceOscillator.connect(traceGainNode);
            traceGainNode.connect(ctx.destination);
            traceOscillator.start(now);

            traceAudioReady = true;
            return true;
        });
    }

    function muteTracingAudio() {
        if (!traceGainNode || !traceAudioCtx) return;
        traceGainNode.gain.setValueAtTime(0, traceAudioCtx.currentTime);
    }

    function startTracingAudio() {
        ensureTracingAudio().then((ready) => {
            if (!ready || !traceGainNode || !traceAudioCtx) return;
            const now = traceAudioCtx.currentTime;
            traceGainNode.gain.cancelScheduledValues(now);
            traceGainNode.gain.setValueAtTime(traceGainNode.gain.value, now);
            traceGainNode.gain.linearRampToValueAtTime(TRACE_MAX_GAIN, now + TRACE_FADE_IN_SEC);
        });
    }

    function updateTracingAudio(now, pathDistance) {
        if (!fingerActive || !traceOscillator || !traceGainNode || !traceAudioCtx) return;

        const elapsed = lastTraceAt > 0 ? Math.max(0.001, now - lastTraceAt) : 0.016;
        const dx = fingerX - lastTraceX;
        const dy = fingerY - lastTraceY;
        const speed = Math.sqrt(dx * dx + dy * dy) / elapsed;
        lastTraceX = fingerX;
        lastTraceY = fingerY;
        lastTraceAt = now;

        const accuracy = clamp(1 - pathDistance / PATH_TOLERANCE, 0, 1);
        const speedShift = clamp(speed * 0.05, 0, 28);
        const targetHz = TRACE_ROOT_HZ + accuracy * 36 - speedShift * 0.35;

        traceOscillator.frequency.setTargetAtTime(
            clamp(targetHz, 180, 280),
            traceAudioCtx.currentTime,
            0.04
        );
    }

    function stopMIF() {
        clearMifTimers();
        mifCanvas = null;
        mifCtx = null;
        mifInst = null;
        mifStatus = null;
        fingerActive = false;
        onPath = false;
        onPathStreak = 0;
        synced = false;
        pulses = [];
        pathPoints = [];
        touchTrail = [];
        successfulPulses = 0;
        lastPulseAt = 0;
        teardownThetaHum();
        teardownTracingAudio();
    }

    function setProtocolHeader() {
        const globalInst = document.getElementById('inst');
        if (globalInst) globalInst.textContent = PROTOCOL_HEADER;
        if (mifInst) mifInst.textContent = PROTOCOL_HEADER;
    }

    function setInstruction(text) {
        if (mifStatus) mifStatus.textContent = text;
    }

    function resizeCanvas() {
        if (!mifCanvas) return;
        mifCanvas.width = window.innerWidth;
        mifCanvas.height = window.innerHeight;
        width = mifCanvas.width;
        height = mifCanvas.height;
        cx = width * 0.5;
        cy = height * 0.48;
        baseRadius = Math.min(width, height) * 0.28;
        if (mifCtx) {
            mifCtx.setTransform(1, 0, 0, 1, 0, 0);
        }
    }

    /**
     * Morphing rose / concentric-wave hybrid path.
     * The curve slowly rotates and breathes to require continuous spatial tracking.
     */
    function samplePath(now) {
        const canvasW = mifCanvas ? mifCanvas.width : width;
        const canvasH = mifCanvas ? mifCanvas.height : height;
        const centerX = canvasW * 0.5;
        const centerY = canvasH * 0.48;
        const radius = Math.min(canvasW, canvasH) * 0.28;
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
            const r = radius * breathe * petalMod * innerWave;
            points.push({
                x: centerX + r * Math.cos(theta + rot),
                y: centerY + r * Math.sin(theta + rot),
                theta: theta + rot
            });
        }

        cx = centerX;
        cy = centerY;
        baseRadius = radius;
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
        return {
            x: event.clientX,
            y: event.clientY
        };
    }

    function pushTouchTrail(x, y) {
        touchTrail.push({ x, y });
        if (touchTrail.length > TRAIL_LENGTH) {
            touchTrail.shift();
        }
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
            setInstruction('Steady rhythm — stay with the path');
        } else if (synced) {
            setInstruction('Synchronized — follow the shifting line');
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
        updateTracingAudio(now, dist);

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
                setInstruction('Return to the path — slide slowly');
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
        touchTrail = [];
        pushTouchTrail(fingerX, fingerY);
        onPathStreak = 0;
        synced = false;
        lastPulseAt = 0;
        lastTraceX = fingerX;
        lastTraceY = fingerY;
        lastTraceAt = performance.now();
        startTracingAudio();
        setInstruction('Slide slowly along the shifting path');
    }

    function onPointerMove(event) {
        if (!mifRunning || !fingerActive) return;
        event.preventDefault();
        const coords = canvasCoords(event);
        fingerX = coords.x;
        fingerY = coords.y;
        pushTouchTrail(fingerX, fingerY);
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
        touchTrail = [];
        onPath = false;
        onPathStreak = 0;
        synced = false;
        muteTracingAudio();
        setInstruction('Slide slowly along the shifting path');
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
        if (!fingerActive) return;

        const tSec = now * 0.001;
        wavePhase = tSec * 0.35;
        const ringCount = 4;
        const pulseScale = onPath ? 1 : 0.72;

        for (let i = 0; i < ringCount; i += 1) {
            const phase = (wavePhase + i * 0.55) % (Math.PI * 2);
            const expand = 0.72 + 0.28 * Math.sin(phase);
            const r = (18 + i * 16) * expand * pulseScale;
            const alpha = (0.14 - i * 0.02) * (onPath ? 1 : 0.65);
            ctx.strokeStyle = `rgba(72, 118, 104, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(fingerX, fingerY, r, 0, Math.PI * 2);
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

    function drawTouchTrail(ctx) {
        if (!fingerActive || touchTrail.length < 2) return;

        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        for (let i = 1; i < touchTrail.length; i += 1) {
            const prev = touchTrail[i - 1];
            const curr = touchTrail[i];
            const fade = i / (touchTrail.length - 1);
            const alpha = fade * (onPath ? 0.42 : 0.24);
            const width = 2 + fade * 5;

            ctx.strokeStyle = `rgba(108, 168, 148, ${alpha})`;
            ctx.lineWidth = width;
            ctx.shadowColor = COLORS.trail;
            ctx.shadowBlur = 8 + fade * 14;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.stroke();
        }

        for (let i = 0; i < touchTrail.length; i += 1) {
            const pt = touchTrail[i];
            const fade = (i + 1) / touchTrail.length;
            const alpha = fade * (onPath ? 0.35 : 0.18);
            const r = 1.5 + fade * 4.5;

            ctx.shadowBlur = 0;
            const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 2.4);
            grad.addColorStop(0, `rgba(130, 188, 168, ${alpha})`);
            grad.addColorStop(1, 'rgba(80, 130, 114, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r * 2.4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawTrackingAnchor(ctx) {
        if (!fingerActive) return;

        const x = fingerX;
        const y = fingerY;
        const scale = onPath ? 1 : 0.82;
        const bodyR = 9 * scale;

        ctx.save();

        const halo = ctx.createRadialGradient(x, y, 0, x, y, bodyR * 3.4);
        halo.addColorStop(0, onPath ? 'rgba(130, 188, 168, 0.34)' : 'rgba(96, 140, 124, 0.18)');
        halo.addColorStop(1, 'rgba(72, 118, 104, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, bodyR * 3.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = COLORS.anchorGlow;
        ctx.shadowBlur = onPath ? 16 : 10;
        ctx.fillStyle = onPath ? COLORS.anchorCore : 'rgba(118, 168, 150, 0.72)';
        ctx.beginPath();
        ctx.arc(x, y - bodyR * 0.18, bodyR, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = onPath ? 'rgba(168, 214, 196, 0.88)' : 'rgba(140, 188, 170, 0.62)';
        ctx.beginPath();
        ctx.moveTo(x, y + bodyR * 0.35);
        ctx.bezierCurveTo(
            x + bodyR * 0.72, y + bodyR * 0.05,
            x + bodyR * 0.58, y - bodyR * 1.05,
            x, y - bodyR * 1.28
        );
        ctx.bezierCurveTo(
            x - bodyR * 0.58, y - bodyR * 1.05,
            x - bodyR * 0.72, y + bodyR * 0.05,
            x, y + bodyR * 0.35
        );
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(210, 236, 226, 0.42)';
        ctx.beginPath();
        ctx.ellipse(x - bodyR * 0.22, y - bodyR * 0.42, bodyR * 0.22, bodyR * 0.14, -0.45, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = onPath ? 'rgba(150, 204, 186, 0.55)' : 'rgba(108, 148, 132, 0.32)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, bodyR * 1.05, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
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
        drawPath(mifCtx, points, now);
        drawTouchTrail(mifCtx);
        drawConcentricWaves(mifCtx, now);
        drawPulses(mifCtx, now);
        drawTrackingAnchor(mifCtx);

        mifRafId = requestAnimationFrame(drawFrame);
    }

    function bindEngine(root) {
        mifCanvas = root.querySelector('#mif-canvas');
        mifInst = root.querySelector('#mif-inst');
        mifStatus = root.querySelector('#mif-status');

        if (!mifCanvas) return false;
        mifCtx = mifCanvas.getContext('2d');
        if (!mifCtx) return false;

        fingerActive = false;
        onPath = false;
        onPathStreak = 0;
        synced = false;
        pulses = [];
        touchTrail = [];
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
        prepareThetaHum(root);
        setInstruction('Slide slowly along the shifting path');
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
                <p class="mif-status" id="mif-status" role="status">Slide slowly along the shifting path</p>
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
        if (inst) inst.textContent = PROTOCOL_HEADER;

        if (!mountSpaStage()) mountStandalone();
        setProtocolHeader();
        setInstruction('Slide slowly along the shifting path');
    }

    window.launchMIF = launchMIF;
    window.stopMIF = stopMIF;

    window.MIFThetaAudio = {
        prepare: prepareThetaHum,
        toggle: toggleThetaHum,
        teardown: teardownThetaHum,
        get isPlaying() {
            return isAudioPlaying;
        }
    };

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
