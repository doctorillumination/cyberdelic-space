# Instrument I-01: Cyberdelic Studio

## A human-scale instrument for deliberate public memory

- **Project:** CyberdelicOS
- **Office:** Instruments
- **Status:** Proposed, living, and versioned
- **Version:** 0.1
- **Date:** August 15, 2026
- **Author:** Brad Necyk, with machine collaborators
- **Primary verb:** INSCRIBE
- **Supporting verbs:** ATTEND, CARRY, RATIFY, TEND, END, and FORGET
- **Working software:** DEW LINE Studio 0.3 in [doctorillumination/cyberdelic-studio](https://github.com/doctorillumination/cyberdelic-studio)

*This is an accessible white paper about a working instrument. It explains the purpose and shape of Cyberdelic Studio without requiring prior knowledge of Bitcoin, Ordinals, cryptography, or CyberdelicOS.*

This is not the comprehensive CyberdelicOS white paper proposed for after a first organ and a parallax experiment. It is a narrower report from an organ that now exists.

## The short version

Cyberdelic Studio is a local publishing instrument for the rare moment when a living work is intentionally carried into durable public memory.

It helps a person prepare a work, name who contributed to it, understand what permanence means, review the exact digital object that will be published, approve the cost and network, inscribe it through Bitcoin, verify what happened, and release a reader that other people can copy.

The Studio does not treat permanence as a default setting. Most thoughts, drafts, conversations, and unfinished works should remain private, revisable, or forgettable. The Studio exists for the smaller class of works that a person consciously chooses to address to the future.

Its central question is not:

> How can we put more content on a blockchain?

It is:

> What would a humane ceremony for irreversible publication require?

## Why this instrument exists

Digital publication is usually easy to begin and difficult to understand.

A person uploads a file, accepts terms they did not write, and receives a page on a platform they do not control. The platform may alter the display, remove the work, disappear, track its readers, or make the original file difficult to recover. The creator is asked to trust an interface while the important operations remain hidden.

Bitcoin offers a different possibility. A work can be placed into a public record that no single press, gallery, company, or government controls. But technical durability is not enough. Irreversible publication can magnify mistakes in consent, attribution, privacy, security, and judgment. A command line can make bytes permanent without helping a person understand what they are doing.

Cyberdelic Studio is the layer between the human decision and the technical act.

It makes the publication object visible before it becomes permanent. It separates drafting from approval, rehearsal from real publication, and evidence from interpretation. It turns inscription from a hidden command into a sequence of legible choices.

## The place of the Studio inside CyberdelicOS

The Cyberdelic Kernel proposes thirteen basic operations for a different kind of digital world. Cyberdelic Studio is an early working organ built around one of them: **INSCRIBE**.

INSCRIBE means that a small number of works may cross, deliberately and ceremonially, into permanent public memory. The act should be chosen, consented to, costly, and rare.

The Studio also depends on six related operations:

| Kernel verb | What it means in the Studio |
| --- | --- |
| **ATTEND** | Begin with the work and the creator's intention, not with a feed, market, or token. |
| **CARRY** | Keep context, attribution, rights, and lineage attached as the work moves. |
| **RATIFY** | Require a human to approve the exact work, metadata, network, and cost before broadcast. |
| **TEND** | Preserve readers, records, verification paths, editions, and mirrors after publication. |
| **END** | Give the publication ceremony a visible completion instead of opening an endless engagement loop. |
| **FORGET** | Protect the boundary around what should never become permanent. |
| **INSCRIBE** | Place the approved work into durable public memory and publish the evidence. |

The Studio is not the whole operating system. It does not yet provide the private Hearth, the village of bounded agents, the Observatory, or the full field of living memory imagined in the Field Notes. It is one instrument with a defined office and a narrow responsibility.

That limitation is part of its integrity.

## Memory has temperatures

CyberdelicOS distinguishes memory by temperature:

| Memory | Character | Current relationship to the Studio |
| --- | --- | --- |
| **Living memory** | Private or shared, fast, revisable, and capable of deletion | The work begins here. Studio drafts and local rehearsals remain changeable. A future Hearth would hold the fuller living archive. |
| **Anchored memory** | A public timestamp proves that a private archive existed without revealing its contents | Part of the wider CyberdelicOS design, but not the Studio's central publication path today. |
| **Inscribed memory** | Public, durable, costly, and intentionally difficult to erase | The Studio's primary office. |

This separation matters because permanence is not always a virtue.

A private journal, a patient's story, an unfinished collaboration, a child's image, a recovery phrase, or a thought a person may later need to withdraw should not become permanent merely because the technology allows it. The ability to remember everything creates a corresponding obligation to refrain.

Cyberdelic Studio therefore begins with a boundary: most memory does not belong here.

## The publication circuit

The current Studio organizes publication into five human-readable stages:

```text
WORK
  to ATTRIBUTION
  to PUBLICATION
  to NETWORK AND COST
  to REVIEW AND INSCRIBE
  to VERIFICATION, READING, AND STEWARDSHIP
```

### 1. Work

The person brings in plain text, Markdown, HTML, code, JSON, or a supported book. The Studio preserves the work as exact bytes and shows its size and cryptographic digest.

A digest is a short fingerprint calculated from the file. If even one byte changes, the fingerprint changes. This lets the Studio bind every later approval to one exact version of the work.

The preview may help a person read the work, but it must never silently rewrite the source.

### 2. Attribution

The person records who contributed and how. The Studio distinguishes an original work from a quotation, authorized material, or public domain source. It can preserve roles, dates, editions, AI disclosure, and parent-child lineage.

This metadata does not magically prove authorship. It makes a claim explicit, structured, and available for scrutiny. Provenance becomes something a reader can inspect rather than a line of marketing copy.

### 3. Publication

The person chooses what kind of public object they intend to make.

**Public Memory** is intended as a permanent public record. The press promises not to list or sell the inscription and records that stewardship policy in its metadata.

**Collectible** is explicitly intended to remain transferable and potentially move through wallets or marketplaces.

This distinction is ethical and editorial, not magical. A Public Memory inscription still exists on a technically spendable unit of Bitcoin. The Studio can record and uphold a stewardship promise, but it does not pretend that a label creates a protocol-level transfer lock.

### 4. Network and cost

The person chooses where the act will occur.

**Rehearsal** simulates the complete circuit locally without spending money or publishing anything. It is the default place to learn and to discover mistakes.

**Signet** is Bitcoin's public testing network. It lets a person practice with real network behavior but no mainnet financial consequence.

**Mainnet** is the live Bitcoin network. Here the inscription has a real fee and real permanence.

The Studio shows the fee plan before broadcast. A change in the work, metadata, network, or fee invalidates the earlier approval. Mainnet is never allowed to become an accidental default.

### 5. Review and inscribe

The final review binds consent to the exact content, metadata, inscription envelope, network, and cost.

Preparation and broadcast are separate actions. The person can inspect what is ready without sending it. Only a new, explicit authorization can cross the threshold into broadcast.

If the network response becomes uncertain, the Studio does not blindly try again. It records the pending state and reconciles what happened. This matters because repeating an apparently failed action could create a second irreversible publication.

When the process completes, the Studio produces a publication record and a reader. The ceremony ends with evidence rather than a demand for further engagement.

## What is actually made permanent

An inscription contains the work's bytes and structured metadata inside a Bitcoin transaction. The Studio prepares this object deterministically, meaning the same approved inputs produce the same package.

The publication record includes enough information to inspect the result:

- the exact content bytes and their digest;
- the structured metadata and its digest;
- the complete inscription envelope and its digest;
- the commit and reveal transactions;
- the inscription identifier;
- the Bitcoin block and confirmation state when known;
- the declared contributors, rights, lineage, and publication intent;
- the versions of important tools used in the process.

These records make the act legible, but they do not ask readers to trust the press as the final authority.

## Verification without faith in the publisher

Cyberdelic Studio and cyberdelic.space treat verification as a ladder. A reader can stop at the level that fits their needs or go all the way down to the transaction bytes.

1. **Read the published record.** It states what the press claims happened.
2. **Hash the content.** A browser can confirm that the file being shown matches the approved digest.
3. **Inspect the transaction.** Independent explorers can confirm that the transaction exists in a Bitcoin block.
4. **Read the inscription from Bitcoin.** A browser or local Bitcoin node can extract the inscription envelope from the reveal transaction and compare the work, metadata, and digests byte for byte.
5. **Copy the press.** The public library is a static set of files. A mirror can preserve the readers and repeat the verification without possessing the publishing wallet.

The strongest path does not depend on the Studio, the press's server, or even an Ordinals index. A Bitcoin node can retrieve the reveal transaction, find the inscription in its witness data, and compare it with the approved record.

This is an important asymmetry. A mirror can preserve and verify what was published, but it cannot publish a new work under the press's authority because it holds no keys.

## What Bitcoin can prove, and what it cannot

Bitcoin can support narrow, powerful claims:

- particular bytes were included in a particular transaction;
- the transaction entered a particular block;
- the published file matches those bytes;
- the recorded object has not been silently changed without detection.

Bitcoin cannot prove:

- that the work is true;
- that it is wise, humane, original, or valuable;
- that every contributor consented;
- that a rights claim is legally valid;
- that the press made a good editorial decision;
- that permanence was morally justified.

Those remain human responsibilities. The ledger can witness a decision. It cannot make the decision for us.

Cyberdelic Studio is therefore not a truth machine. It is a tool for making the object, evidence, and responsibility of publication unusually visible.

## A local instrument with a public consequence

The Studio runs locally. Its publishing engine, wallet controls, journals, and Bitcoin services remain on the operator's machine. The public reader has no wallet, account, analytics, advertising, or publishing authority.

This separation follows a wider CyberdelicOS principle: the archive lives at home, while any crossing into public systems is explicit and purpose-bound.

The local application includes safeguards for consequential operations:

- rehearsal before live publication;
- separate Signet and Mainnet environments;
- exact-byte approval;
- pinned and fingerprinted Bitcoin tools;
- local-only service endpoints;
- durable journals for interrupted operations;
- no blind retry after an uncertain broadcast;
- recovery checks before live wallet use;
- explicit review of network fees and destination addresses.

These controls do not remove risk. They make risk more visible and reduce the number of ways a person can cross the threshold by accident.

## One work, several truthful views

A published work can be approached through several views without pretending they are the same experience.

**Read** gives the work a calm presentation.

**Source** reveals the exact text or code that was approved.

**Blockchain** shows the transaction, block, confirmations, and verification route.

**Hex** exposes the underlying bytes for technical inspection.

**Metadata** shows attribution, rights, provenance, edition, AI disclosure, lineage, and the origin of each field.

The point is not to force every reader to become a cryptographer. It is to let a person move from encounter to evidence without changing objects or trusting a different story at each layer.

The same work can remain beautiful, inspectable, and technically accountable.

## Books, editions, and living lineage

Permanent memory should not require the fiction that a work never changes.

The Studio can prepare multi-part editions. An Edition Root commits to the planned order and digest of every part before the parts are published. Each part can then be inscribed as a native child in that sequence. A Final Edition Manifest binds the resulting inscription identifiers back to the original plan.

Later corrections, translations, responses, and new editions should stand beside earlier versions with visible lineage. They do not silently replace history.

This approach holds two truths at once:

- an inscribed version does not change;
- a living work may continue to develop.

The durable record becomes a history of becoming rather than a claim that becoming has ended.

## Accessibility is part of the trust model

A publication ceremony is not meaningfully consensual if only a specialist can understand it.

The Studio therefore treats accessibility as part of technical integrity:

- ordinary language accompanies blockchain terminology;
- important choices state their consequences;
- keyboard navigation and visible focus are supported;
- color is never the only signal of warning or verification state;
- motion can be reduced;
- reading size, line height, and measure can be adjusted;
- graphs and byte tables have text alternatives;
- error states preserve the person's work and offer a clear recovery path;
- the main creative path avoids hidden menus and unexplained defaults.

Accessibility here means more than compliance. It means making power legible to the person being asked to exercise it.

## Present state

The working repository currently identifies the application as **DEW LINE Studio 0.3**. It is a substantial local prototype and mainnet-readiness candidate, not a finished consumer product.

The implemented system includes exact-byte packaging, local rehearsal, Signet and Mainnet profiles, inscription verification, a local library, static mirror export, multi-part editions, EPUB import, publication recovery, and controlled transfer of verified Collectibles. The wider press has already used this lineage of tools to publish and verify Public Memory inscriptions on Bitcoin.

Important limits remain:

- irreversible publication still requires informed human judgment;
- operating a full Bitcoin and Ordinals environment remains demanding;
- a stewardship label is not a transfer lock;
- marketplace sale protocols are outside the present release;
- legal rights and consent cannot be established by metadata alone;
- the interface needs observation with people who did not help build it;
- long-term maintenance, recovery, and succession are cultural obligations as much as technical ones.

Calling the Studio an instrument is useful because an instrument does not replace its operator. It extends perception and action while requiring calibration, practice, and responsibility.

## What this first organ teaches CyberdelicOS

Cyberdelic Studio turns several ideas from the Kernel and Field Notes into working constraints.

It demonstrates that values can become operations. "Permanence should be rare" becomes a default rehearsal network, a separate broadcast step, and an exact acknowledgement. "Provenance should be legible" becomes structured contributions, source relationships, digests, and lineage. "The archive lives at home" becomes a local engine and wallet-free public reader. "Memory has temperatures" becomes a visible boundary between drafts, rehearsals, and inscriptions.

It also reveals where poetry is insufficient.

Consent must be bound to bytes. A failed network call can create ambiguity. A mirror can corrupt line endings. A public label can overstate what a protocol enforces. A reader can quietly trust a stale record instead of the chain. A wallet recovery ritual can be secure in code and still frightening in practice.

These are not side issues. They are where a constitutional idea either survives contact with software or becomes decoration.

The Studio is therefore both an implementation and a question addressed back to the Kernel:

> Can a digital system make consequence more perceptible before asking a person to act?

## The next honest tests

The next stage should be measured through observed use rather than additional claims.

1. Invite a creator with no Bitcoin experience to complete a rehearsal without verbal guidance.
2. Ask them to explain, in their own words, what will become permanent and what will remain local.
3. Test whether attribution, consent, cost, and uncertainty are understood before approval.
4. Interrupt the process and confirm that recovery does not invite a dangerous retry.
5. Rebuild a public reader from the resulting record on a clean machine.
6. Ask an independent reader to verify the work without trusting the press.
7. Document confusion, refusal, fear, delight, failure, and changed assumptions.

The Studio should not be judged only by whether it can publish.

It should be judged by whether a person remains more informed, more deliberate, and more capable of refusal at the moment publication becomes irreversible.

## Invitation

Cyberdelic Studio is one answer to one Kernel verb. It is not the final interface for public memory, and it does not ask to become a universal gate.

Build another ceremony. Test this one. Identify a hidden assumption. Improve the verification path. Design a more merciful boundary. Carry the instrument into another publishing culture and report what fails.

The smallest useful response is concrete:

> Bring one work. Rehearse the crossing. Publish nothing by accident. Return with the trace.

## Sources carried into this paper

- *The Cyberdelic Kernel*, Transmission 01, version 1.0
- *Cyberdelic OS Living Field Notes*, version 0.6
- *Cyberdelic Cognitive Instrument*, version 0.1
- *Core Philosophy: Working Notes*
- *Cyberdelic OS Publication Recommendations*
- *DEW LINE Studio 0.3*, software README and implementation
- *DEW LINE Studio: Desktop Application Plan*
- *cyberdelic.space: Public Reader Architecture*
- *Artifact A-01: Cyberdelic.space*
- *Builder Note BN-01: Building INSCRIBE*

---

*Instrument I-01, version 0.1. Drafted in a cyberdelic loop from Brad Necyk's concepts, the Cyberdelic Kernel and Field Notes, and the working Cyberdelic Studio codebase. Proposed for human ratification. Future versions should preserve substantive changes in visible history.*
