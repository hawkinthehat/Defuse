/**
 * VSD — Visuospatial pattern memory: 3×3 grid, 3-cell flash, shuffled recall, 45s saturation.
 */
(function () {
    const GRID = 3;
    const CELL_COUNT = 9;
    const PATTERN_SIZE = 3;
    const FLASH_MS = 1500;
    const SESSION_MS = 45000;
    const SHUFFLE_MS = 280;
    const MAX_DPR = 2;

    /** CAS healing blues */
    const HEAL = {
        fill: 'rgba(0, 210, 211, 0.52)',
        stroke: '#00d2d3',
        glow: 'rgba(116, 185, 255, 0.45)',
        selected: 'rgba(116, 185, 255, 0.38)',
        selectedStroke: '#74b9ff'
    };

    const IDLE = {
        fill: 'rgba(12, 18, 28, 0.95)',
        stroke: 'rgba(112, 161, 255, 0.18)'
    };

    let vsdRunning = false;
    let vsdTimerId = 0;
    let vsdFlashTimeoutId = 0;
    let vsdShuffleTimeoutId = 0;
    let vsdSessionEndAt = 0;
    let vsdCanvas = null;
    let vsdCtx = null;
    let vsdCssSize = 0;
    let sessionEnded = false;

    let phase = 'flash';
    let pattern = [];
    let screenMap = [];
    let selected = new Set();
    let wrongFlashSlot = -1;
    let wrongFlashUntil = 0;
    let score = 0;
    let roundLocked = false;

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function stopVSD() {
        vsdRunning = false;
        roundLocked = false;
        sessionEnded = false;
        if (vsdCanvas && vsdCanvas._vsdResize) {
            window.removeEventListener('resize', vsdCanvas._vsdResize);
            vsdCanvas._vsdResize = null;
        }
        if (vsdTimerId) {
            clearInterval(vsdTimerId);
            vsdTimerId = 0;
        }
        if (vsdFlashTimeoutId) {
            clearTimeout(vsdFlashTimeoutId);
            vsdFlashTimeoutId = 0;
        }
        if (vsdShuffleTimeoutId) {
            clearTimeout(vsdShuffleTimeoutId);
            vsdShuffleTimeoutId = 0;
        }
        vsdCanvas = null;
        vsdCtx = null;
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function successHaptic() {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(18);
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

    function randomPattern() {
        const pool = [];
        for (let i = 0; i < CELL_COUNT; i += 1) pool.push(i);
        return shuffle(pool).slice(0, PATTERN_SIZE);
    }

    function newScreenMap() {
        return shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    }

    function logicalAtScreenSlot(slot) {
        return screenMap[slot];
    }

    function screenSlotForLogical(logical) {
        return screenMap.indexOf(logical);
    }

    function fitCanvas(canvas) {
        const wrap = canvas.parentElement;
        const rect = (wrap || canvas).getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        vsdCssSize = Math.max(200, Math.floor(Math.min(rect.width, rect.height || rect.width)));
        canvas.width = Math.floor(vsdCssSize * dpr);
        canvas.height = Math.floor(vsdCssSize * dpr);
        canvas.style.width = `${vsdCssSize}px`;
        canvas.style.height = `${vsdCssSize}px`;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    function roundRectPath(ctx, x, y, w, h, r) {
        const rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + w - rad, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
        ctx.lineTo(x + w, y + h - rad);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
        ctx.lineTo(x + rad, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
        ctx.lineTo(x, y + rad);
        ctx.quadraticCurveTo(x, y, x + rad, y);
        ctx.closePath();
    }

    function cellRects() {
        const pad = 14;
        const gap = 8;
        const inner = vsdCssSize - pad * 2;
        const cell = (inner - gap * (GRID - 1)) / GRID;
        const rects = [];
        for (let slot = 0; slot < CELL_COUNT; slot += 1) {
            const row = Math.floor(slot / GRID);
            const col = slot % GRID;
            rects.push({
                slot,
                x: pad + col * (cell + gap),
                y: pad + row * (cell + gap),
                w: cell,
                h: cell
            });
        }
        return rects;
    }

    function drawGrid() {
        if (!vsdCtx || !vsdCanvas) return;
        const ctx = vsdCtx;
        const rects = cellRects();
        const now = performance.now();

        ctx.fillStyle = '#030508';
        ctx.fillRect(0, 0, vsdCssSize, vsdCssSize);

        rects.forEach((r) => {
            const logical = logicalAtScreenSlot(r.slot);
            const inPattern = pattern.includes(logical);
            const isSelected = selected.has(logical);
            const wrongFlash = wrongFlashSlot === r.slot && now < wrongFlashUntil;

            let fill = IDLE.fill;
            let stroke = IDLE.stroke;
            let lineW = 1.5;

            if (phase === 'flash' && inPattern) {
                fill = HEAL.fill;
                stroke = HEAL.stroke;
                lineW = 2.5;
                ctx.shadowColor = HEAL.glow;
                ctx.shadowBlur = 16;
            } else if (phase === 'recall' && isSelected) {
                fill = HEAL.selected;
                stroke = HEAL.selectedStroke;
                lineW = 2;
                ctx.shadowBlur = 10;
                ctx.shadowColor = HEAL.glow;
            } else if (wrongFlash) {
                fill = 'rgba(255, 71, 87, 0.35)';
                stroke = '#ff4757';
                lineW = 2;
                ctx.shadowBlur = 0;
            } else {
                ctx.shadowBlur = 0;
            }

            const radius = 6;
            roundRectPath(ctx, r.x, r.y, r.w, r.h, radius);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = stroke;
            ctx.lineWidth = lineW;
            ctx.stroke();
            ctx.shadowBlur = 0;
        });
    }

    function updateHud() {
        const phaseEl = document.getElementById('vsd-phase');
        const scoreEl = document.getElementById('vsd-score');
        const hint = document.getElementById('vsd-hint');
        const fill = document.getElementById('vsd-timer-fill');

        if (phaseEl) {
            phaseEl.textContent =
                phase === 'flash' ? 'Encode pattern' : phase === 'shuffle' ? 'Shuffling…' : 'Tap coordinates';
        }
        if (scoreEl) scoreEl.textContent = `${score} locked`;
        if (hint) {
            hint.textContent =
                phase === 'flash'
                    ? 'Memorize the three healing-blue cells.'
                    : 'Recall all three coordinates on the shuffled grid.';
        }
        if (fill && vsdSessionEndAt) {
            const left = Math.max(0, vsdSessionEndAt - Date.now());
            fill.style.width = `${(left / SESSION_MS) * 100}%`;
        }
    }

    function updateInstTimer() {
        const left = vsdSessionEndAt - Date.now();
        setInst(`VSD · ${formatTimeLeft(left)} · ${score} patterns`);
        updateHud();
        if (left <= 0 && vsdRunning && !sessionEnded) {
            endSession();
        }
    }

    function setsEqual(a, b) {
        if (a.size !== b.size) return false;
        for (const v of a) {
            if (!b.has(v)) return false;
        }
        return true;
    }

    function onRoundSuccess() {
        score += 1;
        successHaptic();
        selected = new Set();
        if (!vsdRunning || sessionEnded) return;
        if (Date.now() >= vsdSessionEndAt) {
            endSession();
            return;
        }
        startRound();
    }

    function startRecallPhase() {
        phase = 'recall';
        roundLocked = false;
        selected = new Set();
        updateHud();
        drawGrid();
    }

    function beginShuffleThenRecall() {
        phase = 'shuffle';
        screenMap = newScreenMap();
        roundLocked = true;
        updateHud();
        drawGrid();

        if (vsdShuffleTimeoutId) clearTimeout(vsdShuffleTimeoutId);
        vsdShuffleTimeoutId = window.setTimeout(() => {
            vsdShuffleTimeoutId = 0;
            if (!vsdRunning || sessionEnded) return;
            startRecallPhase();
        }, SHUFFLE_MS);
    }

    function startRound() {
        if (!vsdRunning || sessionEnded) return;
        pattern = randomPattern();
        screenMap = [0, 1, 2, 3, 4, 5, 6, 7, 8];
        selected = new Set();
        wrongFlashSlot = -1;
        phase = 'flash';
        roundLocked = true;
        updateHud();
        drawGrid();

        if (vsdFlashTimeoutId) clearTimeout(vsdFlashTimeoutId);
        vsdFlashTimeoutId = window.setTimeout(() => {
            vsdFlashTimeoutId = 0;
            if (!vsdRunning || sessionEnded) return;
            beginShuffleThenRecall();
        }, FLASH_MS);
    }

    function hitTestSlot(clientX, clientY) {
        if (!vsdCanvas) return -1;
        const rect = vsdCanvas.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width) * vsdCssSize;
        const y = ((clientY - rect.top) / rect.height) * vsdCssSize;
        const rects = cellRects();
        for (let i = 0; i < rects.length; i += 1) {
            const r = rects[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.slot;
        }
        return -1;
    }

    function onPointer(e) {
        if (!vsdRunning || sessionEnded || phase !== 'recall' || roundLocked) return;
        e.preventDefault();

        const slot = hitTestSlot(e.clientX, e.clientY);
        if (slot < 0) return;

        const logical = logicalAtScreenSlot(slot);
        const patternSet = new Set(pattern);

        if (patternSet.has(logical)) {
            if (selected.has(logical)) {
                selected.delete(logical);
            } else {
                selected.add(logical);
            }
            drawGrid();

            if (selected.size === PATTERN_SIZE && setsEqual(selected, patternSet)) {
                roundLocked = true;
                onRoundSuccess();
            }
            return;
        }

        wrongFlashSlot = slot;
        wrongFlashUntil = performance.now() + 220;
        drawGrid();
        window.setTimeout(() => {
            if (vsdRunning) drawGrid();
        }, 230);
    }

    function bindCanvas(canvas) {
        canvas.addEventListener('pointerdown', onPointer, { passive: false });
    }

    function renderComplete() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        setInst('VSD · SESSION COMPLETE');
        stage.innerHTML = `
            <div class="vsd-root vsd-root--complete">
                <p class="vsd-complete-line">Visuospatial memory saturated. Intrusive trace displaced from working buffer.</p>
                <p class="vsd-complete-meta">${score} pattern${score === 1 ? '' : 's'} locked in 45 seconds</p>
                <button type="button" class="vsd-done-btn" id="vsd-done">RETURN TO MAIN SCREEN</button>
            </div>
        `;
        document.getElementById('vsd-done')?.addEventListener('click', () => exitProtocol());
    }

    function endSession() {
        if (sessionEnded) return;
        sessionEnded = true;
        vsdRunning = false;
        if (vsdTimerId) {
            clearInterval(vsdTimerId);
            vsdTimerId = 0;
        }
        if (vsdFlashTimeoutId) {
            clearTimeout(vsdFlashTimeoutId);
            vsdFlashTimeoutId = 0;
        }
        if (vsdShuffleTimeoutId) {
            clearTimeout(vsdShuffleTimeoutId);
            vsdShuffleTimeoutId = 0;
        }
        renderComplete();
    }

    function renderSession() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.innerHTML = `
            <div class="vsd-root">
                <div class="vsd-hud">
                    <p class="vsd-phase" id="vsd-phase">Encode pattern</p>
                    <p class="vsd-score" id="vsd-score">0 locked</p>
                </div>
                <div class="vsd-timer-bar" aria-hidden="true"><div class="vsd-timer-fill" id="vsd-timer-fill"></div></div>
                <div class="vsd-canvas-wrap">
                    <canvas class="vsd-canvas" id="vsd-canvas" width="300" height="300" aria-label="3 by 3 visuospatial grid"></canvas>
                </div>
                <p class="vsd-hint" id="vsd-hint">Memorize the three healing-blue cells.</p>
            </div>
        `;

        vsdCanvas = document.getElementById('vsd-canvas');
        if (!vsdCanvas) return;
        vsdCtx = fitCanvas(vsdCanvas);
        bindCanvas(vsdCanvas);

        const onResize = () => {
            if (!vsdRunning || !vsdCanvas) return;
            vsdCtx = fitCanvas(vsdCanvas);
            drawGrid();
        };
        window.addEventListener('resize', onResize);
        vsdCanvas._vsdResize = onResize;
    }

    function launchVSD() {
        stopVSD();
        const prev = document.getElementById('vsd-canvas');
        if (prev && prev._vsdResize) {
            window.removeEventListener('resize', prev._vsdResize);
        }

        vsdRunning = true;
        sessionEnded = false;
        score = 0;
        vsdSessionEndAt = Date.now() + SESSION_MS;

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        renderSession();
        updateInstTimer();
        vsdTimerId = window.setInterval(updateInstTimer, 200);
        startRound();
    }

    window.launchVSD = launchVSD;
    window.stopVSD = stopVSD;
})();
