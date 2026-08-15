/* Safe, dependency-free Markdown presentation for publication text.
 *
 * This deliberately renders a readable CommonMark-style subset with DOM
 * methods only. Raw HTML is never interpreted, apart from the exact
 * <div align="center"> wrapper used for typographic alignment. The source
 * remains the authority for every original byte and marker.
 */
(function () {
  "use strict";

  const MAX_DEPTH = 24;

  function node(tag, className) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    return value;
  }

  function text(parent, value) {
    if (value) parent.appendChild(document.createTextNode(value));
  }

  function safeLink(raw) {
    const value = String(raw || "").trim();
    if (/^#[A-Za-z0-9_.:-]+$/.test(value)) return value;
    if (/^(https?:|mailto:)/i.test(value)) return value;
    if (/^\/content\/[0-9a-f]{64}i\d+(?:[/?#].*)?$/i.test(value)) {
      return value;
    }
    return null;
  }

  function linkParts(source) {
    const value = source.trim();
    const match = value.match(
      /^(?:<([^>]+)>|([^\s]+))(?:\s+["']([^"']*)["'])?$/);
    return match ? {
      href: safeLink(match[1] || match[2]),
      title: match[3] || "",
    } : { href: null, title: "" };
  }

  function appendInline(parent, source, depth) {
    if (depth > MAX_DEPTH) {
      text(parent, source);
      return;
    }
    let buffer = "";
    let index = 0;
    function flush() {
      text(parent, buffer);
      buffer = "";
    }
    while (index < source.length) {
      const character = source[index];
      if (character === "\\" && index + 1 < source.length &&
          /[\\`*_[\]{}()#+\-.!>]/.test(source[index + 1])) {
        buffer += source[index + 1];
        index += 2;
        continue;
      }
      if (character === "`") {
        let count = 1;
        while (source[index + count] === "`") count += 1;
        const fence = "`".repeat(count);
        const end = source.indexOf(fence, index + count);
        if (end !== -1) {
          flush();
          let value = source.slice(index + count, end).replace(/\n/g, " ");
          if (/^\s.*\s$/.test(value) && value.trim()) value = value.slice(1, -1);
          const code = node("code");
          text(code, value);
          parent.appendChild(code);
          index = end + count;
          continue;
        }
      }
      const image = source.startsWith("![", index);
      if (image || character === "[") {
        const labelStart = index + (image ? 2 : 1);
        const labelEnd = source.indexOf("](", labelStart);
        const destinationEnd = labelEnd === -1 ? -1 :
          source.indexOf(")", labelEnd + 2);
        if (labelEnd !== -1 && destinationEnd !== -1) {
          flush();
          const label = source.slice(labelStart, labelEnd);
          const destination = linkParts(
            source.slice(labelEnd + 2, destinationEnd));
          if (image) {
            const replacement = node("span", "markdown-image-reference");
            replacement.setAttribute("role", "img");
            replacement.setAttribute("aria-label", label || "Markdown image");
            text(replacement, label || "Image");
            parent.appendChild(replacement);
          } else if (destination.href) {
            const anchor = node("a");
            anchor.setAttribute("href", destination.href);
            if (/^https?:/i.test(destination.href)) {
              anchor.setAttribute("target", "_blank");
              anchor.setAttribute("rel", "noopener noreferrer");
            }
            if (destination.title) anchor.setAttribute("title", destination.title);
            appendInline(anchor, label, depth + 1);
            parent.appendChild(anchor);
          } else {
            text(parent, source.slice(index, destinationEnd + 1));
          }
          index = destinationEnd + 1;
          continue;
        }
      }
      const strongMarker = source.startsWith("**", index) ? "**" :
        (source.startsWith("__", index) ? "__" : null);
      if (strongMarker) {
        const end = source.indexOf(strongMarker, index + 2);
        if (end > index + 2) {
          flush();
          const strong = node("strong");
          appendInline(strong, source.slice(index + 2, end), depth + 1);
          parent.appendChild(strong);
          index = end + 2;
          continue;
        }
      }
      if (source.startsWith("~~", index)) {
        const end = source.indexOf("~~", index + 2);
        if (end > index + 2) {
          flush();
          const deleted = node("del");
          appendInline(deleted, source.slice(index + 2, end), depth + 1);
          parent.appendChild(deleted);
          index = end + 2;
          continue;
        }
      }
      if (character === "*" || character === "_") {
        const end = source.indexOf(character, index + 1);
        const insideWord = character === "_" && index > 0 &&
          /[A-Za-z0-9]/.test(source[index - 1]);
        if (!insideWord && end > index + 1) {
          flush();
          const emphasis = node("em");
          appendInline(emphasis, source.slice(index + 1, end), depth + 1);
          parent.appendChild(emphasis);
          index = end + 1;
          continue;
        }
      }
      buffer += character;
      index += 1;
    }
    flush();
  }

  function appendParagraph(parent, lines, depth) {
    const paragraph = node("p");
    lines.forEach((line, position) => {
      const hardBreak = /(?: {2}|\\)$/.test(line);
      const value = hardBreak ? line.replace(/(?: {2}|\\)$/, "") : line;
      appendInline(paragraph, value.trim(), depth);
      if (position < lines.length - 1) {
        paragraph.appendChild(hardBreak ? node("br") :
          document.createTextNode(" "));
      }
    });
    parent.appendChild(paragraph);
  }

  function isFence(line) {
    return line.match(/^ {0,3}(`{3,}|~{3,})\s*([^\s]*)\s*$/);
  }

  function isRule(line) {
    const compact = line.trim().replace(/\s/g, "");
    return compact.length >= 3 &&
      (/^\*+$/.test(compact) || /^-+$/.test(compact) || /^_+$/.test(compact));
  }

  function blockStart(line) {
    return !line.trim() || isFence(line) || isRule(line) ||
      /^ {0,3}#{1,6}\s+/.test(line) || /^ {0,3}>/.test(line) ||
      /^ {0,3}(?:[-+*]|\d+[.)])\s+/.test(line) ||
      /^\s*<div\s+align=["']?center["']?\s*>\s*$/i.test(line) ||
      /^\s*<\/div>\s*$/i.test(line);
  }

  function renderBlocks(root, lines, depth) {
    let parent = root;
    let centered = false;
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }
      if (/^\s*<div\s+align=["']?center["']?\s*>\s*$/i.test(line)) {
        if (!centered) {
          parent = node("div", "markdown-center");
          root.appendChild(parent);
          centered = true;
        }
        index += 1;
        continue;
      }
      if (/^\s*<\/div>\s*$/i.test(line) && centered) {
        parent = root;
        centered = false;
        index += 1;
        continue;
      }
      const fence = isFence(line);
      if (fence) {
        const marker = fence[1];
        const language = fence[2];
        const codeLines = [];
        index += 1;
        const closing = new RegExp("^ {0,3}" + marker[0] +
          "{" + marker.length + ",}\\s*$");
        while (index < lines.length && !closing.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const pre = node("pre");
        const code = node("code");
        if (/^[A-Za-z0-9_-]+$/.test(language)) {
          code.className = "language-" + language;
        }
        text(code, codeLines.join("\n"));
        pre.appendChild(code);
        parent.appendChild(pre);
        continue;
      }
      if (isRule(line)) {
        parent.appendChild(node("hr"));
        index += 1;
        continue;
      }
      const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const title = node("h" + heading[1].length);
        appendInline(title, heading[2], depth);
        parent.appendChild(title);
        index += 1;
        continue;
      }
      if (/^ {0,3}>/.test(line)) {
        const quoted = [];
        while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
          quoted.push(lines[index].replace(/^ {0,3}> ?/, ""));
          index += 1;
        }
        const quote = node("blockquote");
        renderBlocks(quote, quoted, depth + 1);
        parent.appendChild(quote);
        continue;
      }
      const item = line.match(/^ {0,3}([-+*]|\d+[.)])\s+(.+)$/);
      if (item) {
        const ordered = /^\d/.test(item[1]);
        const list = node(ordered ? "ol" : "ul");
        while (index < lines.length) {
          const next = lines[index].match(
            /^ {0,3}([-+*]|\d+[.)])\s+(.+)$/);
          if (!next || /^\d/.test(next[1]) !== ordered) break;
          const listItem = node("li");
          appendInline(listItem, next[2], depth);
          list.appendChild(listItem);
          index += 1;
        }
        parent.appendChild(list);
        continue;
      }
      const paragraph = [line];
      index += 1;
      while (index < lines.length && !blockStart(lines[index])) {
        paragraph.push(lines[index]);
        index += 1;
      }
      appendParagraph(parent, paragraph, depth);
    }
  }

  function render(source) {
    const root = node("div", "markdown-body");
    const normalized = String(source || "").replace(/\r\n?/g, "\n");
    renderBlocks(root, normalized.split("\n"), 0);
    return root;
  }

  window.DEWMarkdown = Object.freeze({ render });
})();
