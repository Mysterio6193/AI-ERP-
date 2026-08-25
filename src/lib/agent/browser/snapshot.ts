import type { Page } from "playwright"

/**
 * Reading a page in a form a text model can afford.
 *
 * The obvious way to show a page to a model is a screenshot, and it is the
 * wrong way here. A screenshot needs a vision model, costs thousands of tokens
 * a look, and gives the model pixels when what it needs is "there is a button
 * called Sign in". Our agent runs on a free-tier text model with 88 tool
 * definitions already in the prompt; a screenshot per step is not affordable
 * and would not help if it were.
 *
 * So a page arrives as a short list of the things that can be acted on, each
 * with a reference the model quotes back to act on it. Roughly the shape of an
 * accessibility tree, which is the same reason screen readers use one: it is
 * what the page *means* rather than what it looks like.
 *
 * The approach — an accessibility-style element list with refs, instead of
 * pixels — is OpenBot's, from `agent-computer/src/aria-snapshot.ts` (MIT); see
 * docs/THIRD_PARTY.md. The implementation is ours and works differently: they
 * parse Playwright's aria-snapshot YAML, which in 1.62 does not emit the refs
 * they parse. Tagging the elements ourselves means a ref always resolves back
 * to the element it came from, which is the property that matters when the
 * next thing the model does is click it.
 */

/** The attribute a ref is stored in. Namespaced so a page's own attributes cannot collide. */
export const REF_ATTRIBUTE = "data-supplysure-ref"

export interface SnapshotElement {
  /** What the model quotes back to act on this element. */
  ref: string
  role: string
  name: string
  /** Current value of an input, so the model can see what is already filled in. */
  value?: string
  disabled?: boolean
  checked?: boolean
  /** Where a link goes, which is often the whole reason to read one. */
  href?: string
}

export interface PageSnapshot {
  url: string
  title: string
  elements: SnapshotElement[]
  /** Readable page text, trimmed. The model still needs to read the thing. */
  text: string
  /** True when the element list was cut short. */
  truncated: boolean
}

/**
 * Enough to work with, few enough to fit in a prompt.
 *
 * A page with more interactive elements than this is a search-results or
 * report page, where the useful next step is almost always to narrow the page
 * rather than to read all of it.
 */
export const MAX_ELEMENTS = 120

/** Page prose, past which nothing is being read carefully anyway. */
export const MAX_TEXT = 3000

/**
 * Collect the page's interactive elements and tag each with a ref.
 *
 * Runs inside the page, so it is written as a self-contained function with no
 * imports — nothing from this module's scope exists on the other side.
 */
/**
 * The script that runs inside the page, kept as a string on purpose.
 *
 * Passing a real function here is the obvious thing and it breaks. Bundlers
 * that enable esbuild's `keepNames` — tsx does, and a Next build may — rewrite
 * every named function into `__name(fn, "fn")` to preserve `fn.name`. That
 * helper is defined in *our* module scope, and the function is serialised and
 * evaluated in the *browser's*, where nothing called `__name` exists. The page
 * throws `ReferenceError: __name is not defined` and every snapshot fails.
 *
 * It is a nasty failure because it depends on the build rather than the code:
 * it can pass locally and break once bundled, or the reverse. A string is not
 * transformed by anything, so it behaves the same under every build.
 *
 * The cost is no type checking inside. That is a smaller loss than it looks —
 * this code only touches DOM APIs, none of our own types, so there is little
 * for the checker to verify.
 *
 * A string also cannot take arguments: Playwright evaluates it as an
 * expression and silently ignores anything passed alongside, which returns
 * `undefined` rather than failing. The three values it needs are compile-time
 * constants, so they are interpolated in and the whole thing is written as an
 * expression that calls itself.
 */
