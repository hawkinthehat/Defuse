/**
 * Universal top-right Stop & Switch safety bar.
 * Halts speech, web audio, and haptics, then leaves the session for the studio hub.
 */
(function initUniversalSafetyControl(global) {
    'use strict';

    const STUDIO_HOME = 'https://healinghawkstudios.vercel.app';
    const STUDIO_TRIAGE = 'https://healinghawkstudios.vercel.app#triage';
    const BAR_ID = 'universal-safety-control';

    let inited = false;

    function haltWebAudioContexts() {
        if (global.GlobalBinauralEngine) {
            try {
                global.GlobalBinauralEngine.mute();
            } catch (_) {
                /* ignore */
            }
            const ctx = global.GlobalBinauralEngine.audioContext;
            if (ctx && ctx.state !== 'closed') {
                try {
                    ctx.suspend();
                } catch (_) {
                    /* ignore */
                }
                try {
                    ctx.close();
                } catch (_) {
                    /* ignore */
                }
            }
        }

        const tracked = global.__dzixwAudioContexts;
        if (Array.isArray(tracked)) {
            tracked.forEach((ctx) => {
                if (!ctx || ctx.state === 'closed') return;
                try {
                    ctx.suspend();
                } catch (_) {
                    /* ignore */
                }
                try {
                    ctx.close();
                } catch (_) {
                    /* ignore */
                }
            });
        }
    }

    function haltHtmlMedia() {
        document.querySelectorAll('audio, video').forEach((el) => {
            try {
                el.pause();
            } catch (_) {
                /* ignore */
            }
            try {
                el.currentTime = 0;
            } catch (_) {
                /* ignore */
            }
        });
    }

    function haltProtocolEngines() {
        if (typeof global.exitProtocol === 'function') {
            try {
                global.exitProtocol();
            } catch (_) {
                /* ignore */
            }
            return;
        }

        [
            'stopOBD',
            'stopCRE',
            'stopSAM',
            'stopIEC',
            'stopPRCB',
            'stopMIF',
            'stopAED'
        ].forEach((name) => {
            if (typeof global[name] === 'function') {
                try {
                    global[name]();
                } catch (_) {
                    /* ignore */
                }
            }
        });
    }

    function haltAllMedia() {
        try {
            global.speechSynthesis?.cancel();
        } catch (_) {
            /* ignore */
        }

        haltHtmlMedia();
        haltWebAudioContexts();
        haltProtocolEngines();

        try {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(0);
            }
        } catch (_) {
            /* ignore */
        }
    }

    function triggerEmergencyStop() {
        haltAllMedia();
        global.location.href = STUDIO_HOME;
    }

    function switchTool() {
        global.location.href = STUDIO_TRIAGE;
    }

    function ensureSafetyControlBar() {
        let bar = document.getElementById(BAR_ID);
        if (bar) return bar;

        bar = document.createElement('nav');
        bar.id = BAR_ID;
        bar.className = 'fixed top-4 right-4 z-50 flex items-center gap-2';
        bar.setAttribute('aria-label', 'Emergency stop and tool switch');

        const stopBtn = document.createElement('button');
        stopBtn.type = 'button';
        stopBtn.id = 'universal-safety-stop';
        stopBtn.className =
            'bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-md transition-all';
        stopBtn.setAttribute('aria-label', 'Stop all media and return home');
        stopBtn.textContent = '⏹️ Stop';

        const switchBtn = document.createElement('button');
        switchBtn.type = 'button';
        switchBtn.id = 'universal-safety-switch';
        switchBtn.className =
            'bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-md transition-all';
        switchBtn.setAttribute('aria-label', 'Try a different tool');
        switchBtn.textContent = '🔄 Try Something Else';

        bar.appendChild(stopBtn);
        bar.appendChild(switchBtn);
        document.body.appendChild(bar);
        return bar;
    }

    function bindSafetyControls() {
        if (inited) return;
        inited = true;

        ensureSafetyControlBar();

        document.addEventListener(
            'click',
            (event) => {
                const stop = event.target.closest('#universal-safety-stop');
                if (stop) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    triggerEmergencyStop();
                    return;
                }
                const switchEl = event.target.closest('#universal-safety-switch');
                if (switchEl) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    switchTool();
                }
            },
            true
        );

        document.addEventListener(
            'keydown',
            (event) => {
                if (event.key !== 'Escape' && event.code !== 'Escape') return;
                event.preventDefault();
                event.stopImmediatePropagation();
                triggerEmergencyStop();
            },
            true
        );
    }

    global.UniversalSafetyControl = {
        haltAllMedia,
        triggerEmergencyStop,
        switchTool,
        ensureSafetyControlBar,
        init: bindSafetyControls
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindSafetyControls);
        } else {
            bindSafetyControls();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
