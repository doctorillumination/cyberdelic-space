/* Keep the book's page bookmark visible in the gallery address. */
(function () {
  "use strict";
  var frame = document.querySelector('[data-fieldwork="transplant"] iframe');
  if (!frame) return;
  var valid = /^#sheet-(0[1-9]|[12][0-9]|3[0-3])$/;
  if (valid.test(location.hash)) frame.dataset.src += location.hash;
  frame.addEventListener("load", function () {
    var book = frame.contentWindow;
    if (!book) return;
    function toBook() {
      if (valid.test(location.hash) && book.location.hash !== location.hash) book.location.hash = location.hash;
    }
    function fromBook() {
      if (valid.test(book.location.hash) && location.hash !== book.location.hash) history.replaceState(null, "", book.location.hash);
    }
    if (valid.test(location.hash)) toBook();
    else fromBook();
    book.addEventListener("hashchange", fromBook);
    var folio = book.document.querySelector("#folio");
    if (folio) new MutationObserver(fromBook).observe(folio, {attributes: true, attributeFilter: ["data-sheet"]});
    window.addEventListener("hashchange", toBook);
  });
})();
