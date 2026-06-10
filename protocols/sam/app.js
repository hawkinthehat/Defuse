/**
 * SAM - Somatic Anchoring Module.
 * Sustained centering + signal detection working-memory saturation task.
 */
(function () {
    const SESSION_MS = 60000;
    const ROLLING_WINDOW_MS = 10000;
    const HEALING_BLUE = '#2563EB';
    const CHARCOAL = '#0F172A';
    const BASE_FALL_SPEED = 118;
    const BASE_SPAWN_MS = 1300;
    const MAX_DENSITY = 4.5;
    const MAX_SPEED = 3.4;
    const CENTER_SAMPLE_MS = 100;

    const DISTRACTOR_COLORS = ['#0F172A', '#EA580C', '#64748B', '#16A34A'];
    const SHAPE_TYPES = ['circle', 'square', 'triangle'];

    const state = {
        running: false,
        ended: false,
        rafId: 0,
        canvas: null,
        ctx: null,
        width: 0,
        height: 0,
        dpr: 1,
        startedAt: 0,
        lastFrameAt: 0,
        markerX: 0,
        markerV: 0,
        markerNoise: 0,
        dragPointerId: null,
        shapes: [],
        feedbacks: [],
        nextShapeId: 1,
        spawnAccumulator: 0,
        speedMultiplier: 1,
        densityMultiplier: 1,
        adaptiveLevel: 1,
        nextAdaptAt: ROLLING_WINDOW_MS,
        centerWindow: [],
        signalWindow: [],
        centerSampleAccumulator: 0,
        centerHits: 0,
        centerSamples: 0,
        signalHits: 0,
        signalEvents: 0,
        resizeObserver: null
    };

    function ensureStyles() {
        if (document.getElementById('sam-protocol-styles')) return;

        const style = document.createElement('style');
        style.id = 'sam-protocol-styles';
        style.textContent = `
            #protocol-stage.sam-stage {
                padding: 0 !important;
                overflow: hidden;
            }

            #viewport.viewport-sam {
                background:
                    radial-gradient(circle at 50% 16%, rgba(37, 99, 235, 0.11), transparent 24rem),
                    #f8fafc;
            }

            .sam-root {
                position: absolute;
                inset: 0;
                width: 100%;
                min-height: 100%;
                overflow: hidden;
                background: #f8fafc;
                color: ${CHARCOAL};
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                box-sizing: border-box;
            }

            .sam-canvas {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                display: block;
                touch-action: none;
                -webkit-tap-highlight-color: transparent;
                background: #f8fafc;
            }

            .sam-hud {
                position: absolute;
                top: calc(env(safe-area-inset-top, 32px) + 5.55rem);
                left: max(0.8rem, env(safe-area-inset-left, 0px));
                right: max(0.8rem, env(safe-area-inset-right, 0px));
                z-index: 3;
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 0.45rem;
                pointer-events: none;
            }

            .sam-metric {
                min-width: 0;
                padding: 0.5rem 0.45rem;
                border: 1px solid rgba(15, 23, 42, 0.15);
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.9);
                box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
                text-align: center;
            }

            .sam-metric-label {
                display: block;
                color: #475569;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: clamp(0.48rem, 2.4vw, 0.58rem);
                font-weight: 900;
                letter-spacing: 0.12em;
                line-height: 1.1;
                text-transform: uppercase;
            }

            .sam-metric-value {
                display: block;
                margin-top: 0.15rem;
                color: ${CHARCOAL};
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: clamp(0.76rem, 3.4vw, 1rem);
                font-weight: 900;
                line-height: 1;
                font-variant-numeric: tabular-nums;
            }

            .sam-root--preflight {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: calc(env(safe-area-inset-top, 32px) + 5rem) 1.25rem 1.5rem;
                background:
                    radial-gradient(circle at 50% 20%, rgba(37, 99, 235, 0.12), transparent 22rem),
                    #f8fafc;
            }

            .sam-complete-card {
                width: min(100%, 24rem);
                padding: clamp(1.25rem, 5vw, 1.7rem);
                border: 1.5px solid rgba(37, 99, 235, 0.38);
                border-radius: 18px;
                background: #ffffff;
                box-shadow:
                    0 4px 14px rgba(15, 23, 42, 0.08),
                    0 0 0 5px rgba(37, 99, 235, 0.06);
                text-align: center;
            }

            .sam-kicker {
                margin: 0 0 0.72rem;
                color: ${HEALING_BLUE};
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: 0.62rem;
                font-weight: 900;
                letter-spacing: 0.22em;
                text-transform: uppercase;
            }

            .sam-complete-title {
                margin: 0 0 0.75rem;
                color: ${CHARCOAL};
                font-size: clamp(1.35rem, 6vw, 1.85rem);
                line-height: 1.1;
                font-weight: 900;
                letter-spacing: -0.04em;
            }

            .sam-complete-copy {
                margin: 0 0 1.1rem;
                color: #334155;
                font-size: 0.94rem;
                line-height: 1.5;
                font-weight: 700;
            }

            .sam-results {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0.7rem;
                margin: 0 0 1.25rem;
            }

            .sam-result {
                padding: 0.75rem 0.55rem;
                border-radius: 12px;
                border: 1px solid rgba(148, 163, 184, 0.35);
                background: #f8fafc;
            }

            .sam-result span,
            .sam-result strong {
                display: block;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            }

            .sam-result span {
                color: #475569;
                font-size: 0.55rem;
                font-weight: 900;
                letter-spacing: 0.12em;
                text-transform: uppercase;
            }

            .sam-result strong {
                margin-top: 0.24rem;
                color: ${CHARCOAL};
                font-size: 1.08rem;
                font-weight: 900;
            }

            .sam-done-btn {
                width: 100%;
                min-height: 3.1rem;
                border: 1.5px solid ${HEALING_BLUE};
                border-radius: 12px;
                background: ${HEALING_BLUE};
                color: #ffffff;
                cursor: pointer;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: 0.75rem;
                font-weight: 900;
                letter-spacing: 0.14em;
                text-transform: uppercase;
                box-shadow: 0 14px 30px rgba(37, 99, 235, 0.22);
                touch-action: manipulation;
            }

            .sam-done-btn:active {
                transform: scale(0.985);
            }

            @media (max-width: 460px) {
                .sam-hud {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    top: calc(env(safe-area-inset-top, 32px) + 5.1rem);
                }
            }

            @media (max-height: 640px) {
                .sam-hud {
                    top: calc(env(safe-area-inset-top, 32px) + 4.7rem);
                }

                .sam-metric {
                    padding: 0.38rem 0.42rem;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function haptic(pattern) {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(pattern);
        } catch {
            /* ignore */
        }
    }

    function formatTime(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${r < 10 ? '0' : ''}${r}`;
    }

    function percent(hits, total) {
        if (!total) return '--';
        return `${Math.round((hits / total) * 100)}%`;
    }

    function aggregateWindow(events, now) {
        const cutoff = now - ROLLING_WINDOW_MS;
        while (events.length && events[0].t < cutoff) events.shift();
        if (!events.length) return { hits: 0, total: 0, accuracy: 0 };
        const hits = events.reduce((sum, event) => sum + (event.ok ? 1 : 0), 0);
        return { hits, total: events.length, accuracy: hits / events.length };
    }

    function addCenterSample(now, ok) {
        state.centerWindow.push({ t: now, ok });
        state.centerSamples += 1;
        if (ok) state.centerHits += 1;
    }

    function addSignalEvent(now, ok) {
        state.signalWindow.push({ t: now, ok });
        state.signalEvents += 1;
        if (ok) state.signalHits += 1;
    }

    function resetState() {
        state.running = false;
        state.ended = false;
        state.rafId = 0;
        state.width = 0;
        state.height = 0;
        state.dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
        state.startedAt = 0;
        state.lastFrameAt = 0;
        state.markerX = 0;
        state.markerV = 0;
        state.markerNoise = 0;
        state.dragPointerId = null;
        state.shapes = [];
        state.feedbacks = [];
        state.nextShapeId = 1;
        state.spawnAccumulator = 0;
        state.speedMultiplier = 1;
        state.densityMultiplier = 1;
        state.adaptiveLevel = 1;
        state.nextAdaptAt = ROLLING_WINDOW_MS;
        state.centerWindow = [];
        state.signalWindow = [];
        state.centerSampleAccumulator = 0;
        state.centerHits = 0;
        state.centerSamples = 0;
        state.signalHits = 0;
        state.signalEvents = 0;
    }

    function stopSAM() {
        state.running = false;
        state.ended = true;

        if (state.rafId) {
            cancelAnimationFrame(state.rafId);
            state.rafId = 0;
        }

        if (state.resizeObserver) {
            state.resizeObserver.disconnect();
            state.resizeObserver = null;
        }
        window.removeEventListener('resize', resizeCanvas);

        const vp = document.getElementById('viewport');
        if (vp) vp.classList.remove('viewport-sam');

        const stage = document.getElementById('protocol-stage');
        if (stage) stage.classList.remove('sam-stage');

        state.canvas = null;
        state.ctx = null;
    }

    function trackMetrics() {
        const width = state.width || 1;
        const height = state.height || 1;
        const trackReserve = Math.max(128, Math.min(178, height * 0.22));
        const trackY = height - Math.max(72, trackReserve * 0.5);
        const targetWidth = Math.max(64, Math.min(132, width * 0.18));
        const minX = Math.max(24, width * 0.07);
        const maxX = width - minX;
        return {
            trackY,
            trackReserve,
            targetX: width / 2,
            targetWidth,
            minX,
            maxX,
            handleRadius: Math.max(20, Math.min(30, width * 0.055))
        };
    }

    function resizeCanvas() {
        const canvas = state.canvas;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const width = Math.max(320, Math.round(rect.width || window.innerWidth || 320));
        const height = Math.max(420, Math.round(rect.height || window.innerHeight || 420));
        const oldWidth = state.width;

        state.width = width;
        state.height = height;
        state.dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
        canvas.width = Math.round(width * state.dpr);
        canvas.height = Math.round(height * state.dpr);

        if (state.ctx) {
            state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        }

        const metrics = trackMetrics();
        if (!oldWidth || !state.markerX) {
            state.markerX = metrics.targetX;
        } else {
            state.markerX = Math.max(metrics.minX, Math.min(metrics.maxX, state.markerX * (width / oldWidth)));
        }
    }

    function spawnShape() {
        const metrics = trackMetrics();
        const size = Math.max(30, Math.min(58, state.width * (0.07 + Math.random() * 0.035)));
        const isBlue = Math.random() < 0.34;
        const type = SHAPE_TYPES[Math.floor(Math.random() * SHAPE_TYPES.length)];
        const color = isBlue
            ? HEALING_BLUE
            : DISTRACTOR_COLORS[Math.floor(Math.random() * DISTRACTOR_COLORS.length)];

        state.shapes.push({
            id: state.nextShapeId,
            type,
            color,
            isBlue,
            size,
            x: metrics.minX + Math.random() * Math.max(1, metrics.maxX - metrics.minX),
            y: -size - Math.random() * 80,
            vy: BASE_FALL_SPEED * state.speedMultiplier * (0.86 + Math.random() * 0.34),
            rotation: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 1.6
        });
        state.nextShapeId += 1;
    }

    function updateMarker(dt) {
        const metrics = trackMetrics();
        if (state.dragPointerId === null) {
            state.markerNoise += (Math.random() - 0.5) * 80 * dt;
            state.markerNoise *= Math.pow(0.72, dt * 10);
            state.markerV += state.markerNoise + (Math.random() - 0.5) * 34 * dt;
            state.markerV *= Math.pow(0.92, dt * 60);
            state.markerX += state.markerV * dt * 60;
        } else {
            state.markerV *= Math.pow(0.55, dt * 60);
        }

        if (state.markerX < metrics.minX) {
            state.markerX = metrics.minX;
            state.markerV = Math.abs(state.markerV) * 0.35;
        } else if (state.markerX > metrics.maxX) {
            state.markerX = metrics.maxX;
            state.markerV = -Math.abs(state.markerV) * 0.35;
        }
    }

    function updateShapes(dt, now) {
        const missLine = state.height - trackMetrics().trackReserve;
        const next = [];

        state.shapes.forEach((shape) => {
            shape.y += shape.vy * dt;
            shape.rotation += shape.spin * dt;
            if (shape.isBlue && shape.y - shape.size > missLine) {
                addSignalEvent(now, false);
                state.feedbacks.push({ x: shape.x, y: Math.min(shape.y, missLine), text: 'MISS', color: '#DC2626', age: 0 });
                return;
            }
            if (!shape.isBlue && shape.y - shape.size > state.height + 60) return;
            next.push(shape);
        });

        state.shapes = next;
        state.feedbacks = state.feedbacks
            .map((feedback) => ({ ...feedback, age: feedback.age + dt }))
            .filter((feedback) => feedback.age < 0.55);
    }

    function maybeSpawn(dtMs) {
        const interval = Math.max(360, BASE_SPAWN_MS / state.densityMultiplier);
        state.spawnAccumulator += dtMs;

        while (state.spawnAccumulator >= interval) {
            state.spawnAccumulator -= interval;
            spawnShape();
        }
    }

    function maybeAdapt(elapsed) {
        if (elapsed < state.nextAdaptAt) return;

        const now = performance.now();
        const center = aggregateWindow(state.centerWindow, now);
        const signal = aggregateWindow(state.signalWindow, now);
        const ready = center.total >= 40 && signal.total >= 2;

        if (ready && center.accuracy > 0.85 && signal.accuracy > 0.85) {
            state.speedMultiplier = Math.min(MAX_SPEED, state.speedMultiplier * 1.15);
            state.densityMultiplier = Math.min(MAX_DENSITY, state.densityMultiplier * 1.15);
            state.adaptiveLevel += 1;
            haptic([18, 30, 18]);
        }

        state.nextAdaptAt += ROLLING_WINDOW_MS;
    }

    function updateHud(remainingMs) {
        const center = percent(state.centerHits, state.centerSamples);
        const signal = percent(state.signalHits, state.signalEvents);
        const values = {
            'sam-time': formatTime(remainingMs),
            'sam-center-acc': center,
            'sam-signal-acc': signal,
            'sam-level': String(state.adaptiveLevel)
        };

        Object.keys(values).forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = values[id];
        });

        setInst(`SAM · ${formatTime(remainingMs)} · CENTER ${center} · SIGNAL ${signal}`);
    }

    function sampleCenter(now, dtMs) {
        state.centerSampleAccumulator += dtMs;
        if (state.centerSampleAccumulator < CENTER_SAMPLE_MS) return;
        state.centerSampleAccumulator %= CENTER_SAMPLE_MS;

        const metrics = trackMetrics();
        const ok = Math.abs(state.markerX - metrics.targetX) <= metrics.targetWidth / 2;
        addCenterSample(now, ok);
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function drawShape(ctx, shape) {
        ctx.save();
        ctx.translate(shape.x, shape.y);
        ctx.rotate(shape.rotation);
        ctx.fillStyle = shape.color;
        ctx.strokeStyle = shape.isBlue ? '#1D4ED8' : '#ffffff';
        ctx.lineWidth = shape.isBlue ? 4 : 2;
        ctx.shadowColor = shape.isBlue ? 'rgba(37, 99, 235, 0.28)' : 'rgba(15, 23, 42, 0.14)';
        ctx.shadowBlur = shape.isBlue ? 16 : 8;

        const s = shape.size;
        if (shape.type === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (shape.type === 'square') {
            drawRoundedRect(ctx, -s / 2, -s / 2, s, s, Math.max(5, s * 0.13));
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(0, -s / 2);
            ctx.lineTo(s * 0.5, s * 0.42);
            ctx.lineTo(-s * 0.5, s * 0.42);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawTrack(ctx) {
        const metrics = trackMetrics();
        const trackWidth = metrics.maxX - metrics.minX;
        const trackHeight = Math.max(16, state.height * 0.022);
        const y = metrics.trackY;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, metrics.minX - 18, y - 54, trackWidth + 36, 112, 26);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#CBD5E1';
        drawRoundedRect(ctx, metrics.minX, y - trackHeight / 2, trackWidth, trackHeight, 999);
        ctx.fill();

        ctx.fillStyle = 'rgba(37, 99, 235, 0.18)';
        ctx.strokeStyle = HEALING_BLUE;
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, metrics.targetX - metrics.targetWidth / 2, y - 30, metrics.targetWidth, 60, 18);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = HEALING_BLUE;
        ctx.beginPath();
        ctx.arc(state.markerX, y, metrics.handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = CHARCOAL;
        ctx.font = '900 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DRAG HANDLE INTO TARGET ZONE', metrics.targetX, y + 52);
        ctx.restore();
    }

    function drawFeedback(ctx) {
        state.feedbacks.forEach((feedback) => {
            const alpha = Math.max(0, 1 - feedback.age / 0.55);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = feedback.color;
            ctx.font = '900 16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(feedback.text, feedback.x, feedback.y - 18 - feedback.age * 30);
            ctx.restore();
        });
    }

    function renderFrame() {
        const ctx = state.ctx;
        if (!ctx) return;

        ctx.clearRect(0, 0, state.width, state.height);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, state.width, state.height);

        ctx.save();
        ctx.fillStyle = 'rgba(37, 99, 235, 0.05)';
        ctx.beginPath();
        ctx.arc(state.width / 2, state.height * 0.24, Math.min(state.width, state.height) * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        state.shapes.forEach((shape) => drawShape(ctx, shape));
        drawFeedback(ctx);
        drawTrack(ctx);
    }

    function endSession() {
        if (state.ended) return;
        state.running = false;
        state.ended = true;

        if (state.rafId) {
            cancelAnimationFrame(state.rafId);
            state.rafId = 0;
        }

        setInst('SAM · SESSION COMPLETE');

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.innerHTML = `
            <div class="sam-root sam-root--preflight">
                <section class="sam-complete-card" aria-labelledby="sam-complete-title">
                    <p class="sam-kicker">SAM complete</p>
                    <h2 class="sam-complete-title" id="sam-complete-title">Dual attention task complete.</h2>
                    <p class="sam-complete-copy">You trained centering control while screening for the Healing Blue signal under adaptive load.</p>
                    <div class="sam-results" aria-label="SAM results">
                        <div class="sam-result">
                            <span>Centering</span>
                            <strong>${percent(state.centerHits, state.centerSamples)}</strong>
                        </div>
                        <div class="sam-result">
                            <span>Signals</span>
                            <strong>${percent(state.signalHits, state.signalEvents)}</strong>
                        </div>
                    </div>
                    <button type="button" class="sam-done-btn" id="sam-done">RETURN TO MAIN SCREEN</button>
                </section>
            </div>
        `;

        document.getElementById('sam-done')?.addEventListener('click', () => exitProtocol());
    }

    function tick(now) {
        if (!state.running) {
            state.rafId = 0;
            return;
        }

        const elapsed = now - state.startedAt;
        const remainingMs = Math.max(0, SESSION_MS - elapsed);
        const dtMs = state.lastFrameAt ? Math.min(50, now - state.lastFrameAt) : 16;
        const dt = dtMs / 1000;
        state.lastFrameAt = now;

        updateMarker(dt);
        maybeSpawn(dtMs);
        updateShapes(dt, now);
        sampleCenter(now, dtMs);
        maybeAdapt(elapsed);
        updateHud(remainingMs);
        renderFrame();

        if (remainingMs <= 0) {
            endSession();
            return;
        }

        state.rafId = requestAnimationFrame(tick);
    }

    function canvasPoint(event) {
        const rect = state.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    function isSliderGesture(point) {
        const metrics = trackMetrics();
        const dx = point.x - state.markerX;
        const dy = point.y - metrics.trackY;
        const nearHandle = Math.hypot(dx, dy) <= metrics.handleRadius + 26;
        const inTrackBand = point.y >= metrics.trackY - 58;
        return nearHandle || inTrackBand;
    }

    function moveHandle(point) {
        const metrics = trackMetrics();
        state.markerX = Math.max(metrics.minX, Math.min(metrics.maxX, point.x));
    }

    function hitShape(point, shape) {
        const dx = point.x - shape.x;
        const dy = point.y - shape.y;
        if (shape.type === 'circle') return Math.hypot(dx, dy) <= shape.size / 2;
        return Math.abs(dx) <= shape.size * 0.56 && Math.abs(dy) <= shape.size * 0.56;
    }

    function handleSignalTap(point) {
        const hit = state.shapes
            .slice()
            .reverse()
            .find((shape) => hitShape(point, shape));

        if (hit) {
            const ok = hit.isBlue;
            addSignalEvent(performance.now(), ok);
            state.feedbacks.push({
                x: hit.x,
                y: hit.y,
                text: ok ? 'HIT' : 'FALSE',
                color: ok ? HEALING_BLUE : '#DC2626',
                age: 0
            });
            state.shapes = state.shapes.filter((shape) => shape.id !== hit.id);
            haptic(ok ? 18 : [30, 35, 30]);
            return;
        }

        const activeBlue = state.shapes.find((shape) => shape.isBlue && shape.y > 0 && shape.y < state.height - trackMetrics().trackReserve);
        if (activeBlue) {
            addSignalEvent(performance.now(), true);
            state.feedbacks.push({ x: activeBlue.x, y: activeBlue.y, text: 'HIT', color: HEALING_BLUE, age: 0 });
            state.shapes = state.shapes.filter((shape) => shape.id !== activeBlue.id);
            haptic(18);
            return;
        }

        addSignalEvent(performance.now(), false);
        state.feedbacks.push({ x: point.x, y: point.y, text: 'WAIT', color: '#DC2626', age: 0 });
        haptic([25, 35, 25]);
    }

    function onPointerDown(event) {
        if (!state.running || !state.canvas) return;
        event.preventDefault();
        const point = canvasPoint(event);

        if (isSliderGesture(point)) {
            state.dragPointerId = event.pointerId;
            moveHandle(point);
            try {
                state.canvas.setPointerCapture(event.pointerId);
            } catch {
                /* Pointer capture can fail after browser cancellation. */
            }
            return;
        }

        handleSignalTap(point);
    }

    function onPointerMove(event) {
        if (!state.running || event.pointerId !== state.dragPointerId) return;
        event.preventDefault();
        moveHandle(canvasPoint(event));
    }

    function releasePointer(event) {
        if (event.pointerId === state.dragPointerId) {
            state.dragPointerId = null;
        }
    }

    function bindCanvas() {
        const canvas = state.canvas;
        if (!canvas) return;
        canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
        canvas.addEventListener('pointermove', onPointerMove, { passive: false });
        canvas.addEventListener('pointerup', releasePointer);
        canvas.addEventListener('pointercancel', releasePointer);
        canvas.addEventListener('lostpointercapture', releasePointer);
    }

    function renderTaskShell() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.classList.add('sam-stage');
        stage.innerHTML = `
            <div class="sam-root sam-root--active" id="sam-root">
                <canvas class="sam-canvas" id="sam-canvas" aria-label="Sustained attention canvas task"></canvas>
                <div class="sam-hud" aria-live="polite">
                    <div class="sam-metric">
                        <span class="sam-metric-label">Time</span>
                        <span class="sam-metric-value" id="sam-time">1:00</span>
                    </div>
                    <div class="sam-metric">
                        <span class="sam-metric-label">Center</span>
                        <span class="sam-metric-value" id="sam-center-acc">--</span>
                    </div>
                    <div class="sam-metric">
                        <span class="sam-metric-label">Signal</span>
                        <span class="sam-metric-value" id="sam-signal-acc">--</span>
                    </div>
                    <div class="sam-metric">
                        <span class="sam-metric-label">Load</span>
                        <span class="sam-metric-value" id="sam-level">1</span>
                    </div>
                </div>
            </div>
        `;

        state.canvas = document.getElementById('sam-canvas');
        state.ctx = state.canvas ? state.canvas.getContext('2d') : null;
        resizeCanvas();
        bindCanvas();

        if (typeof ResizeObserver !== 'undefined' && state.canvas) {
            state.resizeObserver = new ResizeObserver(resizeCanvas);
            state.resizeObserver.observe(state.canvas);
        }
        window.addEventListener('resize', resizeCanvas, { passive: true });
    }

    function startTask() {
        haptic(24);
        resetState();
        renderTaskShell();
        state.running = true;
        state.startedAt = performance.now();
        state.lastFrameAt = 0;
        setInst('SAM · CENTER HANDLE · TAP HEALING BLUE ONLY');
        spawnShape();
        updateHud(SESSION_MS);
        renderFrame();
        state.rafId = requestAnimationFrame(tick);
    }

    function renderPreflight() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.classList.add('sam-stage');
        setInst('SAM · READ INSTRUCTIONS');
        stage.innerHTML = `
            <div class="sam-root sam-root--preflight">
                <div class="protocol-preflight-overlay">
                    <section class="protocol-preflight-card" role="dialog" aria-labelledby="sam-preflight-title" aria-describedby="sam-preflight-steps">
                        <h2 class="protocol-preflight-title" id="sam-preflight-title">HOW TO ANCHOR ATTENTION</h2>
                        <ol class="protocol-preflight-steps" id="sam-preflight-steps">
                            <li>Drag the bottom slider handle to keep it inside the center target zone.</li>
                            <li>Shapes will fall from the top while the handle drifts randomly.</li>
                            <li>Tap only the Healing Blue (#2563EB) target shapes. Non-blue taps and missed blue shapes count as misses.</li>
                            <li>Strong accuracy increases speed and density every rolling 10-second window.</li>
                        </ol>
                        <button type="button" class="protocol-preflight-start" id="sam-preflight-start">[ START TASK ]</button>
                    </section>
                </div>
            </div>
        `;

        document.getElementById('sam-preflight-start')?.addEventListener('click', startTask);
    }

    function launchSAM() {
        ensureStyles();
        stopSAM();
        resetState();

        const vp = document.getElementById('viewport');
        if (vp) vp.classList.add('viewport-sam');

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        renderPreflight();
    }

    window.launchSAM = launchSAM;
    window.stopSAM = stopSAM;
})();
