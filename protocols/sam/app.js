(function () {
    const SESSION_MS = 60000;
    const WINDOW_MS = 10000;
    const HEALING_BLUE = '#2563EB';
    const CHARCOAL = '#0F172A';
    const MAX_DPR = 2;
    const TARGET_ZONE_NORM = 0.14;
    const BASE_SPEED = 135;
    const BASE_SPAWN_MS = 1050;
    const DIFFICULTY_STEP = 1.15;

    const SHAPE_COLORS = [HEALING_BLUE, '#DC2626', '#F59E0B', '#0F766E', '#7C3AED'];
    const SHAPE_TYPES = ['circle', 'square', 'triangle'];

    let samRunning = false;
    let samEnded = false;
    let samCanvas = null;
    let samCtx = null;
    let samRafId = 0;
    let samResizeHandler = null;

    let width = 0;
    let height = 0;
    let startedAt = 0;
    let lastFrameAt = 0;
    let lastSpawnAt = 0;
    let lastAdaptiveAt = 0;
    let difficulty = 1;

    let handleNorm = 0.5;
    let driftOffset = 0;
    let driftVelocity = 0.16;
    let markerNorm = 0.5;
    let draggingHandle = false;
    let activePointerId = null;

    let shapes = [];
    let centerSamples = [];
    let signalEvents = [];
    let totalCenterMs = 0;
    let totalCenteredMs = 0;
    let signalCorrect = 0;
    let signalTotal = 0;
    let blueSeen = 0;
    let blueHit = 0;
    let missedBlue = 0;
    let falseAlarms = 0;
    let adaptationCount = 0;

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function formatClock(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;
        return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function haptic(pattern) {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(pattern);
        } catch {
            /* ignore */
        }
    }

    function getTrackMetrics() {
        const safeBottom = 26;
        const trackY = clamp(
            height - safeBottom - 88,
            Math.max(150, height * 0.55),
            Math.max(160, height - safeBottom - 72)
        );
        const left = Math.max(28, width * 0.08);
        const right = Math.min(width - 28, width * 0.92);
        const center = (left + right) / 2;
        const trackWidth = right - left;
        return {
            left,
            right,
            center,
            trackY,
            trackWidth,
            targetHalf: Math.max(22, trackWidth * TARGET_ZONE_NORM * 0.5),
            handleY: trackY + 42
        };
    }

    function fitCanvas() {
        if (!samCanvas) return;
        const rect = samCanvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        width = Math.max(1, Math.floor(rect.width));
        height = Math.max(1, Math.floor(rect.height));
        samCanvas.width = Math.floor(width * dpr);
        samCanvas.height = Math.floor(height * dpr);
        samCtx = samCanvas.getContext('2d', { alpha: false });
        samCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function randomShape(now) {
        const track = getTrackMetrics();
        const size = clamp(width * 0.055, 22, 42);
        const isBlue = Math.random() < 0.34;
        if (isBlue) blueSeen += 1;
        return {
            id: `${now}-${Math.random()}`,
            x: 28 + Math.random() * Math.max(1, width - 56),
            y: -size - Math.random() * 80,
            radius: size,
            type: SHAPE_TYPES[Math.floor(Math.random() * SHAPE_TYPES.length)],
            color: isBlue ? HEALING_BLUE : SHAPE_COLORS[1 + Math.floor(Math.random() * (SHAPE_COLORS.length - 1))],
            blue: isBlue,
            speed: (BASE_SPEED + Math.random() * 70) * difficulty,
            bottomLimit: track.trackY - 36,
            hit: false
        };
    }

    function spawnDueShapes(now) {
        const spawnEvery = Math.max(260, BASE_SPAWN_MS / difficulty);
        if (now - lastSpawnAt < spawnEvery) return;

        lastSpawnAt = now;
        shapes.push(randomShape(now));
        if (difficulty > 1.25 && Math.random() < Math.min(0.72, (difficulty - 1) * 0.42)) {
            shapes.push(randomShape(now + 1));
        }
    }

    function recordSignal(correct) {
        signalTotal += 1;
        if (correct) signalCorrect += 1;
        signalEvents.push({ t: performance.now(), correct });
    }

    function pruneRolling(now) {
        const threshold = now - WINDOW_MS;
        while (centerSamples.length && centerSamples[0].t < threshold) centerSamples.shift();
        while (signalEvents.length && signalEvents[0].t < threshold) signalEvents.shift();
    }

    function getRollingStats(now) {
        pruneRolling(now);
        const centerMs = centerSamples.reduce((sum, sample) => sum + sample.dt, 0);
        const centeredMs = centerSamples.reduce((sum, sample) => sum + (sample.ok ? sample.dt : 0), 0);
        const signalCount = signalEvents.length;
        const signalHits = signalEvents.filter((event) => event.correct).length;
        return {
            centerAccuracy: centerMs > 0 ? centeredMs / centerMs : 0,
            signalAccuracy: signalCount > 0 ? signalHits / signalCount : 1,
            signalCount
        };
    }

    function evaluateAdaptiveWindow(now) {
        if (now - lastAdaptiveAt < WINDOW_MS) return;
        lastAdaptiveAt = now;
        const stats = getRollingStats(now);
        if (stats.signalCount === 0) return;

        if (stats.centerAccuracy > 0.85 && stats.signalAccuracy > 0.85) {
            difficulty *= DIFFICULTY_STEP;
            adaptationCount += 1;
            haptic([16, 30, 16]);
        }
    }

    function updateMarker(dt) {
        driftVelocity += (Math.random() - 0.5) * 0.34 * dt;
        driftVelocity = clamp(driftVelocity, -0.36, 0.36);
        driftOffset += driftVelocity * dt;
        if (driftOffset > 0.34 || driftOffset < -0.34) {
            driftOffset = clamp(driftOffset, -0.34, 0.34);
            driftVelocity *= -0.72;
        }

        markerNorm = clamp(0.5 + driftOffset + (handleNorm - 0.5) * 0.95, 0, 1);
    }

    function updateShapes(dt) {
        for (let i = shapes.length - 1; i >= 0; i -= 1) {
            const shape = shapes[i];
            shape.y += shape.speed * dt;
            if (shape.y - shape.radius > shape.bottomLimit) {
                if (shape.blue && !shape.hit) {
                    missedBlue += 1;
                    recordSignal(false);
                }
                shapes.splice(i, 1);
            }
        }
    }

    function drawShape(ctx, shape) {
        ctx.save();
        ctx.translate(shape.x, shape.y);
        ctx.fillStyle = shape.color;
        ctx.strokeStyle = shape.blue ? '#1D4ED8' : '#334155';
        ctx.lineWidth = shape.blue ? 3 : 2;
        ctx.shadowColor = shape.blue ? 'rgba(37, 99, 235, 0.38)' : 'rgba(15, 23, 42, 0.12)';
        ctx.shadowBlur = shape.blue ? 16 : 7;

        if (shape.type === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, shape.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (shape.type === 'square') {
            const s = shape.radius * 1.58;
            ctx.beginPath();
            ctx.roundRect(-s / 2, -s / 2, s, s, 8);
            ctx.fill();
            ctx.stroke();
        } else {
            const r = shape.radius * 1.15;
            ctx.beginPath();
            ctx.moveTo(0, -r);
            ctx.lineTo(r * 0.92, r * 0.68);
            ctx.lineTo(-r * 0.92, r * 0.68);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawHud(ctx, remainingMs, stats) {
        const padX = Math.max(14, width * 0.04);
        const top = Math.max(18, Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 18);
        const clock = formatClock(remainingMs);

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(padX, top + 8, Math.min(width - padX * 2, 460), 68, 16);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = CHARCOAL;
        ctx.font = '900 18px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(`SAM ${clock}`, padX + 16, top + 35);

        ctx.font = '800 12px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = '#334155';
        const center = Math.round(stats.centerAccuracy * 100);
        const signal = Math.round(stats.signalAccuracy * 100);
        ctx.fillText(`CENTER ${center}% · SIGNAL ${signal}% · LOAD ${difficulty.toFixed(2)}x`, padX + 16, top + 58);
        ctx.restore();
    }

    function drawTrack(ctx, centered) {
        const track = getTrackMetrics();
        const markerX = track.left + markerNorm * track.trackWidth;
        const handleX = track.left + handleNorm * track.trackWidth;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(12, track.trackY - 50, width - 24, 124, 22);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
        ctx.strokeStyle = HEALING_BLUE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(track.center - track.targetHalf, track.trackY - 25, track.targetHalf * 2, 50, 12);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(track.left, track.trackY);
        ctx.lineTo(track.right, track.trackY);
        ctx.stroke();

        ctx.strokeStyle = centered ? HEALING_BLUE : '#DC2626';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(markerX, track.trackY - 34);
        ctx.lineTo(markerX, track.trackY + 34);
        ctx.stroke();
        ctx.fillStyle = centered ? HEALING_BLUE : '#DC2626';
        ctx.beginPath();
        ctx.arc(markerX, track.trackY, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(track.left, track.handleY);
        ctx.lineTo(track.right, track.handleY);
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = CHARCOAL;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(handleX, track.handleY, draggingHandle ? 23 : 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = CHARCOAL;
        ctx.font = '900 11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DRAG HANDLE TO KEEP MARKER INSIDE BLUE ZONE', width / 2, track.trackY - 62);
        ctx.restore();
    }

    function render(now) {
        if (!samRunning || !samCtx || !samCanvas?.isConnected) {
            samRafId = 0;
            return;
        }

        const dt = Math.min(0.05, Math.max(0, (now - lastFrameAt) / 1000));
        lastFrameAt = now;

        const elapsed = now - startedAt;
        const remainingMs = Math.max(0, SESSION_MS - elapsed);

        updateMarker(dt);
        spawnDueShapes(now);
        updateShapes(dt);

        const track = getTrackMetrics();
        const markerX = track.left + markerNorm * track.trackWidth;
        const centered = Math.abs(markerX - track.center) <= track.targetHalf;
        const sampleMs = dt * 1000;
        totalCenterMs += sampleMs;
        if (centered) totalCenteredMs += sampleMs;
        centerSamples.push({ t: now, dt: sampleMs, ok: centered });

        const stats = getRollingStats(now);
        evaluateAdaptiveWindow(now);

        samCtx.fillStyle = '#F8FAFC';
        samCtx.fillRect(0, 0, width, height);

        for (const shape of shapes) drawShape(samCtx, shape);
        drawTrack(samCtx, centered);
        drawHud(samCtx, remainingMs, stats);

        setInst(`SAM · ${formatClock(remainingMs)} · CENTER ${Math.round(stats.centerAccuracy * 100)}% · SIGNAL ${Math.round(stats.signalAccuracy * 100)}%`);

        if (remainingMs <= 0) {
            endSession();
            return;
        }

        samRafId = requestAnimationFrame(render);
    }

    function hitShape(clientX, clientY) {
        if (!samCanvas) return null;
        const rect = samCanvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        for (let i = shapes.length - 1; i >= 0; i -= 1) {
            const shape = shapes[i];
            const dx = x - shape.x;
            const dy = y - shape.y;
            const radius = shape.radius * 1.15;
            if (dx * dx + dy * dy <= radius * radius) return { shape, index: i };
        }
        return null;
    }

    function setHandleFromPointer(clientX) {
        if (!samCanvas) return;
        const rect = samCanvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const track = getTrackMetrics();
        handleNorm = clamp((x - track.left) / track.trackWidth, 0, 1);
    }

    function pointerNearHandleArea(clientX, clientY) {
        if (!samCanvas) return false;
        const rect = samCanvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const track = getTrackMetrics();
        const handleX = track.left + handleNorm * track.trackWidth;
        const onTrack = y >= track.trackY - 54 && y <= track.handleY + 44 && x >= track.left - 30 && x <= track.right + 30;
        const onHandle = Math.hypot(x - handleX, y - track.handleY) <= 44;
        return onTrack || onHandle;
    }

    function onPointerDown(e) {
        if (!samRunning || samEnded) return;
        e.preventDefault();

        if (pointerNearHandleArea(e.clientX, e.clientY)) {
            draggingHandle = true;
            activePointerId = e.pointerId;
            setHandleFromPointer(e.clientX);
            try {
                samCanvas.setPointerCapture(e.pointerId);
            } catch {
                /* ignore */
            }
            return;
        }

        const hit = hitShape(e.clientX, e.clientY);
        if (!hit) {
            falseAlarms += 1;
            recordSignal(false);
            haptic(18);
            return;
        }

        const { shape, index } = hit;
        shapes.splice(index, 1);
        if (shape.blue) {
            shape.hit = true;
            blueHit += 1;
            recordSignal(true);
            haptic(14);
        } else {
            falseAlarms += 1;
            recordSignal(false);
            haptic(28);
        }
    }

    function onPointerMove(e) {
        if (!draggingHandle || e.pointerId !== activePointerId) return;
        e.preventDefault();
        setHandleFromPointer(e.clientX);
    }

    function releasePointer(e) {
        if (e.pointerId !== activePointerId) return;
        draggingHandle = false;
        activePointerId = null;
    }

    function bindCanvas() {
        if (!samCanvas) return;
        samCanvas.addEventListener('pointerdown', onPointerDown, { passive: false });
        samCanvas.addEventListener('pointermove', onPointerMove, { passive: false });
        samCanvas.addEventListener('pointerup', releasePointer);
        samCanvas.addEventListener('pointercancel', releasePointer);
        samCanvas.addEventListener('lostpointercapture', releasePointer);
    }

    function resetState() {
        startedAt = 0;
        lastFrameAt = 0;
        lastSpawnAt = 0;
        lastAdaptiveAt = 0;
        difficulty = 1;
        handleNorm = 0.5;
        driftOffset = 0;
        driftVelocity = 0.16;
        markerNorm = 0.5;
        draggingHandle = false;
        activePointerId = null;
        shapes = [];
        centerSamples = [];
        signalEvents = [];
        totalCenterMs = 0;
        totalCenteredMs = 0;
        signalCorrect = 0;
        signalTotal = 0;
        blueSeen = 0;
        blueHit = 0;
        missedBlue = 0;
        falseAlarms = 0;
        adaptationCount = 0;
    }

    function renderTaskShell() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.style.paddingTop = '0';
        stage.innerHTML = `
            <div class="sam-root" id="sam-root">
                <canvas class="sam-canvas" id="sam-canvas" aria-label="Sustained attention and signal detection canvas"></canvas>
            </div>
        `;
        samCanvas = document.getElementById('sam-canvas');
        fitCanvas();
        bindCanvas();
        samResizeHandler = () => {
            fitCanvas();
        };
        window.addEventListener('resize', samResizeHandler);
    }

    function startTask() {
        stopLoopOnly();
        resetState();
        renderTaskShell();
        if (!samCanvas) return;
        samRunning = true;
        samEnded = false;
        startedAt = performance.now();
        lastFrameAt = startedAt;
        lastSpawnAt = startedAt - 650;
        lastAdaptiveAt = startedAt;
        setInst('SAM · 1:00 · CENTER MARKER · TAP BLUE SHAPES ONLY');
        samRafId = requestAnimationFrame(render);
    }

    function renderOnboarding() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.removeAttribute('style');
        stage.innerHTML = `
            <div class="sam-root sam-root--onboarding">
                <section class="sam-card" role="dialog" aria-modal="false" aria-labelledby="sam-title">
                    <p class="sam-kicker">SAM · Somatic Anchoring Module</p>
                    <h1 class="sam-title" id="sam-title">Anchor attention under load.</h1>
                    <ol class="sam-steps">
                        <li>Drag the bottom slider handle to keep the moving marker centered in the blue target zone.</li>
                        <li>Geometric shapes will fall from the top of the screen.</li>
                        <li>Tap only Healing Blue (${escapeHtml(HEALING_BLUE)}) shapes. Ignore every other shape.</li>
                        <li>The task adapts every 10 seconds when both channels stay above 85% accuracy.</li>
                    </ol>
                    <button type="button" class="sam-start-btn" id="sam-start-btn">[ START TASK ]</button>
                </section>
            </div>
        `;
        const start = document.getElementById('sam-start-btn');
        if (start) {
            start.addEventListener('click', startTask);
            start.focus();
        }
    }

    function renderComplete() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.removeAttribute('style');
        const centerPct = totalCenterMs > 0 ? Math.round((totalCenteredMs / totalCenterMs) * 100) : 0;
        const signalPct = signalTotal > 0 ? Math.round((signalCorrect / signalTotal) * 100) : 100;
        setInst('SAM · SESSION COMPLETE');
        stage.innerHTML = `
            <div class="sam-root sam-root--complete">
                <section class="sam-card sam-card--summary" aria-labelledby="sam-complete-title">
                    <p class="sam-kicker">SAM complete</p>
                    <h2 class="sam-title" id="sam-complete-title">Sustained attention sequence complete.</h2>
                    <div class="sam-summary-grid">
                        <p><strong>${centerPct}%</strong><span>Centering accuracy</span></p>
                        <p><strong>${signalPct}%</strong><span>Signal accuracy</span></p>
                        <p><strong>${blueHit}/${blueSeen}</strong><span>Blue shapes tapped</span></p>
                        <p><strong>${adaptationCount}</strong><span>Adaptive load increases</span></p>
                    </div>
                    <p class="sam-summary-note">Missed blue: ${missedBlue}. False alarms: ${falseAlarms}. Final load: ${difficulty.toFixed(2)}x.</p>
                    <button type="button" class="sam-done-btn" id="sam-done-btn">RETURN TO DASHBOARD</button>
                </section>
            </div>
        `;
        document.getElementById('sam-done-btn')?.addEventListener('click', () => exitProtocol());
    }

    function stopLoopOnly() {
        samRunning = false;
        draggingHandle = false;
        activePointerId = null;
        if (samRafId) {
            cancelAnimationFrame(samRafId);
            samRafId = 0;
        }
        if (samResizeHandler) {
            window.removeEventListener('resize', samResizeHandler);
            samResizeHandler = null;
        }
        samCanvas = null;
        samCtx = null;
    }

    function endSession() {
        if (samEnded) return;
        samEnded = true;
        stopLoopOnly();
        renderComplete();
    }

    function stopSAM() {
        stopLoopOnly();
        samEnded = false;
        const stage = document.getElementById('protocol-stage');
        if (stage) stage.removeAttribute('style');
    }

    function launchSAM() {
        stopSAM();
        if (typeof showProtocolViewport === 'function') showProtocolViewport();
        setInst('SAM · READY');
        renderOnboarding();
    }

    window.launchSAM = launchSAM;
    window.stopSAM = stopSAM;
})();
