(function () {
    const obsHistory = [];

    const PROTOCOL_OBJECTIVE =
        'Transition from internal experience to objective observation. Use clinical, third-person language to audit the system state.';

    const STEP1_INSTRUCTION =
        'Identify the primary signal. (e.g., increased heart rate, chest pressure, rapid breathing).';

    const STEP2_INSTRUCTION = 'Pinpoint the coordinates of the signal in the body.';

    const STEP3_INSTRUCTION =
        'Write a formal report in the third person. Use: "The system is experiencing [X] at [Y] coordinates. This is a known biological pattern."';

    const VALIDATION_MESSAGE =
        'Report Logged. Sensation recognized as a transient system state. Observer status maintained.';

    let obsStep = 1;
    let obsLabel = '';
    let obsLog = '';
    let obsPlatform = '';
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
                    <h3 id="obs-objective-heading" class="obs-objective-label">Protocol Objective</h3>
                    <p class="obs-objective-body">${escapeHtml(PROTOCOL_OBJECTIVE)}</p>
                </section>
            `;
        }
        return `
            <section class="obs-objective" aria-labelledby="obs-objective-heading">
                <h3 id="obs-objective-heading" class="obs-objective-label">Protocol Objective</h3>
                <p id="obs-objective-tw" class="obs-objective-body obs-typewriter" aria-live="polite"></p>
            </section>
        `;
    }

    function renderShell(innerHtml) {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        cancelTypewriters();
        stage.innerHTML = `
            <div class="obs-root" role="main">
                <header class="obs-header">
                    <p class="obs-protocol-id">OBS · OBSERVER SHIFT</p>
                    <p class="obs-audit-title">FORENSIC AUDIT</p>
                    ${objectiveBlockHtml()}
                    <div class="obs-step-rail" aria-hidden="true">
                        <span class="obs-step-dot ${obsStep >= 1 ? 'is-on' : ''}"></span>
                        <span class="obs-step-line"></span>
                        <span class="obs-step-dot ${obsStep >= 2 ? 'is-on' : ''}"></span>
                        <span class="obs-step-line"></span>
                        <span class="obs-step-dot ${obsStep >= 3 ? 'is-on' : ''}"></span>
                    </div>
                </header>
                ${innerHtml}
                ${recentAuditsHtml()}
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
                    <h3 id="obs-recent-title" class="obs-recent-title">Recent Audits</h3>
                    <p class="obs-recent-empty">No sealed audits yet this session.</p>
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
                <h3 id="obs-recent-title" class="obs-recent-title">Recent Audits</h3>
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

    function renderStep1() {
        obsStep = 1;
        setInst('OBS · STEP 01 / 03 · DETECTION (WHAT)');
        renderShell(`
            <section class="obs-panel obs-wizard" aria-labelledby="obs-s1-title">
                <p class="obs-wizard-meta">Step 1 of 3 · Detection</p>
                <h2 id="obs-s1-title" class="obs-step-title">The &lsquo;What&rsquo; (Detection)</h2>
                <p id="obs-step-instruction-tw" class="obs-step-body obs-step-body--tw" aria-live="polite"></p>
                <label class="obs-field-label" for="obs-input-label">Primary signal log</label>
                <textarea id="obs-input-label" class="obs-input obs-textarea" rows="3" autocomplete="off" placeholder="e.g. elevated heart rate · thoracic pressure band · shallow rapid ventilation"></textarea>
                <p id="obs-s1-err" class="obs-field-error" role="alert"></p>
                <button type="button" class="obs-btn obs-btn-primary" id="obs-s1-next">CONTINUE TO LOCALIZATION</button>
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
                if (err) err.textContent = 'Signal designation required for audit trail.';
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
        setInst('OBS · STEP 02 / 03 · LOCALIZATION (WHERE)');
        renderShell(`
            <section class="obs-panel obs-wizard" aria-labelledby="obs-s2-title">
                <p class="obs-wizard-meta">Step 2 of 3 · Localization</p>
                <h2 id="obs-s2-title" class="obs-step-title">The &lsquo;Where&rsquo; (Localization)</h2>
                <p id="obs-step-instruction-tw" class="obs-step-body obs-step-body--tw" aria-live="polite"></p>
                <label class="obs-field-label" for="obs-input-log">Body-coordinate fix</label>
                <textarea id="obs-input-log" class="obs-input obs-textarea" rows="4" autocomplete="off" placeholder="e.g. anterior chest, midline, T4–T6 reference · subdiaphragmatic left quadrant"></textarea>
                <p id="obs-s2-err" class="obs-field-error" role="alert"></p>
                <div class="obs-actions">
                    <button type="button" class="obs-btn obs-btn-ghost" id="obs-s2-back">BACK</button>
                    <button type="button" class="obs-btn obs-btn-primary" id="obs-s2-next">CONTINUE TO FORENSIC REPORT</button>
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
                if (err) err.textContent = 'Coordinates required.';
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
        setInst('OBS · STEP 03 / 03 · FORENSIC REPORT (SHIFT)');
        renderShell(`
            <section class="obs-panel obs-wizard" aria-labelledby="obs-s3-title">
                <p class="obs-wizard-meta">Step 3 of 3 · Forensic report</p>
                <h2 id="obs-s3-title" class="obs-step-title">The &lsquo;Shift&rsquo; (Forensic Report)</h2>
                <p id="obs-step-instruction-tw" class="obs-step-body obs-step-body--tw" aria-live="polite"></p>
                <label class="obs-field-label" for="obs-input-platform">Formal third-person report</label>
                <textarea id="obs-input-platform" class="obs-input obs-textarea obs-textarea-tall" rows="5" autocomplete="off" placeholder='The system is experiencing [signal] at [body coordinates]. This is a known biological pattern.'></textarea>
                <p id="obs-s3-err" class="obs-field-error" role="alert"></p>
                <div class="obs-actions">
                    <button type="button" class="obs-btn obs-btn-ghost" id="obs-s3-back">BACK</button>
                    <button type="button" class="obs-btn obs-btn-primary" id="obs-s3-submit">SEAL AUDIT</button>
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
                if (err) err.textContent = 'Formal report required to close audit.';
                shake(document.querySelector('.obs-panel'));
                return;
            }
            if (!looksShiftForensicReport(v)) {
                if (err) {
                    err.textContent =
                        'Use third-person system language. Include “the system” and close with a known biological pattern (see instruction above).';
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
     * Clinical Translator: maps operator affect/somatic inputs into a neutral System Status Report only.
     * No comfort language — status register copy only (Detection, Coordinates, Historical Pattern, System State).
     */
    function buildClinicalTranslatorHtml(label, log, platform) {
        const L = escapeHtml(label);
        const C = escapeHtml(log);
        const P = escapeHtml(platform);
        const hist = escapeHtml(historicalPatternClause(platform));
        return `
            <div class="obs-clinical-translator" aria-labelledby="obs-translator-heading">
                <h3 id="obs-translator-heading" class="obs-translator-heading">System Status Report</h3>
                <p class="obs-translator-sub">Clinical Translator · status-only output (no therapeutic framing)</p>
                <div class="obs-system-report" role="document">
                    <p class="obs-system-report-block"><span class="obs-report-keyword">Detection,</span> primary signal register: ${L}</p>
                    <p class="obs-system-report-block"><span class="obs-report-keyword">Coordinates,</span> spatial fix register: ${C}</p>
                    <p class="obs-system-report-block"><span class="obs-report-keyword">Historical Pattern,</span> ${hist}</p>
                    <p class="obs-system-report-block"><span class="obs-report-keyword">System State,</span> ${P}</p>
                </div>
                <p class="obs-vocalize-prompt">Vocalize this report to stabilize the observer platform.</p>
            </div>
        `;
    }

    function renderComplete() {
        obsStep = 3;
        setInst('OBS · AUDIT SEALED');
        const translatorHtml = buildClinicalTranslatorHtml(obsLabel, obsLog, obsPlatform);
        renderShell(`
            <section class="obs-panel obs-panel-readout" aria-labelledby="obs-out-title">
                <h2 id="obs-out-title" class="obs-step-title">Audit sealed</h2>
                <p id="obs-validation-tw" class="obs-validation-banner obs-typewriter" aria-live="polite"></p>
                ${translatorHtml}
                <p class="obs-readout-intro">Immutable snapshot · session record</p>
                <dl class="obs-readout">
                    <div class="obs-readout-row">
                        <dt>01 · What (detection)</dt>
                        <dd>${escapeHtml(obsLabel)}</dd>
                    </div>
                    <div class="obs-readout-row">
                        <dt>02 · Where (localization)</dt>
                        <dd>${escapeHtml(obsLog)}</dd>
                    </div>
                    <div class="obs-readout-row">
                        <dt>03 · Shift (forensic report)</dt>
                        <dd>${escapeHtml(obsPlatform)}</dd>
                    </div>
                </dl>
                <button type="button" class="obs-btn obs-btn-primary" id="obs-exit" onclick="exitProtocol()">TERMINATE SESSION</button>
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
        cancelTypewriters();
        obsStep = 1;
        obsLabel = '';
        obsLog = '';
        obsPlatform = '';
        obsObjectiveTyped = false;
        const vp = getViewport();
        if (vp) vp.classList.add('viewport-obs');
        showProtocolViewport();
        setInst('OBS · FORENSIC AUDIT · INITIALIZE');
        renderStep1();
    }

    window.launchOBS = launchOBS;
    window.saveAudit = saveAudit;
})();
