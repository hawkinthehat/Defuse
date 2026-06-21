/**
 * AED — ʔuʔəy̓ (Autonomic Exposure Desensitization)
 * Attention Bias Modification: ignore chaotic nodes, tap slow calm nodes to down-regulate arousal.
 */
(function () {
    const DIM_DURATION_MS = 60000;
    const MAX_DPR = 2;
    const CHAOTIC_MIN = 4;
    const CHAOTIC_MAX = 5;
    const CALM_MIN = 3;
    const CALM_MAX = 4;
    const CALM_RESPAWN_MS = 4200;
    const POP_MS = 520;

    const CHAOTIC_COLORS = ['#ff2244', '#ff8800', '#ffffff', '#00e5ff', '#ff44aa'];
    const CALM_COLORS = ['#4a8fb8', '#5a9a7a', '#6ba8c4', '#4d9a82'];

    let aedRunning = false;
    let aedRafId = 0;
    let aedCanvas = null;
    let aedCtx = null;
    let aedShell = null;
    let aedInst = null;
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
                display: block;
                width: 100%;
                height: 100%;
                touch-action: none;
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
        aedInst = null;
        chaoticNodes = [];
        calmNodes = [];
        popEffects = [];
        regulationTarget = 0;
        regulationDisplay = 0;
        calmTaps = 0;
    }

    function setInstruction(text) {
        if (aedInst) aedInst.textContent = text;
        const globalInst = document.getElementById('inst');
        if (globalInst && !aedInst?.id) globalInst.textContent = text;
    }

    function resizeCanvas() {
        if (!aedCanvas || !aedCtx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const rect = aedCanvas.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        aedCanvas.width = Math.floor(width * dpr);
        aedCanvas.height = Math.floor(height * dpr);
        aedCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function makeChaoticNode() {
        const size = rand(22, 38);
        return {
            kind: 'chaotic',
            x: rand(size, Math.max(size + 1, width - size)),
            y: rand(size + 40, Math.max(size + 41, height - size)),
            size,
            vx: rand(-1.8, 1.8),
            vy: rand(-1.5, 1.5),
            pulsePhase: rand(0, Math.PI * 2),
            pulseSpeed: rand(0.22, 0.38),
            rot: rand(0, Math.PI * 2),
            rotSpeed: rand(-0.05, 0.05),
            color: pick(CHAOTIC_COLORS),
            wedgeBias: rand(0.55, 0.78),
            flashUntil: 0
        };
    }

    function makeCalmNode() {
        const radius = rand(26, 38);
        return {
            kind: 'calm',
            x: rand(radius, Math.max(radius + 1, width - radius)),
            y: rand(radius + 40, Math.max(radius + 41, height - radius)),
            radius,
            baseRadius: radius,
            vx: rand(-0.35, 0.35),
            vy: rand(-0.28, 0.28),
            driftPhase: rand(0, Math.PI * 2),
            driftSpeed: rand(0.0008, 0.0016),
            pulsePhase: rand(0, Math.PI * 2),
            pulseSpeed: rand(0.008, 0.016),
            color: pick(CALM_COLORS),
            crescentFacing: Math.random() < 0.5 ? -1 : 1,
            alive: true
        };
    }

    function spawnChaoticNodes() {
        const count = CHAOTIC_MIN + Math.floor(Math.random() * (CHAOTIC_MAX - CHAOTIC_MIN + 1));
        chaoticNodes = [];
        for (let i = 0; i < count; i += 1) {
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
        regulationAnimFrom = regulationDisplay;
        regulationTarget = clamp(regulationTarget + 0.22, 0, 1);
        regulationAnimStart = performance.now();
        if (regulationTarget >= 0.95) {
            setInstruction('ʔuʔəy̓ · REGULATION HOLD · BREATHE WITH THE DIM');
        } else {
            setInstruction('ʔuʔəy̓ · CALM NODE · SCREEN SOFTENING');
        }
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
            const hitR = node.radius * 1.15;
            if (dx * dx + dy * dy <= hitR * hitR) return node;
        }
        return null;
    }

    function hitTestChaotic(px, py) {
        for (let i = 0; i < chaoticNodes.length; i += 1) {
            const node = chaoticNodes[i];
            const pulse = 0.72 + 0.38 * Math.sin(node.pulsePhase);
            const half = node.size * pulse;
            const dx = px - node.x;
            const dy = py - node.y;
            if (Math.sqrt(dx * dx + dy * dy) <= half * 1.05) {
                return node;
            }
        }
        return null;
    }

    /**
     * Coast Salish Trigon — sharp three-cornered wedge (hostile node motif).
     */
    function trigonPath(ctx, half, wedgeBias) {
        const tipY = -half;
        const baseLeftX = -half * wedgeBias;
        const baseRightX = half * wedgeBias;
        const baseY = half * 0.92;
        ctx.moveTo(0, tipY);
        ctx.lineTo(baseRightX, baseY);
        ctx.lineTo(baseLeftX, baseY);
        ctx.closePath();
    }

    /**
     * Coast Salish Crescent — soft curved moon arc (calm node motif).
     */
    function crescentPath(ctx, r, facing) {
        const outerR = r;
        const innerR = r * 0.72;
        const offsetX = r * 0.38 * facing;
        ctx.arc(0, 0, outerR, 0.15 * Math.PI, 1.85 * Math.PI, false);
        ctx.arc(offsetX, 0, innerR, 1.85 * Math.PI, 0.15 * Math.PI, true);
        ctx.closePath();
    }

    function onPointerDown(event) {
        if (!aedRunning || !aedCanvas) return;
        event.preventDefault();
        const rect = aedCanvas.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;

        const calmHit = hitTestCalm(px, py);
        if (calmHit) {
            calmHit.alive = false;
            addPopEffect(calmHit.x, calmHit.y, calmHit.color);
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

    function drawTrigonNode(ctx, node) {
        const pulse = 0.68 + 0.42 * Math.sin(node.pulsePhase);
        const half = node.size * pulse;
        const highFreq = 0.78 + 0.22 * Math.sin(node.pulsePhase * 2.6);
        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.rotate(node.rot);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = highFreq;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 16 + 8 * Math.sin(node.pulsePhase * 3.1);

        ctx.beginPath();
        trigonPath(ctx, half, node.wedgeBias);
        ctx.fill();

        ctx.globalAlpha = highFreq * 0.45;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
    }

    function drawCrescentNode(ctx, node) {
        if (!node.alive) return;
        const breathe = 0.94 + 0.06 * Math.sin(node.pulsePhase);
        const r = node.baseRadius * breathe;
        const facing = node.crescentFacing || 1;
        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.rotate(node.driftPhase * 0.04);

        const grad = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.4);
        grad.addColorStop(0, `${node.color}dd`);
        grad.addColorStop(0.5, `${node.color}88`);
        grad.addColorStop(1, `${node.color}00`);
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.88;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 22;
        ctx.beginPath();
        crescentPath(ctx, r, facing);
        ctx.fill();

        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = `${node.color}aa`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        crescentPath(ctx, r * 0.92, facing);
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
            ctx.strokeStyle = pop.color;
            ctx.globalAlpha = alpha * 0.65;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pop.x, pop.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = alpha * 0.35;
            ctx.fillStyle = pop.color;
            ctx.beginPath();
            ctx.arc(pop.x, pop.y, radius * 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            return true;
        });
    }

    function updateNodes(now) {
        chaoticNodes.forEach((node) => {
            node.pulsePhase += node.pulseSpeed;
            node.rot += node.rotSpeed;
            node.x += node.vx;
            node.y += node.vy;

            const margin = node.size;
            if (node.x < margin || node.x > width - margin) node.vx *= -1;
            if (node.y < margin + 20 || node.y > height - margin) node.vy *= -1;
            node.x = clamp(node.x, margin, width - margin);
            node.y = clamp(node.y, margin + 20, height - margin);

            if (now < node.flashUntil) {
                node.vx *= 1.02;
                node.vy *= 1.02;
            }
        });

        calmNodes.forEach((node) => {
            if (!node.alive) return;
            node.pulsePhase += node.pulseSpeed;
            node.driftPhase += node.driftSpeed * 1000;
            node.x += node.vx + Math.sin(node.driftPhase) * 0.08;
            node.y += node.vy + Math.cos(node.driftPhase * 0.9) * 0.06;

            const margin = node.radius;
            if (node.x < margin || node.x > width - margin) node.vx *= -1;
            if (node.y < margin + 20 || node.y > height - margin) node.vy *= -1;
            node.x = clamp(node.x, margin, width - margin);
            node.y = clamp(node.y, margin + 20, height - margin);
        });

        const aliveCalm = calmNodes.filter((n) => n.alive).length;
        if (aliveCalm === 0 && now - lastRespawnAt > 800) {
            spawnCalmNodes();
            setInstruction('ʔuʔəy̓ · IGNORE NOISE · TAP SLOW CALM NODES');
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

        calmNodes.forEach((node) => drawCrescentNode(aedCtx, node));
        chaoticNodes.forEach((node) => drawTrigonNode(aedCtx, node));
        drawPopEffects(aedCtx, now);

        aedRafId = requestAnimationFrame(drawFrame);
    }

    function bindEngine(root) {
        aedShell = root.querySelector('#aed-shell') || root.querySelector('.aed-shell');
        aedCanvas = root.querySelector('#aed-canvas');
        aedInst = root.querySelector('#aed-inst');

        if (!aedShell || !aedCanvas) return false;
        aedCtx = aedCanvas.getContext('2d');
        if (!aedCtx) return false;

        regulationTarget = 0;
        regulationDisplay = 0;
        regulationAnimStart = 0;
        regulationAnimFrom = 0;
        calmTaps = 0;
        popEffects = [];
        aedShell.style.filter = 'contrast(1.18) brightness(1)';

        resizeCanvas();
        spawnChaoticNodes();
        spawnCalmNodes();

        aedResizeHandler = () => resizeCanvas();
        window.addEventListener('resize', aedResizeHandler);

        aedPointerHandler = onPointerDown;
        aedCanvas.addEventListener('pointerdown', aedPointerHandler, { passive: false });

        aedRunning = true;
        setInstruction('ʔuʔəy̓ · IGNORE NOISE · TAP SLOW CALM NODES');
        aedRafId = requestAnimationFrame(drawFrame);
        return true;
    }

    function mountStandalone() {
        const canvas = document.getElementById('aed-canvas');
        if (!canvas) return false;
        const page = document.getElementById('aed-page') || document.body;
        return bindEngine(page);
    }

    function mountSpaStage() {
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

        return bindEngine(stage);
    }

    function launchAED() {
        stopAED();
        if (typeof showProtocolViewport === 'function') showProtocolViewport();
        if (typeof ensureEmergencyBypassFooter === 'function') ensureEmergencyBypassFooter();

        const inst = document.getElementById('inst');
        if (inst) inst.textContent = 'ʔuʔəy̓ · IGNORE NOISE · TAP SLOW CALM NODES';

        if (!mountSpaStage()) mountStandalone();
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
