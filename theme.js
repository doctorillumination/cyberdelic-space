/* cyberdelic.space: reading theme.
 *
 * Psychedelic is the default on every device. Light and Dark are deliberate
 * choices. The selected atmosphere is kept in localStorage so it holds across
 * pages and visits on this device only. Loaded in <head> without defer, so a
 * saved preference applies before first paint and the page never flashes.
 */
(function () {
  "use strict";
  var KEY = "cyberdelic-theme";
  var DEFAULT = "psychedelic";
  var MODES = ["light", "dark", "psychedelic"];
  var LABELS = {
    light: "Light",
    dark: "Dark",
    psychedelic: "Psychedelic"
  };

  function currentMode() {
    var value = document.documentElement.dataset.theme || DEFAULT;
    return MODES.indexOf(value) === -1 ? DEFAULT : value;
  }

  function apply(mode) {
    if (mode === "light") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = mode;
    }
  }

  var saved = DEFAULT;
  try { saved = localStorage.getItem(KEY); } catch (error) { /* private mode */ }
  apply(MODES.indexOf(saved) === -1 ? DEFAULT : saved);

  document.addEventListener("DOMContentLoaded", function () {
    var button = document.querySelector(".theme-toggle");
    if (!button) return;
    button.hidden = false;

    function paint() {
      var mode = currentMode();
      var next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      button.textContent = LABELS[mode];
      button.setAttribute(
        "aria-label",
        "Appearance: " + LABELS[mode] + ". Activate for " + LABELS[next] + "."
      );
      button.setAttribute("title", "Next appearance: " + LABELS[next]);
    }

    button.addEventListener("click", function () {
      var mode = currentMode();
      var next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      apply(next);
      try { localStorage.setItem(KEY, next); }
      catch (error) { /* the choice still works for this page */ }
      paint();
    });

    paint();
  });
})();
