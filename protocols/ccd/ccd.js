function launchCCD() {
    const stage = document.getElementById('protocol-stage');
    document.getElementById('viewport').classList.remove('hidden');
    
    stage.innerHTML = '<h1 class="shatter-word">ANXIETY</h1>';
    
    // Auto-exit after animation
    setTimeout(() => {
        exitProtocol();
    }, 1200);
}
