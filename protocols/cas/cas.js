function launchCAS() {
    const stage = document.getElementById('protocol-stage');
    document.getElementById('viewport').classList.remove('hidden');
    
    let shapesHTML = '';
    // Generate 10 layers of geometric depth
    for (let i = 0; i < 10; i++) {
        const shapeClass = i % 3 === 0 ? 'cas-circle' : (i % 3 === 1 ? 'cas-square' : 'cas-octagon');
        shapesHTML += `<div class="cas-shape ${shapeClass}" style="animation-delay: ${i * 0.3}s"></div>`;
    }
    
    stage.innerHTML = `<div class="cas-tunnel">${shapesHTML}</div>`;
}
