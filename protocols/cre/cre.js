/**
 * CRE — Cognitive Re-Coder: intercept falling anxious thoughts, reframe or lose stability.
 */
(function () {
    const SESSION_MS = 60000;
    const STABILITY_DRAIN = 15;
    const SPAWN_MS = 2600;
    const FALL_PX_PER_SEC = 72;

    /** threat + neutral third-person reframe + two catastrophizing traps */
    const SCRIPT_MATRIX = [
        {
            threat: "I can't handle this",
            reframe: "The system has safely processed this specific intensity before.",
            traps: [
                "This will crush me and I won't recover.",
                "I'm completely falling apart right now."
            ]
        },
        {
            threat: "Something terrible is about to happen",
            reframe: "The mind is forecasting threat; no verified event is occurring.",
            traps: [
                "Disaster is imminent and I have no control.",
                "I need to panic until I know I'm safe."
            ]
        },
        {
            threat: "Everyone is judging me",
            reframe: "Observer attention is largely self-focused, not evaluative of me.",
            traps: [
                "They can see how broken I am.",
                "I'll be humiliated if I stay visible."
            ]
        },
        {
            threat: "I always mess everything up",
            reframe: "One episode does not define the full operational record.",
            traps: [
                "I've ruined everything permanently.",
                "I should expect failure from myself."
            ]
        },
        {
            threat: "I can't stop thinking about this",
            reframe: "The loop is a pattern the brain can redirect with a new frame.",
            traps: [
                "If I don't solve this mentally, I'm unsafe.",
                "The thought will never loosen its grip."
            ]
        },
        {
            threat: "What if I lose control",
            reframe: "Arousal is elevated; behavioral control remains online.",
            traps: [
                "I'm seconds away from breaking down.",
                "I might do something I can't take back."
            ]
        },
        {
            threat: "I should have seen this coming",
            reframe: "Hindsight bias is active; prior information was incomplete.",
            traps: [
                "This is entirely my fault for not preventing it.",
                "I'm irresponsible for missing the signs."
            ]
        },
        {
            threat: "Nothing will ever get better",
            reframe: "State-dependent thinking is narrowing the time horizon.",
            traps: [
                "The future is closed and hopeless.",
                "Improvement is impossible for someone like me."
            ]
        },
        {
            threat: "I need certainty right now",
            reframe: "Uncertainty is present; tolerance can be trained in this moment.",
            traps: [
                "Without certainty I cannot function at all.",
                "Ambiguity means danger is guaranteed."
            ]
        },
        {
            threat: "My body feels wrong — something is wrong",
            reframe: "Sensory alarm signals are loud; medical emergency is not established.",
            traps: [
                "This sensation means serious harm is happening.",
                "I must escape or I will be harmed."
            ]
        },
        {
            threat: "I disappointed everyone",
            reframe: "Self-criticism is amplified; external verdicts are not confirmed.",
            traps: [
                "I've failed as a person in their eyes.",
                "Repair is impossible so I should withdraw."
            ]
        },
        {
            threat: "I can't trust my own mind",
            reframe: "Intrusive content is noise, not a command or identity.",
            traps: [
                "My thoughts prove I'm dangerous or broken.",
                "I have to obey every alarming idea."
            ]
        }
    ];

    let creRunning = false;
    let creSpawnId = 0;
    let creTimerId = 0;
    let creRafId = 0;
    let creSessionEndAt = 0;
    let creLastFrame = 0;
    let stability = 100;
    let thoughts = [];
    let nextThoughtId = 1;
    let choiceOpen = false;
    let matrixQueue = [];
    let sessionEnded = false;

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function setStabilityBarViewport(active) {
        const vp = document.getElementById('viewport');
        if (!vp) return;
        vp.classList.toggle('protocol-has-stability-bar', Boolean(active));
    }

    function stopCRE() {
        creRunning = false;
        choiceOpen = false;
        sessionEnded = false;
        thoughts = [];
        setStabilityBarViewport(false);
        if (creSpawnId) {
            clearInterval(creSpawnId);
            creSpawnId = 0;
        }
        if (creTimerId) {
            clearInterval(creTimerId);
            creTimerId = 0;
        }
        if (creRafId) {
            cancelAnimationFrame(creRafId);
            creRafId = 0;
        }
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function successHaptic() {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(30);
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

    function refillMatrixQueue() {
        matrixQueue = shuffle(
            SCRIPT_MATRIX.map((_, i) => i)
        );
    }

    function nextPair() {
        if (matrixQueue.length === 0) refillMatrixQueue();
        const idx = matrixQueue.pop();
        return SCRIPT_MATRIX[idx];
    }

    function updateStabilityUI() {
        const fill = document.getElementById('cre-stability-fill');
        const pct = document.getElementById('cre-stability-pct');
        const clamped = Math.max(0, Math.min(100, stability));
        if (fill) {
            fill.style.width = `${clamped}%`;
            fill.classList.toggle('cre-stability-fill--low', clamped <= 35);
        }
        if (pct) pct.textContent = `${clamped}%`;
    }

    function drainStability() {
        stability = Math.max(0, stability - STABILITY_DRAIN);
        updateStabilityUI();
        const wrap = document.querySelector('.cre-stability-wrap');
        if (wrap) {
            wrap.classList.remove('cre-stability-wrap--shake');
            void wrap.offsetWidth;
            wrap.classList.add('cre-stability-wrap--shake');
        }
        if (stability <= 0) {
            endSession(false);
        }
    }

    function updateInstTimer() {
        const left = creSessionEndAt - Date.now();
        setInst(`k̓ʷəč · ${formatTimeLeft(left)} · Stability ${Math.max(0, stability)}%`);
        if (left <= 0 && creRunning) {
            endSession(stability > 0);
        }
    }

    function getFieldEl() {
        return document.getElementById('cre-field');
    }

    function getFloorY(field) {
        return field ? field.clientHeight - 8 : 400;
    }

    function renderShell() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="cre-root" id="cre-root">
                <div class="cre-stability-wrap stability-bar-container">
                    <span class="cre-stability-label">Stability</span>
                    <div class="cre-stability-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
                        <div class="cre-stability-fill" id="cre-stability-fill"></div>
                    </div>
                    <span class="cre-stability-pct" id="cre-stability-pct">100%</span>
                </div>
                <div class="cre-field" id="cre-field">
                    <div class="cre-floor" aria-hidden="true"></div>
                </div>
                <div class="cre-choice-backdrop hidden" id="cre-choice-backdrop" aria-hidden="true">
                    <div class="cre-choice-panel" role="dialog" aria-labelledby="cre-choice-prompt">
                        <p class="cre-choice-prompt" id="cre-choice-prompt">Select re-code</p>
                        <p class="cre-choice-threat" id="cre-choice-threat"></p>
                        <ul class="cre-choice-list" id="cre-choice-list"></ul>
                    </div>
                </div>
            </div>
        `;
        setStabilityBarViewport(true);
        updateStabilityUI();
    }

    function renderPreflight() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        setInst('k̓ʷəč · READ INSTRUCTIONS');
        stage.innerHTML = `
            <div class="cre-root cre-root--preflight">
                <div class="protocol-preflight-overlay">
                    <section class="protocol-preflight-card" role="dialog" aria-labelledby="cre-preflight-title" aria-describedby="cre-preflight-steps">
                        <h2 class="protocol-preflight-title" id="cre-preflight-title">HOW TO RE-CODE</h2>
                        <ol class="protocol-preflight-steps" id="cre-preflight-steps">
                            <li>Anxious thought loops will drift down the screen.</li>
                            <li>Tap a moving block to freeze it and open the filter.</li>
                            <li>Select the most neutral, objective, and realistic re-code option at the bottom to neutralize the threat.</li>
                            <li>Avoid choosing catastrophizing options to keep your stability at 100%.</li>
                        </ol>
                        <button type="button" class="protocol-preflight-start" id="cre-preflight-start">[ START TASK ]</button>
                    </section>
                </div>
            </div>
        `;
        const start = document.getElementById('cre-preflight-start');
        if (start) start.addEventListener('click', () => {
            successHaptic();
            creRunning = true;
            startSession();
        });
    }

    function spawnThought() {
        if (!creRunning || choiceOpen) return;
        const field = getFieldEl();
        if (!field) return;

        const pair = nextPair();
        const id = nextThoughtId;
        nextThoughtId += 1;

        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'cre-thought';
        el.dataset.creId = String(id);
        el.style.top = '-4px';
        el.innerHTML = `<p class="cre-thought-text">${escapeHtml(pair.threat)}</p>`;
        el.addEventListener('click', (e) => {
            e.preventDefault();
            onThoughtTap(id);
        });

        field.appendChild(el);

        const thought = {
            id,
            threat: pair.threat,
            reframe: pair.reframe,
            traps: pair.traps.slice(),
            y: -el.offsetHeight || -48,
            frozen: false,
            el,
            removing: false
        };
        thoughts.push(thought);
        positionThought(thought);
    }

    function positionThought(thought) {
        if (!thought.el) return;
        thought.el.style.top = `${thought.y}px`;
    }

    function closeChoiceMenu() {
        choiceOpen = false;
        const backdrop = document.getElementById('cre-choice-backdrop');
        if (backdrop) {
            backdrop.classList.add('hidden');
            backdrop.setAttribute('aria-hidden', 'true');
        }
        thoughts.forEach((t) => {
            if (t.frozen && t.el) {
                t.frozen = false;
                t.el.classList.remove('cre-thought--frozen');
            }
        });
    }

    function onThoughtTap(id) {
        if (!creRunning || choiceOpen) return;
        const thought = thoughts.find((t) => t.id === id);
        if (!thought || thought.removing || thought.frozen) return;

        choiceOpen = true;
        thought.frozen = true;
        if (thought.el) thought.el.classList.add('cre-thought--frozen');

        const options = shuffle([
            { kind: 'reframe', text: thought.reframe },
            { kind: 'trap', text: thought.traps[0] },
            { kind: 'trap', text: thought.traps[1] }
        ]);

        const backdrop = document.getElementById('cre-choice-backdrop');
        const threatEl = document.getElementById('cre-choice-threat');
        const list = document.getElementById('cre-choice-list');
        if (!backdrop || !threatEl || !list) return;

        threatEl.textContent = thought.threat;
        list.innerHTML = options
            .map(
                (opt, i) => `
            <li>
                <button type="button" class="cre-choice-btn" data-cre-choice="${opt.kind}" data-cre-thought="${id}" data-cre-opt="${i}">
                    ${escapeHtml(opt.text)}
                </button>
            </li>
        `
            )
            .join('');

        backdrop.classList.remove('hidden');
        backdrop.setAttribute('aria-hidden', 'false');

        list.querySelectorAll('.cre-choice-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const kind = btn.getAttribute('data-cre-choice');
                const tid = Number(btn.getAttribute('data-cre-thought'));
                onChoicePick(tid, kind, btn);
            });
        });
    }

    function removeThought(thought, className) {
        if (thought.removing) return;
        thought.removing = true;
        if (thought.el) {
            if (className) thought.el.classList.add(className);
            const el = thought.el;
            window.setTimeout(() => {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, className === 'cre-thought--vaporize' ? 450 : 350);
        }
        thoughts = thoughts.filter((t) => t.id !== thought.id);
    }

    function onChoicePick(thoughtId, kind, btnEl) {
        if (!creRunning) return;
        const thought = thoughts.find((t) => t.id === thoughtId);
        if (!thought) {
            closeChoiceMenu();
            return;
        }

        closeChoiceMenu();

        if (kind === 'reframe') {
            successHaptic();
            removeThought(thought, 'cre-thought--vaporize');
            return;
        }

        if (btnEl) {
            btnEl.classList.add('cre-choice-btn--wrong');
        }
        drainStability();
        removeThought(thought, 'cre-thought--miss');
    }

    function onThoughtMiss(thought) {
        if (thought.removing || thought.frozen) return;
        thought.removing = true;
        drainStability();
        removeThought(thought, 'cre-thought--miss');
    }

    function tick(now) {
        if (!creRunning) {
            creRafId = 0;
            return;
        }

        const dt = creLastFrame ? Math.min(0.05, (now - creLastFrame) / 1000) : 0.016;
        creLastFrame = now;

        const field = getFieldEl();
        const floorY = getFloorY(field);

        thoughts.forEach((thought) => {
            if (thought.removing || thought.frozen || choiceOpen) return;
            const h = thought.el ? thought.el.offsetHeight : 48;
            thought.y += FALL_PX_PER_SEC * dt;
            positionThought(thought);
            if (thought.y + h >= floorY) {
                onThoughtMiss(thought);
            }
        });

        creRafId = requestAnimationFrame(tick);
    }

    function renderComplete(won) {
        stopCRE();
        setInst(won ? 'k̓ʷəč · LOOPS BROKEN' : 'k̓ʷəč · STABILITY LOST');

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        if (won) {
            stage.innerHTML = `
                <div class="cre-root cre-root--complete">
                    <p class="cre-complete-line">Cognitive loops successfully broken. Thought patterns normalized.</p>
                    <p class="cre-complete-meta">Stability ${stability}% · 60 second intercept complete</p>
                    <button type="button" class="cre-done-btn" id="cre-done">RETURN TO MAIN SCREEN</button>
                </div>
            `;
        } else {
            stage.innerHTML = `
                <div class="cre-root cre-root--complete">
                    <p class="cre-complete-line cre-complete-line--lose">Stability depleted. Loop exposure exceeded safe threshold.</p>
                    <p class="cre-complete-meta">Re-engage when ready to intercept again</p>
                    <button type="button" class="cre-done-btn" id="cre-done">RETURN TO MAIN SCREEN</button>
                </div>
            `;
        }

        const done = document.getElementById('cre-done');
        if (done) {
            done.addEventListener('click', () => {
                exitProtocol();
            });
        }
    }

    function endSession(won) {
        if (sessionEnded) return;
        sessionEnded = true;
        creRunning = false;
        if (creSpawnId) {
            clearInterval(creSpawnId);
            creSpawnId = 0;
        }
        if (creTimerId) {
            clearInterval(creTimerId);
            creTimerId = 0;
        }
        if (creRafId) {
            cancelAnimationFrame(creRafId);
            creRafId = 0;
        }
        closeChoiceMenu();
        renderComplete(won);
    }

    function startSession() {
        if (!creRunning) return;
        stability = 100;
        thoughts = [];
        nextThoughtId = 1;
        choiceOpen = false;
        refillMatrixQueue();
        creSessionEndAt = Date.now() + SESSION_MS;
        creLastFrame = 0;

        renderShell();
        updateInstTimer();

        spawnThought();
        creSpawnId = window.setInterval(() => {
            if (creRunning && !choiceOpen) spawnThought();
        }, SPAWN_MS);

        creTimerId = window.setInterval(updateInstTimer, 250);
        creRafId = requestAnimationFrame(tick);
    }

    function launchCRE() {
        stopCRE();

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        renderPreflight();
    }

    window.launchCRE = launchCRE;
    window.stopCRE = stopCRE;
})();
