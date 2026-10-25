/* Recorded glimpses, never four simultaneous artwork renderers. */
(function () {
  "use strict";
  var videos = Array.from(document.querySelectorAll("video[data-preview-src]"));
  var controls = document.querySelector(".fieldworks-preview-controls");
  var button = controls && controls.querySelector("button");
  if (!videos.length || !button || !window.IntersectionObserver) return;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var connection = navigator.connection;
  var paused = reduced.matches || !!(connection && connection.saveData);
  var visible = new Set();
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting && entry.intersectionRatio >= .15) visible.add(entry.target);
      else visible.delete(entry.target);
    });
    sync();
  }, { threshold: [0, .15] });
  function updateButton() {
    button.textContent = paused ? "Play previews" : "Pause previews";
    button.setAttribute("aria-pressed", String(!paused));
  }
  function sync() {
    videos.forEach(function (video) {
      if (paused || document.hidden || !visible.has(video) || video.dataset.failed) {
        video.pause();
        return;
      }
      if (!video.src) video.src = video.dataset.previewSrc;
      video.play().catch(function () {
        video.classList.remove("is-playing");
        paused = true;
        updateButton();
        videos.forEach(function (other) { other.pause(); });
      });
    });
  }
  videos.forEach(function (video) {
    video.muted = true;
    video.addEventListener("playing", function () { video.classList.add("is-playing"); });
    video.addEventListener("error", function () {
      video.dataset.failed = "true";
      video.classList.remove("is-playing");
    });
    observer.observe(video);
  });
  button.addEventListener("click", function () { paused = !paused; updateButton(); sync(); });
  reduced.addEventListener("change", function () { paused = reduced.matches; updateButton(); sync(); });
  if (connection && connection.addEventListener) connection.addEventListener("change", function () {
    if (connection.saveData) { paused = true; updateButton(); sync(); }
  });
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", function () { videos.forEach(function (video) { video.pause(); }); });
  window.addEventListener("pageshow", sync);
  controls.hidden = false;
  updateButton();
})();
