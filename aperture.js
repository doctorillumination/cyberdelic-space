/* Copy the Personal Aperture prompt without observing the visitor. */
(function () {
  "use strict";

  var promptCache = Object.create(null);

  function statusFor(button) {
    var id = button.getAttribute("aria-describedby");
    return id ? document.getElementById(id) : null;
  }

  function announce(button, message, state) {
    var status = statusFor(button);
    if (status) status.textContent = message;
    button.dataset.copyState = state || "";
  }

  function fallbackCopy(value) {
    return new Promise(function (resolve, reject) {
      var field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      field.style.pointerEvents = "none";
      document.body.appendChild(field);
      field.select();
      field.setSelectionRange(0, field.value.length);
      var copied = false;
      try { copied = document.execCommand("copy"); }
      catch (error) { copied = false; }
      field.remove();
      if (copied) resolve();
      else reject(new Error("Clipboard unavailable"));
    });
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).catch(function () {
        return fallbackCopy(value);
      });
    }
    return fallbackCopy(value);
  }

  function loadPrompt(url) {
    if (!promptCache[url]) {
      promptCache[url] = fetch(url, {
        credentials: "same-origin",
        cache: "no-cache"
      }).then(function (response) {
        if (!response.ok) throw new Error("Prompt returned " + response.status);
        return response.text();
      }).then(function (value) {
        if (!value.trim()) throw new Error("Prompt is empty");
        return value;
      });
    }
    return promptCache[url];
  }

  function prepare(button) {
    var url = button.dataset.promptUrl;
    var target = button.dataset.promptTarget ?
      document.querySelector(button.dataset.promptTarget) : null;
    if (!url) return;
    loadPrompt(url).then(function (value) {
      button.disabled = false;
      if (target) target.value = value;
      announce(button, "The invitation is ready to copy.", "ready");
    }).catch(function () {
      button.disabled = true;
      if (target) {
        target.value = "The invitation could not be loaded. Open the plain-text prompt below.";
      }
      announce(
        button,
        "The invitation could not be loaded. Use the plain-text prompt link.",
        "error"
      );
    });

    button.addEventListener("click", function () {
      button.disabled = true;
      loadPrompt(url).then(copyText).then(function () {
        announce(
          button,
          "Copied. Paste the invitation into the AI you choose.",
          "copied"
        );
      }).catch(function () {
        announce(
          button,
          "Copying was blocked. Select the prompt or open the plain-text version.",
          "error"
        );
        if (target) {
          target.focus();
          target.select();
        }
      }).finally(function () {
        button.disabled = false;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-aperture-copy]").forEach(prepare);
  });
})();
