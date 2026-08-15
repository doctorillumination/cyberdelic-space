/* Render living Markdown publications and restore their note-level map. */
(function () {
  "use strict";

  function fieldNoteRecords(container) {
    return Array.prototype.slice.call(container.querySelectorAll("h1"))
      .map(function (heading) {
        var match = heading.textContent.trim().match(/^Field Note (\d+)$/i);
        if (!match) return null;
        var number = String(parseInt(match[1], 10)).padStart(2, "0");
        var title = heading.nextElementSibling;
        while (title && title.tagName !== "H2") title = title.nextElementSibling;
        heading.id = "fn-" + number;
        heading.tabIndex = -1;
        heading.classList.add("field-note-anchor");
        return {
          heading: heading,
          id: heading.id,
          label: "FN-" + number,
          title: title ? title.textContent.trim() : "Untitled field note"
        };
      }).filter(Boolean);
  }

  function populateFieldNoteIndexes(records) {
    var indexes = document.querySelectorAll("[data-field-note-index]");
    indexes.forEach(function (list) {
      list.textContent = "";
      records.forEach(function (record) {
        var item = document.createElement("li");
        var link = document.createElement("a");
        var code = document.createElement("code");
        var title = document.createElement("span");
        link.href = "#" + record.id;
        link.dataset.noteTarget = record.id;
        code.textContent = record.label;
        title.textContent = record.title;
        link.appendChild(code);
        link.appendChild(title);
        item.appendChild(link);
        list.appendChild(item);
      });
    });
  }

  function markCurrentFieldNote(id) {
    document.querySelectorAll("[data-note-target]").forEach(function (link) {
      if (link.dataset.noteTarget === id) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function observeFieldNotes(records) {
    if (!("IntersectionObserver" in window) || !records.length) return;
    var observer = new IntersectionObserver(function (entries) {
      var visible = entries.filter(function (entry) { return entry.isIntersecting; })
        .sort(function (first, second) {
          return first.boundingClientRect.top - second.boundingClientRect.top;
        });
      if (visible.length) markCurrentFieldNote(visible[0].target.id);
    }, { rootMargin: "0px 0px -75% 0px", threshold: 0 });
    records.forEach(function (record) { observer.observe(record.heading); });
  }

  function restoreDeepLink(records) {
    var id = window.location.hash.replace(/^#/, "");
    var record = records.find(function (item) { return item.id === id; });
    if (!record) return;
    markCurrentFieldNote(id);
    window.requestAnimationFrame(function () {
      record.heading.scrollIntoView({ block: "start" });
    });
  }

  window.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-markdown]").forEach(function (container) {
      var source = container.querySelector(".markdown-source");
      if (!source || !window.DEWMarkdown) return;
      container.replaceChildren(window.DEWMarkdown.render(source.textContent || ""));
    });
    var reading = document.querySelector(".living-reading .markdown-body, " +
      ".markdown-reading .markdown-body");
    if (!reading) return;
    var records = fieldNoteRecords(reading);
    if (!records.length) return;
    populateFieldNoteIndexes(records);
    observeFieldNotes(records);
    restoreDeepLink(records);
    window.addEventListener("hashchange", function () {
      markCurrentFieldNote(window.location.hash.replace(/^#/, ""));
    });
  });
})();
