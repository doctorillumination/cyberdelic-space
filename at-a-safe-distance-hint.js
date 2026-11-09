/* A centered opening, retired by the viewer's first deliberate drag. */
(function () {
  const frame = document.querySelector('[data-fieldwork="at-a-safe-distance"] iframe');
  function attach(canvas, host) {
    if (!canvas || host.querySelector('[data-instruction]')) return;
    const hint = host.querySelector('#gesture-hint') || document.createElement('p');
    hint.classList.add('fieldwork-drag-hint');
    hint.dataset.instruction = 'drag';
    hint.setAttribute('aria-hidden', 'true');
    const action = document.createElement('span');
    action.className = 'instruction-action';
    action.textContent = matchMedia('(pointer: coarse)').matches ? 'Touch and drag' : 'Click and drag';
    const detail = document.createElement('span');
    detail.className = 'instruction-detail';
    detail.textContent = 'to look around';
    hint.replaceChildren(action, detail);
    if (!hint.parentNode) host.appendChild(hint);
    let start = null;
    let revealQueued = false;
    const ready = () => {
      if (revealQueued || canvas.dataset.ready !== 'true') return;
      revealQueued = true;
      observer.disconnect();
      // Two painted frames guarantee an entrance even when the views are cached.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (hint.dataset.dismissed !== 'true') hint.dataset.ready = 'true';
      }));
    };
    const observer = new MutationObserver(ready);
    observer.observe(canvas, {attributes: true, attributeFilter: ['data-ready']});
    ready();
    function down(event) {
      if (event.button === 0 && canvas.dataset.ready === 'true') start = {id: event.pointerId, x: event.clientX, y: event.clientY};
    }
    function move(event) {
      if (!start || event.pointerId !== start.id || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return;
      hint.dataset.dismissed = 'true';
      observer.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', release);
      canvas.removeEventListener('pointercancel', release);
    }
    function release() { start = null; }
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }
  if (frame) {
    const connect = () => attach(frame.contentDocument?.querySelector('#scene'), document.querySelector('.fieldwork-player'));
    frame.addEventListener('load', connect);
    connect();
  } else attach(document.querySelector('#scene'), document.querySelector('#artwork'));
})();
