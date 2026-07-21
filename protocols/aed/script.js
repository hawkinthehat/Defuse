/**
 * AED — ʔuʔəy̓ (Autonomic Exposure Desensitization)
 * Attention Bias Modification: ignore chaotic nodes, tap slow calm nodes to down-regulate arousal.
 */
(function () {
    const DIM_DURATION_MS = 60000;
    const MAX_DPR = 2;
    const CHAOTIC_MAX = 5;
    const CALM_MIN = 3;
    const CALM_MAX = 4;
    const CALM_RESPAWN_MS = 4200;
    const POP_MS = 520;

    const CHAOTIC_COLORS = ['#ffffff', '#ff44aa', '#ff2288', '#ffe0ef'];
    const CHAOS_SHAPES = ['trigon', 'extended_crescent', 'quinton'];
    const CALM_TEAL_STOPS = ['#0a3040', '#145568', '#1e7080', '#288c9c', '#34a8b8', '#48c4d4'];

    let aedRunning = false;
    let aedRafId = 0;
    let aedCanvas = null;
    let aedCtx = null;
    let aedShell = null;
    let instructionOverlay = null;
    let instructionOverlayDismissed = false;
    let interactionCounter = 0;
    let aedResizeHandler = null;
    let aedPointerHandler = null;

    let chaoticNodes = [];
    let calmNodes = [];
    let popEffects = [];
    let width = 0;
    let height = 0;

    let regulationTarget = 0;
    let regulationDisplay = 0;
    let regulationAnimStart = 0;
    let regulationAnimFrom = 0;
    let calmTaps = 0;
    let lastRespawnAt = 0;

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function injectAedStyles() {
        if (document.getElementById('aed-spa-styles')) return;
        const style = document.createElement('style');
        style.id = 'aed-spa-styles';
        style.textContent = `
            .aed-root {
                width: 100%;
                height: 100%;
                min-height: 100%;
                align-self: stretch;
                display: flex;
                flex-direction: column;
                background: #050608;
                position: relative;
                overflow: hidden;
                padding-bottom: 80px;
                box-sizing: border-box;
            }
            .aed-root .aed-shell {
                flex: 1;
                position: relative;
                width: 100%;
                min-height: 0;
                overflow: hidden;
                transition: filter 0.4s linear;
            }
            .aed-root #aed-canvas {
                position: absolute;
                top: 0;
                left: 0;
                width: 100vw !important;
                height: 100vh !important;
                display: block;
                z-index: 1;
                touch-action: none;
            }
            .aed-root .aed-header {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 11998;
                margin: 0;
                padding: calc(env(safe-area-inset-top, 0px) + 10px) 12px 8px;
                background: #050608;
                pointer-events: none;
            }
            .aed-root .aed-header .protocol-header {
                position: static;
                left: auto;
                right: auto;
                z-index: auto;
            }
            .aed-root #instruction-overlay {
                position: fixed;
                inset: 0;
                z-index: 2000;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0;
                padding: 0 1.5rem;
                background: transparent !important;
                font-size: clamp(1.5rem, 5vw, 2.25rem);
                font-weight: 600;
                line-height: 1.35;
                letter-spacing: 0.03em;
                text-align: center;
                color: #ffffff;
                pointer-events: none;
                opacity: 1;
                transition: opacity 500ms ease;
            }
            .aed-root #instruction-overlay.is-fading {
                opacity: 0;
            }
        `;
        document.head.appendChild(style);
    }

    function clearAedTimers() {
        if (aedRafId) {
            cancelAnimationFrame(aedRafId);
            aedRafId = 0;
        }
        if (aedResizeHandler) {
            window.removeEventListener('resize', aedResizeHandler);
            aedResizeHandler = null;
        }
        if (aedPointerHandler && aedCanvas) {
            aedCanvas.removeEventListener('pointerdown', aedPointerHandler);
            aedPointerHandler = null;
        }
        aedRunning = false;
    }

    function stopAED() {
        clearAedTimers();
        aedCanvas = null;
        aedCtx = null;
        aedShell = null;
        instructionOverlay = null;
        instructionOverlayDismissed = false;
        interactionCounter = 0;
        chaoticNodes = [];
        calmNodes = [];
        popEffects = [];
        regulationTarget = 0;
        regulationDisplay = 0;
        calmTaps = 0;
    }

    function ensureInstructionOverlay(root) {
        if (!root) return null;
        let overlay = root.querySelector('#instruction-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'instruction-overlay';
            overlay.setAttribute('role', 'status');
            overlay.setAttribute('aria-live', 'polite');
            overlay.textContent = 'Focus on the glowing ovoids.';
            root.appendChild(overlay);
        }
        overlay.classList.remove('is-fading');
        overlay.style.opacity = '';
        overlay.style.display = '';
        overlay.style.pointerEvents = 'none';
        return overlay;
    }

    function dismissInstructionOverlay() {
        if (!instructionOverlay || instructionOverlayDismissed) return;
        instructionOverlayDismissed = true;

        const overlay = instructionOverlay;
        overlay.classList.add('is-fading');

        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.remove();
            if (instructionOverlay === overlay) instructionOverlay = null;
        }, 500);
    }

    function maybeDismissInstructionOverlay() {
        if (interactionCounter >= 2) dismissInstructionOverlay();
    }

    function resizeCanvas() {
        if (!aedCanvas) return;
        aedCanvas.width = window.innerWidth;
        aedCanvas.height = window.innerHeight;
        width = aedCanvas.width;
        height = aedCanvas.height;
        if (aedCtx) {
            aedCtx.setTransform(1, 0, 0, 1, 0, 0);
        }
    }

    function assignChaoticTrajectory(node) {
        const speed = rand(12, 16);
        const angle = rand(0, Math.PI * 2);
        node.vx = Math.cos(angle) * speed;
        node.vy = Math.sin(angle) * speed;
        node.framesUntilDirChange = Math.floor(rand(45, 61));
        node.rotSpeed = rand(0.42, 0.78) * (Math.random() < 0.5 ? 1 : -1);
    }

    function recycleChaoticNode(node) {
        const canvasW = aedCanvas ? aedCanvas.width : width;
        const canvasH = aedCanvas ? aedCanvas.height : height;
        const margin = node.size;
        if (node.x < -margin) {
            node.x = canvasW + margin * 0.5;
            node.y = rand(margin + 40, Math.max(margin + 41, canvasH - margin));
        } else if (node.x > canvasW + margin) {
            node.x = -margin * 0.5;
            node.y = rand(margin + 40, Math.max(margin + 41, canvasH - margin));
        } else if (node.y < margin + 20) {
            node.y = canvasH - margin;
            node.x = rand(margin, Math.max(margin + 1, canvasW - margin));
        } else if (node.y > canvasH - margin) {
            node.y = margin + 40;
            node.x = rand(margin, Math.max(margin + 1, canvasW - margin));
        }
        assignChaoticTrajectory(node);
    }

    function makeChaoticNode() {
        const canvasW = aedCanvas ? aedCanvas.width : width;
        const canvasH = aedCanvas ? aedCanvas.height : height;
        const size = rand(22, 38);
        const pattern = pick(CHAOS_SHAPES);
        const node = {
            kind: 'chaotic',
            pattern,
            x: rand(size, Math.max(size + 1, canvasW - size)),
            y: rand(size + 40, Math.max(size + 41, canvasH - size)),
            size,
            vx: 0,
            vy: 0,
            pulsePhase: rand(0, Math.PI * 2),
            pulseSpeed: rand(0.28, 0.52),
            rot: rand(0, Math.PI * 2),
            rotSpeed: 0,
            rotJitter: rand(0.12, 0.22),
            framesUntilDirChange: 0,
            color: pick(CHAOTIC_COLORS),
            flashUntil: 0
        };
        assignChaoticTrajectory(node);
        return node;
    }

    function makeCalmNode() {
        const canvasW = aedCanvas ? aedCanvas.width : width;
        const canvasH = aedCanvas ? aedCanvas.height : height;
        const radius = rand(26, 38);
        const speed = rand(2, 3);
        const angle = rand(0, Math.PI * 2);
        return {
            kind: 'calm',
            x: rand(radius, Math.max(radius + 1, canvasW - radius)),
            y: rand(radius + 40, Math.max(radius + 41, canvasH - radius)),
            radius,
            baseRadius: radius,
            rx: radius * 1.08,
            ry: radius * 0.72,
            ovoidTilt: rand(-0.18, 0.18),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            pulsePhase: rand(0, Math.PI * 2),
            pulseSpeed: rand(0.008, 0.016),
            alive: true
        };
    }

    function spawnChaoticNodes() {
        chaoticNodes = [];
        for (let i = 0; i < CHAOTIC_MAX; i += 1) {
            chaoticNodes.push(makeChaoticNode());
        }
    }

    function spawnCalmNodes() {
        const count = CALM_MIN + Math.floor(Math.random() * (CALM_MAX - CALM_MIN + 1));
        calmNodes = [];
        for (let i = 0; i < count; i += 1) {
            calmNodes.push(makeCalmNode());
        }
        lastRespawnAt = performance.now();
    }

    function updateRegulationFilter(now) {
        if (!aedShell) return;
        if (regulationAnimStart > 0) {
            const elapsed = now - regulationAnimStart;
            const t = clamp(elapsed / DIM_DURATION_MS, 0, 1);
            regulationDisplay = regulationAnimFrom + (regulationTarget - regulationAnimFrom) * easeOutCubic(t);
        }
        const contrast = 1.18 - regulationDisplay * 0.46;
        const brightness = 1 - regulationDisplay * 0.48;
        aedShell.style.filter = `contrast(${contrast.toFixed(3)}) brightness(${brightness.toFixed(3)})`;
    }

    function triggerRegulationStep() {
        calmTaps += 1;
        interactionCounter += 1;
        regulationAnimFrom = regulationDisplay;
        regulationTarget = clamp(regulationTarget + 0.22, 0, 1);
        regulationAnimStart = performance.now();
        maybeDismissInstructionOverlay();
    }

    function addPopEffect(x, y, color) {
        popEffects.push({
            x,
            y,
            color,
            born: performance.now(),
            maxR: rand(48, 72)
        });
    }

    function hitTestCalm(px, py) {
        for (let i = calmNodes.length - 1; i >= 0; i -= 1) {
            const node = calmNodes[i];
            if (!node.alive) continue;
            const dx = px - node.x;
            const dy = py - node.y;
            const cos = Math.cos(-node.ovoidTilt);
            const sin = Math.sin(-node.ovoidTilt);
            const lx = dx * cos - dy * sin;
            const ly = dx * sin + dy * cos;
            const hitRx = node.rx * 1.12;
            const hitRy = node.ry * 1.12;
            if ((lx * lx) / (hitRx * hitRx) + (ly * ly) / (hitRy * hitRy) <= 1) return node;
        }
        return null;
    }

    function hitTestChaotic(px, py) {
        for (let i = 0; i < chaoticNodes.length; i += 1) {
            const node = chaoticNodes[i];
            const half = node.size * (0.85 + 0.25 * Math.sin(node.pulsePhase));
            if (px >= node.x - half && px <= node.x + half && py >= node.y - half && py <= node.y + half) {
                return node;
            }
        }
        return null;
    }

    function onPointerDown(event) {
        if (!aedRunning || !aedCanvas) return;
        event.preventDefault();
        const px = event.clientX;
        const py = event.clientY;

        const calmHit = hitTestCalm(px, py);
        if (calmHit) {
            calmHit.alive = false;
            addPopEffect(calmHit.x, calmHit.y, CALM_TEAL_STOPS[4]);
            triggerRegulationStep();
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try {
                    navigator.vibrate(18);
                } catch {
                    /* ignore */
                }
            }
            return;
        }

        const chaoticHit = hitTestChaotic(px, py);
        if (chaoticHit) {
            chaoticHit.flashUntil = performance.now() + 90;
        }
    }

    /** Formline ovoid outline via four cubic-bezier quarters. */
    function traceOvoid(ctx, rx, ry) {
        const k = 0.5522847498;
        ctx.beginPath();
        ctx.moveTo(0, -ry);
        ctx.bezierCurveTo(rx * k, -ry, rx, -ry * k, rx, 0);
        ctx.bezierCurveTo(rx, ry * k, rx * k, ry, 0, ry);
        ctx.bezierCurveTo(-rx * k, ry, -rx, ry * k, -rx, 0);
        ctx.bezierCurveTo(-rx, -ry * k, -rx * k, -ry, 0, -ry);
        ctx.closePath();
    }

    /**
     * Trigon — closed negative relief: three sharp points joined by concave,
     * inward-curving sides (Coast Salish / Northwest Coast geometry).
     */
    function traceTrigon(ctx, s) {
        const verts = [
            { x: 0, y: -s },
            { x: s * 0.866, y: s * 0.5 },
            { x: -s * 0.866, y: s * 0.5 }
        ];

        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 0; i < 3; i += 1) {
            const from = verts[i];
            const to = verts[(i + 1) % 3];
            const mx = (from.x + to.x) * 0.5;
            const my = (from.y + to.y) * 0.5;
            ctx.quadraticCurveTo(mx * 0.42, my * 0.42, to.x, to.y);
        }
        ctx.closePath();
    }

    /**
     * Extended Crescent — tapering u-form arc with sharp terminal points at each end.
     */
    function traceExtendedCrescent(ctx, s) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.94, -s * 0.2);
        ctx.bezierCurveTo(-s * 0.58, s * 0.88, s * 0.58, s * 0.88, s * 0.94, -s * 0.2);
        ctx.bezierCurveTo(s * 0.36, s * 0.38, -s * 0.36, s * 0.38, -s * 0.94, -s * 0.2);
        ctx.closePath();
    }

    /**
     * Quinton — closed five-sided form with softly curved edges and distinct vertices.
     */
    function traceQuinton(ctx, s) {
        const sides = 5;
        const radius = s * 0.92;
        const curvePull = 0.64;

        ctx.beginPath();
        for (let i = 0; i < sides; i += 1) {
            const a0 = (i / sides) * Math.PI * 2 - Math.PI / 2;
            const a1 = ((i + 1) / sides) * Math.PI * 2 - Math.PI / 2;
            const x0 = Math.cos(a0) * radius;
            const y0 = Math.sin(a0) * radius;
            const x1 = Math.cos(a1) * radius;
            const y1 = Math.sin(a1) * radius;
            const am = (a0 + a1) * 0.5;
            const cx = Math.cos(am) * radius * curvePull;
            const cy = Math.sin(am) * radius * curvePull;
            if (i === 0) ctx.moveTo(x0, y0);
            ctx.quadraticCurveTo(cx, cy, x1, y1);
        }
        ctx.closePath();
    }

    const CHAOS_TRACE_FNS = {
        trigon: traceTrigon,
        extended_crescent: traceExtendedCrescent,
        quinton: traceQuinton
    };

    function drawChaoticShape(ctx, node, now) {
        const trace = CHAOS_TRACE_FNS[node.pattern] || traceTrigon;
        const flash = now < node.flashUntil ? 1 : 0.88 + 0.12 * Math.abs(Math.sin(node.pulsePhase * 5.2));

        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.rotate(node.rot);
        ctx.globalAlpha = flash;
        ctx.fillStyle = node.color;
        trace(ctx, node.size);
        ctx.fill();
        ctx.restore();
    }

    /** Three nested concentric ovoid rings: outer border, middle ring, inner core. */
    function drawCalmNode(ctx, node) {
        if (!node.alive) return;

        const breathe = 0.94 + 0.06 * Math.sin(node.pulsePhase);
        const auraPulse = 0.5 + 0.5 * Math.sin(node.pulsePhase * 0.55);
        const rx = node.rx * breathe;
        const ry = node.ry * breathe;
        const rings = [
            { scale: 1, lineWidth: 3.2, stroke: CALM_TEAL_STOPS[2], fill: null },
            { scale: 0.68, lineWidth: 2, stroke: CALM_TEAL_STOPS[3], fill: `${CALM_TEAL_STOPS[1]}44` },
            { scale: 0.38, lineWidth: 0, stroke: null, fill: CALM_TEAL_STOPS[4] }
        ];

        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.rotate(node.ovoidTilt);

        ctx.globalAlpha = 0.12 + auraPulse * 0.14;
        ctx.shadowColor = CALM_TEAL_STOPS[4];
        ctx.shadowBlur = 28 + auraPulse * 22;
        traceOvoid(ctx, rx * 1.18, ry * 1.18);
        ctx.strokeStyle = CALM_TEAL_STOPS[3];
        ctx.lineWidth = 5;
        ctx.stroke();

        rings.forEach((ring, idx) => {
            const ringRx = rx * ring.scale;
            const ringRy = ry * ring.scale;
            ctx.shadowBlur = idx === 0 ? 14 + auraPulse * 10 : 0;
            ctx.globalAlpha = 0.72 + auraPulse * 0.12 - idx * 0.08;

            if (ring.fill) {
                ctx.fillStyle = ring.fill;
                traceOvoid(ctx, ringRx, ringRy);
                ctx.fill();
            }

            if (ring.stroke) {
                ctx.strokeStyle = ring.stroke;
                ctx.lineWidth = ring.lineWidth;
                traceOvoid(ctx, ringRx, ringRy);
                ctx.stroke();
            }
        });

        ctx.globalAlpha = 0.28 + auraPulse * 0.18;
        ctx.strokeStyle = CALM_TEAL_STOPS[5] || CALM_TEAL_STOPS[4];
        ctx.lineWidth = 1.2;
        traceOvoid(ctx, rx * 1.06, ry * 1.06);
        ctx.stroke();

        ctx.restore();
    }

    function drawPopEffects(ctx, now) {
        popEffects = popEffects.filter((pop) => {
            const age = now - pop.born;
            if (age > POP_MS) return false;
            const t = age / POP_MS;
            const alpha = 1 - easeOutCubic(t);
            const radius = pop.maxR * easeOutCubic(t);
            const rx = radius * 1.12;
            const ry = radius * 0.78;

            ctx.save();
            ctx.translate(pop.x, pop.y);
            ctx.strokeStyle = pop.color;
            ctx.globalAlpha = alpha * 0.65;
            ctx.lineWidth = 2;
            traceOvoid(ctx, rx, ry);
            ctx.stroke();
            ctx.globalAlpha = alpha * 0.35;
            ctx.fillStyle = pop.color;
            traceOvoid(ctx, rx * 0.35, ry * 0.35);
            ctx.fill();
            ctx.restore();
            ctx.globalAlpha = 1;
            return true;
        });
    }

    function updateNodes(now) {
        chaoticNodes = chaoticNodes.slice(0, CHAOTIC_MAX);

        chaoticNodes.forEach((node) => {
            node.framesUntilDirChange -= 1;
            if (node.framesUntilDirChange <= 0) {
                assignChaoticTrajectory(node);
            }

            node.pulsePhase += node.pulseSpeed;
            node.rot += node.rotSpeed + Math.sin(node.pulsePhase * 9.4) * node.rotJitter;
            node.x += node.vx;
            node.y += node.vy;

            const margin = node.size;
            if (node.x < -margin || node.x > width + margin || node.y < margin + 20 || node.y > height - margin) {
                recycleChaoticNode(node);
            }

            if (now < node.flashUntil) {
                node.vx *= 1.02;
                node.vy *= 1.02;
            }
        });

        calmNodes.forEach((node) => {
            if (!node.alive) return;
            node.pulsePhase += node.pulseSpeed;
            node.x += node.vx;
            node.y += node.vy;

            const margin = node.radius;
            if (node.x < margin || node.x > width - margin) node.vx *= -1;
            if (node.y < margin + 20 || node.y > height - margin) node.vy *= -1;
            node.x = clamp(node.x, margin, width - margin);
            node.y = clamp(node.y, margin + 20, height - margin);
        });

        const aliveCalm = calmNodes.filter((n) => n.alive).length;
        if (aliveCalm === 0 && now - lastRespawnAt > 800) {
            spawnCalmNodes();
        }
    }

    function drawFrame(now) {
        if (!aedRunning || !aedCtx || !aedCanvas?.isConnected) {
            clearAedTimers();
            return;
        }

        updateRegulationFilter(now);
        updateNodes(now);

        aedCtx.fillStyle = '#050608';
        aedCtx.fillRect(0, 0, width, height);

        const vignette = aedCtx.createRadialGradient(
            width * 0.5,
            height * 0.5,
            Math.min(width, height) * 0.15,
            width * 0.5,
            height * 0.5,
            Math.max(width, height) * 0.72
        );
        vignette.addColorStop(0, 'rgba(12, 16, 22, 0.15)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        aedCtx.fillStyle = vignette;
        aedCtx.fillRect(0, 0, width, height);

        chaoticNodes.forEach((node) => drawChaoticShape(aedCtx, node, now));
        calmNodes.forEach((node) => drawCalmNode(aedCtx, node));
        drawPopEffects(aedCtx, now);

        aedRafId = requestAnimationFrame(drawFrame);
    }

    function bindEngine(root, options) {
        aedShell = root.querySelector('#aed-shell') || root.querySelector('.aed-shell');
        aedCanvas = root.querySelector('#aed-canvas');

        if (!aedShell || !aedCanvas) return false;
        aedCtx = aedCanvas.getContext('2d');
        if (!aedCtx) return false;

        const startPaused = options && options.paused;

        regulationTarget = 0;
        regulationDisplay = 0;
        regulationAnimStart = 0;
        regulationAnimFrom = 0;
        calmTaps = 0;
        interactionCounter = 0;
        instructionOverlayDismissed = true;
        popEffects = [];
        aedShell.style.filter = 'contrast(1.18) brightness(1)';
        instructionOverlay = null;

        resizeCanvas();
        spawnChaoticNodes();
        spawnCalmNodes();

        aedResizeHandler = () => resizeCanvas();
        window.addEventListener('resize', aedResizeHandler);

        aedPointerHandler = onPointerDown;
        aedCanvas.addEventListener('pointerdown', aedPointerHandler, { passive: false });

        if (startPaused) {
            aedRunning = false;
            /* Draw one static frame behind the onboarding overlay. */
            const now = performance.now();
            aedCtx.fillStyle = '#050608';
            aedCtx.fillRect(0, 0, aedCanvas.width, aedCanvas.height);
            chaoticNodes.forEach((node) => drawChaoticShape(aedCtx, node, now));
            calmNodes.forEach((node) => drawCalmNode(aedCtx, node));
        } else {
            aedRunning = true;
            aedRafId = requestAnimationFrame(drawFrame);
        }
        return true;
    }

    function engageAEDSession() {
        if (aedRunning || !aedCanvas || !aedCtx) return;
        aedRunning = true;
        if (aedRafId) cancelAnimationFrame(aedRafId);
        aedRafId = requestAnimationFrame(drawFrame);
    }

    function mountStandalone() {
        const canvas = document.getElementById('aed-canvas');
        if (!canvas) return false;
        const page = document.getElementById('aed-page') || document.body;
        return bindEngine(page);
    }

    function mountSpaStage(options) {
        injectAedStyles();
        const stage = document.getElementById('protocol-stage');
        if (!stage) return false;

        stage.innerHTML = `
            <div class="aed-root" id="aed-root">
                <main class="aed-shell" id="aed-shell" aria-label="Attention bias modification canvas">
                    <canvas id="aed-canvas" aria-hidden="true"></canvas>
                </main>
            </div>
        `;

        return bindEngine(stage, options);
    }

    function launchAED() {
        stopAED();
        if (typeof showProtocolViewport === 'function') showProtocolViewport();
        if (typeof ensureEmergencyBypassFooter === 'function') ensureEmergencyBypassFooter();

        const inst = document.getElementById('inst');
        if (inst) inst.textContent = 'ʔuʔəy̓ (oo-uh-ee)';

        if (!mountSpaStage({ paused: true })) {
            mountStandalone();
            return;
        }

        const root = document.getElementById('aed-root');
        if (root && typeof window.ProtocolOnboarding !== 'undefined' && window.ProtocolOnboarding.mount) {
            window.ProtocolOnboarding.mount(root, {
                protocolKey: 'aed',
                onStart: engageAEDSession
            });
        } else {
            engageAEDSession();
        }
    }

    window.launchAED = launchAED;
    window.stopAED = stopAED;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.getElementById('aed-canvas') && !document.getElementById('protocol-stage')) {
                mountStandalone();
            }
        });
    } else if (document.getElementById('aed-canvas') && !document.getElementById('protocol-stage')?.querySelector('#aed-canvas')) {
        mountStandalone();
    }
})();
