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
    const CALM_TEAL_STOPS = ['#0a3040', '#145568', '#1e7080', '#288c9c', '#34a8b8', '#48c4d4'];

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
        const pattern = Math.random() < 0.5 ? 'trigon' : 'salish_eye';
        const node = {
            kind: 'chaotic',
            pattern,
            x: rand(size, Math.max(size + 1, width - size)),
            y: rand(size + 40, Math.max(size + 41, height - size)),
            size,
            vx: rand(-1.8, 1.8),
            vy: rand(-1.5, 1.5),
            pulsePhase: rand(0, Math.PI * 2),
            rot: rand(0, Math.PI * 2),
            rotSpeed: rand(-0.05, 0.05),
            color: pick(CHAOTIC_COLORS),
            flashUntil: 0
        };

        if (pattern === 'trigon') {
            node.trigonCount = 2 + Math.floor(rand(0, 2));
            node.trigonSpread = rand(0.32, 0.58);
            node.trigonTilt = rand(-0.25, 0.25);
            node.pulseSpeed = rand(0.22, 0.38);
            node.rotSpeed = rand(-0.08, 0.08);
        } else {
            node.eyeTilt = rand(-0.45, 0.45);
            node.pulseSpeed = rand(0.18, 0.34);
        }

        return node;
    }

    function makeCalmNode() {
        const radius = rand(26, 38);
        return {
            kind: 'calm',
            x: rand(radius, Math.max(radius + 1, width - radius)),
            y: rand(radius + 40, Math.max(radius + 41, height - radius)),
            radius,
            baseRadius: radius,
            rx: radius * 1.08,
            ry: radius * 0.72,
            ovoidTilt: rand(-0.18, 0.18),
            vx: rand(-0.35, 0.35),
            vy: rand(-0.28, 0.28),
            driftPhase: rand(0, Math.PI * 2),
            driftSpeed: rand(0.0008, 0.0016),
            pulsePhase: rand(0, Math.PI * 2),
            pulseSpeed: rand(0.008, 0.016),
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
        const rect = aedCanvas.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;

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

    /** Coast Salish trigon: three curved formline sides meeting at sharp points. */
    function traceSalishTrigon(ctx, scale) {
        const s = scale;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(-s * 0.98, -s * 0.12, -s * 0.64, s * 0.5);
        ctx.quadraticCurveTo(0, s * 0.74, s * 0.64, s * 0.5);
        ctx.quadraticCurveTo(s * 0.98, -s * 0.12, 0, -s);
        ctx.closePath();
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

    function drawTrigon(ctx, node) {
        const fastPulse = node.pulsePhase * 3.1;
        const pulse = 0.58 + 0.52 * Math.sin(fastPulse);
        const reach = node.size * pulse;

        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.rotate(node.rot + node.trigonTilt);
        ctx.fillStyle = node.color;
        ctx.strokeStyle = node.color;
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'butt';
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 14 + 10 * Math.sin(fastPulse * 1.4);

        for (let i = 0; i < node.trigonCount; i += 1) {
            const phase = fastPulse + i * node.trigonSpread * Math.PI * 2;
            const microPulse = 0.72 + 0.38 * Math.sin(phase);
            const offset = reach * 0.38 * i;
            const angle = i * node.trigonSpread * Math.PI * 2;

            ctx.save();
            ctx.translate(Math.cos(angle) * offset, Math.sin(angle) * offset);
            ctx.rotate(Math.sin(phase * 0.7) * 0.18);
            ctx.globalAlpha = 0.68 + 0.32 * Math.sin(phase * 1.25);

            traceSalishTrigon(ctx, reach * microPulse);
            ctx.fill();
            ctx.globalAlpha = 0.85 + 0.15 * Math.sin(phase);
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    /** Almond eye with sharp horizontal points, nested ovoid pupil, outer ovoid casing. */
    function traceSalishEyeAlmond(ctx, rx, ry) {
        ctx.beginPath();
        ctx.moveTo(-rx, 0);
        ctx.bezierCurveTo(-rx * 0.42, -ry * 1.15, rx * 0.42, -ry * 1.15, rx, 0);
        ctx.bezierCurveTo(rx * 0.42, ry * 1.15, -rx * 0.42, ry * 1.15, -rx, 0);
        ctx.closePath();
    }

    function drawSalishEye(ctx, node) {
        const flash = 0.4 + 0.6 * Math.abs(Math.sin(node.pulsePhase * 3.4));
        const s = node.size * (0.82 + 0.28 * Math.sin(node.pulsePhase * 2.1));
        const outerRx = s * 1.08;
        const outerRy = s * 0.82;
        const eyeRx = s * 0.72;
        const eyeRy = s * 0.38;

        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.rotate(node.rot + node.eyeTilt);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 12 + 16 * flash;

        ctx.globalAlpha = flash * 0.55;
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 2.8;
        traceOvoid(ctx, outerRx, outerRy);
        ctx.stroke();

        ctx.globalAlpha = flash * 0.35;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(-outerRx * 0.72, -outerRy * 0.35, s * 0.28, Math.PI * 0.15, Math.PI * 0.95);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(outerRx * 0.68, outerRy * 0.42, s * 0.24, Math.PI * 1.05, Math.PI * 1.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-outerRx * 0.15, -outerRy * 0.95);
        ctx.quadraticCurveTo(outerRx * 0.35, -outerRy * 0.55, outerRx * 0.88, -outerRy * 0.12);
        ctx.stroke();

        ctx.globalAlpha = flash * 0.92;
        ctx.fillStyle = node.color;
        traceSalishEyeAlmond(ctx, eyeRx, eyeRy);
        ctx.fill();

        ctx.globalAlpha = flash;
        ctx.fillStyle = '#050608';
        traceOvoid(ctx, eyeRx * 0.32, eyeRy * 0.32);
        ctx.fill();

        ctx.globalAlpha = flash * 0.7;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.1;
        traceSalishEyeAlmond(ctx, eyeRx * 0.96, eyeRy * 0.96);
        ctx.stroke();

        ctx.restore();
    }

    function drawChaoticShape(ctx, node) {
        if (node.pattern === 'salish_eye') {
            drawSalishEye(ctx, node);
        } else {
            drawTrigon(ctx, node);
        }
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

        calmNodes.forEach((node) => drawCalmNode(aedCtx, node));
        chaoticNodes.forEach((node) => drawChaoticShape(aedCtx, node));
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
