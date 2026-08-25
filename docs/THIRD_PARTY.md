# Using open source code in this project

Short answer: yes, and most of what runs here already is. The obligations are
usually small, but they are real, and the cost of ignoring them lands later
than the benefit of copying.

## What has been copied in

| What | Where | Source | Licence | Obligation |
|---|---|---|---|---|
| Hermes skill definitions (485 files) | `skills/hermes/` | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | MIT | Keep the copyright and permission notice — now in `skills/hermes/NOTICE.md` |
| Assorted skill packs | `skills/*/LICENSE.txt` | various | MIT | Notices already present upstream |
| npm dependencies | `node_modules/` | many | mostly MIT / Apache-2.0 | Nothing while used as dependencies |

## The rule of thumb

**MIT, BSD, ISC, Apache-2.0** — take it. Keep the copyright notice and licence
text with any substantial copy. Apache-2.0 also asks that you state what you
changed. This covers the overwhelming majority of what is worth taking.

**LGPL** — usable as a library, awkward if you modify it or link it statically.
Ask before reaching for one.

**GPL / AGPL** — do not copy into this codebase. GPL requires anything it is
combined with to be released under the GPL too. AGPL extends that to software
users merely reach over a network, which is exactly what an ERP is. Copying
AGPL code into SupplySure would oblige you to publish SupplySure's source.

**No licence at all** — the default is all rights reserved. A public repository
with no LICENSE file grants nothing, whatever its README implies. This includes
snippets from blog posts, Stack Overflow answers used wholesale, and gists.

## Before copying anything substantial

1. Find the licence. Not the README, the `LICENSE` file.
2. If it is GPL or AGPL, stop.
3. Copy the licence text and copyright line in alongside the code.
4. Record it in the table above.
5. Say in the commit message where it came from, so the next person can trace it.

Small idiomatic fragments — a regex, a date calculation, a three-line helper —
are not what this is about. A directory of files is.

## This project's own licence

`package.json` has no `license` field and there is no `LICENSE` file, so
SupplySure is all rights reserved by default. That is the right posture for
proprietary software and needs no change — but it is worth knowing it is a
default rather than a decision, and that it is the same rule that makes an
unlicensed repository unsafe to copy from.
