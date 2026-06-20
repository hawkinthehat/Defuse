/**
 * AED — Kinetic Icon Clear (ʔuʔəy̓): swipe or tap drifting icons to interrupt racing cognition.
 */
(function () {
    const SESSION_MS = 60000;
    const SPAWN_MS = 1100;
    const ICONS = ['◆', '●', '▲', '■', '✦', '◎'];
    const COLORS = ['#2563EB', '#DC2626', '#0D9488', '#7C3AED', '#D97706', '#0F766E'];

    let aedRunning = false;
    let aedRafId = 0;
    let aedSpawnTimerId = 0;
    let aedStartedAt = 0;
    let aedCleared = 0;
    let aedField = null;

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function formatClock(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;
        return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
    }

    function haptic(ms) {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(ms);
        } catch {
            /* ignore */
        }
    }

    function clearTimers() {
        if (aedRafId) {
            cancelAnimationFrame(aedRafId);
            aedRafId = 0;
        }
        if (aedSpawnTimerId) {
            clearInterval(aedSpawnTimerId);
            aedSpawnTimerId = 0;
        }
    }

    function stopAED() {
        aedRunning = false;
        clearTimers();
        const vp = document.getElementById('viewport');
        if (vp) vp.classList.remove('viewport-aed');
        aedField = null;
    }

    function updateHud(remainingMs) {
        const clock = document.getElementById('aed-clock');
        const score = document.getElementById('aed-score');
        if (clock) clock.textContent = formatClock(remainingMs);
        if (score) score.textContent = String(aedCleared);
        setInst(`ʔuʔəy̓ · KINETIC ICON CLEAR · ${formatClock(remainingMs)} · ${aedCleared} cleared`);
    }

    function removeIcon(el) {
        if (!el || !el.isConnected) return;
        el.classList.add('is-clearing');
        window.setTimeout(() => el.remove(), 180);
    }

    function spawnIcon() {
        if (!aedRunning || !aedField) return;

        const fieldRect = aedField.getBoundingClientRect();
        const size = 52;
        const maxX = Math.max(0, fieldRect.width - size);
        const maxY = Math.max(0, fieldRect.height - size);

        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'aed-icon';
        el.textContent = ICONS[Math.floor(Math.random() * ICONS.length)];
        el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
        el.style.left = `${Math.random() * maxX}px`;
        el.style.top = `${Math.random() * maxY}px`;
        el.setAttribute('aria-label', 'Clear icon');

        let vx = (Math.random() - 0.5) * 90;
        let vy = (Math.random() - 0.5) * 90;
        let last = performance.now();

        function onClear() {
            aedCleared += 1;
            haptic(22);
            removeIcon(el);
        }

        el.addEventListener('click', onClear);

        el.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            const startX = event.clientX;
            const startY = event.clientY;

            function onMove(moveEvent) {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                if (Math.hypot(dx, dy) > 28) {
                    onClear();
                    cleanup();
                }
            }

            function cleanup() {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', cleanup);
                window.removeEventListener('pointercancel', cleanup);
            }

            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', cleanup);
            window.addEventListener('pointercancel', cleanup);
        });

        el._aedTick = (now) => {
            if (!el.isConnected || !aedRunning) return;
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;

            let x = parseFloat(el.style.left) + vx * dt;
            let y = parseFloat(el.style.top) + vy * dt;

            if (x <= 0 || x >= maxX) {
                vx *= -1;
                x = Math.max(0, Math.min(maxX, x));
            }
            if (y <= 0 || y >= maxY) {
                vy *= -1;
                y = Math.max(0, Math.min(maxY, y));
            }

            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
        };

        aedField.appendChild(el);
    }

    function renderComplete() {
        aedRunning = false;
        clearTimers();
        setInst('ʔuʔəy̓ · KINETIC ICON CLEAR COMPLETE');

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;
        stage.innerHTML = `
            <div class="aed-root">
                <p class="aed-cue" style="margin-top:2rem;font-weight:700;color:#2563eb;">${aedCleared} icons cleared</p>
                <p class="aed-cue">Kinetic clearing interrupted the visual loop. Return when you need another pass.</p>
                <button type="button" class="mif-ground-pad" id="aed-done-btn" style="align-self:center;margin-top:1rem;">Return to dashboard</button>
            </div>
        `;
        document.getElementById('aed-done-btn')?.addEventListener('click', () => exitProtocol());
    }

    function tick(now) {
        if (!aedRunning) {
            aedRafId = 0;
            return;
        }

        const elapsed = now - aedStartedAt;
        const remainingMs = Math.max(0, SESSION_MS - elapsed);
        updateHud(remainingMs);

        aedField?.querySelectorAll('.aed-icon').forEach((icon) => {
            if (typeof icon._aedTick === 'function') icon._aedTick(now);
        });

        if (remainingMs <= 0) {
            renderComplete();
            return;
        }

        aedRafId = requestAnimationFrame(tick);
    }

    function renderSession() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        aedCleared = 0;
        stage.innerHTML = `
            <div class="aed-root" id="aed-root">
                <div class="aed-hud" aria-live="polite">
                    <span>Clock <strong id="aed-clock">${formatClock(SESSION_MS)}</strong></span>
                    <span>Cleared <strong id="aed-score">0</strong></span>
                </div>
                <div class="aed-field" id="aed-field" role="application" aria-label="Kinetic icon clearing field"></div>
                <p class="aed-cue">Tap or flick each drifting icon to clear it from the field.</p>
            </div>
        `;

        aedField = document.getElementById('aed-field');
        aedRunning = true;
        aedStartedAt = performance.now();
        spawnIcon();
        aedSpawnTimerId = window.setInterval(spawnIcon, SPAWN_MS);
        aedRafId = requestAnimationFrame(tick);
    }

    function launchAED() {
        stopAED();
        const vp = document.getElementById('viewport');
        if (vp) vp.classList.add('viewport-aed');

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        setInst('ʔuʔəy̓ · KINETIC ICON CLEAR · READY');
        renderSession();
    }

    window.launchAED = launchAED;
    window.stopAED = stopAED;
})();
