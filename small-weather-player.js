/* Pause rain and its sound while the introduction is open. */
(() => {
  const player = document.querySelector('[data-fieldwork="small-weather"]');
  const frame = player.querySelector('iframe');
  const about = player.querySelector('.fieldwork-about');
  const styleURL = new URL('small-weather-player.css', document.currentScript.src);
  let resume = false;

  function syncAbout() {
    const study = frame.contentWindow?.weatherStudy;
    if (!study) return;
    if (about.open) {
      resume = !frame.contentDocument.body.classList.contains('paused');
      study.pause(true);
    } else if (resume) {
      study.pause(false);
      resume = false;
    }
  }

  player.querySelector('[data-open-about]').addEventListener('click', syncAbout);
  about.addEventListener('close', syncAbout);
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    const style = doc.createElement('link');
    style.rel = 'stylesheet';
    style.href = styleURL.href;
    doc.head.append(style);
    if (about.open) syncAbout();
  });
})();
