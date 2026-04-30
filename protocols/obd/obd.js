/**
 * OBD — bilateral sweep; optional edge-synced haptics (Web Vibration API).
 * Haptics align with CSS sweep via animationiteration + shared --obd-sweep-duration.
 */
(function () {
    const OBD_SWEEP_SLOW_MS = 2000;
    const OBD_SWEEP_FAST_MS = 1100;
    const STORAGE_KEY = 'obdHapticsEnabled';

    let obdPhaseTimeoutId = 0;
    let obdExitTimeoutId = 0;
    let obdFeatherEl = null;
    let obdHapticHandler = null;
    let obdTrackEl = null;

    function stopOBD() {
        if (obdPhaseTimeoutId) {
            clearTimeout(obdPhaseTimeoutId);
            obdPhaseTimeoutId = 0;
        }
        if (obdExitTimeoutId) {
            clearTimeout(obdExitTimeoutId);
            obdExitTimeoutId = 0;
        }
        if (obdFeatherEl && obdHapticHandler) {
            obdFeatherEl.removeEventListener('animationiteration', obdHapticHandler);
        }
        obdFeatherEl = null;
        obdHapticHandler = null;
        obdTrackEl = null;
        if (navigator.vibrate) {
            try {
                navigator.vibrate(0);
            } catch {
                /* ignore */
            }
        }
    }

    function obdHapticsEnabled() {
        try {
            return window.localStorage.getItem(STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    }

    function setOBDHapticsEnabled(on) {
        try {
            if (on) window.localStorage.setItem(STORAGE_KEY, 'true');
            else window.localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    }

    function parseCssTime(val) {
        const v = String(val || '').trim();
        if (!v || v === '0s' || v === '0ms') return OBD_SWEEP_SLOW_MS;
        const num = parseFloat(v);
        if (Number.isNaN(num)) return OBD_SWEEP_SLOW_MS;
        if (v.endsWith('ms')) return num;
        if (v.endsWith('s')) return num * 1000;
        return OBD_SWEEP_SLOW_MS;
    }

    function getSweepDurationMs() {
        if (!obdFeatherEl?.isConnected) return OBD_SWEEP_SLOW_MS;
        const cs = getComputedStyle(obdFeatherEl);
        return parseCssTime(cs.animationDuration);
    }

    /**
     * Thump-style bilateral cue; intensity scales with sweep speed (shorter duration = stronger).
     */
    function vibrateEdgeHit(sweepMs) {
        if (!navigator.vibrate || !obdHapticsEnabled()) return;
        const base = OBD_SWEEP_SLOW_MS;
        const speedFactor = Math.min(2.1, Math.max(1, base / Math.max(400, sweepMs)));
        const pulse = Math.round(40 * speedFactor);
        const gap = Math.round(20 * Math.min(1.15, speedFactor));
        const pulse2 = Math.round(40 * speedFactor);
        navigator.vibrate([pulse, gap, pulse2]);
    }

    function launchOBD() {
        stopOBD();

        const stage = document.getElementById('protocol-stage');
        showProtocolViewport();

        const inst = document.getElementById('inst');
        if (inst) inst.innerText = 'FOLLOW THE FEATHER WITH YOUR EYES';

        const hapticsOn = obdHapticsEnabled();
        stage.innerHTML = `
            <div class="obd-root">
                <div id="obd-track" class="obd-track" style="--obd-sweep-duration: ${OBD_SWEEP_SLOW_MS}ms">
                    <div id="feather" class="sweep-standard"></div>
                </div>
                <div class="obd-settings" role="region" aria-label="OBD settings">
                    <label class="obd-toggle-label">
                        <input type="checkbox" class="obd-toggle" id="obd-haptics-toggle" ${hapticsOn ? 'checked' : ''}>
                        <span>Enable Physical Feedback</span>
                    </label>
                    <p class="obd-settings-note">Short haptic thump at each sweep reversal (left/right sync with motion). Requires vibration support.</p>
                </div>
            </div>
        `;

        obdTrackEl = document.getElementById('obd-track');
        const feather = document.getElementById('feather');
        obdFeatherEl = feather;
        const toggle = document.getElementById('obd-haptics-toggle');

        if (toggle) {
            toggle.addEventListener('change', () => {
                setOBDHapticsEnabled(toggle.checked);
            });
        }

        obdHapticHandler = () => {
            if (!obdFeatherEl?.isConnected) return;
            vibrateEdgeHit(getSweepDurationMs());
        };

        if (feather) {
            feather.addEventListener('animationiteration', obdHapticHandler);
        }

        obdPhaseTimeoutId = window.setTimeout(() => {
            if (!feather?.isConnected) return;
            feather.classList.remove('sweep-standard');
            feather.classList.add('sweep-saccadic');
            if (obdTrackEl?.isConnected) {
                obdTrackEl.style.setProperty('--obd-sweep-duration', `${OBD_SWEEP_FAST_MS}ms`);
            }
            if (inst) inst.innerText = 'INCREASED TRACKING SPEED';
        }, 30000);

        obdExitTimeoutId = window.setTimeout(() => {
            stopOBD();
            exitProtocol();
        }, 60000);
    }

    window.launchOBD = launchOBD;
    window.stopOBD = stopOBD;
})();
