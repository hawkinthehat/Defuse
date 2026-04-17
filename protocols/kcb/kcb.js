function launchKCB() {
    const stage = document.getElementById('protocol-stage');
    document.getElementById('viewport').classList.remove('hidden');
    
    document.getElementById('inst').innerText = 'ACUTE EMERGENCY OVERRIDE';

    stage.innerHTML = `
        <div class="kcb-overlay">
            <h1 class="kcb-status">SYSTEM RESET</h1>
        </div>
    `;
}
