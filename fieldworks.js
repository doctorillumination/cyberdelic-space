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
  var interfaceButton = document.querySelector("[data-fieldwork-interface]");
  var clean = false;
  var beforeFullscreen = false;
  var childDocument;
  function setClean(value) {
    clean = value;
    player.classList.toggle("is-artwork-only", clean);
    interfaceButton.setAttribute("aria-pressed", String(clean));
    interfaceButton.setAttribute("aria-label", clean ? "Show interface" : "Hide interface");
    interfaceButton.title = clean ? "Show interface (H)" : "Hide interface (H)";
    if (clean && about.open) about.close();
    if (childDocument) {
      childDocument.documentElement.toggleAttribute("data-fieldwork-artwork-only", clean);
      if (clean) childDocument.querySelectorAll("dialog[open]").forEach(function (dialog) { dialog.close(); });
    }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await player.requestFullscreen();
    } catch (error) { fullscreen.textContent = "Unavailable"; }
  }
  function shortcuts(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ||
        event.target.closest("input,select,textarea,[contenteditable=true]")) return;
    var key = event.key.toLowerCase();
    if (key === "h" || (key === "f" && player.requestFullscreen)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (key === "h") setClean(!clean);
      else toggleFullscreen();
    } else if (key === "escape" && clean && !document.fullscreenElement) {
      setClean(false);
      interfaceButton.focus();
    }
  }
  frame.addEventListener("load", function () {
    if (status) status.hidden = true;
    childDocument = frame.contentDocument;
    if (!childDocument) return;
    // Host presentation is separate from the exact, independently published runtime.
    var style = childDocument.createElement("link");
    style.rel = "stylesheet";
    style.href = new URL("../../fieldworks-immersive.css?v=20261025", location.href).href;
    childDocument.head.appendChild(style);
    childDocument.documentElement.setAttribute("data-fieldwork-slot", player.dataset.fieldwork);
    childDocument.addEventListener("keydown", shortcuts, true);
    childDocument.addEventListener("click", function (event) {
      var button = event.target.closest("#fullscreen,#fullscreen-button,#hide");
      if (!button) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (button.id === "hide") setClean(true);
      else if (player.requestFullscreen) toggleFullscreen();
    }, true);
    setClean(clean);
  });
  interfaceButton.hidden = false;
  interfaceButton.addEventListener("click", function () { setClean(!clean); });
  document.addEventListener("keydown", shortcuts, true);
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
    fullscreen.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", function () {
      var active = !!document.fullscreenElement;
      fullscreen.textContent = active ? "Exit full" : "Full screen";
      fullscreen.setAttribute("aria-pressed", String(active));
      if (active) { beforeFullscreen = clean; setClean(true); }
      else setClean(beforeFullscreen);
    });
  }
})();
