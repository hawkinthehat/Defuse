/**
 * IEC — Imaginal Exposure Canvas: locked 90-second worry-loop exposure.
 */
(function () {
    const SESSION_MS = 90000;

    let iecRunning = false;
    let iecTimerId = 0;
    let iecSessionEndAt = 0;
    let submittedText = '';

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function setExitLocked(locked) {
        if (typeof window.setProtocolExitLocked === 'function') {
            window.setProtocolExitLocked(locked);
        }
    }

    function formatTimeLeft(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${r < 10 ? '0' : ''}${r}`;
    }

    function stopIEC() {
        iecRunning = false;
        if (iecTimerId) {
            clearInterval(iecTimerId);
            iecTimerId = 0;
        }
        setExitLocked(false);
    }

    function hapticPulse(pattern) {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(pattern);
        } catch {
            /* ignore */
        }
    }

    function updateCountdown() {
        const left = iecSessionEndAt - Date.now();
        setInst(`IEC · EXPOSURE LOCKED · ${formatTimeLeft(left)}`);

        const timerText = document.getElementById('iec-timer-text');
        const timerFill = document.getElementById('iec-timer-fill');
        if (timerText) timerText.textContent = formatTimeLeft(left);
        if (timerFill) {
            const pct = Math.max(0, Math.min(100, (left / SESSION_MS) * 100));
            timerFill.style.width = `${pct}%`;
        }

        if (left <= 0 && iecRunning) {
            completeExposure();
        }
    }

    function renderPreflight() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        setInst('IEC · READ INSTRUCTIONS');
        stage.innerHTML = `
            <div class="iec-root iec-root--preflight">
                <div class="protocol-preflight-overlay">
                    <section class="protocol-preflight-card" role="dialog" aria-labelledby="iec-preflight-title" aria-describedby="iec-preflight-steps">
                        <h2 class="protocol-preflight-title" id="iec-preflight-title">PRE-FLIGHT</h2>
                        <ol class="protocol-preflight-steps" id="iec-preflight-steps">
                            <li>Write one short summary of the persistent worry loop.</li>
                            <li>When you submit it, the exact words will stay on screen for 90 seconds.</li>
                            <li>Keep your focus on the words until the countdown completes.</li>
                            <li>Exit controls unlock only after the exposure timer finishes.</li>
                        </ol>
                        <button type="button" class="protocol-preflight-start" id="iec-preflight-start">[ START TASK ]</button>
                    </section>
                </div>
            </div>
        `;

        const start = document.getElementById('iec-preflight-start');
        if (start) {
            start.addEventListener('click', () => {
                hapticPulse(20);
                renderInput();
            });
        }
    }

    function renderInput() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        setInst('IEC · ENTER WORRY LOOP');
        stage.innerHTML = `
            <div class="iec-root iec-root--input">
                <form class="iec-input-card" id="iec-form">
                    <label class="iec-input-label" for="iec-worry-input">Input a short text summary of your persistent worry loop.</label>
                    <textarea class="iec-textarea" id="iec-worry-input" rows="5" maxlength="220" required autocomplete="off" autocapitalize="sentences" spellcheck="true"></textarea>
                    <p class="iec-input-help" id="iec-input-help">Keep it brief. The exact text you enter will become the exposure target.</p>
                    <button type="submit" class="iec-submit-btn">[ BEGIN 90 SECOND EXPOSURE ]</button>
                </form>
            </div>
        `;

        const form = document.getElementById('iec-form');
        const input = document.getElementById('iec-worry-input');
        const help = document.getElementById('iec-input-help');
        if (input) input.focus({ preventScroll: true });
        if (form && input) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const value = input.value;
                if (!value.trim()) {
                    if (help) help.textContent = 'Enter a short worry-loop summary before starting.';
                    input.focus();
                    return;
                }
                submittedText = value;
                hapticPulse([20, 40, 20]);
                startExposure();
            });
        }
    }

    function startExposure() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        iecRunning = true;
        iecSessionEndAt = Date.now() + SESSION_MS;
        setExitLocked(true);

        stage.innerHTML = `
            <div class="iec-root iec-root--exposure">
                <div class="iec-timer" aria-live="polite">
                    <span class="iec-timer-label">Exposure countdown</span>
                    <span class="iec-timer-text" id="iec-timer-text">1:30</span>
                    <span class="iec-timer-bar" aria-hidden="true"><span class="iec-timer-fill" id="iec-timer-fill"></span></span>
                </div>
                <div class="iec-exposure-field" aria-label="Persistent worry loop exposure target">
                    <p class="iec-exposure-text" id="iec-exposure-text"></p>
                </div>
                <p class="iec-lock-note">Exit locked until the timer completes.</p>
            </div>
        `;

        const exposureText = document.getElementById('iec-exposure-text');
        if (exposureText) exposureText.textContent = submittedText;

        updateCountdown();
        iecTimerId = window.setInterval(updateCountdown, 200);
    }

    function completeExposure() {
        if (!iecRunning) return;
        iecRunning = false;
        if (iecTimerId) {
            clearInterval(iecTimerId);
            iecTimerId = 0;
        }
        setExitLocked(false);
        hapticPulse([30, 70, 30]);
        setInst('IEC · EXPOSURE COMPLETE');

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="iec-root iec-root--complete">
                <p class="iec-complete-kicker">90 seconds complete</p>
                <p class="iec-complete-line">Exposure target held without interruption.</p>
                <blockquote class="iec-complete-quote">${escapeHtml(submittedText)}</blockquote>
                <button type="button" class="iec-done-btn" id="iec-done">RETURN TO DASHBOARD</button>
            </div>
        `;

        const done = document.getElementById('iec-done');
        if (done) {
            done.addEventListener('click', () => {
                stopIEC();
                exitProtocol();
            });
        }
    }

    function launchIEC() {
        stopIEC();
        submittedText = '';

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        renderPreflight();
    }

    window.launchIEC = launchIEC;
    window.stopIEC = stopIEC;
})();
