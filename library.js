/* cyberdelic.space — filtering the library.
 *
 * The whole collection is already in the page; searching only hides cards that
 * do not match. No index to download, no request to make, works offline.
 */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  var input = document.getElementById("find");
  var count = document.querySelector(".count");
  if (!input) return;
  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  var total = cards.length;

  function plural(n) { return n + (n === 1 ? " work" : " works"); }

  function filter() {
    var needle = input.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {
      var hit = !needle || (card.dataset.search || "").indexOf(needle) !== -1;
      card.hidden = !hit;
      if (hit) shown += 1;
    });
    if (count) {
      count.textContent = needle
        ? plural(shown) + " matching “" + input.value.trim() + "”"
        : plural(total);
    }
  }

  input.addEventListener("input", filter);
  input.form.addEventListener("submit", function (event) {
    event.preventDefault();
    filter();
  });
})();
