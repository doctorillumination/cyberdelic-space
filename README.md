# cyberdelic.space

The published library of cyberdelic.space, a decentralized imagination press.
Its Library holds 7 works inscribed
into the Bitcoin blockchain on mainnet. Field and Workshop publications are
separate, visibly living, versioned records under `/project/`.

`field-notes.json` indexes the 28 Cyberdelic OS Field Notes individually with
stable identifiers, fragment URLs, summaries, themes, and named concepts.

**This directory is generated.** It is the built output of the press's reader
(`reader/build_site.py`), and it is also a mirror: everything needed to read the
library, and to check it against Bitcoin, is here.

## Read it anywhere

    python -m http.server 8000

Then open <http://localhost:8000>. No build step, no database, no network calls
to the press. Every page works from a plain file server, which is the point.

## Check it without trusting anyone

Each work carries its inscription id, both transaction ids, its block, and the
SHA-256 of its exact bytes. `/verify/` explains the four levels, from hashing
the bytes in your own browser to reading the inscription out of the reveal
transaction on your own Bitcoin node. The inscribed bytes themselves are under
`/content/`, one folder per inscription, so you can fetch and hash them alone:

    curl -sL https://cyberdelic.space/library.json

Living indexes are available separately at `field.json`, `field-notes.json`,
and `workshop.json`, so archives can preserve their revisable status rather
than presenting them as Bitcoin inscriptions.

## Copying this is encouraged

A mirror holds no keys and no wallet, so it can never publish anything. It can
only be checked against the chain. That asymmetry is why copying it freely is
safe, and why a press that means what it says about permanence should want you
to.
