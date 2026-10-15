/**
 * Gentle protocol onboarding — plain language, voluntary start, audio optional.
 * Shared across AED, OBD, MIF, CRE, and PRCB.
 */
(function (global) {
    const AUDIO_NOTE =
        'Sound is optional and starts off. Use the Sound toggle if you want it — silence is always okay.';

    const PROTOCOL_ONBOARDING = Object.freeze({
        aed: Object.freeze({
            header: 'Help me focus',
            steps: Object.freeze([
                Object.freeze({
                    label: 'TRY',
                    text: 'Tap the calm glowing ovals when they appear.'
                }),
                Object.freeze({
                    label: 'SKIP',
                    text: 'You can ignore the busy shapes. Let them drift by.'
                }),
                Object.freeze({
                    label: 'REMINDER',
                    text: 'Stop or switch anytime. There is no score to protect.'
                })
            ])
        }),
        obd: Object.freeze({
            header: 'I need to move',
            steps: Object.freeze([
                Object.freeze({
                    label: 'TRY',
                    text: 'Hold the pad and gently follow the paddle along the loop with your eyes.'
                }),
                Object.freeze({
                    label: 'PACE',
                    text: 'Move at a pace that feels okay. You can pause by lifting your finger.'
                }),
                Object.freeze({
                    label: 'REMINDER',
                    text: 'Stop or switch anytime. Nothing here is mandatory.'
                })
            ])
        }),
        mif: Object.freeze({
            header: 'A quiet moment',
            steps: Object.freeze([
                Object.freeze({
                    label: 'TRY',
                    text: 'If it feels right, slowly trace the glowing path with one finger.'
                }),
                Object.freeze({
                    label: 'PACE',
                    text: 'You can pause, lift, or start again whenever you want.'
                }),
                Object.freeze({
                    label: 'REMINDER',
                    text: 'This is a low-stimulation option. Leave the moment you need to.'
                })
            ])
        }),
        cre: Object.freeze({
            header: 'Help me settle',
            steps: Object.freeze([
                Object.freeze({
                    label: 'TRY',
                    text: 'When a thought floats down, tap it if you want a gentler reframe.'
                }),
                Object.freeze({
                    label: 'CHOICE',
                    text: 'Pick the option that feels truest — or skip. You cannot fail this.'
                }),
                Object.freeze({
                    label: 'REMINDER',
                    text: 'Stop or switch anytime. Your pace is the right pace.'
                })
            ])
        }),
        prcb: Object.freeze({
            header: 'Stability practice',
            steps: Object.freeze([
                Object.freeze({
                    label: 'TRY',
                    text: 'Press and hold the grounding pad if that feels steadying.'
                }),
                Object.freeze({
                    label: 'PACE',
                    text: 'Let go whenever you want. You do not have to finish.'
                }),
                Object.freeze({
                    label: 'REMINDER',
                    text: 'Stop or switch anytime. Support is also in the footer if you need it.'
                })
            ])
        })
    });

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getContent(protocolKey) {
        return PROTOCOL_ONBOARDING[protocolKey] || null;
    }

    function buildMarkup(protocolKey, idPrefix) {
        const content = getContent(protocolKey);
        if (!content) return '';

        const prefix = idPrefix || protocolKey;
        const titleId = `${prefix}-onboarding-title`;
        const stepsId = `${prefix}-onboarding-steps`;
        const noteId = `${prefix}-onboarding-note`;

        const stepsHtml = content.steps
            .map(
                (step) =>
                    `<li class="protocol-preflight-step">` +
                    `<span class="protocol-preflight-step-label">${escapeHtml(step.label)}:</span> ` +
                    `<span class="protocol-preflight-step-text">${escapeHtml(step.text)}</span>` +
                    `</li>`
            )
            .join('');

        return (
            `<div class="protocol-preflight-overlay protocol-onboarding-overlay" data-protocol-onboarding="${escapeHtml(protocolKey)}" role="presentation">` +
            `<section class="protocol-preflight-card protocol-onboarding-card" role="dialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${stepsId} ${noteId}">` +
            `<h2 class="protocol-preflight-title protocol-onboarding-title" id="${titleId}">${escapeHtml(content.header)}</h2>` +
            `<ul class="protocol-preflight-steps protocol-onboarding-steps" id="${stepsId}">${stepsHtml}</ul>` +
            `<p class="protocol-onboarding-note" id="${noteId}">${escapeHtml(AUDIO_NOTE)}</p>` +
            `<button type="button" class="protocol-preflight-start protocol-onboarding-start" id="${prefix}-onboarding-start">START WHEN READY</button>` +
            `</section>` +
            `</div>`
        );
    }

    function mount(container, options) {
        if (!container || !options || !options.protocolKey || typeof options.onStart !== 'function') {
            return null;
        }

        const markup = buildMarkup(options.protocolKey, options.idPrefix);
        if (!markup) return null;

        if (options.replace) {
            container.innerHTML = markup;
        } else {
            container.insertAdjacentHTML('beforeend', markup);
        }

        const el = container.querySelector(
            `[data-protocol-onboarding="${options.protocolKey}"]`
        );
        if (!el) return null;

        let dismissed = false;

        const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            el.removeEventListener('click', onOverlayActivate);
            el.removeEventListener('keydown', onKeyActivate);
            if (el.parentNode) el.parentNode.removeChild(el);
            options.onStart();
        };

        function onOverlayActivate(event) {
            event.preventDefault();
            dismiss();
        }

        function onKeyActivate(event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                dismiss();
            }
        }

        el.addEventListener('click', onOverlayActivate);
        el.addEventListener('keydown', onKeyActivate);

        const startBtn = el.querySelector('.protocol-onboarding-start');
        if (startBtn) {
            startBtn.focus();
        }

        return { el, dismiss };
    }

    global.ProtocolOnboarding = {
        AUDIO_NOTE,
        PROTOCOL_ONBOARDING,
        getContent,
        buildMarkup,
        mount
    };
})(typeof window !== 'undefined' ? window : globalThis);
