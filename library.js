/* cyberdelic.space: filtering the library.
 *
 * The whole collection is already in the page; searching and faceting only
 * hide cards that do not match. No index to download, no request to make,
 * works offline.
 *
 * The facet chips are ordinary links to pre-rendered shelf pages, so browsing
 * works without this file. Here they become toggles: within one facet a card
 * may match any selected term, across facets it must match all of them, which
 * is what makes an intersection like form:poem + theme:dream a real place.
 * The selection mirrors into the URL hash, so a shelf a reader composes is a
 * link they can hand to someone else.
 */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  var input = document.getElementById("find");
  var count = document.querySelector(".count");
  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
  if (!input && !chips.length) return;
  var total = cards.length;
  var selected = {};              /* facet -> { slug: true } */

  function plural(n) { return n + (n === 1 ? " work" : " works"); }

  function anySelected() {
    return Object.keys(selected).some(function (facet) {
      return Object.keys(selected[facet]).length > 0;
    });
  }

  function cardMatches(card, needle) {
    if (needle && (card.dataset.search || "").indexOf(needle) === -1) {
      return false;
    }
    var terms = (card.dataset.facets || "").split(/\s+/);
    return Object.keys(selected).every(function (facet) {
      var slugs = Object.keys(selected[facet]);
      if (!slugs.length) return true;
      return slugs.some(function (slug) {
        return terms.indexOf(facet + ":" + slug) !== -1;
      });
    });
  }

  function filter() {
    var needle = input ? input.value.trim().toLowerCase() : "";
    var shown = 0;
    cards.forEach(function (card) {
      var hit = cardMatches(card, needle);
      card.hidden = !hit;
      if (hit) shown += 1;
    });
    if (count) {
      count.textContent = (needle || anySelected())
        ? plural(shown) + " matching"
        : plural(total);
    }
  }

  function writeHash() {
    var parts = [];
    Object.keys(selected).sort().forEach(function (facet) {
      var slugs = Object.keys(selected[facet]).sort();
      if (slugs.length) parts.push(facet + "=" + slugs.join(","));
    });
    var url = location.pathname + location.search +
      (parts.length ? "#" + parts.join("&") : "");
    history.replaceState(null, "", url);
  }

  function readHash() {
    selected = {};
    var hash = location.hash.replace(/^#/, "");
    if (!hash) return;
    hash.split("&").forEach(function (part) {
      var eq = part.indexOf("=");
      if (eq === -1) return;
      var facet = part.slice(0, eq);
      part.slice(eq + 1).split(",").forEach(function (slug) {
        if (!slug) return;
        selected[facet] = selected[facet] || {};
        selected[facet][slug] = true;
      });
    });
  }

  function paintChips() {
    chips.forEach(function (chip) {
      var on = !!(selected[chip.dataset.facet] &&
                  selected[chip.dataset.facet][chip.dataset.term]);
      chip.classList.toggle("on", on);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  chips.forEach(function (chip) {
    chip.setAttribute("role", "button");
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", function (event) {
      /* A modified click keeps its link nature: the shelf page opens. */
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      var facet = chip.dataset.facet, term = chip.dataset.term;
      selected[facet] = selected[facet] || {};
      if (selected[facet][term]) delete selected[facet][term];
      else selected[facet][term] = true;
      paintChips();
      filter();
      writeHash();
    });
  });

  if (input) {
    input.addEventListener("input", filter);
    input.form.addEventListener("submit", function (event) {
      event.preventDefault();
      filter();
    });
  }
  window.addEventListener("hashchange", function () {
    readHash();
    paintChips();
    filter();
  });

  readHash();
  paintChips();
  filter();
})();
