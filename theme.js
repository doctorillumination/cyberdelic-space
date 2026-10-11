/* cyberdelic.space: reading theme.
 *
 * Psychedelic is the default on every device. Light and Dark are deliberate
 * choices. The selected atmosphere is kept in localStorage so it holds across
 * pages and visits on this device only. Loaded in <head> without defer, so a
 * saved preference applies before first paint and the page never flashes.
 */
(function () {
  "use strict";
  var assetBase = document.currentScript && document.currentScript.src;
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
    document.documentElement.dataset.theme = mode;
  }

  var saved = DEFAULT;
  try { saved = localStorage.getItem(KEY); } catch (error) { /* private mode */ }
  apply(MODES.indexOf(saved) === -1 ? DEFAULT : saved);

  document.addEventListener("DOMContentLoaded", function () {
    // Load the optional reader for the supported written publication families.
    var article = document.querySelector("article.living-page");
    var kind = article && article.querySelector(".shelf-kind");
    var title = article && article.querySelector(".living-head h1");
    var eligible = article && (article.classList.contains("correspondence-page") ||
      (kind && /field notes|builder notes|correspondence|artifacts|instruments/i.test(kind.textContent)) ||
      (title && /field notes|builder notes|correspondence|artifacts|instruments/i.test(title.textContent)));
    if (eligible && assetBase && !document.querySelector("script[data-listen-asset]")) {
      var styles = document.createElement("link");
      styles.rel = "stylesheet";
      styles.href = new URL("read-aloud.css?v=2-lewis", assetBase).href;
      document.head.appendChild(styles);
      var reader = document.createElement("script");
      reader.src = new URL("read-aloud.js?v=2-lewis", assetBase).href;
      reader.dataset.listenAsset = "";
      document.head.appendChild(reader);
    }
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
