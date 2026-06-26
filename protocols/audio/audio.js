/**
 * Audio entrainment — Web Audio binaural beats: 25Hz Beta → 6Hz Theta over 90s.
 */
(function () {
    const SESSION_MS = 90000;
    const FREQ_L = 200;
    const FREQ_R_START = 225;
    const FREQ_R_END = 206;
    const BEAT_START = FREQ_R_START - FREQ_L;
    const BEAT_END = FREQ_R_END - FREQ_L;
    const GAIN_LEVEL = 0.11;

    let audioRunning = false;
    let audioRafId = 0;
    let audioCtx = null;
    let oscL = null;
    let oscR = null;
    let sessionStart = 0;
    let sessionEnded = false;

    function stopAudio() {
        audioRunning = false;
        sessionEnded = false;
        if (audioRafId) {
            cancelAnimationFrame(audioRafId);
            audioRafId = 0;
        }
        if (oscL) {
            try {
                oscL.stop();
            } catch {
                /* ignore */
            }
            oscL.disconnect();
            oscL = null;
        }
        if (oscR) {
            try {
                oscR.stop();
            } catch {
                /* ignore */
            }
            oscR.disconnect();
            oscR = null;
        }
        if (audioCtx) {
            audioCtx.close().catch(() => {});
            audioCtx = null;
        }
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function beatHzAtProgress(p) {
        const t = Math.max(0, Math.min(1, p));
        return BEAT_START + (BEAT_END - BEAT_START) * t;
    }

    function rightHzAtProgress(p) {
        const t = Math.max(0, Math.min(1, p));
        return FREQ_R_START + (FREQ_R_END - FREQ_R_START) * t;
    }

    function formatTimeLeft(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${r < 10 ? '0' : ''}${r}`;
    }

    function startBinauralEngine() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return false;

        stopAudio();
        audioCtx = new Ctx();
        const merger = audioCtx.createChannelMerger(2);
        const gainL = audioCtx.createGain();
        const gainR = audioCtx.createGain();
        gainL.gain.value = GAIN_LEVEL;
        gainR.gain.value = GAIN_LEVEL;

        oscL = audioCtx.createOscillator();
        oscR = audioCtx.createOscillator();
        oscL.type = 'sine';
        oscR.type = 'sine';
        oscL.frequency.value = FREQ_L;
        oscR.frequency.value = FREQ_R_START;

        oscL.connect(gainL);
        oscR.connect(gainR);
        gainL.connect(merger, 0, 0);
        gainR.connect(merger, 0, 1);
        merger.connect(audioCtx.destination);

        const t0 = audioCtx.currentTime;
        oscR.frequency.setValueAtTime(FREQ_R_START, t0);
        oscR.frequency.linearRampToValueAtTime(FREQ_R_END, t0 + SESSION_MS / 1000);

        oscL.start(t0);
        oscR.start(t0);
        oscL.stop(t0 + SESSION_MS / 1000 + 0.05);
        oscR.stop(t0 + SESSION_MS / 1000 + 0.05);

        audioRunning = true;
        sessionStart = performance.now();
        sessionEnded = false;
        return true;
    }

    function drawWave(canvas, beatHz, phase) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const mid = h * 0.5;
        const amp = h * 0.28;
        const cycles = 2.5 + (1 - beatHz / BEAT_START) * 2;
        const speed = beatHz * 0.35;

        ctx.strokeStyle = 'rgba(37, 99, 235, 0.75)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
            const nx = x / w;
            const y =
                mid +
                Math.sin(nx * Math.PI * 2 * cycles + phase * speed) * amp * (0.65 + 0.35 * (beatHz / BEAT_START));
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(59, 130, 246, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
            const nx = x / w;
            const env = 0.5 + 0.5 * Math.sin(nx * Math.PI * 4 + phase * speed * 0.5);
            const y = mid + Math.sin(nx * Math.PI * 2 * cycles + phase * speed) * amp * env * 0.4;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    function renderComplete() {
        stopAudio();
        sessionEnded = true;
        setInst('AUDIO · ENTRAINMENT COMPLETE');

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="audio-root audio-root--complete">
                <p class="audio-complete-line">Theta entrainment complete. Neural frequency normalized to calm differential.</p>
                <button type="button" class="audio-done-btn" id="audio-done">RETURN TO MAIN SCREEN</button>
            </div>
        `;
        document.getElementById('audio-done')?.addEventListener('click', () => exitProtocol());
    }

    function tick(now) {
        if (!audioRunning || sessionEnded) {
            audioRafId = 0;
            return;
        }

        const elapsed = now - sessionStart;
        const progress = Math.min(1, elapsed / SESSION_MS);
        const beatHz = beatHzAtProgress(progress);
        const left = SESSION_MS - elapsed;

        const beatEl = document.getElementById('audio-beat');
        const progressEl = document.getElementById('audio-progress-fill');
        const metaEl = document.getElementById('audio-meta');
        const canvas = document.getElementById('audio-wave-canvas');

        if (beatEl) beatEl.textContent = `${beatHz.toFixed(1)} Hz`;
        if (progressEl) progressEl.style.width = `${progress * 100}%`;
        if (metaEl) {
            metaEl.textContent = `L ${FREQ_L} Hz · R ${rightHzAtProgress(progress).toFixed(1)} Hz · ${formatTimeLeft(left)}`;
        }
        if (canvas) drawWave(canvas, beatHz, now * 0.001);

        setInst(`AUDIO · ENTRAINMENT · ${formatTimeLeft(left)}`);

        if (elapsed >= SESSION_MS) {
            renderComplete();
            return;
        }

        audioRafId = requestAnimationFrame(tick);
    }

    function tryStartEntrainment() {
        const btn = document.getElementById('audio-start-btn');
        if (!startBinauralEngine()) {
            setInst('AUDIO · Web Audio unavailable');
            return;
        }
        const resume = audioCtx && audioCtx.state === 'suspended' ? audioCtx.resume() : Promise.resolve();
        resume
            .then(() => {
                if (btn) btn.classList.add('hidden');
                sessionStart = performance.now();
                audioRafId = requestAnimationFrame(tick);
            })
            .catch(() => {
                stopAudio();
                setInst('AUDIO · Tap begin to start');
                if (btn) btn.classList.remove('hidden');
            });
    }

    function onBeginClick() {
        tryStartEntrainment();
    }

    function renderSession() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.innerHTML = `
            <div class="audio-root">
                <p class="audio-warning">Headphones required for entrainment</p>
                <div class="audio-wave-wrap">
                    <canvas class="audio-wave-canvas" id="audio-wave-canvas" aria-hidden="true"></canvas>
                </div>
                <p class="audio-meta" id="audio-meta">L ${FREQ_L} Hz · R ${FREQ_R_START} Hz · ${formatTimeLeft(SESSION_MS)}</p>
                <p class="audio-beat" id="audio-beat" aria-live="polite">${BEAT_START.toFixed(1)} Hz</p>
                <p class="audio-sub">Binaural differential shifting Beta (${BEAT_START} Hz) toward Theta (${BEAT_END} Hz)</p>
                <div class="audio-progress" aria-hidden="true"><div class="audio-progress-fill" id="audio-progress-fill"></div></div>
                <button type="button" class="audio-start-btn" id="audio-start-btn">BEGIN ENTRAINMENT</button>
            </div>
        `;

        const startBtn = document.getElementById('audio-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', (e) => {
                e.preventDefault();
                onBeginClick();
            });
        }

        const canvas = document.getElementById('audio-wave-canvas');
        if (canvas) drawWave(canvas, BEAT_START, 0);
    }

    function launchAudio() {
        stopAudio();
        sessionEnded = false;

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        setInst('AUDIO · BINAURAL ENTRAINMENT');
        renderSession();
    }

    window.launchAudio = launchAudio;
    window.stopAudio = stopAudio;
})();
