/**
 * Global viewport shell for protocol modules. Loaded before protocol scripts.
 */
function showProtocolViewport() {
    const vp = document.getElementById('viewport');
    if (!vp) return;
    vp.classList.remove('hidden');
    vp.setAttribute('aria-hidden', 'false');
    vp.style.removeProperty('display');
}

/** Sets status text and shows the protocol viewport (used by CPI and similar modules). */
function openSession(message) {
    showProtocolViewport();
    const inst = document.getElementById('inst');
    if (inst) {
        inst.textContent = message;
        inst.removeAttribute('style');
    }
}

function exitProtocol() {
    if (typeof clearKcbStrobe === 'function') {
        clearKcbStrobe();
    }
    const vp = document.getElementById('viewport');
    if (vp) {
        vp.classList.add('hidden');
        vp.setAttribute('aria-hidden', 'true');
        vp.style.removeProperty('display');
    }
    const stage = document.getElementById('protocol-stage');
    if (stage) {
        stage.innerHTML = '';
        stage.removeAttribute('style');
    }
    const inst = document.getElementById('inst');
    if (inst) {
        inst.textContent = '';
        inst.removeAttribute('style');
    }
}
