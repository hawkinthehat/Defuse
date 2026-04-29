(function () {
    const obsHistory = [];

    let obsStep = 1;
    let obsLabel = '';
    let obsLog = '';
    let obsPlatform = '';

    function getViewport() {
        return document.getElementById('viewport');
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function renderShell(innerHtml) {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="obs-root" role="main">
                <header class="obs-header">
                    <p class="obs-protocol-id">OBS · OBSERVER SHIFT</p>
                    <p class="obs-audit-title">FORENSIC AUDIT</p>
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
        const head = s.trim().slice(0, 48).toLowerCase();
        if (head.length < 12) return false;
        return !/^(i\b|i'|i'm|my\b|me\b|mine\b|we\b|our\b|us\b)\b/i.test(head);
    }

    function renderStep1() {
        obsStep = 1;
        setInst('OBS · STEP 01 / 03 · OBJECTIVE LABELING');
        renderShell(`
            <section class="obs-panel" aria-labelledby="obs-s1-title">
                <h2 id="obs-s1-title" class="obs-step-title">01 · Objective labeling</h2>
                <p class="obs-step-body">Identify the physical sensation as a neutral object. Name the signal, not the story (e.g. <span class="obs-mono">tightness</span> rather than <span class="obs-mono">panic</span>).</p>
                <label class="obs-field-label" for="obs-input-label">Neutral object designation</label>
                <textarea id="obs-input-label" class="obs-input obs-textarea" rows="3" autocomplete="off" placeholder="e.g. pressure band · heat spike · vestibular drift"></textarea>
                <p id="obs-s1-err" class="obs-field-error" role="alert"></p>
                <button type="button" class="obs-btn obs-btn-primary" id="obs-s1-next">LOG ENTRY · CONTINUE</button>
            </section>
        `);
        const ta = document.getElementById('obs-input-label');
        if (ta) {
            ta.value = obsLabel;
            ta.focus();
        }
        bindPrimaryAction('obs-s1-next', () => {
            const v = (document.getElementById('obs-input-label')?.value || '').trim();
            const err = document.getElementById('obs-s1-err');
            if (!v) {
                if (err) err.textContent = 'Designation required for audit trail.';
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
        setInst('OBS · STEP 02 / 03 · EXTERNALIZATION');
        renderShell(`
            <section class="obs-panel" aria-labelledby="obs-s2-title">
                <h2 id="obs-s2-title" class="obs-step-title">02 · Externalization</h2>
                <p class="obs-step-body">Assign a historical log context to the sensation. Treat it as recurring telemetry, not a novel threat (e.g. pattern recurrence, prior episode correlation).</p>
                <label class="obs-field-label" for="obs-input-log">Historical log context</label>
                <textarea id="obs-input-log" class="obs-input obs-textarea" rows="4" autocomplete="off" placeholder="e.g. Log shows prior occurrences under load; classified as expected variance, not fault."></textarea>
                <p id="obs-s2-err" class="obs-field-error" role="alert"></p>
                <div class="obs-actions">
                    <button type="button" class="obs-btn obs-btn-ghost" id="obs-s2-back">BACK</button>
                    <button type="button" class="obs-btn obs-btn-primary" id="obs-s2-next">LOG ENTRY · CONTINUE</button>
                </div>
            </section>
        `);
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
                if (err) err.textContent = 'Historical context required.';
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
        setInst('OBS · STEP 03 / 03 · PLATFORMING');
        renderShell(`
            <section class="obs-panel" aria-labelledby="obs-s3-title">
                <h2 id="obs-s3-title" class="obs-step-title">03 · Platforming</h2>
                <p class="obs-step-body">Describe the sensation in <strong>third-person forensic language</strong> only. No first-person operator voice. Frame as system report or external instrument readout.</p>
                <label class="obs-field-label" for="obs-input-platform">Forensic readout (third person)</label>
                <textarea id="obs-input-platform" class="obs-input obs-textarea obs-textarea-tall" rows="5" autocomplete="off" placeholder="The system is currently reporting high-voltage energy in the chest cavity; amplitude stable, classification: sensory transient."></textarea>
                <p id="obs-s3-err" class="obs-field-error" role="alert"></p>
                <div class="obs-actions">
                    <button type="button" class="obs-btn obs-btn-ghost" id="obs-s3-back">BACK</button>
                    <button type="button" class="obs-btn obs-btn-primary" id="obs-s3-submit">SEAL AUDIT</button>
                </div>
            </section>
        `);
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
                if (err) err.textContent = 'Readout required to close audit.';
                shake(document.querySelector('.obs-panel'));
                return;
            }
            if (!looksForensicThirdPerson(v)) {
                if (err) {
                    err.textContent =
                        'Register mismatch. Use third-person forensic phrasing (e.g. “The system is reporting…”, “Telemetry indicates…”).';
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

    function renderComplete() {
        obsStep = 3;
        setInst('OBS · AUDIT SEALED');
        renderShell(`
            <section class="obs-panel obs-panel-readout" aria-labelledby="obs-out-title">
                <h2 id="obs-out-title" class="obs-step-title">Audit sealed</h2>
                <p class="obs-readout-intro">Immutable snapshot · session record</p>
                <dl class="obs-readout">
                    <div class="obs-readout-row">
                        <dt>01 · Neutral object</dt>
                        <dd>${escapeHtml(obsLabel)}</dd>
                    </div>
                    <div class="obs-readout-row">
                        <dt>02 · Historical log</dt>
                        <dd>${escapeHtml(obsLog)}</dd>
                    </div>
                    <div class="obs-readout-row">
                        <dt>03 · Forensic readout</dt>
                        <dd>${escapeHtml(obsPlatform)}</dd>
                    </div>
                </dl>
                <button type="button" class="obs-btn obs-btn-primary" id="obs-exit" onclick="exitProtocol()">TERMINATE SESSION</button>
            </section>
        `);
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
        obsStep = 1;
        obsLabel = '';
        obsLog = '';
        obsPlatform = '';
        const vp = getViewport();
        if (vp) vp.classList.add('viewport-obs');
        showProtocolViewport();
        setInst('OBS · FORENSIC AUDIT · INITIALIZE');
        renderStep1();
    }

    window.launchOBS = launchOBS;
    window.saveAudit = saveAudit;
})();
