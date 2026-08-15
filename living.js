/* Render living Markdown publications without interpreting raw HTML. */
(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-markdown]").forEach(function (container) {
      var source = container.querySelector(".markdown-source");
      if (!source || !window.DEWMarkdown) return;
      container.replaceChildren(window.DEWMarkdown.render(source.textContent || ""));
    });
  });
})();
