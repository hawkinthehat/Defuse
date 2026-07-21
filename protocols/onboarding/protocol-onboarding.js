/**
 * Standardized protocol onboarding overlay — dark, high-contrast, step-by-step.
 * Shared across AED, OBD, MIF, CRE, and PRCB.
 */
(function (global) {
    const AUDIO_NOTE =
        'Tap anywhere when ready. Audio defaults to off—toggle sound on using the icon if desired.';

    const PROTOCOL_ONBOARDING = Object.freeze({
        aed: Object.freeze({
            header: 'RETRAIN FOCUS / CLEAR CHAOTIC STIMULI',
            steps: Object.freeze([
                Object.freeze({
                    label: 'ACTION',
                    text: 'Tap only the stable, glowing Ovoid shapes as they move across the screen.'
                }),
                Object.freeze({
                    label: 'RULE',
                    text: 'Do NOT tap the chaotic shapes (Trigons, Crescents, or Quintons). Let them float past.'
                }),
                Object.freeze({
                    label: 'GOAL',
                    text: 'Locking your focus exclusively on the ovoids forces your brain to filter out chaotic sensory noise and reset your attentional baseline.'
                })
            ])
        }),
        obd: Object.freeze({
            header: 'RETRAIN RHYTHM / RETURN TO CENTER',
            steps: Object.freeze([
                Object.freeze({
                    label: 'ACTION',
                    text: 'Keep your eyes locked on the moving Cedar Paddle as it tracks along the infinity loop.'
                }),
                Object.freeze({
                    label: 'RULE',
                    text: 'Allow the background vertical sine waves to shift in your peripheral vision. Do not try to trace them—just follow the paddle.'
                }),
                Object.freeze({
                    label: 'GOAL',
                    text: 'Smooth visual tracking coupled with spatial audio forces micro-adjustments in your eyes (Optokinetic Nystagmus), breaking cyclic panic loops.'
                })
            ])
        }),
        mif: Object.freeze({
            header: 'RETRAIN SENSATION / PHYSICAL TOUCH GROUNDING',
            steps: Object.freeze([
                Object.freeze({
                    label: 'ACTION',
                    text: 'Press down and slowly trace your finger along the glowing path from end to end.'
                }),
                Object.freeze({
                    label: 'RULE',
                    text: 'Maintain continuous contact with the screen. If you stray off path or lift your finger, pause, re-align, and resume.'
                }),
                Object.freeze({
                    label: 'GOAL',
                    text: 'Tactile tracking combines visual and acoustic feedback to re-anchor your physical awareness directly into the present moment.'
                })
            ])
        }),
        cre: Object.freeze({
            header: 'RETRAIN THOUGHT / ATTENTIONAL FOCUS',
            steps: Object.freeze([
                Object.freeze({
                    label: 'ACTION',
                    text: 'Focus on the central anchor point and synchronize your breath with its rhythmic expansion and contraction.'
                }),
                Object.freeze({
                    label: 'RULE',
                    text: 'Inhale as the anchor expands; exhale as it contracts.'
                }),
                Object.freeze({
                    label: 'GOAL',
                    text: 'Re-establishes conscious control over parasympathetic breathing rates to lower physiological heart rate and blood pressure.'
                })
            ])
        }),
        prcb: Object.freeze({
            header: 'RETRAIN STABILITY / EMERGENCY OVERRIDE',
            steps: Object.freeze([
                Object.freeze({
                    label: 'ACTION',
                    text: 'Press and hold the central grounding pad firmly with your thumb or palm.'
                }),
                Object.freeze({
                    label: 'RULE',
                    text: 'Do not let go until the visual display stabilizes completely.'
                }),
                Object.freeze({
                    label: 'GOAL',
                    text: 'Delivers high-contrast visual and audio anchors to interrupt severe sensory overload or acute dissociation immediately.'
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
            `<button type="button" class="protocol-preflight-start protocol-onboarding-start" id="${prefix}-onboarding-start">START PROTOCOL</button>` +
            `</section>` +
            `</div>`
        );
    }

    /**
     * Mount the standardized onboarding overlay into a container.
     * Canvas / session logic should stay paused until onStart fires.
     *
     * @param {HTMLElement} container
     * @param {{ protocolKey: string, onStart: Function, idPrefix?: string, replace?: boolean }} options
     * @returns {{ el: HTMLElement, dismiss: Function } | null}
     */
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
            /* Allow START button and anywhere on the overlay to engage. */
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
