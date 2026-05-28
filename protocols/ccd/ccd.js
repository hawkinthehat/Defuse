(function () {
    let ccdRafId = 0;
    let ccdParticles = [];
    let ccdPhaseTime = 0;
    let ccdExplodeEnd = 0.45;
    let ccdTotalDur = 3.45;
    let ccdElapsed = 0;
    let ccdCanvas = null;
    let ccdCtx = null;
    let ccdW = 0;
    let ccdH = 0;
    let ccdRunning = false;
    /** Per-column sand height (from bottom) for natural stacking */
    let ccdSandFloor = null;

    const ORANGE = [255, 140, 55];
    const RED = [255, 75, 65];
    const BLUE = [70, 145, 255];
    const GREEN = [55, 195, 130];

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function lerpColor(c1, c2, t) {
        return [
            Math.round(lerp(c1[0], c2[0], t)),
            Math.round(lerp(c1[1], c2[1], t)),
            Math.round(lerp(c1[2], c2[2], t))
        ];
    }

    /** t in [0,1] over full discharge: orange/red → blue → green */
    function colorForProgress(t) {
        if (t <= 0.38) return lerpColor(ORANGE, RED, t / 0.38);
        if (t <= 0.62) return lerpColor(RED, BLUE, (t - 0.38) / 0.24);
        return lerpColor(BLUE, GREEN, Math.min(1, (t - 0.62) / 0.38));
    }

    function cancelCCDLoop() {
        if (ccdRafId) {
            cancelAnimationFrame(ccdRafId);
            ccdRafId = 0;
        }
        ccdRunning = false;
        ccdParticles = [];
        ccdSandFloor = null;
        ccdCanvas = null;
        ccdCtx = null;
    }

    function fitCanvas(canvas, root) {
        const r = root.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ccdW = Math.max(1, Math.floor(r.width));
        ccdH = Math.max(1, Math.floor(r.height));
        canvas.width = Math.floor(ccdW * dpr);
        canvas.height = Math.floor(ccdH * dpr);
        canvas.style.width = `${ccdW}px`;
        canvas.style.height = `${ccdH}px`;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    function spawnParticles(word, cx, cy) {
        const n = Math.min(180, 72 + word.length * 8);
        const out = [];
        for (let i = 0; i < n; i++) {
            const ang = Math.random() * Math.PI * 2;
            // Strong radial burst; a fraction get an extra kick for a sharper explosion
            let sp = 720 + Math.random() * 1180;
            if (Math.random() < 0.22) sp *= 1.45;
            out.push({
                x: cx,
                y: cy,
                vx: Math.cos(ang) * sp,
                vy: Math.sin(ang) * sp,
                r: 1.2 + Math.random() * 2.2,
                settled: false,
                deposited: false
            });
        }
        return out;
    }

    function sandBucketIndex(x) {
        if (!ccdSandFloor || ccdW <= 0) return 0;
        const b = Math.floor((x / ccdW) * ccdSandFloor.length);
        return Math.max(0, Math.min(ccdSandFloor.length - 1, b));
    }

    function particleLoop(t0) {
        if (!ccdRunning || !ccdCtx || !ccdCanvas?.isConnected) return;

        function frame(now) {
            if (!ccdRunning || !ccdCanvas?.isConnected) {
                ccdRafId = 0;
                return;
            }

            const dt = Math.min(0.045, Math.max(0, (now - t0) / 1000));
            t0 = now;
            ccdElapsed += dt;

            const ctx = ccdCtx;
            const ground = ccdH - 12;
            const explodePhase = ccdElapsed < ccdExplodeEnd;
            /** Subtle gravity while settling so sand falls gently and stacks */
            const gSettle = 395;

            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, ccdW, ccdH);

            const colorT = Math.min(1, ccdElapsed / ccdTotalDur);
            const [cr, cg, cb] = colorForProgress(colorT);

            for (let i = 0; i < ccdParticles.length; i++) {
                const p = ccdParticles[i];
                if (p.settled) {
                    ctx.fillStyle = `rgb(${Math.round(lerp(cr, GREEN[0], 0.25))},${Math.round(lerp(cg, GREEN[1], 0.25))},${Math.round(lerp(cb, GREEN[2], 0.25))})`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    ctx.fill();
                    continue;
                }

                if (explodePhase) {
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    // Light drag so the burst carries across the viewport before settling
                    p.vx *= 0.993;
                    p.vy *= 0.993;
                } else {
                    p.vy += gSettle * dt;
                    p.vx *= 0.993;
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;

                    let bi = sandBucketIndex(p.x);
                    let surface = ground - ccdSandFloor[bi];

                    if (p.y + p.r >= surface) {
                        p.vy = 0;
                        if (!p.deposited) {
                            ccdSandFloor[bi] += p.r * 1.62;
                            p.deposited = true;
                        }
                        bi = sandBucketIndex(p.x);
                        surface = ground - ccdSandFloor[bi];
                        p.y = surface - p.r;
                        p.vx *= 0.42;
                        if (Math.abs(p.vx) < 10) {
                            p.settled = true;
                            p.vx = 0;
                        }
                    }
                    if (p.x < p.r) {
                        p.x = p.r;
                        p.vx *= -0.42;
                    }
                    if (p.x > ccdW - p.r) {
                        p.x = ccdW - p.r;
                        p.vx *= -0.42;
                    }
                }

                const pt = Math.min(1, ccdElapsed / ccdTotalDur);
                const [pr, pg, pb] = colorForProgress(pt);
                ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }

            if (ccdElapsed < ccdTotalDur) {
                ccdRafId = requestAnimationFrame(frame);
            } else {
                ccdRafId = 0;
                ccdRunning = false;
                showResolution();
            }
        }

        ccdRafId = requestAnimationFrame(frame);
    }

    function showResolution() {
        const el = document.getElementById('ccd-resolution');
        if (el) el.classList.remove('hidden');
    }

    function hideResolution() {
        const el = document.getElementById('ccd-resolution');
        if (el) el.classList.add('hidden');
    }

    function runDischarge(word) {
        const root = document.getElementById('ccd-root');
        const canvas = document.getElementById('ccd-canvas');
        if (!root || !canvas) return;

        cancelCCDLoop();

        document.getElementById('ccd-input-phase')?.classList.add('hidden');
        document.getElementById('ccd-word-phase')?.classList.add('hidden');
        canvas.classList.remove('hidden');

        ccdCanvas = canvas;
        ccdCtx = fitCanvas(canvas, root);
        const buckets = Math.min(96, Math.max(28, Math.floor(ccdW / 5)));
        ccdSandFloor = new Float32Array(buckets);

        const cx = ccdW * 0.5;
        const cy = ccdH * 0.42;
        ccdParticles = spawnParticles(word, cx, cy);
        ccdElapsed = 0;
        ccdRunning = true;
        particleLoop(performance.now());
    }

    function bindOnce(stage) {
        const input = document.getElementById('ccd-worry-input');
        const wordEl = document.getElementById('ccd-word-text');
        const wordPhase = document.getElementById('ccd-word-phase');
        const inputPhase = document.getElementById('ccd-input-phase');

        if (input && !input.dataset.ccdBound) {
            input.dataset.ccdBound = '1';
            input.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const raw = (input.value || '').trim();
                if (!raw) return;

                const word = raw.slice(0, 48);
                wordEl.textContent = word;
                inputPhase.classList.add('hidden');
                wordPhase.classList.remove('hidden');
                wordPhase.classList.remove('ccd-expand');
                void wordPhase.offsetWidth;
                wordPhase.classList.add('ccd-rattle');

                setTimeout(() => {
                    wordPhase.classList.remove('ccd-rattle');
                    void wordPhase.offsetWidth;
                    wordPhase.classList.add('ccd-expand');

                    setTimeout(() => {
                        runDischarge(word);
                    }, 2000);
                }, 3000);
            });
        }

        const more = document.getElementById('ccd-more-worries');
        const better = document.getElementById('ccd-feel-better');
        if (more && !more.dataset.ccdBound) {
            more.dataset.ccdBound = '1';
            more.addEventListener('click', () => resetWorryFlow());
        }
        if (better && !better.dataset.ccdBound) {
            better.dataset.ccdBound = '1';
            better.addEventListener('click', () => {
                cancelCCDLoop();
                exitProtocol();
            });
        }
    }

    function resetWorryFlow() {
        cancelCCDLoop();
        hideResolution();

        const canvas = document.getElementById('ccd-canvas');
        if (canvas) {
            canvas.classList.add('hidden');
            const ctx = canvas.getContext('2d');
            if (ctx && ccdW && ccdH) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        const inputPhase = document.getElementById('ccd-input-phase');
        const wordPhase = document.getElementById('ccd-word-phase');
        const input = document.getElementById('ccd-worry-input');

        wordPhase?.classList.add('hidden');
        wordPhase?.classList.remove('ccd-rattle', 'ccd-expand');
        inputPhase?.classList.remove('hidden');
        if (input) {
            input.value = '';
            input.focus();
        }
    }

    window.launchCCD = function launchCCD() {
        showProtocolViewport();

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        cancelCCDLoop();

        stage.innerHTML = `
            <div class="ccd-root" id="ccd-root">
                <div class="ccd-phase ccd-input-phase" id="ccd-input-phase">
                    <p class="ccd-label">Name a worry</p>
                    <input type="text" class="ccd-input" id="ccd-worry-input" maxlength="48" autocomplete="off" placeholder="Type a word, then Enter" aria-label="Worry word">
                </div>
                <div class="ccd-phase ccd-word-phase hidden" id="ccd-word-phase" aria-live="polite">
                    <span class="ccd-word-text" id="ccd-word-text"></span>
                </div>
                <canvas class="ccd-canvas hidden" id="ccd-canvas" aria-hidden="true"></canvas>
                <div class="ccd-resolution hidden" id="ccd-resolution" role="dialog" aria-label="Continue">
                    <p class="ccd-resolution-prompt">What would you like to do?</p>
                    <div class="ccd-resolution-actions">
                        <button type="button" class="ccd-btn ccd-btn-secondary" id="ccd-more-worries">More worries</button>
                        <button type="button" class="ccd-btn ccd-btn-primary" id="ccd-feel-better">Feel better</button>
                    </div>
                </div>
            </div>
        `;

        bindOnce(stage);
        document.getElementById('ccd-worry-input')?.focus();
    };
})();
