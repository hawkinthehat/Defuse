(function () {
    const CHARGE_MS = 10000;
    const FREQ_MIN_HZ = 4;
    const FREQ_MAX_HZ = 12;
    const FLASH_ALPHA_MIN = 0.12;
    const FLASH_ALPHA_MAX = 0.98;
    const TOTAL_RESET_HOLD_MS = 480;

    let kcbRafId = 0;
    let kcbResetTimerId = 0;
    let kcbRunning = false;

    function clearTimers() {
        if (kcbRafId) {
            cancelAnimationFrame(kcbRafId);
            kcbRafId = 0;
        }
        if (kcbResetTimerId) {
            clearTimeout(kcbResetTimerId);
            kcbResetTimerId = 0;
        }
        kcbRunning = false;
    }

    function clearKcbStrobe() {
        clearTimers();
    }

    window.clearKcbStrobe = clearKcbStrobe;

    function startKcbChargeSequence() {
        clearTimers();

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        const inst = document.getElementById('inst');
        if (inst) inst.innerText = 'ACUTE EMERGENCY OVERRIDE';

        stage.innerHTML = `
            <div class="kcb-root" id="kcb-root">
                <div class="kcb-flash-overlay" id="kcb-flash" aria-hidden="true"></div>
                <div class="kcb-charge-ui" id="kcb-charge-ui">
                    <div class="kcb-circuit-head">
                        <span class="kcb-circuit-label">Circuit status</span>
                        <span class="kcb-circuit-pct" id="kcb-charge-pct">0%</span>
                    </div>
                    <div class="kcb-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="kcb-progress-track">
                        <div class="kcb-progress-fill" id="kcb-progress-fill"></div>
                    </div>
                    <p class="kcb-charge-hint">Charging kinetic interrupt — ramp to full reset</p>
                </div>
                <div class="kcb-hud" id="kcb-hud">
                    <h1 class="kcb-status" id="kcb-status">SYSTEM RESET</h1>
                </div>
                <div class="kcb-total-reset hidden" id="kcb-total-reset" aria-hidden="true"></div>
            </div>
        `;

        const flashEl = document.getElementById('kcb-flash');
        const statusEl = document.getElementById('kcb-status');
        const fillEl = document.getElementById('kcb-progress-fill');
        const pctEl = document.getElementById('kcb-charge-pct');
        const trackEl = document.getElementById('kcb-progress-track');
        const chargeUi = document.getElementById('kcb-charge-ui');
        const totalResetEl = document.getElementById('kcb-total-reset');

        if (!flashEl || !statusEl || !fillEl || !pctEl) return;

        let phaseHalf = 0;
        let lastNow = performance.now();
        const tStart = lastNow;
        kcbRunning = true;

        function triggerTotalReset() {
            if (kcbRafId) {
                cancelAnimationFrame(kcbRafId);
                kcbRafId = 0;
            }
            kcbRunning = false;

            if (chargeUi) chargeUi.classList.add('hidden');
            const hud = document.getElementById('kcb-hud');
            if (hud) hud.classList.add('hidden');
            flashEl.style.background = 'transparent';
            flashEl.classList.remove('kcb-flash-overlay--lit');
            if (totalResetEl) totalResetEl.classList.remove('hidden');

            kcbResetTimerId = setTimeout(() => {
                kcbResetTimerId = 0;
                if (typeof exitProtocol === 'function') exitProtocol();
            }, TOTAL_RESET_HOLD_MS);
        }

        function frame(now) {
            if (!kcbRunning || !flashEl.isConnected) {
                clearTimers();
                return;
            }

            const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
            lastNow = now;

            const elapsed = now - tStart;
            const charge = Math.min(1, elapsed / CHARGE_MS);

            const pct = Math.round(charge * 100);
            fillEl.style.width = `${pct}%`;
            pctEl.textContent = `${pct}%`;
            if (trackEl) {
                trackEl.setAttribute('aria-valuenow', String(pct));
            }

            if (charge >= 1) {
                triggerTotalReset();
                return;
            }

            const freq = FREQ_MIN_HZ + (FREQ_MAX_HZ - FREQ_MIN_HZ) * charge;
            phaseHalf += 2 * freq * dt;
            const lit = Math.floor(phaseHalf) % 2 === 1;

            const flashAlpha = FLASH_ALPHA_MIN + (FLASH_ALPHA_MAX - FLASH_ALPHA_MIN) * charge;

            if (lit) {
                flashEl.style.background = `rgba(255, 255, 255, ${flashAlpha})`;
                flashEl.classList.add('kcb-flash-overlay--lit');
                statusEl.classList.add('kcb-status--onwhite');
            } else {
                flashEl.style.background = '#000000';
                flashEl.classList.remove('kcb-flash-overlay--lit');
                statusEl.classList.remove('kcb-status--onwhite');
            }

            kcbRafId = requestAnimationFrame(frame);
        }

        kcbRafId = requestAnimationFrame(frame);
    }

    window.launchKCB = function launchKCB() {
        clearTimers();

        const stage = document.getElementById('protocol-stage');
        showProtocolViewport();

        const inst = document.getElementById('inst');
        if (inst) inst.textContent = 'Read the safety notice — acknowledge to continue.';

        if (!stage) return;

        stage.innerHTML = `
            <div class="kcb-warning-screen" id="kcb-warning-screen">
                <div class="kcb-warning-panel" role="dialog" aria-labelledby="kcb-warning-heading" aria-modal="true">
                    <p class="kcb-warning-kicker">Phase 05 · Kinetic circuit breaker</p>
                    <h2 class="kcb-warning-title" id="kcb-warning-heading">Safety notice</h2>
                    <p class="kcb-warning-text">
                        This module uses <strong>high-frequency flashing light</strong> and rapid full-screen contrast changes.
                        It is <strong>not appropriate</strong> if you have photosensitive epilepsy, a history of seizures,
                        or migraines triggered by flashing patterns.
                    </p>
                    <p class="kcb-warning-text">
                        If you are unsure, choose <strong>Cancel</strong> and return to the dashboard. By continuing, you confirm you accept this sensory load.
                    </p>
                    <div class="kcb-warning-actions">
                        <button type="button" class="kcb-warn-btn kcb-warn-btn-cancel" id="kcb-warning-cancel">Cancel</button>
                        <button type="button" class="kcb-warn-btn kcb-warn-btn-ok" id="kcb-warning-continue">I understand — begin</button>
                    </div>
                </div>
            </div>
        `;

        const cancel = document.getElementById('kcb-warning-cancel');
        const cont = document.getElementById('kcb-warning-continue');

        cancel?.addEventListener('click', () => {
            if (typeof exitProtocol === 'function') exitProtocol();
        });

        cont?.addEventListener('click', () => {
            startKcbChargeSequence();
        });
    };
})();
