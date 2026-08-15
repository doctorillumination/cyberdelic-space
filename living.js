/* Render living Markdown publications without interpreting raw HTML. */
(function () {
  "use strict";

  function fieldNoteNumber(value) {
    var match = String(value || "").trim().match(/^Field Note (\d{1,2})$/i);
    return match ? match[1].padStart(2, "0") : null;
  }

  function enhanceFieldNotes(container) {
    var index = document.querySelector("[data-field-note-index]");
    var body = container.querySelector(".markdown-body");
    if (!index || !body) return;

    var headings = Array.prototype.slice.call(body.querySelectorAll("h1"))
      .filter(function (heading) {
        var number = fieldNoteNumber(heading.textContent);
        if (!number) return false;
        heading.id = "fn-" + number;
        heading.classList.add("field-note-heading");
        heading.setAttribute("tabindex", "-1");
        var title = heading.nextElementSibling;
        if (title && title.tagName === "H2") {
          title.classList.add("field-note-title");
        }
        return true;
      });
    if (!headings.length) return;

    var links = Array.prototype.slice.call(index.querySelectorAll("a[href^='#fn-']"));
    var itemById = {};
    links.forEach(function (link) {
      itemById[link.getAttribute("href").slice(1)] = link;
    });

    var currentId = "";
    function setCurrent(id) {
      if (!id || id === currentId) return;
      currentId = id;
      links.forEach(function (link) {
        var selected = link.getAttribute("href") === "#" + id;
        if (selected) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
      var active = itemById[id];
      if (active && window.innerWidth <= 832) {
        var scroller = active.closest(".field-note-list");
        if (scroller) {
          var left = active.parentElement.offsetLeft -
            (scroller.clientWidth - active.parentElement.offsetWidth) / 2;
          scroller.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
        }
      }
    }

    var scheduled = false;
    function locateCurrent() {
      scheduled = false;
      var threshold = Math.min(180, window.innerHeight * 0.24);
      var current = headings[0];
      headings.forEach(function (heading) {
        if (heading.getBoundingClientRect().top <= threshold) current = heading;
      });
      if (window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 2) {
        current = headings[headings.length - 1];
      }
      setCurrent(current.id);
    }
    function scheduleLocation() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(locateCurrent);
    }

    window.addEventListener("scroll", scheduleLocation, { passive: true });
    window.addEventListener("resize", scheduleLocation);
    links.forEach(function (link) {
      link.addEventListener("click", function () {
        setCurrent(link.getAttribute("href").slice(1));
      });
    });

    var input = index.querySelector("[data-field-note-filter]");
    var status = index.querySelector("[data-field-note-count]");
    var items = Array.prototype.slice.call(index.querySelectorAll("[data-note]"));
    if (input) {
      input.addEventListener("input", function () {
        var query = input.value.trim().toLowerCase();
        var visible = 0;
        items.forEach(function (item) {
          var match = !query || (item.dataset.search || "").indexOf(query) !== -1;
          item.hidden = !match;
          if (match) visible += 1;
        });
        if (status) {
          status.textContent = query
            ? visible + (visible === 1 ? " note found" : " notes found")
            : items.length + " notes";
        }
      });
    }

    var target = location.hash && body.querySelector(location.hash);
    if (target) {
      var revealTarget = function () {
        target.scrollIntoView();
        target.focus({ preventScroll: true });
        setCurrent(target.id);
      };
      var settleTarget = function () {
        revealTarget();
        window.setTimeout(revealTarget, 500);
      };
      if (document.readyState === "complete") {
        window.setTimeout(settleTarget, 0);
      } else {
        window.addEventListener("load", function () {
          window.setTimeout(settleTarget, 0);
        }, { once: true });
      }
    } else {
      locateCurrent();
    }
  }

  window.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-markdown]").forEach(function (container) {
      var source = container.querySelector(".markdown-source");
      if (!source || !window.DEWMarkdown) return;
      container.replaceChildren(window.DEWMarkdown.render(source.textContent || ""));
      enhanceFieldNotes(container);
    });
  });
})();
