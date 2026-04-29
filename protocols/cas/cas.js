/**
 * CAS — high-performance OKN stream: centripetal motion, 1.5s spawn cadence,
 * healing-blue palette per shape. Canvas + rAF for steady frame pacing.
 */
(function () {
    const SPAWN_MS = 1500;
    const MOTION_MS = 2200;
    const MAX_DPR = 2;

    const SHAPE_ORDER = ['circle', 'triangle', 'square', 'pentagon', 'hexagon', 'octagon'];

    /** Healing blues: distinct per geometry */
    const SHAPE_STYLE = {
        circle: { stroke: '#00d2d3', fill: 'rgba(0, 210, 211, 0.22)' },
        triangle: { stroke: '#00cec9', fill: 'rgba(0, 206, 201, 0.2)' },
        square: { stroke: '#74b9ff', fill: 'rgba(116, 185, 255, 0.2)' },
        pentagon: { stroke: '#81ecec', fill: 'rgba(129, 236, 236, 0.22)' },
        hexagon: { stroke: '#5dade2', fill: 'rgba(93, 173, 226, 0.2)' },
        octagon: { stroke: '#0984e3', fill: 'rgba(9, 132, 227, 0.2)' }
    };

    let casRunning = false;
    let casRafId = 0;
    let casSpawnId = 0;
    let casCanvas = null;
    let casCtx = null;
    let casCssW = 0;
    let casCssH = 0;
    let casEntities = [];
    let casSpawnSeq = 0;
    let casEdgeSeq = 0;
    let casResizeHandler = null;

    function stopCAS() {
        casRunning = false;
        if (casRafId) {
            cancelAnimationFrame(casRafId);
            casRafId = 0;
        }
        if (casSpawnId) {
            clearInterval(casSpawnId);
            casSpawnId = 0;
        }
        if (casResizeHandler) {
            window.removeEventListener('resize', casResizeHandler);
            casResizeHandler = null;
        }
        casEntities = [];
        casCanvas = null;
        casCtx = null;
    }

    function fitCanvas(canvas) {
        const stage = document.getElementById('protocol-stage');
        const root = stage && stage.querySelector('.cas-root');
        const r = (root || canvas.parentElement || canvas).getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        casCssW = Math.max(1, Math.floor(r.width));
        casCssH = Math.max(1, Math.floor(r.height));
        canvas.width = Math.floor(casCssW * dpr);
        canvas.height = Math.floor(casCssH * dpr);
        canvas.style.width = `${casCssW}px`;
        canvas.style.height = `${casCssH}px`;
        const ctx = canvas.getContext('2d', { alpha: true });
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    function edgeStart(cx, cy, edge) {
        const m = Math.max(casCssW, casCssH) * 0.14;
        switch (edge % 4) {
            case 0:
                return { sx: cx, sy: -m };
            case 1:
                return { sx: casCssW + m, sy: cy };
            case 2:
                return { sx: cx, sy: casCssH + m };
            default:
                return { sx: -m, sy: cy };
        }
    }

    function spawnEntity() {
        if (!casRunning || !casCtx || casCssW < 8 || casCssH < 8) return;
        const cx = casCssW * 0.5;
        const cy = casCssH * 0.5;
        const edge = casEdgeSeq++ % 4;
        const { sx, sy } = edgeStart(cx, cy, edge);
        const type = SHAPE_ORDER[casSpawnSeq % SHAPE_ORDER.length];
        casSpawnSeq += 1;
        const m = Math.min(casCssW, casCssH);
        casEntities.push({
            type,
            t0: performance.now(),
            dur: MOTION_MS,
            sx,
            sy,
            cx,
            cy,
            r0: m * 0.4,
            r1: m * 0.052
        });
        const cap = 10;
        while (casEntities.length > cap) casEntities.shift();
    }

    function regularPolygonPath(ctx, x, y, r, n, rot0) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const ang = rot0 + (i * 2 * Math.PI) / n - Math.PI / 2;
            const px = x + r * Math.cos(ang);
            const py = y + r * Math.sin(ang);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    function drawShape(ctx, type, x, y, r) {
        const st = SHAPE_STYLE[type] || SHAPE_STYLE.circle;
        const lw = Math.max(2.2, Math.min(8, r * 0.09));

        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = st.stroke;
        ctx.fillStyle = st.fill;
        ctx.lineWidth = lw;

        switch (type) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                break;
            case 'triangle':
                regularPolygonPath(ctx, x, y, r, 3, 0);
                ctx.fill();
                ctx.stroke();
                break;
            case 'square':
                regularPolygonPath(ctx, x, y, r, 4, Math.PI / 4);
                ctx.fill();
                ctx.stroke();
                break;
            case 'pentagon':
                regularPolygonPath(ctx, x, y, r, 5, 0);
                ctx.fill();
                ctx.stroke();
                break;
            case 'hexagon':
                regularPolygonPath(ctx, x, y, r, 6, 0);
                ctx.fill();
                ctx.stroke();
                break;
            case 'octagon':
                regularPolygonPath(ctx, x, y, r, 8, 0);
                ctx.fill();
                ctx.stroke();
                break;
            default:
                ctx.beginPath();
                ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
        }
        ctx.restore();
    }

    function tick(now) {
        if (!casRunning || !casCtx || !casCanvas?.isConnected) {
            casRafId = 0;
            return;
        }

        const ctx = casCtx;
        ctx.clearRect(0, 0, casCssW, casCssH);

        casEntities = casEntities.filter((e) => {
            const u = (now - e.t0) / e.dur;
            if (u >= 1) return false;
            const k = u;
            const x = e.sx + (e.cx - e.sx) * k;
            const y = e.sy + (e.cy - e.sy) * k;
            const rad = e.r0 + (e.r1 - e.r0) * k;
            drawShape(ctx, e.type, x, y, rad);
            return true;
        });

        casRafId = requestAnimationFrame(tick);
    }

    function onResize() {
        if (!casCanvas || !casRunning) return;
        casCtx = fitCanvas(casCanvas);
        casEntities = [];
    }

    function completeCASSession() {
        stopCAS();
        exitProtocol();
    }

    function launchCAS() {
        stopCAS();
        casRunning = true;
        casSpawnSeq = 0;
        casEdgeSeq = 0;

        showProtocolViewport();
        const inst = document.getElementById('inst');
        if (inst) inst.textContent = 'OKN STREAM · TRACK SHAPES TO CENTER';

        const stage = document.getElementById('protocol-stage');
        if (!stage) return;

        stage.innerHTML = `
            <div class="cas-root" role="application" aria-label="Optokinetic shape stream">
                <canvas id="cas-canvas" class="cas-canvas" aria-hidden="true"></canvas>
                <div class="cas-hud">
                    <button type="button" class="cas-complete-btn" id="cas-session-complete">Session Complete</button>
                </div>
            </div>
        `;

        casCanvas = document.getElementById('cas-canvas');
        const btn = document.getElementById('cas-session-complete');
        if (!casCanvas) return;

        casCtx = fitCanvas(casCanvas);
        casResizeHandler = onResize;
        window.addEventListener('resize', casResizeHandler);

        if (btn) {
            btn.addEventListener('click', completeCASSession);
        }

        spawnEntity();
        casSpawnId = window.setInterval(spawnEntity, SPAWN_MS);

        casRafId = requestAnimationFrame(tick);
    }

    window.launchCAS = launchCAS;
    window.stopCAS = stopCAS;
})();
