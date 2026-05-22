(function () {
    const obsHistory = [];
    const BUFFER_SECONDS = 5;
    const MOOD_SHIFTER_MS = 60000;
    const MOOD_BPM_START = 110;
    const MOOD_BPM_END = 60;
    const OBS_HAPTICS_KEY = 'obsHapticsEnabled';

    const PROTOCOL_OBJECTIVE =
        'You can step back from how this feels and notice it with a little distance — like watching weather pass instead of being caught in the storm.';

    const STEP1_INSTRUCTION =
        'Notice what your body is signaling right now. Name it in plain terms (for example: faster heartbeat, tight chest, shallow breaths).';

    const STEP2_INSTRUCTION =
        'Where do you feel it in your body? Describe the place in words — you do not need clinical labels.';

    const STEP3_INSTRUCTION =
        'Describe what is happening in the third person, as if you were calmly reporting for a friend. Try: "The system is experiencing [what you noticed] at [where you feel it]. This is a known biological pattern."';

    const VALIDATION_MESSAGE =
        'You named it, placed it, and stepped back. What you felt is a passing state — you are still the one observing.';

    let obsStep = 0;
    let obsLabel = '';
    let obsLog = '';
    let obsPlatform = '';
    let obsIntensity = 5;
    let obsBufferTimerId = 0;
    let obsBufferRemaining = BUFFER_SECONDS;
    let obsPhase = 'buffer';
    let obsMoodRafId = 0;
    let obsMoodEndTimeoutId = 0;
    let obsMoodStart = 0;
    let obsEntrainRing = null;
    let obsMoodHapticHandler = null;
    let obsTwToken = 0;
    let obsObjectiveTyped = false;

    function getViewport() {
        return document.getElementById('viewport');
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function cancelTypewriters() {
        obsTwToken += 1;
    }

    function cancelBufferTimer() {
        if (obsBufferTimerId) {
            clearInterval(obsBufferTimerId);
            obsBufferTimerId = 0;
        }
    }

    function obsHapticsEnabled() {
        try {
            return window.localStorage.getItem(OBS_HAPTICS_KEY) === 'true';
        } catch {
            return false;
        }
    }

    function setObsHapticsEnabled(on) {
        try {
            if (on) window.localStorage.setItem(OBS_HAPTICS_KEY, 'true');
            else window.localStorage.removeItem(OBS_HAPTICS_KEY);
        } catch {
            /* ignore */
        }
    }

    function moodPulseHaptic() {
        if (typeof navigator === 'undefined' || !navigator.vibrate || !obsHapticsEnabled()) return;
        try {
            navigator.vibrate(30);
        } catch {
            /* ignore */
        }
    }

    function bpmToDurationMs(bpm) {
        return 60000 / bpm;
    }

    /** Linear 110 → 60 BPM over MOOD_SHIFTER_MS; smoothstep eases the handoff. */
    function moodShifterBpmAt(elapsedMs) {
        const t = Math.min(1, Math.max(0, elapsedMs / MOOD_SHIFTER_MS));
        const eased = t * t * (3 - 2 * t);
        return MOOD_BPM_START + (MOOD_BPM_END - MOOD_BPM_START) * eased;
    }

    function applyMoodPulseDuration(ring, durationMs) {
        if (!ring) return;
        const ms = `${durationMs}ms`;
        ring.style.setProperty('--obs-pulse-duration', ms);
        ring.style.animationDuration = ms;
    }

    function cancelMoodShifter() {
        if (obsMoodRafId) {
            cancelAnimationFrame(obsMoodRafId);
            obsMoodRafId = 0;
        }
        if (obsMoodEndTimeoutId) {
            clearTimeout(obsMoodEndTimeoutId);
            obsMoodEndTimeoutId = 0;
        }
        if (obsEntrainRing && obsMoodHapticHandler) {
            obsEntrainRing.removeEventListener('animationiteration', obsMoodHapticHandler);
        }
        obsEntrainRing = null;
        obsMoodHapticHandler = null;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try {
                navigator.vibrate(0);
            } catch {
                /* ignore */
            }
        }
    }

    function stopOBS() {
        cancelBufferTimer();
        cancelMoodShifter();
        cancelTypewriters();
    }

    function typewriterInto(el, fullText, options, onDone) {
        if (!el || !fullText) {
            if (typeof onDone === 'function') onDone();
            return;
        }
        const token = obsTwToken;
        const intervalMs = options.intervalMs ?? 34;
        const chunk = options.chunk ?? 1;
        el.classList.add('obs-typewriter', 'is-typing');
        el.textContent = '';
        let i = 0;

        function tick() {
            if (token !== obsTwToken) return;
            if (i >= fullText.length) {
                el.textContent = fullText;
                el.classList.remove('is-typing');
                if (typeof onDone === 'function') onDone();
                return;
            }
            i = Math.min(fullText.length, i + chunk);
            el.textContent = fullText.slice(0, i);
            window.setTimeout(tick, intervalMs);
        }

        tick();
    }

    function objectiveBlockHtml() {
        if (obsObjectiveTyped) {
            return `
                <section class="obs-objective" aria-labelledby="obs-objective-heading">
                    <h3 id="obs-objective-heading" class="obs-objective-label">Why we&rsquo;re here</h3>
                    <p class="obs-objective-body">${escapeHtml(PROTOCOL_OBJECTIVE)}</p>
                </section>
            `;
        }
        return `
            <section class="obs-objective" aria-labelledby="obs-objective-heading">
                <h3 id="obs-objective-heading" class="obs-objective-label">Why we&rsquo;re here</h3>
                <p id="obs-objective-tw" class="obs-objective-body obs-typewriter" aria-live="polite"></p>
            </section>
        `;
    }

    function renderShell(innerHtml) {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        cancelTypewriters();
        const moodMode = obsPhase === 'mood';
        const showWizardHeader = obsPhase === 'wizard' && obsStep > 0;
        stage.innerHTML = `
            <div class="obs-root${moodMode ? ' obs-root--mood' : ''}" role="main">
                ${
                    showWizardHeader
                        ? `
                <header class="obs-header">
                    <p class="obs-protocol-id">OBS · Observer shift</p>
                    <p class="obs-audit-title">Shift my view</p>
                    ${objectiveBlockHtml()}
                    <div class="obs-step-rail" aria-hidden="true">
                        <span class="obs-step-dot ${obsStep >= 1 ? 'is-on' : ''}"></span>
                        <span class="obs-step-line"></span>
                        <span class="obs-step-dot ${obsStep >= 2 ? 'is-on' : ''}"></span>
                        <span class="obs-step-line"></span>
                        <span class="obs-step-dot ${obsStep >= 3 ? 'is-on' : ''}"></span>
                    </div>
                </header>`
                        : moodMode
                          ? '<p class="obs-mood-phase-label">Mood shifter</p>'
                          : ''
                }
                ${innerHtml}
                ${obsPhase === 'wizard' ? recentAuditsHtml() : ''}
            </div>
        `;
    }

    /**
     * Persist a completed forensic audit (label, log, platform, timestamp) to obsHistory.
     * @param {{ label: string, log: string, platform: string, timestamp?: string }} record
     */
    function saveAudit(record) {
        obsHistory.push({
            label: String(record.label || ''),
            log: String(record.log || ''),
            platform: String(record.platform || ''),
            timestamp: record.timestamp || new Date().toISOString()
        });
    }

    function formatAuditTime(iso) {
        try {
            return new Date(iso).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
        } catch {
            return iso;
        }
    }

    function recentAuditsHtml() {
        if (obsHistory.length === 0) {
            return `
                <section class="obs-recent" aria-labelledby="obs-recent-title">
                    <h3 id="obs-recent-title" class="obs-recent-title">Recent reflections</h3>
                    <p class="obs-recent-empty">Nothing saved yet this session — that&rsquo;s okay.</p>
                </section>
            `;
        }
        const rows = obsHistory
            .slice()
            .reverse()
            .map((entry) => {
                const t = formatAuditTime(entry.timestamp);
                const preview = [entry.label, entry.log, entry.platform]
                    .map((s) => String(s).replace(/\s+/g, ' ').trim())
                    .filter(Boolean)
                    .join(' · ');
                const short =
                    preview.length > 120 ? `${escapeHtml(preview.slice(0, 117))}…` : escapeHtml(preview);
                return `
                    <li class="obs-recent-item">
                        <span class="obs-recent-time">${escapeHtml(t)}</span>
                        <p class="obs-recent-preview">${short}</p>
                    </li>
                `;
            })
            .join('');
        return `
            <section class="obs-recent" aria-labelledby="obs-recent-title">
                <h3 id="obs-recent-title" class="obs-recent-title">Recent reflections</h3>
                <ol class="obs-recent-list" reversed>${rows}</ol>
            </section>
        `;
    }

    function bindPrimaryAction(id, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    }

    function shake(el) {
        if (!el) return;
        el.classList.remove('obs-shake');
        void el.offsetWidth;
        el.classList.add('obs-shake');
        setTimeout(() => el.classList.remove('obs-shake'), 420);
    }

    function looksForensicThirdPerson(s) {
        const head = s.trim().slice(0, 56).toLowerCase();
        if (head.length < 24) return false;
        return !/^(i\b|i'|i'm|my\b|me\b|mine\b|we\b|our\b|us\b)\b/i.test(head);
    }

    /** Step 3: third-person register + system framing + biological-pattern closure */
    function looksShiftForensicReport(s) {
        const t = s.trim();
        if (!looksForensicThirdPerson(t)) return false;
        const lower = t.toLowerCase();
        if (!/\bthe system\b/.test(lower)) return false;
        if (!/known biological pattern/.test(lower)) return false;
        return true;
    }

    function runStepTypewriters(stepInstruction) {
        const objEl = document.getElementById('obs-objective-tw');
        const bodyEl = document.getElementById('obs-step-instruction-tw');

        function runBody() {
            if (bodyEl) {
                typewriterInto(bodyEl, stepInstruction, { intervalMs: 32, chunk: 1 }, null);
            }
        }

        if (!obsObjectiveTyped && objEl) {
            typewriterInto(objEl, PROTOCOL_OBJECTIVE, { intervalMs: 28, chunk: 1 }, () => {
                obsObjectiveTyped = true;
                runBody();
            });
        } else {
            runBody();
        }
    }

    function updateBufferCountdownDisplay() {
        const el = document.getElementById('obs-buffer-countdown');
        if (!el) return;
        if (obsBufferRemaining > 0) {
            el.textContent = `Take a slow breath — we\u2019ll begin in ${obsBufferRemaining}\u2026`;
        } else {
            el.textContent = 'Here when you are ready.';
        }
    }

    function renderBufferScreen() {
        obsPhase = 'buffer';
        obsStep = 0;
        obsObjectiveTyped = false;
        cancelBufferTimer();
        obsBufferRemaining = BUFFER_SECONDS;
        const hapticsSupported = typeof navigator !== 'undefined' && !!navigator.vibrate;
        const hapticsOn = obsHapticsEnabled();
        setInst('OBS · Settle in');
        renderShell(`
            <section class="obs-panel obs-buffer" aria-labelledby="obs-buffer-title">
                <h2 id="obs-buffer-title" class="obs-step-title obs-step-title--gentle">Take a breath</h2>
                <p class="obs-step-body">Before we look together, pause for a moment. Slide to match how intense this feels right now — then let the short countdown give you space to settle.</p>
                <label class="obs-field-label" for="obs-intensity">How intense does this feel? (1 = mild · 10 = very intense)</label>
                <div class="obs-intensity-wrap">
                    <input type="range" id="obs-intensity" class="obs-intensity-slider" min="1" max="10" value="${obsIntensity}" aria-valuemin="1" aria-valuemax="10" aria-valuenow="${obsIntensity}" />
                    <output id="obs-intensity-out" class="obs-intensity-value" for="obs-intensity">${obsIntensity}</output>
                </div>
                ${
                    hapticsSupported
                        ? `
                <label class="obs-haptics-toggle-label">
                    <input type="checkbox" class="obs-haptics-toggle" id="obs-haptics-toggle" ${hapticsOn ? 'checked' : ''} />
                    <span>Feel the pulse (vibration)</span>
                </label>
                <p class="obs-haptics-note">A short tap on each pulse during Mood Shifter — rhythm slows with you over one minute.</p>`
                        : ''
                }
                <p id="obs-buffer-countdown" class="obs-buffer-countdown" aria-live="polite"></p>
            </section>
        `);
        updateBufferCountdownDisplay();

        const slider = document.getElementById('obs-intensity');
        const out = document.getElementById('obs-intensity-out');
        if (slider) {
            slider.addEventListener('input', () => {
                obsIntensity = Number(slider.value) || 5;
                slider.setAttribute('aria-valuenow', String(obsIntensity));
                if (out) out.textContent = String(obsIntensity);
            });
        }

        const hapticsToggle = document.getElementById('obs-haptics-toggle');
        if (hapticsToggle) {
            hapticsToggle.addEventListener('change', () => {
                setObsHapticsEnabled(hapticsToggle.checked);
            });
        }

        obsBufferTimerId = window.setInterval(() => {
            obsBufferRemaining -= 1;
            if (obsBufferRemaining > 0) {
                updateBufferCountdownDisplay();
                return;
            }
            cancelBufferTimer();
            renderMoodShifter();
        }, 1000);
    }

    function startMoodShifterPacing() {
        const ring = document.getElementById('obs-entrain-ring');
        if (!ring) return;

        obsEntrainRing = ring;
        obsMoodStart = performance.now();
        applyMoodPulseDuration(ring, bpmToDurationMs(MOOD_BPM_START));

        obsMoodHapticHandler = () => moodPulseHaptic();
        ring.addEventListener('animationiteration', obsMoodHapticHandler);
        if (obsHapticsEnabled()) moodPulseHaptic();

        function tick(now) {
            if (!ring.isConnected) return;
            const elapsed = now - obsMoodStart;
            applyMoodPulseDuration(ring, bpmToDurationMs(moodShifterBpmAt(elapsed)));

            const progress = document.getElementById('obs-mood-progress');
            if (progress) {
                const secLeft = Math.max(0, Math.ceil((MOOD_SHIFTER_MS - elapsed) / 1000));
                progress.textContent =
                    secLeft > 0 ? `${secLeft}s — pulse easing toward rest` : 'Settling in\u2026';
            }

            if (elapsed < MOOD_SHIFTER_MS) {
                obsMoodRafId = requestAnimationFrame(tick);
            }
        }

        obsMoodRafId = requestAnimationFrame(tick);

        obsMoodEndTimeoutId = window.setTimeout(() => {
            obsMoodEndTimeoutId = 0;
            cancelMoodShifter();
            obsPhase = 'wizard';
            renderStep1();
        }, MOOD_SHIFTER_MS);
    }

    function renderMoodShifter() {
        obsPhase = 'mood';
        obsStep = 0;
        cancelMoodShifter();
        setInst('OBS · Mood shifter');
        const startDuration = bpmToDurationMs(MOOD_BPM_START);
        renderShell(`
            <section class="obs-mood-shifter" aria-labelledby="obs-mood-prompt">
                <p id="obs-mood-prompt" class="obs-mood-prompt">Match the pulse. Let the system bring you down.</p>
                <div class="obs-entrain-stage" role="img" aria-label="Pulsing entrainment circle">
                    <div id="obs-entrain-ring" class="obs-entrain-ring" style="--obs-pulse-duration: ${startDuration}ms; animation-duration: ${startDuration}ms;"></div>
                    <div class="obs-entrain-core" aria-hidden="true"></div>
                </div>
                <p id="obs-mood-progress" class="obs-mood-progress" aria-live="polite">60s — pulse easing toward rest</p>
            </section>
        `);
        startMoodShifterPacing();
    }

    function renderStep1() {
        obsPhase = 'wizard';
        obsStep = 1;
        setInst('OBS · Step 1 of 3 · What you notice');
        renderShell(`
            <section class="obs-panel obs-wizard" aria-labelledby="obs-s1-title">
                <p class="obs-wizard-meta">Step 1 of 3 · What you notice</p>
                <h2 id="obs-s1-title" class="obs-step-title">What you&rsquo;re noticing</h2>
                <p id="obs-step-instruction-tw" class="obs-step-body obs-step-body--tw" aria-live="polite"></p>
                <label class="obs-field-label" for="obs-input-label">What stands out right now</label>
                <textarea id="obs-input-label" class="obs-input obs-textarea" rows="3" autocomplete="off" placeholder="e.g. faster heartbeat, tight chest, shallow breaths"></textarea>
                <p id="obs-s1-err" class="obs-field-error" role="alert"></p>
                <button type="button" class="obs-btn obs-btn-primary" id="obs-s1-next">Next: where you feel it</button>
            </section>
        `);
        runStepTypewriters(STEP1_INSTRUCTION);
        const ta = document.getElementById('obs-input-label');
        if (ta) {
            ta.value = obsLabel;
            ta.focus();
        }
        bindPrimaryAction('obs-s1-next', () => {
            const v = (document.getElementById('obs-input-label')?.value || '').trim();
            const err = document.getElementById('obs-s1-err');
            if (!v) {
                if (err) err.textContent = 'A few words about what you notice will help — even one sensation is enough.';
                shake(document.querySelector('.obs-panel'));
                return;
            }
            obsLabel = v;
            if (err) err.textContent = '';
            renderStep2();
        });
    }

    function renderStep2() {
        obsStep = 2;
        setInst('OBS · Step 2 of 3 · Where you feel it');
        renderShell(`
            <section class="obs-panel obs-wizard" aria-labelledby="obs-s2-title">
                <p class="obs-wizard-meta">Step 2 of 3 · Where you feel it</p>
                <h2 id="obs-s2-title" class="obs-step-title">Where it lives in your body</h2>
                <p id="obs-step-instruction-tw" class="obs-step-body obs-step-body--tw" aria-live="polite"></p>
                <label class="obs-field-label" for="obs-input-log">Place in your body</label>
                <textarea id="obs-input-log" class="obs-input obs-textarea" rows="4" autocomplete="off" placeholder="e.g. center of chest, left side below ribs, back of neck"></textarea>
                <p id="obs-s2-err" class="obs-field-error" role="alert"></p>
                <div class="obs-actions">
                    <button type="button" class="obs-btn obs-btn-ghost" id="obs-s2-back">Back</button>
                    <button type="button" class="obs-btn obs-btn-primary" id="obs-s2-next">Next: your observer view</button>
                </div>
            </section>
        `);
        runStepTypewriters(STEP2_INSTRUCTION);
        const ta = document.getElementById('obs-input-log');
        if (ta) {
            ta.value = obsLog;
            ta.focus();
        }
        bindPrimaryAction('obs-s2-back', () => renderStep1());
        bindPrimaryAction('obs-s2-next', () => {
            const v = (document.getElementById('obs-input-log')?.value || '').trim();
            const err = document.getElementById('obs-s2-err');
            if (!v) {
                if (err) err.textContent = 'A rough location is enough — even &ldquo;my chest&rdquo; or &ldquo;my stomach&rdquo; works.';
                shake(document.querySelector('.obs-panel'));
                return;
            }
            obsLog = v;
            if (err) err.textContent = '';
            renderStep3();
        });
    }

    function renderStep3() {
        obsStep = 3;
        setInst('OBS · Step 3 of 3 · Observer view');
        renderShell(`
            <section class="obs-panel obs-wizard" aria-labelledby="obs-s3-title">
                <p class="obs-wizard-meta">Step 3 of 3 · Observer view</p>
                <h2 id="obs-s3-title" class="obs-step-title">Your observer view</h2>
                <p id="obs-step-instruction-tw" class="obs-step-body obs-step-body--tw" aria-live="polite"></p>
                <label class="obs-field-label" for="obs-input-platform">Third-person report (calm, distant voice)</label>
                <textarea id="obs-input-platform" class="obs-input obs-textarea obs-textarea-tall" rows="5" autocomplete="off" placeholder='The system is experiencing [what you noticed] at [where you feel it]. This is a known biological pattern.'></textarea>
                <p id="obs-s3-err" class="obs-field-error" role="alert"></p>
                <div class="obs-actions">
                    <button type="button" class="obs-btn obs-btn-ghost" id="obs-s3-back">Back</button>
                    <button type="button" class="obs-btn obs-btn-primary" id="obs-s3-submit">Save this view</button>
                </div>
            </section>
        `);
        runStepTypewriters(STEP3_INSTRUCTION);
        const ta = document.getElementById('obs-input-platform');
        if (ta) {
            ta.value = obsPlatform;
            ta.focus();
        }
        bindPrimaryAction('obs-s3-back', () => renderStep2());
        bindPrimaryAction('obs-s3-submit', () => {
            const v = (document.getElementById('obs-input-platform')?.value || '').trim();
            const err = document.getElementById('obs-s3-err');
            if (!v) {
                if (err) err.textContent = 'A short third-person sentence is enough to finish — you can use the example above.';
                shake(document.querySelector('.obs-panel'));
                return;
            }
            if (!looksShiftForensicReport(v)) {
                if (err) {
                    err.textContent =
                        'Try speaking about yourself in the third person: include &ldquo;the system&rdquo; and end with &ldquo;this is a known biological pattern&rdquo; (see the example above).';
                }
                shake(document.querySelector('.obs-panel'));
                return;
            }
            obsPlatform = v;
            if (err) err.textContent = '';
            saveAudit({
                label: obsLabel,
                log: obsLog,
                platform: obsPlatform,
                timestamp: new Date().toISOString()
            });
            renderComplete();
        });
    }

    function historicalPatternClause(platform) {
        const t = String(platform).trim();
        const m = t.match(/[^.!?]+(?:biological pattern|pattern classification|known pattern)[^.!?]*[.!?]?/i);
        if (m) return m[0].trim();
        return 'Known biological pattern designation retained; transient operator waveform. Non-escalating.';
    }

    /**
     * Observer summary: maps somatic inputs into a neutral third-person readout (validation logic unchanged).
     */
    function buildClinicalTranslatorHtml(label, log, platform) {
        const L = escapeHtml(label);
        const C = escapeHtml(log);
        const P = escapeHtml(platform);
        const hist = escapeHtml(historicalPatternClause(platform));
        const intensityNote = escapeHtml(`Intensity at start: ${obsIntensity} / 10`);
        return `
            <div class="obs-clinical-translator" aria-labelledby="obs-translator-heading">
                <h3 id="obs-translator-heading" class="obs-translator-heading">Your observer summary</h3>
                <p class="obs-translator-sub">${intensityNote}</p>
                <div class="obs-system-report" role="document">
                    <p class="obs-system-report-block"><span class="obs-report-keyword">What you noticed:</span> ${L}</p>
                    <p class="obs-system-report-block"><span class="obs-report-keyword">Where you feel it:</span> ${C}</p>
                    <p class="obs-system-report-block"><span class="obs-report-keyword">Pattern reminder:</span> ${hist}</p>
                    <p class="obs-system-report-block"><span class="obs-report-keyword">Observer view:</span> ${P}</p>
                </div>
                <p class="obs-vocalize-prompt">If it helps, read this aloud once — slowly — and let your breath catch up.</p>
            </div>
        `;
    }

    function renderComplete() {
        obsStep = 3;
        setInst('OBS · Saved');
        const translatorHtml = buildClinicalTranslatorHtml(obsLabel, obsLog, obsPlatform);
        renderShell(`
            <section class="obs-panel obs-panel-readout" aria-labelledby="obs-out-title">
                <h2 id="obs-out-title" class="obs-step-title">You shifted your view</h2>
                <p id="obs-validation-tw" class="obs-validation-banner obs-typewriter" aria-live="polite"></p>
                ${translatorHtml}
                <p class="obs-readout-intro">Your words from this session</p>
                <dl class="obs-readout">
                    <div class="obs-readout-row">
                        <dt>01 · What you noticed</dt>
                        <dd>${escapeHtml(obsLabel)}</dd>
                    </div>
                    <div class="obs-readout-row">
                        <dt>02 · Where you feel it</dt>
                        <dd>${escapeHtml(obsLog)}</dd>
                    </div>
                    <div class="obs-readout-row">
                        <dt>03 · Observer view</dt>
                        <dd>${escapeHtml(obsPlatform)}</dd>
                    </div>
                </dl>
                <button type="button" class="obs-btn obs-btn-primary" id="obs-exit" onclick="exitProtocol()">Return when you&rsquo;re ready</button>
            </section>
        `);
        const valEl = document.getElementById('obs-validation-tw');
        if (valEl) {
            typewriterInto(valEl, VALIDATION_MESSAGE, { intervalMs: 26, chunk: 1 }, null);
        }
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function launchOBS() {
        stopOBS();
        obsPhase = 'buffer';
        obsStep = 0;
        obsLabel = '';
        obsLog = '';
        obsPlatform = '';
        obsIntensity = 5;
        obsObjectiveTyped = false;
        const vp = getViewport();
        if (vp) vp.classList.add('viewport-obs');
        showProtocolViewport();
        renderBufferScreen();
    }

    window.launchOBS = launchOBS;
    window.stopOBS = stopOBS;
    window.saveAudit = saveAudit;
})();
