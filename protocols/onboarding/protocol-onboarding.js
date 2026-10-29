/**
 * Youth-friendly step-by-step instruction cards before every exercise.
 * Shared across CRE, OBD, MIF, AED, and PRCB.
 */
(function (global) {
    const PROTOCOL_ONBOARDING = Object.freeze({
        cre: Object.freeze({
            header: 'Help Me Settle',
            steps: Object.freeze([
                Object.freeze({
                    label: 'WHAT TO DO',
                    text: 'Breathe in slowly as the shape expands; breathe out as it shrinks.'
                }),
                Object.freeze({
                    label: 'TIP',
                    text: 'Keep your eyes softly focused on the center. Audio is optional—turn it on or leave it silent.'
                }),
                Object.freeze({
                    label: 'CHOICE',
                    text: 'Stop or pause whenever you feel ready. There is no forced time limit.'
                })
            ])
        }),
        obd: Object.freeze({
            header: 'I Need to Move',
            steps: Object.freeze([
                Object.freeze({
                    label: 'WHAT TO DO',
                    text: 'Keep your eyes on the moving cedar paddle as it traces the smooth loop.'
                }),
                Object.freeze({
                    label: 'WHAT TO IGNORE',
                    text: 'Let the shifting background waves pass in your side vision without staring at them.'
                }),
                Object.freeze({
                    label: 'WHY',
                    text: 'Smooth visual tracking helps quiet racing thoughts and bring your focus back to center.'
                })
            ])
        }),
        mif: Object.freeze({
            header: 'I Need a Quiet Moment',
            steps: Object.freeze([
                Object.freeze({
                    label: 'WHAT TO DO',
                    text: 'Press your finger gently on the glowing path and trace along the line.'
                }),
                Object.freeze({
                    label: 'IF YOU SLIP',
                    text: 'If your finger leaves the line, simply place it back on the path and keep moving smoothly.'
                }),
                Object.freeze({
                    label: 'AUDIO',
                    text: 'Sound is turned off by default. Tap the speaker icon if you want gentle touch feedback.'
                })
            ])
        }),
        aed: Object.freeze({
            header: 'Help Me Focus',
            steps: Object.freeze([
                Object.freeze({
                    label: 'WHAT TO DO',
                    text: 'Tap ONLY the stable, glowing ovoid shapes as they float across the screen.'
                }),
                Object.freeze({
                    label: 'WHAT TO AVOID',
                    text: 'Do NOT tap the chaotic shapes (trigons, crescents, or quintons). Let them float past.'
                }),
                Object.freeze({
                    label: 'WHY',
                    text: 'Focusing strictly on the ovoids trains your brain to filter out chaotic sensory noise.'
                })
            ])
        }),
        prcb: Object.freeze({
            header: 'Emergency Reset',
            steps: Object.freeze([
                Object.freeze({
                    label: 'WHAT TO DO',
                    text: 'Press and hold the central pad firmly with your thumb or palm.'
                }),
                Object.freeze({
                    label: 'WHAT TO EXPECT',
                    text: 'Hold until the screen visual relaxes and stabilizes.'
                }),
                Object.freeze({
                    label: 'SAFETY',
                    text: 'You can release your hold or exit at any millisecond.'
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
            `<section class="protocol-preflight-card protocol-onboarding-card" role="dialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${stepsId}">` +
            `<h2 class="protocol-preflight-title protocol-onboarding-title" id="${titleId}">${escapeHtml(content.header)}</h2>` +
            `<ul class="protocol-preflight-steps protocol-onboarding-steps" id="${stepsId}">${stepsHtml}</ul>` +
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
            /* Only the start button (or Enter/Space on focused start) begins the exercise. */
            const startBtn = event.target.closest('.protocol-onboarding-start');
            if (!startBtn) return;
            event.preventDefault();
            dismiss();
        }

        function onKeyActivate(event) {
            if (event.key === 'Enter' || event.key === ' ') {
                const startBtn = event.target.closest('.protocol-onboarding-start');
                if (!startBtn) return;
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
        PROTOCOL_ONBOARDING,
        getContent,
        buildMarkup,
        mount
    };
})(typeof window !== 'undefined' ? window : globalThis);
