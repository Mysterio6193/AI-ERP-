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
| Retry classification approach | `src/lib/agent/retry.ts` | [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot) | Apache-2.0 | Notice in `docs/licences/openmausbot-Apache-2.0.txt`; own implementation |
| Turn watchdog clock | `src/lib/agent/watchdog.ts` | [CopilotKit/OpenBot](https://github.com/CopilotKit/OpenBot) | MIT | Notice in `docs/licences/openbot-MIT.txt`; adapted, not copied wholesale |
| Constant-time secret compare | `src/lib/secret-compare.ts` | [CopilotKit/OpenBot](https://github.com/CopilotKit/OpenBot) | MIT | Same notice; Node's `timingSafeEqual` does the work, the length guard is theirs |

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

## Reading a project without copying from it

Reading how someone else solved a problem is not copying, and it is often worth
more. `src/lib/agent/retry.ts` came out of reading OpenMausBot's driver retry
and taking the *idea* — that the useful question is "would trying again help",
not "did it fail" — then writing our own against our own provider. The header
credits it because the debt is real even though no lines were taken.

The same is true of `src/lib/agent/watchdog.ts`: OpenBot's version watches a
third-party AG-UI endpoint's HTTP stream, which is not our architecture at all,
but the clock inside it — and specifically its insistence that time spent
waiting on the *consumer* must not count against the *producer* — is the part
that makes a watchdog correct instead of merely present, and it transfers
whole. Apache-2.0 asks that changes be stated, which the notice files do.

That reading also found two bugs in our code that no amount of staring at our
own code had surfaced: every OpenRouter reply was truncated at 256 tokens, and
the retry path only ran for models whose id ended `:free`, which the configured
default does not. Comparing against another implementation is a cheap way to
notice what you have stopped seeing.

## This project's own licence

`package.json` has no `license` field and there is no `LICENSE` file, so
SupplySure is all rights reserved by default. That is the right posture for
proprietary software and needs no change — but it is worth knowing it is a
default rather than a decision, and that it is the same rule that makes an
unlicensed repository unsafe to copy from.