const SNAPSHOT_SCRIPT = String.raw`(function () {
  var refAttribute = "${REF_ATTRIBUTE}";
  var maxElements = ${MAX_ELEMENTS};
  var maxText = ${MAX_TEXT};

  var INTERACTIVE = [
    "a[href]", "button", "input", "select", "textarea",
    "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]",
    "[role=tab]", "[role=menuitem]", "[role=combobox]", "[role=textbox]",
    "[role=switch]", "[role=option]", "[contenteditable=true]"
  ].join(",");

  /* An element nobody can see is one the model must not be offered. */
  var isVisible = function (element) {
    var style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    var box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };

  /* The accessible name, roughly as a screen reader resolves it: the cases
     that cover real forms, not the whole specification. */
  var nameOf = function (element) {
    var aria = element.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();

    var labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      var parts = labelledBy.split(/\s+/).map(function (id) {
        var node = document.getElementById(id);
        return node && node.textContent ? node.textContent.trim() : "";
      }).filter(Boolean);
      if (parts.length) return parts.join(" ");
    }

    if (element.id) {
      var label = document.querySelector('label[for="' + CSS.escape(element.id) + '"]');
      if (label && label.textContent && label.textContent.trim()) return label.textContent.trim();
    }

    var parentLabel = element.closest("label");
    if (parentLabel && parentLabel.textContent && parentLabel.textContent.trim()) {
      return parentLabel.textContent.trim();
    }

    var attributes = ["placeholder", "title", "alt", "name", "value"];
    for (var a = 0; a < attributes.length; a++) {
      var value = element.getAttribute(attributes[a]);
      if (value && value.trim()) return value.trim();
    }

    return (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  };

  var roleOf = function (element) {
    var explicit = element.getAttribute("role");
    if (explicit && explicit.trim()) return explicit.trim();

    var tag = element.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";

    if (tag === "input") {
      var type = (element.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "submit" || type === "button" || type === "reset") return "button";
      if (type === "password") return "password";
      return "textbox";
    }

    return "element";
  };

  /* Refs from a previous look are stale the moment the page changes. */
  var stale = document.querySelectorAll("[" + refAttribute + "]");
  for (var s = 0; s < stale.length; s++) stale[s].removeAttribute(refAttribute);

  var elements = [];
  var candidates = document.querySelectorAll(INTERACTIVE);
  var index = 0;
  var truncated = false;

  for (var c = 0; c < candidates.length; c++) {
    var element = candidates[c];
    if (!isVisible(element)) continue;

    if (elements.length >= maxElements) { truncated = true; break; }

    index += 1;
    var ref = "e" + index;
    element.setAttribute(refAttribute, ref);

    var role = roleOf(element);

    elements.push({
      ref: ref,
      role: role,
      name: nameOf(element),
      /* A password's value is never reported. The model has no use for it, and
         it would otherwise reach the transcript, the provider and every log
         that records a turn. */
      value: role === "password" ? undefined : (element.value || undefined),
      disabled: element.disabled || undefined,
      checked: typeof element.checked === "boolean" ? (element.checked || undefined) : undefined,
      href: element.href || undefined
    });
  }

  var text = ((document.body && document.body.innerText) || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxText);

  return { url: window.location.href, title: document.title, elements: elements, text: text, truncated: truncated };
})()`

/**
 * Collect the page's interactive elements and tag each with a ref.
 *
 * Hidden elements are skipped, which also means text hidden with `display:none`
 * never reaches the model — a common place to park an injected instruction
 * where a person will not see it.
 */
export async function snapshotPage(page: Page): Promise<PageSnapshot> {
  const collected = await page.evaluate(SNAPSHOT_SCRIPT as never)

  return collected as unknown as PageSnapshot
}

/**
 * The snapshot as the model sees it.
 *
 * One element per line, because a nested tree costs tokens to render and the
 * model does not need the hierarchy to click a button.
 */
export function renderSnapshot(snapshot: PageSnapshot): string {
  const lines: string[] = [`Page: ${snapshot.title || "(untitled)"}`, `URL: ${snapshot.url}`, ""]

  if (snapshot.elements.length === 0) {
    lines.push("No interactive elements found on this page.")
  } else {
    lines.push("Things you can act on (quote the ref to use one):")

    for (const element of snapshot.elements) {
      const flags: string[] = []
      if (element.disabled) flags.push("disabled")
      if (element.checked) flags.push("checked")
      if (element.value) flags.push(`value: ${element.value.slice(0, 40)}`)

      const suffix = flags.length ? ` [${flags.join(", ")}]` : ""
      lines.push(`  ${element.ref}  ${element.role}  "${element.name}"${suffix}`)
    }

    if (snapshot.truncated) {
      lines.push(
        `  … the list stops at ${MAX_ELEMENTS}. Narrow the page — search or filter — rather than reading the rest.`
      )
    }
  }

  if (snapshot.text) {
    lines.push("", "Page text:", snapshot.text)
  }

  return lines.join("\n")
}
