/**
 * ABM — Attention Bias Modification: 500ms word pair, probe at neutral locus only; 20 cycles; rAF-timed probe onset.
 */
(function () {
    const TOTAL_TRIALS = 20;
    const PROBE_DELAY_MS = 500;
    const PROBE_TIMEOUT_MS = 5000;

    const STRESS_WORDS = ['URGENT', 'NOISE', 'FAST', 'RUSH', 'ALERT', 'CRASH', 'SPIKE', 'JOLT'];
    const NEUTRAL_WORDS = ['STONE', 'PLANT', 'STILL', 'CALM', 'QUIET', 'SLOW', 'REST', 'MOSS'];

    let abmRunning = false;
    let abmWaitRafId = 0;
    let abmTimeoutId = 0;
    let trialIndex = 0;
    let reactionTimes = [];
    let probeShownAt = 0;
    let neutralOnLeft = true;
    let stressWord = '';
    let neutralWord = '';
    let probeActive = false;

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function stopABM() {
        abmRunning = false;
        probeActive = false;
        if (abmWaitRafId) {
            cancelAnimationFrame(abmWaitRafId);
            abmWaitRafId = 0;
        }
        if (abmTimeoutId) {
            clearTimeout(abmTimeoutId);
            abmTimeoutId = 0;
        }
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function armProbeTimeout() {
        if (abmTimeoutId) clearTimeout(abmTimeoutId);
        abmTimeoutId = window.setTimeout(() => {
            if (!abmRunning || !probeActive) return;
            probeActive = false;
            abmTimeoutId = 0;
            nextTrialAfterResponse();
        }, PROBE_TIMEOUT_MS);
    }

    function onProbeHit(e) {
        e.preventDefault();
        if (!abmRunning || !probeActive) return;
        const now = performance.now();
        const rt = Math.round(now - probeShownAt);
        probeActive = false;
        if (abmTimeoutId) {
            clearTimeout(abmTimeoutId);
            abmTimeoutId = 0;
        }
        reactionTimes.push(rt);
        nextTrialAfterResponse();
    }

    function nextTrialAfterResponse() {
        trialIndex += 1;
        if (trialIndex >= TOTAL_TRIALS) {
            showSummary();
            return;
        }
        startTrial();
    }

    function showSummary() {
        const valid = reactionTimes.filter((n) => typeof n === 'number' && n >= 0);
        const avg =
            valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
        const avgPhrase =
            avg !== null ? `${avg}ms.` : '— (no taps recorded).';
        setInst('ABM · SESSION COMPLETE');

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="abm-root abm-root--summary">
                <p class="abm-summary-line">Attention successfully re-biased to Stable. Average response: ${avgPhrase}</p>
                ${
                    valid.length < TOTAL_TRIALS
                        ? `<p class="abm-summary-meta">Valid taps recorded: ${valid.length} / ${TOTAL_TRIALS}</p>`
                        : ''
                }
                <button type="button" class="abm-done-btn" id="abm-done">RETURN TO DASHBOARD</button>
            </div>
        `;
        const done = document.getElementById('abm-done');
        if (done) {
            done.addEventListener('click', () => {
                stopABM();
                exitProtocol();
            });
        }
    }

    function scheduleProbeWithRaf() {
        const deadline = performance.now() + PROBE_DELAY_MS;

        function frame(now) {
            if (!abmRunning) {
                abmWaitRafId = 0;
                return;
            }
            if (now >= deadline) {
                abmWaitRafId = 0;
                showProbePhase();
                return;
            }
            abmWaitRafId = requestAnimationFrame(frame);
        }

        abmWaitRafId = requestAnimationFrame(frame);
    }

    function showProbePhase() {
        const left = document.getElementById('abm-left');
        const right = document.getElementById('abm-right');
        if (!left || !right) return;

        left.innerHTML = '';
        right.innerHTML = '';
        left.classList.add('abm-slot--empty');
        right.classList.add('abm-slot--empty');

        const target = neutralOnLeft ? left : right;
        target.classList.remove('abm-slot--empty');
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'abm-probe';
        dot.setAttribute('aria-label', 'Tap probe');
        target.appendChild(dot);

        dot.addEventListener('pointerdown', onProbeHit, { passive: false });

        probeShownAt = performance.now();
        probeActive = true;
        setInst(`ABM · TRIAL ${trialIndex + 1} / ${TOTAL_TRIALS} · TAP DOT`);
        armProbeTimeout();
    }

    function startTrial() {
        const stage = document.getElementById('protocol-stage');
        if (!stage || !abmRunning) return;

        if (abmWaitRafId) {
            cancelAnimationFrame(abmWaitRafId);
            abmWaitRafId = 0;
        }
        if (abmTimeoutId) {
            clearTimeout(abmTimeoutId);
            abmTimeoutId = 0;
        }

        stressWord = pick(STRESS_WORDS);
        neutralWord = pick(NEUTRAL_WORDS);
        neutralOnLeft = Math.random() < 0.5;

        const leftText = neutralOnLeft ? neutralWord : stressWord;
        const rightText = neutralOnLeft ? stressWord : neutralWord;
        const leftTone = neutralOnLeft ? 'neutral' : 'stress';
        const rightTone = neutralOnLeft ? 'stress' : 'neutral';

        stage.innerHTML = `
            <div class="abm-root" id="abm-root">
                <p class="abm-trial-label" id="abm-trial-label">Trial ${trialIndex + 1} / ${TOTAL_TRIALS}</p>
                <div class="abm-field" role="presentation">
                    <div class="abm-slot abm-slot--left abm-slot--${leftTone}" id="abm-left">
                        <span class="abm-word">${escapeHtml(leftText)}</span>
                    </div>
                    <div class="abm-slot abm-slot--right abm-slot--${rightTone}" id="abm-right">
                        <span class="abm-word">${escapeHtml(rightText)}</span>
                    </div>
                </div>
            </div>
        `;

        setInst(`ABM · TRIAL ${trialIndex + 1} / ${TOTAL_TRIALS} · SCAN`);
        probeActive = false;
        scheduleProbeWithRaf();
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function launchABM() {
        stopABM();
        abmRunning = true;
        trialIndex = 0;
        reactionTimes = [];

        showProtocolViewport();
        setInst('ABM · ATTENTION BIAS MODIFICATION');

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        startTrial();
    }

    window.launchABM = launchABM;
    window.stopABM = stopABM;
})();
