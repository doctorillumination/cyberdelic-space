/* cyberdelic.space: reading theme.
 *
 * Light is the default on every device. Dark is a choice, made with the
 * header toggle and kept in localStorage so it holds across pages and
 * visits on this device only. Loaded in <head> without defer, so a saved
 * dark preference applies before first paint and the page never flashes.
 */
(function () {
  "use strict";
  var KEY = "cyberdelic-theme";

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (error) { /* private mode */ }
  if (saved === "dark") {
    document.documentElement.dataset.theme = "dark";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var button = document.querySelector(".theme-toggle");
    if (!button) return;
    button.hidden = false;      // useless without scripting, so hidden until now

    function paint() {
      var dark = document.documentElement.dataset.theme === "dark";
      // The label names where the switch goes, not where you are.
      button.textContent = dark ? "Light" : "Dark";
      button.setAttribute("aria-pressed", dark ? "true" : "false");
    }

    button.addEventListener("click", function () {
      var toDark = document.documentElement.dataset.theme !== "dark";
      if (toDark) {
        document.documentElement.dataset.theme = "dark";
      } else {
        delete document.documentElement.dataset.theme;
      }
      try { localStorage.setItem(KEY, toDark ? "dark" : "light"); }
      catch (error) { /* the toggle still works for this page */ }
      paint();
    });

    paint();
  });
})();
