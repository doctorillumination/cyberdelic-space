/* A small threshold around one running artwork. No background gallery canvases. */
(function () {
  "use strict";
  var player = document.querySelector(".fieldwork-player");
  if (!player) return;
  var frame = player.querySelector("iframe");
  var status = document.querySelector(".fieldwork-status");
  var about = document.querySelector(".fieldwork-about");
  var open = document.querySelector("[data-open-about]");
  var close = document.querySelector("[data-close-about]");
  var fullscreen = document.querySelector("[data-fieldwork-fullscreen]");
  frame.addEventListener("load", function () { if (status) status.hidden = true; });
  // Loading begins only after the status listener is attached.
  frame.src = frame.dataset.src;
  open.hidden = false;
  open.addEventListener("click", function () { about.showModal(); });
  close.addEventListener("click", function () { about.close(); });
  about.addEventListener("close", function () { open.focus(); });
  about.addEventListener("click", function (event) {
    if (event.target !== about) return;
    var bounds = about.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) about.close();
  });
  if (player.requestFullscreen) {
    fullscreen.hidden = false;
    fullscreen.addEventListener("click", async function () {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await player.requestFullscreen();
      } catch (error) { fullscreen.textContent = "Unavailable"; }
    });
    document.addEventListener("fullscreenchange", function () {
      fullscreen.textContent = document.fullscreenElement ? "Exit full" : "Full screen";
      fullscreen.setAttribute("aria-pressed", String(!!document.fullscreenElement));
    });
  }
})();
