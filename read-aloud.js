/* Recorded Lewis readings. No autoplay, speech API, or robotic fallback. */
(function () {
  "use strict";
  var SPEEDS = [.75, 1, 1.25, 1.5], KEY = "cyberdelic-listen-speed";
  var scriptURL = typeof document !== "undefined" && document.currentScript && document.currentScript.src;
  var active = null;
  function pageKey(path) { return path.replace(/^\//, "").replace(/index\.html$/, ""); }
  function tracksFor(catalog, path) {
    var key = pageKey(path);
    var item = catalog.items.find(function (entry) {
      return entry.pages.some(function (page) { return pageKey(page) === key; });
    });
    if (item) return [item];
    var list = catalog.playlists.find(function (entry) { return pageKey(entry.page) === key; });
    return list ? list.items.map(function (id) {
      return catalog.items.find(function (entry) { return entry.id === id; });
    }).filter(Boolean) : [];
  }
  function startAt(tracks, hash) {
    var note = /^#fn-(\d+)$/.exec(hash);
    if (!note) return 0;
    var suffix = "fn-" + String(Number(note[1])).padStart(2, "0");
    var index = tracks.findIndex(function (entry) { return entry.id.endsWith(suffix); });
    return index < 0 ? 0 : index;
  }
  function Player(audio, tracks, base, notify) {
    Object.assign(this, {audio: audio, tracks: tracks, base: base, notify: notify,
      state: "idle", speed: 1, index: 0, generation: 0, message: "", retryTime: null});
    audio.preload = "none";
    audio.preservesPitch = audio.webkitPreservesPitch = true;
    var self = this;
    audio.addEventListener("ended", function () {
      if (self.state !== "playing") return;
      self.index++;
      if (self.index >= self.tracks.length) { self.stop(); return; }
      audio.removeAttribute("src"); self.play();
    });
    audio.addEventListener("error", function () {
      self.retryTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      self.generation++; self.state = "paused";
      self.message = "The recording could not load. Please try again."; self.paint();
    });
    audio.addEventListener("loadedmetadata", function () {
      if (self.retryTime === null) return;
      audio.currentTime = Math.min(self.retryTime, audio.duration || self.retryTime);
      self.retryTime = null;
    });
  }
  Player.prototype.paint = function () { this.notify(this); };
  Player.prototype.play = async function () {
    if (!this.tracks.length) return;
    if (active && active !== this) active.pause();
    active = this;
    var token = ++this.generation;
    var url = new URL(this.tracks[this.index].audio_path, this.base).href;
    if (this.audio.src !== url || this.retryTime !== null) this.audio.src = url;
    this.audio.playbackRate = this.speed;
    this.state = "loading"; this.message = ""; this.paint();
    try {
      await this.audio.play();
      if (this.generation !== token) return;
      this.state = "playing";
    } catch (error) {
      if (this.generation !== token) return;
      this.state = "paused";
      this.message = "The recording could not start. Tap Resume to try again.";
    }
    this.paint();
  };
  Player.prototype.toggle = function () {
    if (this.state === "playing" || this.state === "loading") this.pause();
    else return this.play();
  };
  Player.prototype.pause = function () {
    if (this.state === "idle") return;
    this.generation++; this.audio.pause(); this.state = "paused"; this.paint();
  };
  Player.prototype.setSpeed = function (value) {
    if (!SPEEDS.includes(value)) return;
    this.speed = value; this.audio.playbackRate = value; this.paint();
  };
  Player.prototype.stop = function () {
    this.generation++; this.audio.pause();
    if (Number.isFinite(this.audio.duration)) this.audio.currentTime = 0;
    this.audio.removeAttribute("src");
    this.index = 0; this.state = "idle"; this.message = ""; this.retryTime = null; this.paint();
    if (active === this) active = null;
  };
  function mount(container, tracks, base) {
    if (!tracks.length || container.querySelector(".listen-controls")) return;
    var controls = document.createElement("div");
    controls.className = "listen-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Lewis narration");
    controls.innerHTML = '<button type="button"><svg viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor"/></svg><span>Listen</span></button><span class="listen-voice">Lewis</span><label class="listen-speed">Speed <select aria-label="Reading speed"></select></label><p class="listen-status" role="status" aria-live="polite"></p>';
    var button = controls.querySelector("button"), speed = controls.querySelector("select");
    SPEEDS.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value; option.textContent = value + "×"; speed.appendChild(option);
    });
    var saved = 1;
    try { saved = Number(localStorage.getItem(KEY)) || 1; } catch (error) { /* optional */ }
    speed.value = SPEEDS.includes(saved) ? String(saved) : "1";
    container.insertBefore(controls, container.querySelector(".stone"));
    function paint(player) {
      var playing = ["playing", "loading"].includes(player.state);
      button.querySelector("span").textContent = playing ? "Pause" : player.state === "paused" ? "Resume" : "Listen";
      button.querySelector("path").setAttribute("d", playing ? "M2 1h3v10H2zM7 1h3v10H7z" : "M2 1v10l9-5z");
      button.setAttribute("aria-label", playing ? "Pause Lewis reading" : player.state === "paused" ? "Resume Lewis reading" : "Listen with Lewis");
      button.setAttribute("aria-pressed", String(playing));
      controls.querySelector(".listen-status").textContent = player.message;
    }
    var player = new Player(new Audio(), tracks, base, paint);
    player.setSpeed(Number(speed.value));
    button.addEventListener("click", function () {
      if (player.state === "idle") player.index = startAt(tracks, location.hash);
      player.toggle();
    });
    speed.addEventListener("change", function () {
      player.setSpeed(Number(speed.value));
      try { localStorage.setItem(KEY, speed.value); } catch (error) { /* optional */ }
    });
    window.addEventListener("pagehide", function () { player.stop(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) player.pause(); });
    window.addEventListener("hashchange", function () { player.stop(); });
    var dialog = container.closest("dialog");
    if (dialog) dialog.addEventListener("close", function () { player.pause(); });
  }
  async function initialise() {
    var article = document.querySelector("article.living-page");
    var head = article && article.querySelector(".living-head");
    if (!head || !scriptURL) return;
    var base = new URL("./", scriptURL);
    try {
      var response = await fetch(new URL("narrations.json", base), {cache: "no-cache"});
      if (!response.ok) throw new Error("Missing audio catalog");
      var catalog = await response.json();
      if (catalog.schema !== "cyberdelic.space/narrations-v1" || catalog.voice !== "bm_lewis")
        throw new Error("Unknown audio catalog");
      mount(head, tracksFor(catalog, location.pathname), base);
      article.querySelectorAll(".letters .what").forEach(function (entry) {
        var link = entry.querySelector("a");
        if (link) mount(entry, tracksFor(catalog, new URL(link.href).pathname), base);
      });
    } catch (error) {
      var status = document.createElement("p");
      status.className = "listen-status";
      status.textContent = "Lewis recordings are temporarily unavailable.";
      head.appendChild(status);
    }
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {Player: Player, pageKey: pageKey, tracksFor: tracksFor, startAt: startAt};
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise);
  } else initialise();
})();
