/* Render living Markdown publications without interpreting raw HTML. */
(function () {
  "use strict";

  function fieldNoteNumber(value) {
    var match = String(value || "").trim().match(/^Field Note (\d{1,2})$/i);
    return match ? match[1].padStart(2, "0") : null;
  }

  function enhanceFieldNotesChrome(index) {
    var header = document.querySelector("body > header.site");
    var crumbLink = document.querySelector(".field-notes-main .crumb a");
    if (!header || !index) return;

    document.body.classList.add("field-notes-page");

    var siteNav = header.querySelector("nav[aria-label='Sections']");
    if (siteNav && crumbLink && !siteNav.querySelector(".field-notes-return")) {
      var returnLink = crumbLink.cloneNode(true);
      returnLink.className = "field-notes-return";
      returnLink.setAttribute("aria-label", "Back to the CyberdelicOS project");
      siteNav.prepend(returnLink);
    }

    function syncHeaderHeight() {
      var height = Math.ceil(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty(
        "--field-site-header-height", height + "px"
      );
    }

    syncHeaderHeight();
    window.requestAnimationFrame(syncHeaderHeight);
    window.addEventListener("resize", syncHeaderHeight);
    if ("ResizeObserver" in window) {
      var observer = new ResizeObserver(syncHeaderHeight);
      observer.observe(header);
      header._fieldNotesResizeObserver = observer;
    }
  }

  function populateFieldNoteIndex(index) {
    var list = index && index.querySelector(".field-note-list");
    var source = index && index.dataset.fieldNoteSource;
    if (!list || list.children.length || !source) return Promise.resolve();

    return fetch(source).then(function (response) {
      if (!response.ok) throw new Error("Field Notes index unavailable");
      return response.json();
    }).then(function (data) {
      if (!data || !Array.isArray(data.items)) {
        throw new Error("Field Notes index is invalid");
      }

      var fragment = document.createDocumentFragment();
      data.items.forEach(function (note) {
        var item = document.createElement("li");
        var link = document.createElement("a");
        var code = document.createElement("span");
        var label = document.createElement("span");
        var searchParts = [note.id, note.title, note.summary]
          .concat(note.themes || [], note.concepts || []);

        item.dataset.note = "";
        item.dataset.search = searchParts.join(" ").toLowerCase();
        link.href = "#" + String(note.id || "").toLowerCase();
        code.className = "field-note-code";
        code.textContent = note.id;
        label.className = "field-note-label";
        label.textContent = note.title;
        link.append(code, label);
        item.append(link);
        fragment.append(item);
      });

      list.replaceChildren(fragment);
      list.removeAttribute("aria-busy");
      var status = index.querySelector("[data-field-note-count]");
      if (status) status.textContent = data.items.length + " notes";
    }).catch(function () {
      list.removeAttribute("aria-busy");
      var status = index.querySelector("[data-field-note-count]");
      if (status) status.textContent = "Index unavailable";
    });
  }

  function enhanceFieldNotes(container) {
    var index = document.querySelector("[data-field-note-index]");
    var body = container.querySelector(".markdown-body");
    if (!index || !body || index.dataset.enhanced === "true") return;

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
    index.dataset.enhanced = "true";

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
      var siteHeader = document.querySelector("body > header.site");
      var headerBottom = siteHeader
        ? siteHeader.getBoundingClientRect().bottom
        : 0;
      var threshold = Math.max(
        headerBottom + 16,
        Math.min(180, window.innerHeight * 0.24)
      );
      if (window.matchMedia("(max-width: 52rem)").matches) {
        var indexRect = index.getBoundingClientRect();
        if (indexRect.top <= headerBottom + 2) {
          threshold = Math.max(threshold, indexRect.bottom + 16);
        }
      }
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
    });

    var index = document.querySelector("[data-field-note-index]");
    if (!index) return;
    enhanceFieldNotesChrome(index);
    populateFieldNoteIndex(index).then(function () {
      enhanceFieldNotes(document);
    });
  });
})();
