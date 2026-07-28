/* cyberdelic.space: verification against Bitcoin, performed in your browser.
 *
 * A faithful port of the press's own node-only verifier (dip/script.py,
 * dip/bitcoin_tx.py, dip/envelope.py, dip/verify.py). It takes a raw reveal
 * transaction, finds the Ordinals envelope in its Taproot witness the way ord
 * itself does, and hashes the exact bytes. Nothing here trusts this website:
 * the transaction comes from independent public sources and every comparison
 * happens on the reader's own machine.
 */
(function () {
  "use strict";

  var OP_FALSE = 0x00, OP_PUSHDATA1 = 0x4c, OP_PUSHDATA2 = 0x4d;
  var OP_PUSHDATA4 = 0x4e, OP_IF = 0x63, OP_ENDIF = 0x68;
  var ANNEX_PREFIX = 0x50;      // BIP341: a final witness element starting 0x50
  var PROTOCOL_ID = "ord";
  var TAG_CONTENT_TYPE = 0x01, TAG_METADATA = 0x05, TAG_CONTENT_ENCODING = 0x09;
  var TAG_PARENT = 0x03;

  // ------------------------------------------------------------ small tools

  function hexToBytes(hex) {
    var clean = String(hex).trim().toLowerCase();
    if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
      throw new Error("not hexadecimal");
    }
    var out = new Uint8Array(clean.length / 2);
    for (var i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  }

  function bytesToHex(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i++) {
      out += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    }
    return out;
  }

  function bytesToUtf8(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  function concat(list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i].length;
    var out = new Uint8Array(total), at = 0;
    for (i = 0; i < list.length; i++) { out.set(list[i], at); at += list[i].length; }
    return out;
  }

  function equalBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  async function sha256hex(bytes) {
    var digest = await crypto.subtle.digest("SHA-256", bytes);
    return bytesToHex(new Uint8Array(digest));
  }

  // --------------------------------------------------- transaction parsing

  function Reader(bytes) { this.b = bytes; this.i = 0; }
  Reader.prototype.need = function (n) {
    if (this.i + n > this.b.length) throw new Error("truncated transaction");
  };
  Reader.prototype.u8 = function () { this.need(1); return this.b[this.i++]; };
  Reader.prototype.uint = function (n) {
    this.need(n);
    var value = 0;
    for (var k = n - 1; k >= 0; k--) value = value * 256 + this.b[this.i + k];
    this.i += n;
    return value;
  };
  Reader.prototype.varint = function () {
    var first = this.u8();
    if (first < 0xfd) return first;
    if (first === 0xfd) return this.uint(2);
    if (first === 0xfe) return this.uint(4);
    return this.uint(8);
  };
  Reader.prototype.bytes = function (n) {
    this.need(n);
    var out = this.b.subarray(this.i, this.i + n);
    this.i += n;
    return out;
  };

  /** Parse a serialized Bitcoin transaction (segwit aware). */
  function parseTx(raw) {
    var r = new Reader(raw);
    var tx = { version: r.uint(4), vin: [], vout: [], locktime: 0 };
    var segwit = false;
    if (r.b[r.i] === 0x00 && r.b[r.i + 1] === 0x01) { segwit = true; r.i += 2; }
    var nIn = r.varint(), i, k;
    for (i = 0; i < nIn; i++) {
      var prevTxid = r.bytes(32);
      var prevVout = r.uint(4);
      var scriptSig = r.bytes(r.varint());
      var sequence = r.uint(4);
      tx.vin.push({ prevTxid: prevTxid, prevVout: prevVout,
                    scriptSig: scriptSig, sequence: sequence, witness: [] });
    }
    var nOut = r.varint();
    for (i = 0; i < nOut; i++) {
      var value = r.uint(8);
      tx.vout.push({ value: value, scriptPubKey: r.bytes(r.varint()) });
    }
    if (segwit) {
      for (i = 0; i < tx.vin.length; i++) {
        var count = r.varint(), items = [];
        for (k = 0; k < count; k++) items.push(r.bytes(r.varint()));
        tx.vin[i].witness = items;
      }
    }
    tx.locktime = r.uint(4);
    if (r.i !== raw.length) throw new Error("trailing bytes after transaction");
    return tx;
  }

  /** The tapscript of a Taproot script-path witness, per BIP341.
   *
   * If the final element begins with 0x50 (and at least two elements exist) it
   * is the annex and is dropped first. The script is then the element
   * immediately before the control block, never any other element, which is
   * what stops a decoy envelope elsewhere in the witness being mistaken for
   * the inscription.
   */
  function tapscript(witness) {
    var elements = witness.slice();
    if (elements.length >= 2 &&
        elements[elements.length - 1].length >= 1 &&
        elements[elements.length - 1][0] === ANNEX_PREFIX) {
      elements = elements.slice(0, -1);
    }
    if (elements.length < 2) return null;   // key-path spend: no script
    return elements[elements.length - 2];
  }

  // -------------------------------------------------------- script parsing

  /** Tokenize a script, keeping the exact byte span of every instruction. */
  function tokenize(script) {
    var out = [], i = 0, n = script.length;
    while (i < n) {
      var start = i, op = script[i], end;
      i += 1;
      if (op === 0x00) {
        out.push({ op: op, data: new Uint8Array(0), start: start, end: i });
      } else if (op <= 75) {
        end = i + op;
        if (end > n) throw new Error("truncated direct push");
        out.push({ op: op, data: script.subarray(i, end), start: start, end: end });
        i = end;
      } else if (op === OP_PUSHDATA1 || op === OP_PUSHDATA2 || op === OP_PUSHDATA4) {
        var width = op === OP_PUSHDATA1 ? 1 : (op === OP_PUSHDATA2 ? 2 : 4);
        if (i + width > n) throw new Error("truncated pushdata length");
        var length = 0;
        for (var k = width - 1; k >= 0; k--) length = length * 256 + script[i + k];
        i += width;
        end = i + length;
        if (end > n) throw new Error("truncated pushdata");
        out.push({ op: op, data: script.subarray(i, end), start: start, end: end });
        i = end;
      } else {
        out.push({ op: op, data: null, start: start, end: i });
      }
    }
    return out;
  }

  function isPush(token) { return token.data !== null; }

  /** Parse one envelope beginning at OP_FALSE OP_IF; mirrors dip/envelope.py. */
  function parseOne(tokens, start) {
    var i = start + 2, n = tokens.length;
    if (i >= n || !isPush(tokens[i]) ||
        bytesToUtf8(tokens[i].data) !== PROTOCOL_ID) {
      return { inscription: null, next: start + 1, endif: null };
    }
    i += 1;
    var headers = {}, bodyParts = [], inBody = false, endif = null;
    while (i < n) {
      var token = tokens[i];
      if (token.op === OP_ENDIF && !isPush(token)) { endif = i; i += 1; break; }
      if (!isPush(token)) return { inscription: null, next: i + 1, endif: null };
      if (inBody) { bodyParts.push(token.data); i += 1; continue; }
      if (token.data.length === 0) { inBody = true; i += 1; continue; }
      if (i + 1 >= n || !isPush(tokens[i + 1])) {
        return { inscription: null, next: i + 1, endif: null };
      }
      var tag = token.data.length === 1 ? token.data[0] : -1;
      (headers[tag] = headers[tag] || []).push(tokens[i + 1].data);
      i += 2;
    }
    if (endif === null) return { inscription: null, next: i, endif: null };
    function first(tag) { return headers[tag] ? headers[tag][0] : null; }
    function joined(tag) { return headers[tag] ? concat(headers[tag]) : null; }
    return {
      inscription: {
        body: concat(bodyParts),
        contentType: first(TAG_CONTENT_TYPE),
        metadata: joined(TAG_METADATA),
        contentEncoding: first(TAG_CONTENT_ENCODING),
        parents: headers[TAG_PARENT] || [],
      },
      next: i,
      endif: endif,
    };
  }

  /** Every (inscription, exact envelope bytes) pair in a script. */
  function parseEnvelopes(script) {
    var tokens;
    try { tokens = tokenize(script); } catch (error) { return []; }
    var out = [], i = 0, n = tokens.length;
    while (i < n - 1) {
      if (tokens[i].op === OP_FALSE && isPush(tokens[i]) &&
          tokens[i].data.length === 0 &&
          tokens[i + 1].op === OP_IF && !isPush(tokens[i + 1])) {
        var parsed = parseOne(tokens, i);
        if (parsed.inscription) {
          out.push({
            inscription: parsed.inscription,
            bytes: script.subarray(tokens[i].start, tokens[parsed.endif].end),
          });
        }
        i = parsed.next;
      } else {
        i += 1;
      }
    }
    return out;
  }

  /** Every inscription in a raw reveal transaction, in ord's own iN order. */
  function extractInscriptions(rawHex) {
    var tx;
    try { tx = parseTx(hexToBytes(rawHex)); } catch (error) { return []; }
    var found = [];
    for (var i = 0; i < tx.vin.length; i++) {
      var script = tapscript(tx.vin[i].witness);
      if (!script) continue;
      found = found.concat(parseEnvelopes(script));
    }
    return found;
  }

  function extractInscription(rawHex, index) {
    var found = extractInscriptions(rawHex);
    return (index >= 0 && index < found.length) ? found[index] : null;
  }

  function inscriptionTxid(id) { return String(id).replace(/i\d+$/, ""); }
  function inscriptionIndex(id) {
    var match = /i(\d+)$/.exec(String(id));
    return match ? parseInt(match[1], 10) : 0;
  }

  // ------------------------------------------------------- fetching sources

  var SOURCES = {
    mainnet: [
      { name: "mempool.space",
        url: function (t) { return "https://mempool.space/api/tx/" + t + "/hex"; } },
      { name: "blockstream.info",
        url: function (t) { return "https://blockstream.info/api/tx/" + t + "/hex"; } },
    ],
    signet: [
      { name: "mempool.space (signet)",
        url: function (t) { return "https://mempool.space/signet/api/tx/" + t + "/hex"; } },
    ],
  };

  async function fetchText(url, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 15000);
    try {
      var response = await fetch(url, {
        signal: controller.signal, referrerPolicy: "no-referrer", mode: "cors",
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return (await response.text()).trim();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Ask every independent source for this transaction. */
  async function fetchReveal(txid, network) {
    var sources = SOURCES[network] || [];
    var results = await Promise.all(sources.map(async function (source) {
      try {
        return { name: source.name, hex: await fetchText(source.url(txid)) };
      } catch (error) {
        return { name: source.name, error: String(error.message || error) };
      }
    }));
    return results;
  }

  // ------------------------------------------------------------ the verdict

  /**
   * Verify a work against Bitcoin.
   *
   * @param work      the work record shown on this page
   * @param pageBytes the exact bytes this page is displaying
   * @returns a verdict object; `ok` is true only when independent chain data
   *          reproduces the bytes on screen.
   */
  async function verifyAgainstChain(work, pageBytes) {
    var network = work.network;
    var txid = work.chain.reveal_txid || inscriptionTxid(work.inscription_id);
    var index = inscriptionIndex(work.inscription_id);
    var steps = [];
    var sources = await fetchReveal(txid, network);
    var good = sources.filter(function (s) { return s.hex; });
    var failed = sources.filter(function (s) { return s.error; });

    failed.forEach(function (s) {
      steps.push({ level: "note", text: s.name + " could not be reached (" +
                   s.error + ")" });
    });
    if (!good.length) {
      return { ok: false, unreachable: true, steps: steps,
               headline: "Could not reach any public Bitcoin source." };
    }
    good.forEach(function (s) {
      steps.push({ level: "ok", text: "Fetched the reveal transaction from " +
                   s.name + "." });
    });

    var agree = good.every(function (s) {
      return s.hex.toLowerCase() === good[0].hex.toLowerCase();
    });
    if (good.length > 1) {
      if (!agree) {
        return { ok: false, steps: steps.concat([{ level: "bad",
          text: "Independent sources returned different transactions." }]),
          headline: "Sources disagree about this transaction." };
      }
      steps.push({ level: "ok", text: "Independent sources returned byte-identical transactions." });
    }

    var found = extractInscription(good[0].hex, index);
    if (!found) {
      return { ok: false, steps: steps.concat([{ level: "bad",
        text: "No inscription envelope at position " + index +
              " in that transaction." }]),
        headline: "No inscription found on chain." };
    }
    steps.push({ level: "ok",
                 text: "Read the inscription envelope out of the Taproot witness." });

    var encoding = found.inscription.contentEncoding;
    var encoded = encoding && encoding.length
      ? bytesToUtf8(encoding) : null;

    var envelopeDigest = await sha256hex(found.bytes);
    var envelopeOk = !work.digests.envelope_sha256 ||
                     envelopeDigest === work.digests.envelope_sha256;
    steps.push({ level: envelopeOk ? "ok" : "bad",
      text: envelopeOk
        ? "The on-chain envelope matches the published envelope digest."
        : "The on-chain envelope digest is " + envelopeDigest +
          ", not the published " + work.digests.envelope_sha256 + "." });

    if (found.inscription.metadata && work.digests.metadata_cbor_sha256) {
      var metadataDigest = await sha256hex(found.inscription.metadata);
      var metadataOk = metadataDigest === work.digests.metadata_cbor_sha256;
      steps.push({ level: metadataOk ? "ok" : "bad",
        text: metadataOk
          ? "The on-chain metadata matches the published metadata digest."
          : "The on-chain metadata digest does not match the published one." });
      if (!metadataOk) envelopeOk = false;
    }

    if (encoded) {
      steps.push({ level: "note", text: "The body is stored with content " +
        "encoding “" + encoded + "”, which this browser cannot " +
        "decode; the body comparison below is skipped." });
      return { ok: false, partial: true, steps: steps,
               headline: "Envelope verified; encoded body not comparable here." };
    }

    var bodyDigest = await sha256hex(found.inscription.body);
    var approvedOk = bodyDigest === work.digests.content_sha256;
    steps.push({ level: approvedOk ? "ok" : "bad",
      text: approvedOk
        ? "The on-chain body matches this work's published digest."
        : "The on-chain body digest is " + bodyDigest + ", not the published " +
          work.digests.content_sha256 + "." });

    var sameAsPage = pageBytes ? equalBytes(found.inscription.body, pageBytes) : null;
    if (pageBytes) {
      steps.push({ level: sameAsPage ? "ok" : "bad",
        text: sameAsPage
          ? "The bytes on chain are byte-for-byte the bytes on this page."
          : "The bytes on this page differ from the bytes on chain." });
    }

    var ok = envelopeOk && approvedOk && sameAsPage !== false;
    return {
      ok: ok,
      steps: steps,
      sources: good.map(function (s) { return s.name; }),
      bodyDigest: bodyDigest,
      envelopeDigest: envelopeDigest,
      headline: ok
        ? "Verified against Bitcoin."
        : "These bytes do not match what is on Bitcoin.",
    };
  }

  window.DEWVerify = {
    hexToBytes: hexToBytes, bytesToHex: bytesToHex, sha256hex: sha256hex,
    equalBytes: equalBytes, parseTx: parseTx, tapscript: tapscript,
    tokenize: tokenize, parseEnvelopes: parseEnvelopes,
    extractInscriptions: extractInscriptions,
    extractInscription: extractInscription,
    inscriptionTxid: inscriptionTxid, inscriptionIndex: inscriptionIndex,
    verifyAgainstChain: verifyAgainstChain, sources: SOURCES,
  };
})();
