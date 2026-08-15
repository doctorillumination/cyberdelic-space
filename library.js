/* cyberdelic.space: a quiet, finite library aperture.
 *
 * The visible page offers three choices and three works. Its vocabulary and
 * works are read from the static, hidden library already present in the page.
 * Nothing is requested, tracked, scored for popularity, or stored.
 */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  var field = document.querySelector(".living-index");
  var choice = document.querySelector("[data-field-choice]");
  var nodeLayer = document.querySelector("[data-field-nodes]");
  var count = document.querySelector("[data-field-count]");
  var revelation = document.querySelector("[data-field-revelation]");
  var resultHeading = document.querySelector("[data-field-result-heading]");
  var results = document.querySelector("[data-field-results]");
  var drawButton = document.querySelector("[data-field-draw]");
  var resetButton = document.querySelector("[data-field-reset]");
  var stage = document.querySelector("[data-field-stage]");
  var canvas = document.querySelector("[data-field-canvas]");
  var networkContext = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  var networkFrame = null;
  var recomposeTimer = null;
  var settleTimer = null;
  var activeRetuneAnimations = [];
  var retuneDeparting = [];
  var retuneIncoming = [];
  var lastInteractedKey = null;
  var networkPalette = null;
  var networkWidth = 0;
  var networkHeight = 0;
  var networkLeft = 0;
  var networkTop = 0;
  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
  if (!field || !choice || !nodeLayer || !cards.length || !chips.length) return;

  var maximumSignals = 3;
  var selected = {};
  var revealed = false;
  var transitionTimer = null;
  var reducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia &&
    window.matchMedia("(pointer: fine)").matches;
  var magneticPointer = { active: false, x: 0, y: 0 };
  var facetOrder = ["form", "theme", "register", "world", "era"];
  var openingTerms = [
    "theme:imagination", "theme:consciousness", "theme:dream",
    "theme:technology", "theme:psychedelics", "theme:emergence"
  ];

  function termsOn(card) {
    return (card.dataset.facets || "").split(/\s+/).filter(Boolean);
  }

  var works = cards.map(function (card, index) {
    var link = card.querySelector("a");
    var title = card.querySelector("h2");
    var excerpt = card.querySelector(".excerpt");
    var line = card.querySelector(".line");
    var href = link ? link.getAttribute("href") : "";
    var heightMatch = line ? line.textContent.match(/block\s+(\d+)/i) : null;
    return {
      title: title ? title.textContent.trim() : "Untitled work",
      excerpt: excerpt ? excerpt.textContent.trim() : "",
      href: href,
      height: heightMatch ? parseInt(heightMatch[1], 10) : index,
      terms: termsOn(card)
    };
  });

  var terms = chips.map(function (chip) {
    var key = chip.dataset.facet + ":" + chip.dataset.term;
    var label = chip.dataset.term.replace(/-/g, " ");
    if (chip.dataset.facet === "era") label = "incunabula";
    return {
      key: key,
      facet: chip.dataset.facet,
      term: chip.dataset.term,
      label: label,
      count: works.filter(function (work) {
        return work.terms.indexOf(key) !== -1;
      }).length
    };
  });

  var termByKey = {};
  terms.forEach(function (term) { termByKey[term.key] = term; });
  var sharedWorkCounts = {};
  works.forEach(function (work) {
    for (var firstI = 0; firstI < work.terms.length; firstI += 1) {
      for (var secondI = firstI + 1;
          secondI < work.terms.length; secondI += 1) {
        var first = work.terms[firstI];
        var second = work.terms[secondI];
        var key = first < second
          ? first + "|" + second
          : second + "|" + first;
        sharedWorkCounts[key] = (sharedWorkCounts[key] || 0) + 1;
      }
    }
  });

  function cssValue(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
  }

  function sharedWorks(first, second) {
    var key = first < second
      ? first + "|" + second
      : second + "|" + first;
    return sharedWorkCounts[key] || 0;
  }

  function networkAlpha(button, now) {
    if (typeof button._networkEnterAt === "number") {
      return easeOutCubic((now - button._networkEnterAt) /
        button._networkEnterDuration);
    }
    if (typeof button._networkLeaveAt === "number") {
      return 1 - easeOutCubic((now - button._networkLeaveAt) /
        button._networkLeaveDuration);
    }
    return 1;
  }

  function networkNodes(time, retuning) {
    if (!stage) return [];
    return Array.prototype.slice.call(
      nodeLayer.querySelectorAll(".field-node")
    ).map(function (button) {
      var shape = button.querySelector(".field-node-shape");
      var box = (retuning ? button : (shape || button))
        .getBoundingClientRect();
      return {
        key: button.dataset.facet + ":" + button.dataset.term,
        selected: button.classList.contains("selected"),
        alpha: networkAlpha(button, time),
        x: box.left - networkLeft + box.width / 2,
        y: box.top - networkTop + box.height / 2
      };
    });
  }

  function updateMagneticNodes() {
    if (!stage || reducedMotion || !finePointer) return;
    if (field.classList.contains("is-recomposing")) return;
    var stageBox = stage.getBoundingClientRect();
    var canAttract = magneticPointer.active;
    Array.prototype.forEach.call(
      nodeLayer.querySelectorAll(".field-node"), function (button) {
        var state = button._magnetState || { x: 0, y: 0, energy: 0 };
        if (!canAttract && state.x === 0 && state.y === 0 &&
            state.energy === 0) return;
        var shape = button.querySelector(".field-node-shape") || button;
        var box = shape.getBoundingClientRect();
        var left = box.left - stageBox.left - state.x;
        var top = box.top - stageBox.top - state.y;
        var right = left + box.width;
        var bottom = top + box.height;
        var nearestX = clamp(magneticPointer.x, left, right);
        var nearestY = clamp(magneticPointer.y, top, bottom);
        var perimeterX = magneticPointer.x - nearestX;
        var perimeterY = magneticPointer.y - nearestY;
        var perimeterDistance = Math.sqrt(
          perimeterX * perimeterX + perimeterY * perimeterY);
        var centerX = left + box.width / 2;
        var centerY = top + box.height / 2;
        var directionX = magneticPointer.x - centerX;
        var directionY = magneticPointer.y - centerY;
        var centerDistance = Math.sqrt(
          directionX * directionX + directionY * directionY) || 1;
        var influence = canAttract
          ? Math.pow(1 - clamp(perimeterDistance / 76, 0, 1), 3)
          : 0;
        var pull = 6 * influence;
        var targetX = directionX / centerDistance * pull;
        var targetY = directionY / centerDistance * pull;
        var response = canAttract ? .08 : .07;

        state.x += (targetX - state.x) * response;
        state.y += (targetY - state.y) * response;
        state.energy += (influence - state.energy) * response;
        if (!canAttract && Math.abs(state.x) < .03 &&
            Math.abs(state.y) < .03 && state.energy < .003) {
          state.x = 0;
          state.y = 0;
          state.energy = 0;
        }
        button._magnetState = state;
        button.style.setProperty("--magnet-x", state.x.toFixed(2) + "px");
        button.style.setProperty("--magnet-y", state.y.toFixed(2) + "px");
      });
  }

  function resizeNetwork() {
    if (!stage || !canvas || !networkContext) return 1;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, stage.clientWidth);
    var height = Math.max(1, stage.clientHeight);
    var stageBox = stage.getBoundingClientRect();
    networkWidth = width;
    networkHeight = height;
    networkLeft = stageBox.left;
    networkTop = stageBox.top;
    var pixelWidth = Math.round(width * ratio);
    var pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    networkContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    return ratio;
  }

  function refreshNetworkOffset() {
    if (!stage) return;
    var stageBox = stage.getBoundingClientRect();
    networkLeft = stageBox.left;
    networkTop = stageBox.top;
  }

  function readNetworkPalette() {
    if (networkPalette) return networkPalette;
    var signal = cssValue("--signal") || "#087b8a";
    var quiet = cssValue("--ink-2") || "#62546d";
    var psychedelic =
      document.documentElement.dataset.theme === "psychedelic";
    networkPalette = {
      signal: signal,
      quiet: quiet,
      psychedelic: psychedelic,
      colors: {
        cyan: psychedelic ? "#8ff7fb" : signal,
        magenta: psychedelic ? "#ffb9e8" : signal,
        violet: psychedelic ? "#c9c0ff" : signal,
        amber: psychedelic ? "#ffe1a8" : signal,
        pearl: psychedelic ? "#ffffff" : signal
      }
    };
    return networkPalette;
  }

  function curvePoint(a, control, b, amount) {
    var remaining = 1 - amount;
    return {
      x: remaining * remaining * a.x +
        2 * remaining * amount * control.x + amount * amount * b.x,
      y: remaining * remaining * a.y +
        2 * remaining * amount * control.y + amount * amount * b.y
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function easeOutCubic(amount) {
    return 1 - Math.pow(1 - clamp(amount, 0, 1), 3);
  }

  function drawCurve(a, control, b) {
    networkContext.beginPath();
    networkContext.moveTo(a.x, a.y);
    networkContext.quadraticCurveTo(control.x, control.y, b.x, b.y);
    networkContext.stroke();
  }

  function drawCurveSegment(a, control, b, startAmount, endAmount) {
    var start = clamp(startAmount, 0, 1);
    var end = clamp(endAmount, 0, 1);
    if (end <= start) return;
    var steps = Math.max(2, Math.ceil((end - start) * 22));
    var firstPoint = curvePoint(a, control, b, start);
    networkContext.beginPath();
    networkContext.moveTo(firstPoint.x, firstPoint.y);
    for (var step = 1; step <= steps; step += 1) {
      var amount = start + (end - start) * step / steps;
      var point = curvePoint(a, control, b, amount);
      networkContext.lineTo(point.x, point.y);
    }
    networkContext.stroke();
  }

  function edgeGradient(a, b, colors, time, phase, potential) {
    var gradient = networkContext.createLinearGradient(a.x, a.y, b.x, b.y);
    var travel = (time * .000075 + phase * .117) % 1;
    var before = Math.max(0, travel - .17);
    var after = Math.min(1, travel + .17);
    gradient.addColorStop(0, potential ? colors.violet : colors.cyan);
    gradient.addColorStop(before, colors.violet);
    gradient.addColorStop(travel, colors.pearl);
    gradient.addColorStop(after, colors.magenta);
    gradient.addColorStop(1, potential ? colors.violet : colors.cyan);
    return gradient;
  }

  function drawPacket(point, color, size, alpha, rotation) {
    networkContext.save();
    networkContext.translate(point.x, point.y);
    networkContext.rotate(rotation);
    networkContext.fillStyle = color;
    networkContext.globalAlpha = alpha;
    networkContext.fillRect(-size / 2, -size / 2, size, size);
    networkContext.restore();
  }

  function drawSnap(node, amount, colors, selected, alpha) {
    var fade = Math.pow(1 - clamp(amount, 0, 1), 2);
    var reach = 2 + amount * (selected ? 14 : 10);
    networkContext.setLineDash([]);
    networkContext.lineWidth = selected ? 1.25 : .8;
    networkContext.strokeStyle = colors.cyan;
    networkContext.globalAlpha = fade * (selected ? .66 : .4) * alpha;
    networkContext.beginPath();
    networkContext.moveTo(node.x - reach, node.y);
    networkContext.lineTo(node.x + reach, node.y);
    networkContext.moveTo(node.x, node.y - reach);
    networkContext.lineTo(node.x, node.y + reach);
    networkContext.stroke();
    networkContext.strokeStyle = colors.magenta;
    networkContext.globalAlpha = fade * (selected ? .42 : .26) * alpha;
    networkContext.beginPath();
    networkContext.moveTo(node.x - reach * .55, node.y - reach * .55);
    networkContext.lineTo(node.x + reach * .55, node.y + reach * .55);
    networkContext.moveTo(node.x + reach * .55, node.y - reach * .55);
    networkContext.lineTo(node.x - reach * .55, node.y + reach * .55);
    networkContext.stroke();
  }

  function drawHub(node, colors) {
    if (!node.degree) return;
    var strength = Math.min(node.degree, 8);
    networkContext.save();
    networkContext.translate(node.x, node.y);
    networkContext.setLineDash([]);
    networkContext.fillStyle = strength > 3 ? colors.violet : colors.cyan;
    networkContext.globalAlpha = (.16 + strength * .018 +
      (node.selected ? .12 : 0)) * node.alpha;
    var junction = node.selected ? 2.8 : 1.35 + strength * .12;
    networkContext.fillRect(-junction / 2, -junction / 2, junction, junction);
    networkContext.restore();
  }

  function drawNetwork(time) {
    if (!networkContext || !canvas || !stage || choice.hidden) {
      networkFrame = null;
      return;
    }
    if (!networkWidth || !networkHeight) resizeNetwork();
    var retuning = nodeLayer.classList.contains("is-retuning");
    updateMagneticNodes();
    var width = networkWidth;
    var height = networkHeight;
    networkContext.clearRect(0, 0, width, height);
    if (reducedMotion) time = 3200;
    var nodes = networkNodes(time, retuning);
    var palette = readNetworkPalette();
    var quiet = palette.quiet;
    var psychedelic = palette.psychedelic;
    var colors = palette.colors;
    var edges = [];
    nodes.forEach(function (node) { node.degree = 0; });

    for (var edgeI = 0; edgeI < nodes.length; edgeI += 1) {
      for (var edgeJ = edgeI + 1; edgeJ < nodes.length; edgeJ += 1) {
        var sharedCount = sharedWorks(nodes[edgeI].key, nodes[edgeJ].key);
        var isPotential = sharedCount === 0;
        if (retuning && isPotential) continue;
        if (isPotential && (edgeI * 7 + edgeJ * 13 + nodes.length) % 5 !== 0) {
          continue;
        }
        if (!isPotential) {
          var degreeWeight = 1 + Math.min(sharedCount - 1, 3) * .35;
          nodes[edgeI].degree += degreeWeight;
          nodes[edgeJ].degree += degreeWeight;
        }
        edges.push({
          first: nodes[edgeI],
          second: nodes[edgeJ],
          firstIndex: edgeI,
          secondIndex: edgeJ,
          shared: sharedCount,
          potential: isPotential,
          phase: (edgeI + 1) * 1.73 + (edgeJ + 1) * 2.41
        });
      }
    }
    networkContext.lineCap = "round";

    edges.forEach(function (edge) {
        var first = edge.first;
        var second = edge.second;
        var shared = edge.shared;
        var phase = edge.phase;
        var potential = edge.potential;
        var dx = second.x - first.x;
        var dy = second.y - first.y;
        var distance = Math.sqrt(dx * dx + dy * dy) || 1;
        var edgeAlpha = Math.min(first.alpha, second.alpha);
        if (edgeAlpha <= .005) return;
        var bend = Math.sin(time * .00042 + phase) *
          Math.min(24, distance * .085);
        var control = {
          x: (first.x + second.x) / 2 - dy / distance * bend,
          y: (first.y + second.y) / 2 + dx / distance * bend
        };
        var selectedEdge = first.selected || second.selected;
        var shimmer = edgeGradient(first, second, colors, time, phase,
          potential);

        if (retuning) {
          networkContext.save();
          if (psychedelic) {
            networkContext.globalCompositeOperation = "screen";
          }
          networkContext.strokeStyle = shimmer;
          networkContext.globalAlpha = (.18 +
            Math.min(shared, 4) * .025 +
            (selectedEdge ? .08 : 0)) * edgeAlpha;
          networkContext.lineWidth = .9 + shared * .08;
          networkContext.setLineDash([]);
          drawCurve(first, control, second);
          networkContext.restore();
          return;
        }

        if (!potential) {
          networkContext.save();
          if (psychedelic) networkContext.globalCompositeOperation = "screen";
          networkContext.strokeStyle = psychedelic ? colors.violet : quiet;
          networkContext.globalAlpha = (.075 +
            Math.min(shared, 4) * .016 +
            (selectedEdge ? .045 : 0)) * edgeAlpha;
          networkContext.lineWidth = .65 + shared * .09;
          networkContext.setLineDash([]);
          drawCurve(first, control, second);
          networkContext.restore();
        }

        var cycle = (time * (potential ? .00009 : .00012) +
          phase * .083) % 1;
        var startAmount = 0;
        var endAmount = 0;
        var energy = 0;
        if (cycle < .2) {
          endAmount = easeOutCubic(cycle / .2);
          energy = .35 + endAmount * .65;
        } else if (cycle < .7) {
          endAmount = 1;
          energy = 1;
        } else if (cycle < .86) {
          startAmount = easeOutCubic((cycle - .7) / .16);
          endAmount = 1;
          energy = 1 - (cycle - .7) / .16;
        }
        if (potential && cycle > .54) energy = 0;
        if (energy <= 0) return;

        var forward = (edge.firstIndex + edge.secondIndex) % 2 === 0;
        var source = forward ? first : second;
        var target = forward ? second : first;
        if (!forward) {
          var reversedStart = 1 - endAmount;
          var reversedEnd = 1 - startAmount;
          startAmount = reversedStart;
          endAmount = reversedEnd;
        }
        networkContext.save();
        if (psychedelic) networkContext.globalCompositeOperation = "screen";
        networkContext.shadowColor = potential ? colors.violet : colors.magenta;
        networkContext.shadowBlur = potential ? 5 : 9;
        networkContext.strokeStyle = shimmer;
        networkContext.globalAlpha = energy * (potential ? .12 :
          .2 + Math.min(shared, 4) * .024 +
          (selectedEdge ? .07 : 0)) * edgeAlpha;
        networkContext.lineWidth = potential ? .9 : 1.65 + shared * .11;
        networkContext.setLineDash([]);
        drawCurveSegment(first, control, second, startAmount, endAmount);
        networkContext.restore();

        networkContext.save();
        if (psychedelic) networkContext.globalCompositeOperation = "screen";
        networkContext.strokeStyle = shimmer;
        networkContext.globalAlpha = energy * (potential ? .22 :
          .46 + Math.min(shared, 4) * .042 +
          (selectedEdge ? .11 : 0)) * edgeAlpha;
        networkContext.lineWidth = potential ? .75 : .95 + shared * .11;
        networkContext.setLineDash(potential
          ? [1, 12 + (edge.firstIndex + edge.secondIndex) % 6]
          : [2 + shared, 7 + (edge.firstIndex * 3 + edge.secondIndex) % 8]);
        networkContext.lineDashOffset = -time * .022 - phase * 7;
        drawCurveSegment(first, control, second, startAmount, endAmount);
        networkContext.restore();

        if (cycle >= .2 && cycle < .32) {
          drawSnap(target, (cycle - .2) / .12, colors, selectedEdge,
            edgeAlpha);
        }

        if (!potential && cycle >= .26 && cycle < .7) {
          var travel = (cycle - .26) / .44;
          if (!forward) travel = 1 - travel;
          var packet = curvePoint(first, control, second, travel);
          var packetTwo = curvePoint(first, control, second,
            forward ? (travel + .62) % 1 : (travel + .38) % 1);
          var angle = Math.atan2(target.y - source.y, target.x - source.x) +
            Math.PI / 4;
          drawPacket(packet, colors.amber, selectedEdge ? 3.4 : 2.6,
            (.65 + (selectedEdge ? .2 : 0)) * edgeAlpha, angle);
          drawPacket(packetTwo, colors.violet, selectedEdge ? 2.5 : 1.8,
            (.32 + (selectedEdge ? .12 : 0)) * edgeAlpha, angle);
        }
    });

    nodes.forEach(function (node) {
      drawHub(node, colors);
    });
    networkContext.globalAlpha = 1;
    networkContext.setLineDash([]);
    if (!reducedMotion) {
      networkFrame = window.requestAnimationFrame(drawNetwork);
    } else {
      networkFrame = null;
    }
  }

  function startNetwork() {
    if (!networkContext) return;
    resizeNetwork();
    if (networkFrame !== null) window.cancelAnimationFrame(networkFrame);
    networkFrame = window.requestAnimationFrame(drawNetwork);
  }

  function stopNetwork() {
    if (networkFrame !== null) window.cancelAnimationFrame(networkFrame);
    networkFrame = null;
    if (networkContext && canvas) {
      networkContext.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function selectedTerms() {
    var found = [];
    facetOrder.forEach(function (facet) {
      terms.forEach(function (term) {
        if (term.facet === facet && selected[facet] &&
            selected[facet][term.term]) found.push(term);
      });
    });
    return found;
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
        if (!slug || !termByKey[facet + ":" + slug]) return;
        selected[facet] = selected[facet] || {};
        selected[facet][slug] = true;
      });
    });
  }

  function matchCount(work, chosen) {
    return chosen.filter(function (term) {
      return work.terms.indexOf(term.key) !== -1;
    }).length;
  }

  function compatibility(term, chosen) {
    var exact = 0;
    var partial = 0;
    works.forEach(function (work) {
      if (work.terms.indexOf(term.key) === -1) return;
      var matches = matchCount(work, chosen);
      if (matches === chosen.length) exact += 1;
      partial += matches;
    });
    var differentFacet = chosen.some(function (item) {
      return item.facet !== term.facet;
    });
    return exact * 100 + partial * 12 + term.count * 3 +
      (differentFacet ? 8 : 0);
  }

  function candidateTerms(chosen) {
    if (!chosen.length) {
      return openingTerms.map(function (key) { return termByKey[key]; })
        .filter(Boolean);
    }
    return terms.filter(function (term) {
      return term.count < works.length && !chosen.some(function (item) {
        return item.key === term.key;
      });
    }).map(function (term) {
      return { term: term, score: compatibility(term, chosen) };
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.term.key < b.term.key ? -1 : 1;
    }).slice(0, 8).map(function (item) { return item.term; });
  }

  function makeNode(term, index, on) {
    var button = document.createElement("button");
    var label = document.createElement("span");
    var visibleLabel = document.createElement("span");
    var drift = [
      [10, -8], [-12, 8], [9, 12], [-11, -9], [13, 7],
      [-9, 12], [12, -7], [-13, -8], [9, 10]
    ][index % 9];
    button.type = "button";
    button.className = "field-node" + (on ? " selected" : "");
    button.dataset.facet = term.facet;
    button.dataset.term = term.term;
    button.dataset.slot = String(index);
    button.setAttribute("aria-label", term.label);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.style.setProperty("--drift-x", drift[0] + "px");
    button.style.setProperty("--drift-y", drift[1] + "px");
    button.style.setProperty("--drift-delay", (-index * 0.73) + "s");
    button.style.setProperty("--arrival-delay",
      (on ? index * 18 : 55 + index * 28) + "ms");
    label.className = "field-node-shape";
    label.dataset.glow = term.label;
    visibleLabel.className = "field-node-text";
    visibleLabel.textContent = term.label;
    label.appendChild(visibleLabel);
    button.appendChild(label);
    button.addEventListener("click", function (event) {
      toggleTerm(term.facet, term.term, event.detail === 0);
    });
    return button;
  }

  function displayedTerms(chosen) {
    var shown = chosen.slice();
    if (chosen.length < maximumSignals) {
      shown = shown.concat(candidateTerms(chosen));
    }
    return shown.slice(0, 9);
  }

  function populateNodes(chosen) {
    nodeLayer.textContent = "";
    displayedTerms(chosen).forEach(function (term, index) {
      var on = chosen.some(function (item) { return item.key === term.key; });
      nodeLayer.appendChild(makeNode(term, index, on));
    });
  }

  function nodeKey(button) {
    return button.dataset.facet + ":" + button.dataset.term;
  }

  function rectCenter(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function neutralizeMagnet(button) {
    button._magnetState = { x: 0, y: 0, energy: 0 };
    button.style.setProperty("--magnet-x", "0px");
    button.style.setProperty("--magnet-y", "0px");
  }

  function configureNode(button, term, index, on) {
    var drift = [
      [10, -8], [-12, 8], [9, 12], [-11, -9], [13, 7],
      [-9, 12], [12, -7], [-13, -8], [9, 10]
    ][index % 9];
    button.className = "field-node" + (on ? " selected" : "");
    button.dataset.slot = String(index);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.style.setProperty("--drift-x", drift[0] + "px");
    button.style.setProperty("--drift-y", drift[1] + "px");
    button.style.setProperty("--drift-delay", (-index * .73) + "s");
    button.style.setProperty("--arrival-delay",
      (on ? index * 18 : 55 + index * 28) + "ms");
    neutralizeMagnet(button);
    delete button._networkEnterAt;
    delete button._networkLeaveAt;
  }

  function cancelRetune() {
    activeRetuneAnimations.forEach(function (animation) {
      animation.cancel();
    });
    activeRetuneAnimations = [];
    retuneDeparting.forEach(function (button) {
      if (button.parentNode === nodeLayer) button.remove();
    });
    retuneIncoming.forEach(function (button) {
      button.classList.remove("is-arriving");
      delete button._networkEnterAt;
    });
    retuneDeparting = [];
    retuneIncoming = [];
    nodeLayer.classList.remove("is-retuning");
    field.classList.remove("is-recomposing");
  }

  function retuneNodes(chosen, after) {
    if (!window.Element || !Element.prototype.animate) {
      populateNodes(chosen);
      window.requestAnimationFrame(startNetwork);
      if (after) after();
      return;
    }

    var started = performance.now();
    var existing = Array.prototype.slice.call(
      nodeLayer.querySelectorAll(".field-node"));
    var previous = {};
    existing.forEach(function (button) {
      previous[nodeKey(button)] = {
        button: button,
        rect: button.getBoundingClientRect()
      };
    });
    var anchorRecord = previous[lastInteractedKey];
    var anchor = anchorRecord
      ? rectCenter(anchorRecord.rect)
      : rectCenter(stage.getBoundingClientRect());
    var retained = {};
    var moving = [];
    var incoming = [];

    field.classList.add("is-recomposing");
    nodeLayer.classList.remove("is-gathering", "is-folded", "is-unfolding");
    nodeLayer.classList.add("is-retuning");

    displayedTerms(chosen).forEach(function (term, index) {
      var on = chosen.some(function (item) { return item.key === term.key; });
      var record = previous[term.key];
      var button = record ? record.button : makeNode(term, index, on);
      if (record) {
        configureNode(button, term, index, on);
        moving.push({ button: button, from: record.rect, index: index });
      } else {
        configureNode(button, term, index, on);
        button.classList.add("is-arriving");
        nodeLayer.appendChild(button);
        incoming.push({ button: button, index: index });
      }
      if (term.key === lastInteractedKey) {
        button.classList.add("is-retune-anchor");
      }
      retained[term.key] = true;
    });

    existing.forEach(function (button, index) {
      if (retained[nodeKey(button)]) return;
      neutralizeMagnet(button);
      button.classList.add("is-departing");
      button._networkLeaveAt = started + 70 + index * 10;
      button._networkLeaveDuration = 570;
      retuneDeparting.push(button);
    });
    retuneIncoming = incoming.map(function (item) { return item.button; });

    void nodeLayer.offsetWidth;

    moving.forEach(function (item) {
      var finalRect = item.button.getBoundingClientRect();
      var from = rectCenter(item.from);
      var to = rectCenter(finalRect);
      var dx = from.x - to.x;
      var dy = from.y - to.y;
      var startTransform = "translate(-50%, -50%) translate3d(" +
        dx.toFixed(2) + "px, " + dy.toFixed(2) + "px, 0)";
      var anchorNode = item.button.classList.contains("is-retune-anchor");
      var frames = anchorNode
        ? [
            { transform: startTransform, offset: 0 },
            { transform: startTransform, offset: .14 },
            { transform: "translate(-50%, -50%) translate3d(0, 0, 0)",
              offset: 1 }
          ]
        : [
            { transform: startTransform },
            { transform: "translate(-50%, -50%) translate3d(0, 0, 0)" }
          ];
      activeRetuneAnimations.push(item.button.animate(frames, {
        duration: anchorNode ? 1180 : 1080,
        delay: anchorNode ? 0 : item.index * 18,
        easing: "cubic-bezier(.22, 1, .36, 1)",
        fill: "both"
      }));
    });

    incoming.forEach(function (item) {
      var finalRect = item.button.getBoundingClientRect();
      var destination = rectCenter(finalRect);
      var dx = anchor.x - destination.x;
      var dy = anchor.y - destination.y;
      var distance = Math.sqrt(dx * dx + dy * dy) || 1;
      var arc = 12 + item.index % 3 * 4;
      var arcX = -dy / distance * arc;
      var arcY = dx / distance * arc;
      var delay = 130 + item.index * 28;
      item.button._networkEnterAt = started + delay;
      item.button._networkEnterDuration = 720;
      activeRetuneAnimations.push(item.button.animate([
        {
          transform: "translate(-50%, -50%) translate3d(" +
            dx.toFixed(2) + "px, " + dy.toFixed(2) + "px, 0) scale(.84)",
          opacity: .02,
          offset: 0
        },
        {
          transform: "translate(-50%, -50%) translate3d(" +
            (dx * .42 + arcX).toFixed(2) + "px, " +
            (dy * .42 + arcY).toFixed(2) + "px, 0) scale(.94)",
          opacity: .5,
          offset: .48
        },
        {
          transform: "translate(-50%, -50%) translate3d(0, 0, 0) scale(1)",
          opacity: 1,
          offset: 1
        }
      ], {
        duration: 1050,
        delay: delay,
        easing: "cubic-bezier(.22, 1, .36, 1)",
        fill: "both"
      }));
    });

    retuneDeparting.forEach(function (button, index) {
      var oldRecord = previous[nodeKey(button)];
      var oldCenter = rectCenter(oldRecord.rect);
      var neutralCenter = rectCenter(button.getBoundingClientRect());
      var startX = oldCenter.x - neutralCenter.x;
      var startY = oldCenter.y - neutralCenter.y;
      var directionX = oldCenter.x - anchor.x;
      var directionY = oldCenter.y - anchor.y;
      var distance = Math.sqrt(
        directionX * directionX + directionY * directionY) || 1;
      var leaveX = startX + directionX / distance * 18;
      var leaveY = startY + directionY / distance * 18;
      activeRetuneAnimations.push(button.animate([
        {
          transform: "translate(-50%, -50%) translate3d(" +
            startX.toFixed(2) + "px, " + startY.toFixed(2) + "px, 0)",
          opacity: 1
        },
        {
          transform: "translate(-50%, -50%) translate3d(" +
            leaveX.toFixed(2) + "px, " + leaveY.toFixed(2) +
            "px, 0) scale(.96)",
          opacity: 0
        }
      ], {
        duration: 650,
        delay: 70 + index * 10,
        easing: "cubic-bezier(.4, 0, .7, 1)",
        fill: "both"
      }));
    });

    startNetwork();
    settleTimer = window.setTimeout(function () {
      retuneDeparting.forEach(function (button) {
        if (button.parentNode === nodeLayer) button.remove();
      });
      retuneIncoming.forEach(function (button) {
        button.classList.remove("is-arriving");
        delete button._networkEnterAt;
      });
      Array.prototype.forEach.call(
        nodeLayer.querySelectorAll(".field-node"), function (button) {
          button.classList.remove("is-retune-anchor", "is-departing");
          delete button._networkLeaveAt;
        });
      activeRetuneAnimations.forEach(function (animation) {
        animation.cancel();
      });
      activeRetuneAnimations = [];
      retuneDeparting = [];
      retuneIncoming = [];
      nodeLayer.classList.remove("is-retuning");
      field.classList.remove("is-recomposing");
      if (after) after();
    }, 1460);
  }

  function unfoldNodes(chosen, after) {
    nodeLayer.classList.remove("is-gathering");
    nodeLayer.classList.add("is-folded", "is-unfolding");
    populateNodes(chosen);
    void nodeLayer.offsetWidth;
    window.requestAnimationFrame(function () {
      nodeLayer.classList.remove("is-folded");
      startNetwork();
      settleTimer = window.setTimeout(function () {
        nodeLayer.classList.remove("is-unfolding");
        field.classList.remove("is-recomposing");
        if (after) after();
      }, 760);
    });
  }

  function renderBubbles(chosen, animate, after) {
    window.clearTimeout(recomposeTimer);
    window.clearTimeout(settleTimer);
    var hasExistingNodes = nodeLayer.children.length > 0;
    var shouldRecompose = animate && hasExistingNodes && !reducedMotion;
    var shouldIntroduce = !hasExistingNodes && !reducedMotion;

    if (shouldRecompose) {
      if (nodeLayer.classList.contains("is-retuning")) cancelRetune();
      retuneNodes(chosen, after);
      return;
    }

    if (nodeLayer.classList.contains("is-retuning")) cancelRetune();
    nodeLayer.classList.remove("is-gathering", "is-folded", "is-unfolding");
    field.classList.remove("is-recomposing");
    if (shouldIntroduce) {
      field.classList.add("is-recomposing");
      unfoldNodes(chosen, after);
      return;
    }
    populateNodes(chosen);
    window.requestAnimationFrame(startNetwork);
    if (after) after();
  }

  function markVisibleSelections(chosen) {
    Array.prototype.forEach.call(
      nodeLayer.querySelectorAll(".field-node"), function (button) {
        var key = button.dataset.facet + ":" + button.dataset.term;
        var on = chosen.some(function (term) { return term.key === key; });
        button.classList.toggle("selected", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
      });
  }

  function resultWork(item, index, chosen) {
    var article = document.createElement("article");
    var number = document.createElement("p");
    var heading = document.createElement("h3");
    var link = document.createElement("a");
    var excerpt = document.createElement("p");
    var near = document.createElement("p");
    var matches = chosen.filter(function (term) {
      return item.work.terms.indexOf(term.key) !== -1;
    });
    article.className = "field-result";
    number.className = "field-result-kind";
    number.textContent = "0" + (index + 1);
    link.href = item.work.href;
    link.textContent = item.work.title;
    heading.appendChild(link);
    excerpt.className = "field-result-excerpt";
    excerpt.textContent = item.work.excerpt;
    near.className = "field-result-near";
    near.textContent = matches.length ? matches.map(function (term) {
      return term.label;
    }).join(" · ") : "a more distant door";
    article.appendChild(number);
    article.appendChild(heading);
    if (item.work.excerpt) article.appendChild(excerpt);
    article.appendChild(near);
    return article;
  }

  function renderResults(chosen) {
    results.textContent = "";
    var ranked = works.map(function (work) {
      return { work: work, score: matchCount(work, chosen) };
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.work.height !== a.work.height) return b.work.height - a.work.height;
      return a.work.title < b.work.title ? -1 : 1;
    }).slice(0, 3);
    resultHeading.textContent = chosen.map(function (term) {
      return term.label;
    }).join(" · ");
    ranked.forEach(function (item, index) {
      results.appendChild(resultWork(item, index, chosen));
    });
  }

  function revealResults(chosen, animate) {
    window.clearTimeout(transitionTimer);
    renderResults(chosen);
    function arrive() {
      stopNetwork();
      choice.hidden = true;
      revelation.hidden = false;
      field.classList.remove("is-resolving");
      field.dataset.view = "results";
      resultHeading.focus({ preventScroll: true });
    }
    if (animate && !reducedMotion) {
      field.dataset.view = "resolving";
      field.classList.add("is-resolving");
      transitionTimer = window.setTimeout(arrive, 520);
    } else {
      arrive();
    }
  }

  function renderField(animate, focusNext) {
    var chosen = selectedTerms().slice(0, maximumSignals);
    var n = chosen.length;
    count.textContent = n + " of " + maximumSignals;
    if (revealed && n >= maximumSignals) {
      markVisibleSelections(chosen);
      revealResults(chosen, animate);
      return;
    }
    window.clearTimeout(transitionTimer);
    field.classList.remove("is-resolving");
    field.dataset.view = "choosing";
    choice.hidden = false;
    revelation.hidden = true;
    renderBubbles(chosen, animate, function () {
      if (focusNext) {
        var next = nodeLayer.querySelector(".field-node:not(.selected)");
        if (next) next.focus({ preventScroll: true });
      }
    });
  }

  function update(write, animate, focusNext) {
    if (write) writeHash();
    renderField(animate, focusNext);
  }

  function toggleTerm(facet, term, fromKeyboard) {
    var isOn = selected[facet] && selected[facet][term];
    lastInteractedKey = facet + ":" + term;
    if (!isOn && selectedTerms().length >= maximumSignals) return;
    selected[facet] = selected[facet] || {};
    if (isOn) delete selected[facet][term];
    else selected[facet][term] = true;
    revealed = selectedTerms().length >= maximumSignals;
    update(true, true, fromKeyboard && !revealed);
  }

  function clearField() {
    lastInteractedKey = null;
    selected = {};
    revealed = false;
    update(true, false, false);
  }

  function dailyDraw() {
    lastInteractedKey = null;
    var day = Math.floor(Date.now() / 86400000);
    var work = works[day % works.length];
    var ordered = work.terms.map(function (key) { return termByKey[key]; })
      .filter(function (term) {
        return term && term.facet !== "era" && term.count < works.length;
      }).sort(function (a, b) {
        var priority = { theme: 0, register: 1, world: 2, form: 3 };
        return priority[a.facet] - priority[b.facet];
      });
    openingTerms.forEach(function (key) {
      var term = termByKey[key];
      if (term && !ordered.some(function (item) { return item.key === key; })) {
        ordered.push(term);
      }
    });
    selected = {};
    ordered.slice(0, maximumSignals).forEach(function (term) {
      selected[term.facet] = selected[term.facet] || {};
      selected[term.facet][term.term] = true;
    });
    revealed = selectedTerms().length >= maximumSignals;
    update(true, true, false);
  }

  if (drawButton) drawButton.addEventListener("click", dailyDraw);
  if (resetButton) resetButton.addEventListener("click", clearField);
  if (stage && finePointer && !reducedMotion) {
    stage.addEventListener("pointermove", function (event) {
      if (event.pointerType && event.pointerType !== "mouse" &&
          event.pointerType !== "pen") return;
      var box = stage.getBoundingClientRect();
      magneticPointer.active = true;
      magneticPointer.x = event.clientX - box.left;
      magneticPointer.y = event.clientY - box.top;
    });
    stage.addEventListener("pointerleave", function () {
      magneticPointer.active = false;
    });
    stage.addEventListener("pointercancel", function () {
      magneticPointer.active = false;
    });
    window.addEventListener("blur", function () {
      magneticPointer.active = false;
    });
  }
  window.addEventListener("resize", startNetwork);
  window.addEventListener("scroll", refreshNetworkOffset, { passive: true });
  new MutationObserver(function () {
    networkPalette = null;
    startNetwork();
  }).observe(document.documentElement, {
    attributes: true, attributeFilter: ["data-theme"]
  });
  window.addEventListener("hashchange", function () {
    lastInteractedKey = null;
    readHash();
    revealed = selectedTerms().length >= maximumSignals;
    update(false, false, false);
  });

  readHash();
  revealed = selectedTerms().length >= maximumSignals;
  update(false, false, false);
}());
