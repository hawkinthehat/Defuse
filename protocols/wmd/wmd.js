/**
 * WMD — Working Memory Deflector: visuospatial rotation match, 45s timed session.
 */
(function () {
    const SESSION_MS = 45000;
    const ANGLE_STEP = 30;
    const ANGLE_COUNT = 12;

    const SHAPES = ['triangle', 'square', 'pentagon', 'hexagon', 'chevron'];

    /** Blues aligned with CAS healing palette */
    const SHAPE_STYLE = {
        triangle: { stroke: '#2563eb', fill: 'rgba(37, 99, 235, 0.22)' },
        square: { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.22)' },
        pentagon: { stroke: '#1d4ed8', fill: 'rgba(29, 78, 216, 0.2)' },
        hexagon: { stroke: '#2563eb', fill: 'rgba(37, 99, 235, 0.18)' },
        chevron: { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.2)' }
    };

    const SHAPE_PATHS = {
        triangle: 'M50 14 L86 82 L14 82 Z',
        square: 'M24 24 L76 24 L76 76 L24 76 Z',
        pentagon: 'M50 10 L90 38 L74 88 L26 88 L10 38 Z',
        hexagon: 'M50 8 L86 28 L86 72 L50 92 L14 72 L14 28 Z',
        chevron: 'M18 50 L42 22 L68 50 L42 78 Z'
    };

    let wmdRunning = false;
    let wmdIntroTimeoutId = 0;
    let wmdTimerIntervalId = 0;
    let wmdSessionEndAt = 0;
    let score = 0;
    let currentShape = '';
    let currentAngle = 0;
    let roundLocked = false;

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function stopWMD() {
        wmdRunning = false;
        roundLocked = false;
        if (wmdIntroTimeoutId) {
            clearTimeout(wmdIntroTimeoutId);
            wmdIntroTimeoutId = 0;
        }
        if (wmdTimerIntervalId) {
            clearInterval(wmdTimerIntervalId);
            wmdTimerIntervalId = 0;
        }
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function successHaptic() {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(20);
        } catch {
            /* ignore */
        }
    }

    function shapeSvg(shape, angleDeg) {
        const st = SHAPE_STYLE[shape] || SHAPE_STYLE.square;
        const d = SHAPE_PATHS[shape] || SHAPE_PATHS.square;
        const rot = typeof angleDeg === 'number' ? angleDeg : 0;
        return `
            <svg class="wmd-shape" viewBox="0 0 100 100" aria-hidden="true">
                <g transform="rotate(${rot} 50 50)">
                    <path d="${d}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
                </g>
            </svg>
        `;
    }

    function pickAngle() {
        return Math.floor(Math.random() * ANGLE_COUNT) * ANGLE_STEP;
    }

    function pickWrongAngles(correct) {
        const pool = [];
        for (let i = 0; i < ANGLE_COUNT; i += 1) {
            const a = i * ANGLE_STEP;
            if (a !== correct) pool.push(a);
        }
        return shuffle(pool).slice(0, 2);
    }

    function formatTimeLeft(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${r < 10 ? '0' : ''}${r}`;
    }

    function updateInstTimer() {
        const left = wmdSessionEndAt - Date.now();
        setInst(`WMD · ${formatTimeLeft(left)} · ${score} match${score === 1 ? '' : 'es'}`);
        const fill = document.getElementById('wmd-timer-fill');
        if (fill) {
            const pct = Math.max(0, Math.min(100, (left / SESSION_MS) * 100));
            fill.style.width = `${pct}%`;
        }
        if (left <= 0 && wmdRunning) {
            endSession();
        }
    }

    function renderPreflight() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        setInst('WMD · READY');
        stage.innerHTML = `
            <div class="wmd-root wmd-root--preflight">
                <section class="wmd-preflight-card" role="dialog" aria-labelledby="wmd-preflight-title" aria-describedby="wmd-preflight-steps">
                    <p class="wmd-preflight-kicker">Visuospatial Deflector</p>
                    <h2 class="wmd-preflight-title" id="wmd-preflight-title">HOW TO STABILIZE</h2>
                    <ol class="wmd-preflight-steps" id="wmd-preflight-steps">
                        <li>Watch the grid. Three blocks will flash Blue.</li>
                        <li>The grid will shuffle.</li>
                        <li>Tap the exact blocks where the Blue patterns originally appeared.</li>
                        <li>Focus entirely on the shapes to occupy your working memory.</li>
                    </ol>
                    <button type="button" class="wmd-start-btn" id="wmd-start">[ START TASK ]</button>
                </section>
            </div>
        `;
        const start = document.getElementById('wmd-start');
        if (start) {
            start.addEventListener('click', () => {
                successHaptic();
                wmdRunning = true;
                startSession();
            });
        }
    }

    function renderComplete() {
        setInst('WMD · SESSION COMPLETE');
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="wmd-root wmd-root--complete">
                <p class="wmd-complete-line">Cognitive workspace successfully occupied. System cleared.</p>
                <p class="wmd-complete-score">${score} correct match${score === 1 ? '' : 'es'} in 45 seconds</p>
                <button type="button" class="wmd-done-btn" id="wmd-done">RETURN TO MAIN SCREEN</button>
            </div>
        `;
        const done = document.getElementById('wmd-done');
        if (done) {
            done.addEventListener('click', () => {
                stopWMD();
                exitProtocol();
            });
        }
    }

    function endSession() {
        if (!wmdRunning) return;
        wmdRunning = false;
        roundLocked = true;
        if (wmdTimerIntervalId) {
            clearInterval(wmdTimerIntervalId);
            wmdTimerIntervalId = 0;
        }
        renderComplete();
    }

    function onOptionPick(angle) {
        if (!wmdRunning || roundLocked) return;
        if (Date.now() >= wmdSessionEndAt) {
            endSession();
            return;
        }
        if (angle !== currentAngle) return;

        roundLocked = true;
        successHaptic();
        score += 1;
        updateInstTimer();

        const target = document.getElementById('wmd-target-wrap');
        if (target) {
            target.classList.remove('wmd-flash');
            void target.offsetWidth;
            target.classList.add('wmd-flash');
        }

        window.setTimeout(() => {
            if (!wmdRunning) return;
            if (Date.now() >= wmdSessionEndAt) {
                endSession();
                return;
            }
            roundLocked = false;
            renderRound();
        }, 120);
    }

    function renderRound() {
        const stage = document.getElementById('protocol-stage');
        if (!stage || !wmdRunning) return;

        currentShape = pick(SHAPES);
        currentAngle = pickAngle();
        const wrong = pickWrongAngles(currentAngle);
        const options = shuffle([currentAngle, wrong[0], wrong[1]]);

        stage.innerHTML = `
            <div class="wmd-root">
                <div class="wmd-game">
                    <div class="wmd-timer-bar" aria-hidden="true"><div class="wmd-timer-fill" id="wmd-timer-fill"></div></div>
                    <p class="wmd-score">Match the rotation</p>
                    <div class="wmd-target-wrap" id="wmd-target-wrap">
                        ${shapeSvg(currentShape, currentAngle)}
                    </div>
                    <div class="wmd-options" role="group" aria-label="Rotation choices">
                        ${options
                            .map(
                                (ang, i) => `
                            <button type="button" class="wmd-option" data-wmd-angle="${ang}" data-wmd-idx="${i}">
                                ${shapeSvg(currentShape, ang)}
                            </button>
                        `
                            )
                            .join('')}
                    </div>
                </div>
            </div>
        `;

        updateInstTimer();

        stage.querySelectorAll('.wmd-option').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const raw = btn.getAttribute('data-wmd-angle');
                const ang = raw !== null ? Number(raw) : NaN;
                if (!Number.isNaN(ang)) onOptionPick(ang);
            });
        });
    }

    function startSession() {
        if (!wmdRunning) return;
        wmdSessionEndAt = Date.now() + SESSION_MS;
        score = 0;
        roundLocked = false;
        renderRound();
        updateInstTimer();
        wmdTimerIntervalId = window.setInterval(updateInstTimer, 200);
    }

    function launchWMD() {
        stopWMD();
        score = 0;

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        } else if (typeof openSession === 'function') {
            openSession('WMD · ENGAGING');
        }

        renderPreflight();
    }

    window.launchWMD = launchWMD;
    window.stopWMD = stopWMD;
})();
