#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
refactor_i18n.py

1) Replaces static UI strings with t("...") calls using src/i18n/ru.json + src/i18n/en.json.
2) Adds `const { t } = require("<relative>/i18n");` to JS files that were changed.

⚠️ Heuristic script (regex-based). Review the diff after running.

Usage:
  python3 refactor_i18n.py --root /path/to/your/plugin --write
  python3 refactor_i18n.py --root . --write

Dry-run (no writes):
  python3 refactor_i18n.py --root .

Assumptions:
- Your sources live in <root>/src
- i18n files are in <root>/src/i18n/{ru.json,en.json,index.js}
"""

import argparse
import json
import os
import re
from pathlib import Path
from typing import Dict, Tuple, List


# ---------- helpers ----------
def load_json(path: Path) -> Dict[str, str]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def build_reverse_map(*dicts: Dict[str, str]) -> Dict[str, str]:
    """
    value -> key
    If duplicates appear, first wins (so pass ru first, then en).
    """
    rev: Dict[str, str] = {}
    for d in dicts:
        for k, v in d.items():
            if isinstance(v, str) and v not in rev:
                rev[v] = k
    return rev


def normalize_newlines(s: str) -> str:
    return s.replace("\r\n", "\n").replace("\r", "\n")


def escape_for_js_single_quote(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def posix_rel(from_dir: Path, to_dir: Path) -> str:
    rel = os.path.relpath(to_dir, from_dir)
    rel = rel.replace("\\", "/")
    if not rel.startswith("."):
        rel = "./" + rel
    return rel


# ---------- core replacer ----------
# Match JS string literals: "..." or '...' or `...` (no ${} support here)
STRING_LIT_RE = re.compile(
    r"""
    (?P<quote>["'`])
    (?P<body>(?:\\.|(?!\1).)*)
    (?P=quote)
    """,
    re.VERBOSE,
)

# Template literals with ${...} (we handle only a couple of known patterns)
TEMPLATE_LIT_RE = re.compile(r"`(?P<body>(?:\\.|[^`])*)`", re.DOTALL)

# Detect existing t import
T_IMPORT_RE = re.compile(r"\bconst\s*\{\s*t\s*\}\s*=\s*require\([^)]*\)\s*;")

# A very simple "top requires" boundary (we'll insert after last initial require)
TOP_REQUIRE_RE = re.compile(r"^\s*(?:const|let|var)\s+.+?\s*=\s*require\(.+?\)\s*;\s*$")


def replace_known_template_notices(text: str) -> Tuple[str, bool]:
    """
    Replace a couple of very common Notice templates used in your code:

    new Notice(`✅ Экспорт выполнен\n${result.outFilePath}`, 6000);
      -> new Notice(t("notices.export.ok", { path: result.outFilePath }), 6000);

    new Notice(`❌ Экспорт не выполнен\n${getUserErrorMessage(error)}`, 6000);
      -> new Notice(t("notices.export.fail", { message: getUserErrorMessage(error) }), 6000);

    Also supports the split line in your PDF where the string literal was broken.
    """
    changed = False

    patterns = [
        # ok
        (
            re.compile(
                r"new\s+Notice\(\s*`✅\s*Экспорт\s+выполнен\s*\\n\$\{([^}]+)\}`\s*,",
                re.UNICODE,
            ),
            r'new Notice(t("notices.export.ok", { path: \1 }),',
        ),
        # fail
        (
            re.compile(
                r"new\s+Notice\(\s*`❌\s*Экспорт\s+не\s*выполнен\s*\\n\$\{([^}]+)\}`\s*,",
                re.UNICODE,
            ),
            r'new Notice(t("notices.export.fail", { message: \1 }),',
        ),
        # sometimes people use \n directly inside template as actual newline
        (
            re.compile(
                r"new\s+Notice\(\s*`✅\s*Экспорт\s+выполнен\s*\n\$\{([^}]+)\}`\s*,",
                re.UNICODE,
            ),
            r'new Notice(t("notices.export.ok", { path: \1 }),',
        ),
        (
            re.compile(
                r"new\s+Notice\(\s*`❌\s*Экспорт\s+не\s*выполнен\s*\n\$\{([^}]+)\}`\s*,",
                re.UNICODE,
            ),
            r'new Notice(t("notices.export.fail", { message: \1 }),',
        ),
    ]

    out = text
    for rx, repl in patterns:
        out2, n = rx.subn(repl, out)
        if n:
            changed = True
            out = out2

    return out, changed


def replace_string_literals_with_t(text: str, value_to_key: Dict[str, str]) -> Tuple[str, bool]:
    """
    Replace exact-matching string literals whose decoded content equals any value in value_to_key.
    """
    changed = False

    def decode_js_string(quote: str, body: str) -> str:
        # Minimal decode: handle \n, \t, \", \', \\, \uXXXX
        # We do not attempt to fully emulate JS; good enough for UI strings.
        s = body
        s = s.replace("\\n", "\n").replace("\\t", "\t").replace("\\r", "\r")
        s = s.replace('\\"', '"').replace("\\'", "'").replace("\\`", "`")
        s = s.replace("\\\\", "\\")
        # \uXXXX
        def _u(m):
            return chr(int(m.group(1), 16))
        s = re.sub(r"\\u([0-9a-fA-F]{4})", _u, s)
        return s

    def repl(m: re.Match) -> str:
        nonlocal changed
        quote = m.group("quote")
        body = m.group("body")
        decoded = decode_js_string(quote, body)
        key = value_to_key.get(decoded)
        if not key:
            return m.group(0)

        changed = True
        return f't("{key}")'

    out = STRING_LIT_RE.sub(repl, text)
    return out, changed


def add_t_import_if_needed(path: Path, text: str, src_dir: Path, i18n_dir: Path) -> Tuple[str, bool]:
    """
    Adds: const { t } = require("<relative>/i18n");
    to files under src, if not already present.
    """
    if T_IMPORT_RE.search(text):
        return text, False

    # compute require path: from file's dir -> src/i18n, requiring directory ("../i18n")
    rel = posix_rel(path.parent, i18n_dir)
    require_path = rel  # index.js will resolve by folder

    import_line = f'const {{ t }} = require("{require_path}");\n'

    lines = text.splitlines(True)  # keep ends
    insert_at = 0

    # Find last contiguous require statement near top
    i = 0
    while i < len(lines):
        line = lines[i]
        if TOP_REQUIRE_RE.match(line):
            insert_at = i + 1
            i += 1
            continue
        # allow blank lines & comments at very top before requires
        if insert_at == 0 and (line.strip() == "" or line.strip().startswith("//")):
            i += 1
            continue
        # Stop at first non-require after we've started passing requires
        if insert_at > 0:
            break
        i += 1

    # If no require block found, insert at top
    lines.insert(insert_at, import_line)

    return "".join(lines), True


def process_file(path: Path, src_dir: Path, i18n_dir: Path, value_to_key: Dict[str, str]) -> Tuple[str, bool, List[str]]:
    original = normalize_newlines(path.read_text(encoding="utf-8"))
    out = original
    reasons: List[str] = []

    out2, ch_tpl = replace_known_template_notices(out)
    if ch_tpl:
        out = out2
        reasons.append("template-notices")

    out2, ch_str = replace_string_literals_with_t(out, value_to_key)
    if ch_str:
        out = out2
        reasons.append("string-literals")

    changed = (out != original)

    # Add import only if file content changed and it uses t(
    if changed and 't("' in out:
        out3, ch_imp = add_t_import_if_needed(path, out, src_dir, i18n_dir)
        if ch_imp:
            out = out3
            reasons.append("add-import")

    return out, (out != original), reasons


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="Project root (contains src/)")
    ap.add_argument("--write", action="store_true", help="Write changes to disk")
    ap.add_argument("--ext", default=".js", help="File extension to process (default: .js)")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    src_dir = root / "src"
    i18n_dir = src_dir / "i18n"
    ru_path = i18n_dir / "ru.json"
    en_path = i18n_dir / "en.json"

    if not src_dir.exists():
        raise SystemExit(f"src/ not found in {root}")
    if not ru_path.exists() or not en_path.exists():
        raise SystemExit(f"i18n JSON not found: {ru_path} / {en_path}")

    ru = load_json(ru_path)
    en = load_json(en_path)

    # reverse map: prefer ru values first, then en
    value_to_key = build_reverse_map(ru, en)

    targets = [p for p in src_dir.rglob(f"*{args.ext}") if p.is_file()]

    changed_files = 0
    for p in targets:
        new_text, changed, reasons = process_file(p, src_dir, i18n_dir, value_to_key)
        if not changed:
            continue

        changed_files += 1
        rel = p.relative_to(root).as_posix()
        print(f"[CHANGE] {rel}  ({', '.join(reasons)})")

        if args.write:
            # backup
            backup = p.with_suffix(p.suffix + ".bak")
            if not backup.exists():
                backup.write_text(p.read_text(encoding="utf-8"), encoding="utf-8")
            p.write_text(new_text, encoding="utf-8")

    print(f"\nDone. Changed files: {changed_files}")
    if not args.write:
        print("Dry-run only. Re-run with --write to apply changes.")


if __name__ == "__main__":
    main()
