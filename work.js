/* cyberdelic.space: behaviour for one work.
 *
 * Everything essential is already in the HTML. This adds the five-way view
 * switch, the hex dump, the local byte check, and verification against
 * Bitcoin. With scripting off the page simply shows every view at once.
 */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  var data = document.getElementById("work-data");
  var work = data ? JSON.parse(data.textContent) : null;
  if (!work) return;

  var tabs = Array.prototype.slice.call(
    document.querySelectorAll('.views button[data-view]'));
  var panels = {};
  tabs.forEach(function (tab) {
    panels[tab.dataset.view] = document.getElementById(
      "panel-" + tab.dataset.view);
  });

  function show(view) {
    tabs.forEach(function (tab) {
      var on = tab.dataset.view === view;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      if (panels[tab.dataset.view]) panels[tab.dataset.view].hidden = !on;
    });
    if (view === "hex") drawHex();
    if (location.hash.slice(1) !== view) {
      history.replaceState(null, "", "#" + view);
    }
  }

  tabs.forEach(function (tab, position) {
    tab.addEventListener("click", function () { show(tab.dataset.view); });
    tab.addEventListener("keydown", function (event) {
      var step = event.key === "ArrowRight" ? 1
        : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      var next = tabs[(position + step + tabs.length) % tabs.length];
      next.focus();
      show(next.dataset.view);
    });
  });

  var initial = location.hash.slice(1);
  show(panels[initial] ? initial : "read");

  // ------------------------------------------------------------ the bytes

  var bytesPromise = null;
  function contentBytes() {
    if (!bytesPromise) {
      bytesPromise = fetch(work.content_url, { cache: "force-cache" })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.arrayBuffer();
        })
        .then(function (buffer) { return new Uint8Array(buffer); });
    }
    return bytesPromise;
  }

  /* Level 1: the bytes on this page really are the bytes the press approved.
     Free, instant, and needs nothing but the reader's own machine. */
  var integrity = document.getElementById("integrity");
  contentBytes()
    .then(function (bytes) { return window.DEWVerify.sha256hex(bytes); })
    .then(function (digest) {
      if (digest === work.digests.content_sha256) {
        integrity.className = "status ok";
        integrity.textContent =
          "These bytes match the published digest, checked in your browser.";
      } else {
        integrity.className = "status bad";
        integrity.textContent =
          "These bytes do NOT match the published digest. Do not trust this page.";
      }
    })
    .catch(function () {
      integrity.className = "status";
      integrity.textContent = "Could not read the exact bytes to check them.";
    });

  // -------------------------------------------------------------- hex view

  var hexDrawn = false;
  function drawHex() {
    if (hexDrawn) return;
    hexDrawn = true;
    var target = document.getElementById("hexdump");
    if (!target) return;
    contentBytes().then(function (bytes) {
      var lines = [], i, k;
      for (i = 0; i < bytes.length; i += 16) {
        var slice = bytes.subarray(i, i + 16);
        var hex = "", text = "";
        for (k = 0; k < 16; k++) {
          hex += k < slice.length
            ? (slice[k] < 16 ? "0" : "") + slice[k].toString(16) + " "
            : "   ";
          if (k === 7) hex += " ";
          if (k < slice.length) {
            text += (slice[k] >= 32 && slice[k] < 127)
              ? String.fromCharCode(slice[k]) : ".";
          }
        }
        lines.push(("0000000" + i.toString(16)).slice(-8) + "  " + hex +
                   " |" + text + "|");
      }
      target.textContent = lines.join("\n") ||
        "This work has no bytes.";
    }).catch(function () {
      target.textContent = "The exact bytes could not be loaded.";
    });
  }

  // ------------------------------------------------------- interactive work

  /* An inscribed program is loaded as a real document, by URL, never through
   * srcdoc.
   *
   * A srcdoc (or blob:) frame INHERITS this page's Content-Security-Policy,
   * and this page forbids inline script and inline style. That silently blocks
   * the work's own <style> and <script>: the artwork loads but never draws. A
   * document fetched by URL carries its own policy instead, which the site
   * serves from /content/: sealed off from the network, but free to be the
   * program it is. The frame stays sandboxed either way, so it has an opaque
   * origin and cannot reach this page. */

  var interactive = document.querySelector(".interactive");
  if (interactive) {
    var host = interactive.querySelector(".frame-host");
    var statusText = interactive.querySelector(".frame-status");
    var restart = interactive.querySelector(".restart");
    var stop = interactive.querySelector(".stop");
    var generation = 0;

    function halt(message) {
      generation += 1;
      host.textContent = "";
      stop.disabled = true;
      statusText.textContent = message || "Stopped";
    }

    function start() {
      var mine = ++generation;
      host.textContent = "";
      stop.disabled = false;
      statusText.textContent = "Starting…";
      var frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.setAttribute("loading", "eager");
      frame.title = work.title + " (running in isolation)";
      frame.addEventListener("load", function () {
        if (mine === generation) {
          statusText.textContent = "Running · isolated · no network, no storage";
        }
      });
      // A cache-busting query on restart, so the work truly starts over.
      frame.src = work.content_url + (mine > 1 ? "?run=" + mine : "");
      host.appendChild(frame);
    }

    restart.addEventListener("click", start);
    stop.addEventListener("click", function () { halt(); });
    // The reader chose this work; showing it is the point. It still runs
    // sealed off from the network, this page, and everything else.
    start();
  }

  // ------------------------------------------------ copy a terminal command

  Array.prototype.forEach.call(
    document.querySelectorAll("button.copy"), function (button) {
      button.addEventListener("click", function () {
        var command = button.dataset.copy;
        function done(message) {
          button.textContent = message;
          button.classList.add("done");
          setTimeout(function () {
            button.textContent = "Copy";
            button.classList.remove("done");
          }, 2000);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(command)
            .then(function () { done("Copied"); })
            .catch(function () { select(button); });
        } else {
          select(button);
        }
      });
    });

  /* Clipboard access can be refused. Rather than fail silently, select the
     command so the reader can copy it by hand. */
  function select(button) {
    var code = button.parentNode.querySelector("code");
    var range = document.createRange();
    range.selectNodeContents(code);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = "Selected";
  }

  // ------------------------------------------------------ against Bitcoin

  var button = document.getElementById("verify-chain");
  var out = document.getElementById("verify-out");
  if (button && out) {
    button.addEventListener("click", async function () {
      button.disabled = true;
      out.innerHTML = '<p class="verdict working">Asking independent public ' +
        'Bitcoin sources…</p>';
      var bytes = null;
      try { bytes = await contentBytes(); } catch (error) { /* keep going */ }
      var result;
      try {
        result = await window.DEWVerify.verifyAgainstChain(work, bytes);
      } catch (error) {
        result = { ok: false, steps: [], unreachable: true,
                   headline: "Verification could not run: " +
                             (error.message || error) };
      }
      var list = result.steps.map(function (step) {
        var item = document.createElement("li");
        item.className = step.level;
        item.textContent = step.text;
        return item;
      });
      var verdict = document.createElement("p");
      verdict.className = "verdict " +
        (result.ok ? "ok" : (result.unreachable || result.partial ? "working" : "bad"));
      verdict.textContent = result.headline;
      var ol = document.createElement("ol");
      list.forEach(function (item) { ol.appendChild(item); });
      out.innerHTML = "";
      out.appendChild(verdict);
      out.appendChild(ol);
      button.disabled = false;
      button.textContent = "Verify again";
    });
  }
})();
