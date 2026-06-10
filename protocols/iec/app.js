/**
 * IEC - Imaginal Exposure Canvas.
 * Captures a worry loop, projects it centrally, and locks visual exposure for 90 seconds.
 */
(function () {
    const EXPOSURE_MS = 90000;
    const CHARCOAL = '#0F172A';
    const HEALING_BLUE = '#2563EB';

    const state = {
        running: false,
        exposureLocked: false,
        countdownTimerId: 0,
        endAt: 0,
        text: '',
        exitButtonSnapshot: null,
        popstateHandler: null,
        backLocked: false
    };

    if (typeof window !== 'undefined' && typeof window.exitProtocol === 'function' && !window.__iecExitProtocolGuarded) {
        const previousExitProtocol = window.exitProtocol;
        window.exitProtocol = function guardedExitProtocol(...args) {
            if (window.__iecExposureLocked) return undefined;
            return previousExitProtocol.apply(this, args);
        };
        window.__iecExitProtocolGuarded = true;
    }

    function ensureStyles() {
        if (document.getElementById('iec-protocol-styles')) return;

        const style = document.createElement('style');
        style.id = 'iec-protocol-styles';
        style.textContent = `
            #protocol-stage.iec-stage {
                padding: 0 !important;
                overflow: hidden;
            }

            #viewport.viewport-iec {
                background:
                    radial-gradient(circle at 50% 14%, rgba(37, 99, 235, 0.1), transparent 24rem),
                    #f8fafc;
            }

            .iec-root {
                position: absolute;
                inset: 0;
                width: 100%;
                min-height: 100%;
                overflow: hidden;
                background: #f8fafc;
                color: ${CHARCOAL};
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                box-sizing: border-box;
            }

            .iec-root--preflight,
            .iec-root--capture {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: calc(env(safe-area-inset-top, 32px) + 5rem) 1.25rem 1.5rem;
                background:
                    radial-gradient(circle at 50% 20%, rgba(37, 99, 235, 0.1), transparent 22rem),
                    #f8fafc;
            }

            .iec-capture-card {
                width: min(100%, 28rem);
                padding: clamp(1.25rem, 5vw, 1.7rem);
                border: 1.5px solid rgba(37, 99, 235, 0.38);
                border-radius: 18px;
                background: #ffffff;
                box-shadow:
                    0 4px 14px rgba(15, 23, 42, 0.08),
                    0 0 0 5px rgba(37, 99, 235, 0.06);
                box-sizing: border-box;
            }

            .iec-kicker {
                margin: 0 0 0.75rem;
                color: ${HEALING_BLUE};
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: 0.62rem;
                font-weight: 900;
                letter-spacing: 0.22em;
                text-align: center;
                text-transform: uppercase;
            }

            .iec-capture-title {
                margin: 0 0 1rem;
                color: ${CHARCOAL};
                font-size: clamp(1.35rem, 6vw, 1.85rem);
                line-height: 1.1;
                font-weight: 900;
                letter-spacing: -0.04em;
                text-align: center;
            }

            .iec-capture-label {
                display: block;
                margin: 0 0 0.55rem;
                color: ${CHARCOAL};
                font-size: 0.92rem;
                line-height: 1.45;
                font-weight: 800;
            }

            .iec-textarea {
                width: 100%;
                min-height: 10rem;
                resize: vertical;
                padding: 1rem;
                border: 2px solid rgba(15, 23, 42, 0.24);
                border-radius: 14px;
                background: #ffffff;
                color: ${CHARCOAL};
                font: 800 clamp(1rem, 4vw, 1.12rem)/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                box-sizing: border-box;
                box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.06);
                outline: none;
            }

            .iec-textarea::placeholder {
                color: #64748b;
                font-weight: 700;
            }

            .iec-textarea:focus {
                border-color: ${HEALING_BLUE};
                box-shadow:
                    inset 0 1px 2px rgba(15, 23, 42, 0.06),
                    0 0 0 4px rgba(37, 99, 235, 0.14);
            }

            .iec-error {
                min-height: 1.25rem;
                margin: 0.65rem 0 0;
                color: #DC2626;
                font-size: 0.8rem;
                font-weight: 800;
                line-height: 1.35;
            }

            .iec-submit-btn,
            .iec-done-btn {
                width: 100%;
                min-height: 3.1rem;
                margin-top: 0.9rem;
                border: 1.5px solid ${HEALING_BLUE};
                border-radius: 12px;
                background: ${HEALING_BLUE};
                color: #ffffff;
                cursor: pointer;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-size: clamp(0.72rem, 3.5vw, 0.82rem);
                font-weight: 900;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                box-shadow: 0 14px 30px rgba(37, 99, 235, 0.22);
                touch-action: manipulation;
                -webkit-tap-highlight-color: transparent;
            }

            .iec-submit-btn:active,
            .iec-done-btn:active {
                transform: scale(0.985);
            }

            .iec-projection {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: calc(env(safe-area-inset-top, 32px) + 6rem) max(1.05rem, env(safe-area-inset-right, 0px)) calc(2rem + env(safe-area-inset-bottom, 0px)) max(1.05rem, env(safe-area-inset-left, 0px));
                box-sizing: border-box;
                background:
                    radial-gradient(circle at 50% 50%, rgba(37, 99, 235, 0.12), transparent 25rem),
                    linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
            }

            .iec-countdown {
                position: absolute;
                top: calc(env(safe-area-inset-top, 32px) + 4.85rem);
                left: 50%;
                transform: translateX(-50%);
                z-index: 2;
                min-width: min(92vw, 24rem);
                padding: 0.75rem 1rem;
                border: 2px solid ${CHARCOAL};
                border-radius: 999px;
                background: ${CHARCOAL};
                color: #ffffff;
                box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22);
                text-align: center;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-weight: 900;
                letter-spacing: 0.16em;
                text-transform: uppercase;
            }

            .iec-countdown-label {
                display: block;
                color: rgba(255, 255, 255, 0.78);
                font-size: clamp(0.5rem, 2.4vw, 0.62rem);
                line-height: 1.1;
            }

            .iec-countdown-time {
                display: block;
                margin-top: 0.25rem;
                color: #ffffff;
                font-size: clamp(1.55rem, 8vw, 2.35rem);
                line-height: 1;
                font-variant-numeric: tabular-nums;
            }

            .iec-projection-text {
                max-width: min(94vw, 68rem);
                margin: 0;
                color: ${CHARCOAL};
                font-size: clamp(2.7rem, 13vw, 8.8rem);
                line-height: 0.96;
                font-weight: 950;
                letter-spacing: -0.075em;
                text-align: center;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                animation: iec-breath-pulse 7.5s cubic-bezier(0.42, 0, 0.2, 1) infinite;
                transform-origin: center;
                will-change: transform, opacity, filter;
            }

            .iec-complete-note {
                position: absolute;
                left: 50%;
                bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
                transform: translateX(-50%);
                width: min(92vw, 30rem);
                margin: 0;
                padding: 0.9rem 1rem;
                border: 1px solid rgba(37, 99, 235, 0.28);
                border-radius: 14px;
                background: rgba(255, 255, 255, 0.92);
                color: ${CHARCOAL};
                box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
                text-align: center;
                font-size: 0.92rem;
                font-weight: 850;
                line-height: 1.35;
            }

            .iec-hidden-exit {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
            }

            @keyframes iec-breath-pulse {
                0%,
                100% {
                    transform: scale(0.965);
                    opacity: 0.86;
                    filter: blur(0);
                }
                45% {
                    transform: scale(1.035);
                    opacity: 1;
                    filter: blur(0.2px);
                }
                62% {
                    transform: scale(1.035);
                    opacity: 1;
                    filter: blur(0.2px);
                }
            }

            @media (max-width: 520px) {
                .iec-countdown {
                    top: calc(env(safe-area-inset-top, 32px) + 4.55rem);
                    min-width: min(91vw, 20rem);
                    padding: 0.68rem 0.82rem;
                }
            }

            @media (max-height: 640px) {
                .iec-projection {
                    padding-top: calc(env(safe-area-inset-top, 32px) + 7rem);
                }

                .iec-projection-text {
                    font-size: clamp(2.1rem, 10vw, 5.4rem);
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .iec-projection-text {
                    animation-duration: 12s;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function setInst(text) {
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = text;
    }

    function haptic(pattern) {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        try {
            navigator.vibrate(pattern);
        } catch {
            /* ignore */
        }
    }

    function formatTime(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${r < 10 ? '0' : ''}${r}`;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getExitButton() {
        return document.querySelector('.exit-btn');
    }

    function lockExitButton() {
        const btn = getExitButton();
        if (!btn || state.exitButtonSnapshot) return;

        state.exitButtonSnapshot = {
            disabled: btn.disabled,
            ariaHidden: btn.getAttribute('aria-hidden'),
            tabIndex: btn.getAttribute('tabindex')
        };

        btn.disabled = true;
        btn.setAttribute('aria-hidden', 'true');
        btn.setAttribute('tabindex', '-1');
        btn.classList.add('iec-hidden-exit');
    }

    function unlockExitButton() {
        const btn = getExitButton();
        if (!btn || !state.exitButtonSnapshot) return;

        btn.disabled = state.exitButtonSnapshot.disabled;
        if (state.exitButtonSnapshot.ariaHidden === null) {
            btn.removeAttribute('aria-hidden');
        } else {
            btn.setAttribute('aria-hidden', state.exitButtonSnapshot.ariaHidden);
        }
        if (state.exitButtonSnapshot.tabIndex === null) {
            btn.removeAttribute('tabindex');
        } else {
            btn.setAttribute('tabindex', state.exitButtonSnapshot.tabIndex);
        }
        btn.classList.remove('iec-hidden-exit');
        state.exitButtonSnapshot = null;
    }

    function lockBackNavigation() {
        if (state.backLocked || typeof window === 'undefined' || !window.history || !window.history.pushState) return;

        state.backLocked = true;
        window.history.pushState({ protocol: 'iec', exposureLock: true }, document.title, window.location.href);
        state.popstateHandler = function onIecPopState() {
            if (!state.exposureLocked) return;
            window.history.pushState({ protocol: 'iec', exposureLock: true }, document.title, window.location.href);
            setInst(`IEC · EXPOSURE LOCKED · ${formatTime(state.endAt - Date.now())}`);
        };
        window.addEventListener('popstate', state.popstateHandler);
    }

    function unlockBackNavigation() {
        if (state.popstateHandler) {
            window.removeEventListener('popstate', state.popstateHandler);
            state.popstateHandler = null;
        }
        state.backLocked = false;
    }

    function lockExposure() {
        state.exposureLocked = true;
        window.__iecExposureLocked = true;
        lockExitButton();
        lockBackNavigation();
    }

    function unlockExposure() {
        state.exposureLocked = false;
        window.__iecExposureLocked = false;
        unlockExitButton();
        unlockBackNavigation();
    }

    function stopIEC() {
        state.running = false;
        if (state.countdownTimerId) {
            clearInterval(state.countdownTimerId);
            state.countdownTimerId = 0;
        }
        unlockExposure();

        const vp = document.getElementById('viewport');
        if (vp) vp.classList.remove('viewport-iec');

        const stage = document.getElementById('protocol-stage');
        if (stage) stage.classList.remove('iec-stage');
    }

    function updateCountdown() {
        if (!state.running) return;

        const remaining = Math.max(0, state.endAt - Date.now());
        const label = formatTime(remaining);
        const clock = document.getElementById('iec-countdown-time');
        if (clock) clock.textContent = label;
        setInst(`IEC · EXPOSURE LOCKED · ${label}`);

        if (remaining <= 0) completeExposure();
    }

    function completeExposure() {
        if (!state.running) return;

        state.running = false;
        if (state.countdownTimerId) {
            clearInterval(state.countdownTimerId);
            state.countdownTimerId = 0;
        }

        unlockExposure();
        setInst('IEC · EXPOSURE COMPLETE · EXIT AVAILABLE');
        haptic([24, 40, 24]);

        const root = document.getElementById('iec-root');
        if (root) root.classList.add('iec-root--complete');

        const clock = document.getElementById('iec-countdown-time');
        if (clock) clock.textContent = '0:00';

        if (!document.getElementById('iec-complete-note')) {
            const note = document.createElement('p');
            note.className = 'iec-complete-note';
            note.id = 'iec-complete-note';
            note.textContent = 'Exposure clock complete. The EXIT control is available again when you are ready to return.';
            root?.appendChild(note);
        }
    }

    function startExposure(text) {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        state.text = text;
        state.running = true;
        state.endAt = Date.now() + EXPOSURE_MS;
        lockExposure();

        stage.classList.add('iec-stage');
        stage.innerHTML = `
            <div class="iec-root" id="iec-root">
                <section class="iec-projection" aria-label="Imaginal exposure projection">
                    <div class="iec-countdown" role="timer" aria-live="polite" aria-atomic="true">
                        <span class="iec-countdown-label">90-second exposure lock</span>
                        <span class="iec-countdown-time" id="iec-countdown-time">1:30</span>
                    </div>
                    <h1 class="iec-projection-text" id="iec-projection-text"></h1>
                </section>
            </div>
        `;

        const projection = document.getElementById('iec-projection-text');
        if (projection) projection.textContent = state.text;

        updateCountdown();
        state.countdownTimerId = window.setInterval(updateCountdown, 250);
    }

    function renderCapture() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.classList.add('iec-stage');
        setInst('IEC · TEXT CAPTURE');
        stage.innerHTML = `
            <div class="iec-root iec-root--capture">
                <section class="iec-capture-card" aria-labelledby="iec-capture-title">
                    <p class="iec-kicker">IEC · Imaginal Exposure Canvas</p>
                    <h2 class="iec-capture-title" id="iec-capture-title">Name the worry loop.</h2>
                    <form id="iec-capture-form">
                        <label class="iec-capture-label" for="iec-textarea">Input a short text summary of your persistent worry loop.</label>
                        <textarea class="iec-textarea" id="iec-textarea" maxlength="320" required placeholder="Input a short text summary of your persistent worry loop."></textarea>
                        <p class="iec-error" id="iec-error" aria-live="polite"></p>
                        <button type="submit" class="iec-submit-btn">[ SUBMIT TO CANVAS ]</button>
                    </form>
                </section>
            </div>
        `;

        const textarea = document.getElementById('iec-textarea');
        const form = document.getElementById('iec-capture-form');
        const error = document.getElementById('iec-error');

        textarea?.focus();
        form?.addEventListener('submit', (event) => {
            event.preventDefault();
            const raw = textarea ? textarea.value : '';
            if (!raw.trim()) {
                if (error) error.textContent = 'Enter a short worry-loop summary before projection.';
                textarea?.focus();
                return;
            }

            haptic(24);
            startExposure(raw);
        });
    }

    function renderPreflight() {
        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.classList.add('iec-stage');
        setInst('IEC · READ INSTRUCTIONS');
        stage.innerHTML = `
            <div class="iec-root iec-root--preflight">
                <div class="protocol-preflight-overlay">
                    <section class="protocol-preflight-card" role="dialog" aria-labelledby="iec-preflight-title" aria-describedby="iec-preflight-steps">
                        <h2 class="protocol-preflight-title" id="iec-preflight-title">HOW TO RUN EXPOSURE</h2>
                        <ol class="protocol-preflight-steps" id="iec-preflight-steps">
                            <li>Enter a short text summary of the persistent worry loop.</li>
                            <li>Submit it to the canvas and keep your eyes on the centered text.</li>
                            <li>The text will pulse slowly for a full 90-second exposure cycle.</li>
                            <li>EXIT and back navigation are locked until the timer reaches 00:00.</li>
                        </ol>
                        <button type="button" class="protocol-preflight-start" id="iec-preflight-start">[ START TASK ]</button>
                    </section>
                </div>
            </div>
        `;

        document.getElementById('iec-preflight-start')?.addEventListener('click', () => {
            haptic(18);
            renderCapture();
        });
    }

    function launchIEC() {
        ensureStyles();
        stopIEC();

        const vp = document.getElementById('viewport');
        if (vp) vp.classList.add('viewport-iec');

        if (typeof showProtocolViewport === 'function') {
            showProtocolViewport();
        }

        renderPreflight();
    }

    window.launchIEC = launchIEC;
    window.stopIEC = stopIEC;
})();
