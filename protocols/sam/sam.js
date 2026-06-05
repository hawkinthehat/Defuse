/**
 * SAM — Self-Adaptive Multitasking: slider tracking + Healing Blue Go/No-Go.
 */
(function () {
    const SESSION_MS = 60000;
    const STABILITY_WINDOW_MS = 10000;
    const HEALING_BLUE = '#2563eb';
    const MAX_LEVEL = 6;

    const SHAPE_TYPES = ['circle', 'triangle', 'square', 'diamond', 'hexagon'];
    const DISTRACTOR_COLORS = ['#f97316', '#14b8a6', '#a855f7', '#64748b', '#f59e0b'];

    let samRunning = false;
    let samRafId = 0;
    let samSessionEndAt = 0;
    let samLastFrame = 0;
    let samResizeHandler = null;
    let canvas = null;
    let ctx = null;
    let slider = null;
    let sliderValue = 50;
    let targetValue = 50;
    let spawnElapsedMs = 0;
    let spawnIntervalMs = 1150;
    let fallSpeed = 110;
    let level = 1;
    let lastScaleAt = 0;
    let shapes = [];
    let trackingSamples = [];
    let signalEvents = [];
    let hits = 0;
    let falseAlarms = 0;
    let misses = 0;
    let nextShapeId = 1;

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function hapticPulse(pattern) {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(pattern);
        } catch {
            /* ignore */
        }
    }

    function formatTimeLeft(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${r < 10 ? '0' : ''}${r}`;
    }

    function stopSAM() {
        samRunning = false;
        if (samRafId) {
            cancelAnimationFrame(samRafId);
            samRafId = 0;
        }
        if (samResizeHandler) {
            window.removeEventListener('resize', samResizeHandler);
            samResizeHandler = null;
        }
    }

    function trimWindow(arr, now) {
        const cutoff = now - STABILITY_WINDOW_MS;
        while (arr.length && arr[0].t < cutoff) arr.shift();
    }

    function getAverageTracking() {
        if (!trackingSamples.length) return 0;
        const total = trackingSamples.reduce((sum, item) => sum + item.accuracy, 0);
        return total / trackingSamples.length;
    }

    function getRecentSignalScore() {
        if (!signalEvents.length) {
            return { total: 0, score: 0, falseAlarmCount: 0 };
        }
        const correct = signalEvents.filter((event) => event.correct).length;
        const falseAlarmCount = signalEvents.filter((event) => event.kind === 'false').length;
        return {
            total: signalEvents.length,
            score: correct / signalEvents.length,
            falseAlarmCount
        };
    }

    function updateHud(now) {
        const left = samSessionEndAt - now;
        const avgTracking = Math.round(getAverageTracking() * 100);
        const timerEl = document.getElementById('sam-timer');
        const levelEl = document.getElementById('sam-level');
        const trackEl = document.getElementById('sam-tracking');
        const signalEl = document.getElementById('sam-signal');
        if (timerEl) timerEl.textContent = formatTimeLeft(left);
        if (levelEl) levelEl.textContent = `Load ${level}`;
        if (trackEl) trackEl.textContent = `${avgTracking}% track`;
        if (signalEl) signalEl.textContent = `${hits} hit · ${falseAlarms} false · ${misses} miss`;
        setInst(`SAM · ${formatTimeLeft(left)} · Load ${level} · Tracking ${avgTracking}%`);
    }

    function resizeCanvas() {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function spawnShape() {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const size = 28 + Math.random() * 20;
        const isGo = Math.random() < 0.32;
        shapes.push({
            id: nextShapeId,
            type: pick(SHAPE_TYPES),
            x: size + Math.random() * Math.max(size, rect.width - size * 2),
            y: -size,
            size,
            speed: fallSpeed * (0.85 + Math.random() * 0.35),
            color: isGo ? HEALING_BLUE : pick(DISTRACTOR_COLORS),
            isGo,
            rotation: Math.random() * Math.PI,
            spin: -1.2 + Math.random() * 2.4
        });
        nextShapeId += 1;
    }

    function recordMiss(now, shape) {
        if (shape.isGo) {
            misses += 1;
            signalEvents.push({ t: now, correct: false, kind: 'miss' });
            hapticPulse(10);
        }
    }

    function onCanvasTap(e) {
        if (!samRunning) return;
        e.preventDefault();

        const now = performance.now();
        const goShape = shapes.find((shape) => shape.isGo && shape.y + shape.size > 0);
        if (goShape) {
            hits += 1;
            signalEvents.push({ t: now, correct: true, kind: 'hit' });
            shapes = shapes.filter((shape) => shape.id !== goShape.id);
            hapticPulse(24);
        } else {
            falseAlarms += 1;
            signalEvents.push({ t: now, correct: false, kind: 'false' });
            hapticPulse([10, 35, 10]);
        }
    }

    function drawShape(shape) {
        if (!ctx) return;
        ctx.save();
        ctx.translate(shape.x, shape.y);
        ctx.rotate(shape.rotation);
        ctx.fillStyle = shape.color;
        ctx.strokeStyle = shape.isGo ? '#1d4ed8' : 'rgba(15, 23, 42, 0.32)';
        ctx.lineWidth = shape.isGo ? 4 : 2;
        ctx.shadowColor = shape.isGo ? 'rgba(37, 99, 235, 0.42)' : 'rgba(15, 23, 42, 0.14)';
        ctx.shadowBlur = shape.isGo ? 18 : 8;

        const s = shape.size;
        ctx.beginPath();
        if (shape.type === 'circle') {
            ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
        } else if (shape.type === 'triangle') {
            ctx.moveTo(0, -s * 0.58);
            ctx.lineTo(s * 0.58, s * 0.45);
            ctx.lineTo(-s * 0.58, s * 0.45);
            ctx.closePath();
        } else if (shape.type === 'square') {
            ctx.rect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9);
        } else if (shape.type === 'diamond') {
            ctx.moveTo(0, -s * 0.58);
            ctx.lineTo(s * 0.5, 0);
            ctx.lineTo(0, s * 0.58);
            ctx.lineTo(-s * 0.5, 0);
            ctx.closePath();
        } else {
            for (let i = 0; i < 6; i += 1) {
                const a = (Math.PI / 3) * i - Math.PI / 6;
                const px = Math.cos(a) * s * 0.52;
                const py = Math.sin(a) * s * 0.52;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
        }

        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    function drawBaseline(width, height, now) {
        if (!ctx) return;
        const trackWidth = Math.min(width * 0.78, 520);
        const centerX = width / 2;
        const baselineY = height * 0.72 + Math.sin(now / 720) * 12;
        const left = centerX - trackWidth / 2;
        const targetX = left + (targetValue / 100) * trackWidth;
        const sliderX = left + (sliderValue / 100) * trackWidth;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = 10;
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.9)';
        ctx.beginPath();
        ctx.moveTo(left, baselineY);
        ctx.lineTo(left + trackWidth, baselineY);
        ctx.stroke();

        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(37, 99, 235, 0.35)';
        ctx.beginPath();
        ctx.moveTo(left, baselineY);
        ctx.lineTo(left + trackWidth, baselineY);
        ctx.stroke();

        ctx.fillStyle = 'rgba(37, 99, 235, 0.16)';
        ctx.strokeStyle = HEALING_BLUE;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(targetX, baselineY, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(sliderX, baselineY, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(15, 23, 42, 0.24)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sliderX, baselineY - 24);
        ctx.lineTo(sliderX, baselineY + 24);
        ctx.stroke();
        ctx.restore();
    }

    function drawFrame(now) {
        if (!canvas || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, width, height);

        shapes.forEach(drawShape);
        drawBaseline(width, height, now);
    }

    function updateTracking(now) {
        targetValue = 50 + Math.sin(now / 1050) * 30 + Math.sin(now / 420) * 7;
        targetValue = Math.max(5, Math.min(95, targetValue));
        const error = Math.abs(sliderValue - targetValue);
        const accuracy = Math.max(0, 1 - error / 34);
        trackingSamples.push({ t: now, accuracy });
        trimWindow(trackingSamples, now);
        return accuracy;
    }

    function maybeScaleSpeed(now) {
        if (level >= MAX_LEVEL || now - lastScaleAt < STABILITY_WINDOW_MS) return;
        const tracking = getAverageTracking();
        const signal = getRecentSignalScore();
        if (signal.total < 3) return;

        const stableTracking = tracking >= 0.74;
        const stableClicks = signal.score >= 0.67 && signal.falseAlarmCount <= 1;
        if (!stableTracking || !stableClicks) return;

        level += 1;
        fallSpeed += 32;
        spawnIntervalMs = Math.max(520, Math.round(spawnIntervalMs * 0.84));
        lastScaleAt = now;
        hapticPulse([20, 35, 20]);

        const pulse = document.getElementById('sam-level-pulse');
        if (pulse) {
            pulse.textContent = `Speed increased · Load ${level}`;
            pulse.classList.remove('sam-level-pulse--show');
            void pulse.offsetWidth;
            pulse.classList.add('sam-level-pulse--show');
        }
    }

    function tick(now) {
        if (!samRunning) {
            samRafId = 0;
            return;
        }

        const dt = samLastFrame ? Math.min(0.05, (now - samLastFrame) / 1000) : 0.016;
        samLastFrame = now;
        spawnElapsedMs += dt * 1000;

        while (spawnElapsedMs >= spawnIntervalMs) {
            spawnShape();
            spawnElapsedMs -= spawnIntervalMs;
        }

        const rect = canvas ? canvas.getBoundingClientRect() : { height: 0 };
        shapes = shapes.filter((shape) => {
            shape.y += shape.speed * dt;
            shape.rotation += shape.spin * dt;
            if (shape.y - shape.size > rect.height) {
                recordMiss(now, shape);
                return false;
            }
            return true;
        });

        updateTracking(now);
        trimWindow(signalEvents, now);
        maybeScaleSpeed(now);
        updateHud(Date.now());
        drawFrame(now);

        if (Date.now() >= samSessionEndAt) {
            completeSession();
            return;
        }

        samRafId = requestAnimationFrame(tick);
    }

    function renderPreflight() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        setInst('SAM · READ INSTRUCTIONS');
        stage.innerHTML = `
            <div class="sam-root sam-root--preflight">
                <div class="protocol-preflight-overlay">
                    <section class="protocol-preflight-card" role="dialog" aria-labelledby="sam-preflight-title" aria-describedby="sam-preflight-steps">
                        <h2 class="protocol-preflight-title" id="sam-preflight-title">PRE-FLIGHT</h2>
                        <ol class="protocol-preflight-steps" id="sam-preflight-steps">
                            <li>Use the bottom slider continuously to keep the charcoal marker aligned with the blue target on the floating track.</li>
                            <li>Watch the falling shapes while tracking.</li>
                            <li>Tap the canvas only when a Healing Blue shape appears. Do not tap for any other color.</li>
                            <li>If tracking and tap accuracy stay stable for 10 seconds, the falling shapes speed up automatically.</li>
                        </ol>
                        <button type="button" class="protocol-preflight-start" id="sam-preflight-start">[ START TASK ]</button>
                    </section>
                </div>
            </div>
        `;

        const start = document.getElementById('sam-preflight-start');
        if (start) {
            start.addEventListener('click', () => {
                hapticPulse(20);
                startSession();
            });
        }
    }

    function renderGameShell() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="sam-root sam-root--game">
                <div class="sam-hud" aria-live="polite">
                    <span id="sam-timer">1:00</span>
                    <span id="sam-level">Load 1</span>
                    <span id="sam-tracking">0% track</span>
                    <span id="sam-signal">0 hit · 0 false · 0 miss</span>
                </div>
                <p class="sam-level-pulse" id="sam-level-pulse" role="status"></p>
                <canvas class="sam-canvas" id="sam-canvas" aria-label="SAM falling shape canvas"></canvas>
                <div class="sam-slider-wrap">
                    <label class="sam-slider-label" for="sam-slider">Tracking slider</label>
                    <input class="sam-slider" id="sam-slider" type="range" min="0" max="100" value="50" inputmode="decimal" aria-label="Move left and right to align with the target marker">
                </div>
            </div>
        `;

        canvas = document.getElementById('sam-canvas');
        ctx = canvas ? canvas.getContext('2d') : null;
        slider = document.getElementById('sam-slider');
        if (slider) {
            sliderValue = Number(slider.value) || 50;
            slider.addEventListener('input', () => {
                sliderValue = Number(slider.value) || 0;
            });
        }
        if (canvas) {
            canvas.addEventListener('pointerdown', onCanvasTap, { passive: false });
        }

        samResizeHandler = resizeCanvas;
        window.addEventListener('resize', samResizeHandler);
        resizeCanvas();
    }

    function startSession() {
        stopSAM();
        samRunning = true;
        samSessionEndAt = Date.now() + SESSION_MS;
        samLastFrame = 0;
        spawnElapsedMs = 700;
        spawnIntervalMs = 1150;
        fallSpeed = 110;
        level = 1;
        lastScaleAt = performance.now();
        shapes = [];
        trackingSamples = [];
        signalEvents = [];
        hits = 0;
        falseAlarms = 0;
        misses = 0;
        nextShapeId = 1;
        sliderValue = 50;
        targetValue = 50;

        renderGameShell();
        setInst('SAM · 1:00 · Load 1 · Tracking 0%');
        samRafId = requestAnimationFrame(tick);
    }

    function completeSession() {
        if (!samRunning) return;
        samRunning = false;
        if (samRafId) {
            cancelAnimationFrame(samRafId);
            samRafId = 0;
        }
        if (samResizeHandler) {
            window.removeEventListener('resize', samResizeHandler);
            samResizeHandler = null;
        }

        const tracking = Math.round(getAverageTracking() * 100);
        setInst('SAM · SESSION COMPLETE');
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="sam-root sam-root--complete">
                <p class="sam-complete-kicker">60 second multitasking complete</p>
                <p class="sam-complete-line">Working memory load held across tracking and signal detection.</p>
                <p class="sam-complete-score">${tracking}% tracking · ${hits} blue hit · ${falseAlarms} false · ${misses} miss · Load ${level}</p>
                <button type="button" class="sam-done-btn" id="sam-done">RETURN TO DASHBOARD</button>
            </div>
        `;

        const done = document.getElementById('sam-done');
        if (done) {
            done.addEventListener('click', () => {
                stopSAM();
                exitProtocol();
            });
        }
    }

    function launchSAM() {
        stopSAM();

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        renderPreflight();
    }

    window.launchSAM = launchSAM;
    window.stopSAM = stopSAM;
})();
