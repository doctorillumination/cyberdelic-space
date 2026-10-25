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
  var viewControls = document.querySelector(".fieldwork-view-controls");
  var announcement = document.querySelector("[data-fieldwork-announcement]");
  var clean = false;
  var beforeFullscreen = false;
  var expanded = false;
  var childDocument;
  var requestFullscreen = player.requestFullscreen || player.webkitRequestFullscreen;
  var exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
  var nativeFullscreen = !!requestFullscreen && document.fullscreenEnabled !== false;
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
  function updateFullscreen(active) {
    if (active !== expanded) {
      if (active) { beforeFullscreen = clean; setClean(true); }
      else setClean(beforeFullscreen);
      expanded = active;
    }
    fullscreen.setAttribute("aria-pressed", String(active));
    var label = active ? (nativeFullscreen ? "Exit full screen" : "Exit expanded view") :
      (nativeFullscreen ? "Enter full screen" : "Expand artwork");
    fullscreen.setAttribute("aria-label", label);
    fullscreen.title = label + " (F)";
  }
  async function toggleFullscreen() {
    try {
      if (!nativeFullscreen) updateFullscreen(!expanded);
      else if (document.fullscreenElement || document.webkitFullscreenElement) await exitFullscreen.call(document);
      else await requestFullscreen.call(player);
    } catch (error) {
      nativeFullscreen = false;
      updateFullscreen(!expanded);
      announcement.textContent = "Browser full screen is unavailable. The artwork is expanded within this page.";
    }
  }
  function shortcuts(event) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ||
        event.target.closest("input,select,textarea,[contenteditable=true]")) return;
    var key = event.key.toLowerCase();
    if (key === "h" || key === "f") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (key === "h") setClean(!clean);
      else toggleFullscreen();
    } else if (key === "escape" && !document.fullscreenElement && !document.webkitFullscreenElement) {
      if (expanded) updateFullscreen(false);
      else if (clean) setClean(false);
      else return;
      interfaceButton.focus();
    }
  }
  frame.addEventListener("load", function () {
    childDocument = frame.contentDocument;
    if (!childDocument) { if (status) status.hidden = true; return; }
    // Host presentation is separate from the exact, independently published runtime.
    var style = childDocument.createElement("link");
    style.rel = "stylesheet";
    style.href = new URL("../../fieldworks-immersive.css?v=20261025-dock", location.href).href;
    style.onload = function () { if (status) status.hidden = true; };
    style.onerror = function () {
      if (status) status.hidden = true;
      announcement.textContent = "The artwork opened, but its viewing styles could not load. Reload this page.";
    };
    childDocument.querySelectorAll("#fullscreen,#fullscreen-button,#hide,#restore,#show").forEach(function (button) { button.hidden = true; });
    childDocument.head.appendChild(style);
    childDocument.documentElement.setAttribute("data-fieldwork-slot", player.dataset.fieldwork);
    childDocument.addEventListener("keydown", shortcuts, true);
    childDocument.addEventListener("click", function (event) {
      var button = event.target.closest("#fullscreen,#fullscreen-button,#hide");
      if (!button) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (button.id === "hide") setClean(true);
      else toggleFullscreen();
    }, true);
    setClean(clean);
  });
  viewControls.hidden = false;
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
  fullscreen.addEventListener("click", toggleFullscreen);
  function fullscreenChanged() { updateFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement)); }
  document.addEventListener("fullscreenchange", fullscreenChanged);
  document.addEventListener("webkitfullscreenchange", fullscreenChanged);
  updateFullscreen(false);
})();
