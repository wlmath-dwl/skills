#!/usr/bin/env python3
"""Prepare and validate direct-LLM i18n translations.

This helper intentionally does not call any translation service. It detects the
target locales for the current project, writes a full per-locale template for
the active Codex model to translate, and validates the JSON that the model
produces before apply_translations.js writes it to locale files.

Output shape:
  { "en-US": { "ns": { "key": "translation" } } }
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from typing import Any, Dict, List, Optional, Tuple


LOCALE_LABELS: Dict[str, str] = {
  "ar-SA": "Arabic (Saudi Arabia)",
  "de-DE": "German (Germany)",
  "en-US": "English (United States)",
  "es-ES": "Spanish (Spain)",
  "fr-FR": "French (France)",
  "hi-IN": "Hindi (India)",
  "id-ID": "Indonesian (Indonesia)",
  "it-IT": "Italian (Italy)",
  "ja-JP": "Japanese (Japan)",
  "ko-KR": "Korean (Korea)",
  "ms-MY": "Malay (Malaysia)",
  "nl-NL": "Dutch (Netherlands)",
  "pl-PL": "Polish (Poland)",
  "pt-PT": "Portuguese (Portugal)",
  "ru-RU": "Russian (Russia)",
  "sr-Cyrl": "Serbian (Cyrillic)",
  "vi-VN": "Vietnamese (Vietnam)",
  "zh-TW": "Traditional Chinese (Taiwan)",
}

PLACEHOLDER_RE = re.compile(
  r"(\{[A-Za-z0-9_.:$-]+\}|\{\d+\}|<[/]?[A-Za-z][^>]*>|%\([A-Za-z0-9_]+\)s|%[sdif])"
)


def _validate_nested_value(data: Any, path: str) -> None:
  if isinstance(data, str):
    return
  if isinstance(data, dict):
    for key, value in data.items():
      if not isinstance(key, str):
        raise ValueError(f"JSON key must be a string at '{path}'")
      _validate_nested_value(value, f"{path}.{key}" if path else key)
    return
  raise ValueError(f"JSON value at '{path}' must be a string or object")


def load_json_object(path: str) -> Dict[str, Any]:
  with open(path, "r", encoding="utf-8") as handle:
    data = json.load(handle)
  if not isinstance(data, dict):
    raise ValueError(f"{path} must contain a JSON object")
  return data


def load_source(path: str) -> Dict[str, Any]:
  data = load_json_object(path)
  _validate_nested_value(data, "")
  return data


def write_json(path: str, payload: object) -> None:
  with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
    handle.write("\n")


def find_repo_root(start: str) -> Optional[str]:
  try:
    result = subprocess.run(
      ["git", "-C", start, "rev-parse", "--show-toplevel"],
      capture_output=True, text=True, check=True,
    )
    return result.stdout.strip() or None
  except Exception:
    return None


def find_agent_md(start_dir: str, repo_root: str) -> Optional[str]:
  names = ("agent.md", "AGENT.md", "agents.md", "AGENTS.md")
  current = os.path.abspath(start_dir or repo_root)
  stop = os.path.abspath(repo_root)

  while current.startswith(stop):
    for name in names:
      path = os.path.join(current, name)
      if os.path.isfile(path):
        return path
    if current == stop:
      break
    current = os.path.dirname(current)

  for name in names:
    path = os.path.join(stop, name)
    if os.path.isfile(path):
      return path
  return None


def clean_value(value: str) -> str:
  return value.strip().strip("'\"").rstrip(",").strip()


def parse_inline_list(value: str) -> Optional[List[str]]:
  match = re.search(r"\[([^\]]*)\]", value)
  if not match:
    return None
  return [clean_value(item) for item in match.group(1).split(",") if clean_value(item)]


def parse_agent_md(path: str) -> List[str]:
  with open(path, "r", encoding="utf-8") as handle:
    lines = handle.read().splitlines()

  for idx, line in enumerate(lines):
    match = re.match(r"\s*(?:locales|targetLocales|target_locales|languages)\s*:\s*(.*)$", line)
    if not match:
      continue

    inline = parse_inline_list(match.group(1))
    if inline is not None:
      return inline

    locales: List[str] = []
    parent_indent = len(line) - len(line.lstrip())
    for child in lines[idx + 1:]:
      if not child.strip():
        continue
      indent = len(child) - len(child.lstrip())
      item = re.match(r"\s*-\s*(.+?)\s*$", child)
      if indent <= parent_indent and not item:
        break
      if not item:
        break
      value = clean_value(item.group(1))
      if value:
        locales.append(value)
    return locales

  return []


def detect_agent_locales(input_path: str) -> Tuple[Optional[str], Optional[List[str]]]:
  """Detect target locales from agent.md in the current repo."""
  starts = [
    os.getcwd(),
    os.path.dirname(os.path.abspath(input_path)) or os.getcwd(),
  ]
  seen_roots = set()

  for start in starts:
    root = find_repo_root(start)
    if not root or root in seen_roots:
      continue
    seen_roots.add(root)
    agent_path = find_agent_md(start, root)
    if not agent_path:
      continue
    locales = parse_agent_md(agent_path)
    if locales:
      return agent_path, locales

  return None, None


def parse_locales_arg(value: Optional[str]) -> Optional[List[str]]:
  if not value:
    return None
  items = [item.strip() for item in value.split(",")]
  return [item for item in items if item]


def build_template(source: Dict[str, Any], locales: List[str]) -> Dict[str, Any]:
  return {locale: json.loads(json.dumps(source, ensure_ascii=False)) for locale in locales}


def collect_placeholders(value: str) -> List[str]:
  return PLACEHOLDER_RE.findall(value)


def has_string_leaf(data: Any) -> bool:
  if isinstance(data, str):
    return True
  if isinstance(data, dict):
    return any(has_string_leaf(value) for value in data.values())
  return False


def validate_same_shape(source: Any, translated: Any, path: str, errors: List[str]) -> None:
  if isinstance(source, str):
    if not isinstance(translated, str):
      errors.append(f"{path}: translated value must be a string")
      return
    for placeholder in collect_placeholders(source):
      if placeholder not in translated:
        errors.append(f"{path}: missing placeholder {placeholder!r}")
    return

  if not isinstance(translated, dict):
    errors.append(f"{path}: translated value must be an object")
    return

  source_keys = set(source.keys())
  translated_keys = set(translated.keys())
  for missing_key in sorted(source_keys - translated_keys):
    errors.append(f"{path}.{missing_key}: missing key")
  for extra_key in sorted(translated_keys - source_keys):
    errors.append(f"{path}.{extra_key}: extra key")
  for key in sorted(source_keys & translated_keys):
    validate_same_shape(source[key], translated[key], f"{path}.{key}" if path else key, errors)


def validate_translations(
  source: Dict[str, Any],
  translations: Dict[str, Any],
  locales: List[str],
  allow_missing_locales: bool,
) -> None:
  errors: List[str] = []
  expected = set(locales)
  actual = set(translations.keys())
  if allow_missing_locales:
    for extra_locale in sorted(actual - expected):
      errors.append(f"{extra_locale}: extra locale")
    if expected and has_string_leaf(source) and not actual.intersection(expected):
      errors.append("translation output must include at least one target locale")
  else:
    for missing_locale in sorted(expected - actual):
      errors.append(f"{missing_locale}: missing locale")
    for extra_locale in sorted(actual - expected):
      errors.append(f"{extra_locale}: extra locale")

  locales_to_check = sorted(actual & expected) if expected else sorted(actual)
  for locale in locales_to_check:
    payload = translations.get(locale)
    if not isinstance(payload, dict):
      errors.append(f"{locale}: payload must be an object")
      continue
    validate_same_shape(source, payload, locale, errors)

  if errors:
    preview = "\n".join(f"- {item}" for item in errors[:40])
    suffix = "\n..." if len(errors) > 40 else ""
    raise ValueError(f"LLM translation JSON failed validation:\n{preview}{suffix}")


def write_prompt(
  path: str,
  input_path: str,
  template_path: str,
  output_path: str,
  locales: List[str],
) -> None:
  locale_lines = "\n".join(
    f"- {locale}: {LOCALE_LABELS.get(locale, locale)}" for locale in locales
  )
  content = f"""# Direct LLM i18n Translation Prompt

Read the template JSON at:
`{template_path}`

Write the translated JSON to:
`{output_path}`

Source JSON:
`{input_path}`

Target locales:
{locale_lines}

Rules:
- Keep the exact top-level locale keys, namespace keys, and i18n keys.
- Replace every Chinese leaf string with the target locale translation.
- Preserve placeholders and markup exactly, including `{{0}}`, `{{name}}`, `%s`, `<i>`, and closing tags.
- Keep product names, route names, variable-like strings, and units unchanged unless a locale naturally translates them.
- Do not add comments, metadata, or explanatory text to the JSON.
- Use UTF-8 JSON with two-space indentation.
"""
  with open(path, "w", encoding="utf-8") as handle:
    handle.write(content)


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(
    description="Prepare direct-LLM i18n translation templates and validate filled translations."
  )
  parser.add_argument("--input", required=True, help="Path to source JSON ({ns:{key:zh}} or flat)")
  parser.add_argument(
    "--template-output",
    help="Path to write the per-locale Chinese template for the LLM to fill",
  )
  parser.add_argument("--prompt-output", help="Path to write a reusable LLM prompt markdown file")
  parser.add_argument(
    "--output",
    help="Final translated JSON path to mention in the prompt (not written by this script)",
  )
  parser.add_argument(
    "--validate-output",
    help="Path to translated JSON produced by the LLM; validates locale/shape/placeholders",
  )
  parser.add_argument(
    "--locales",
    help="Comma-separated target locales (BCP-47). Overrides agent.md locale detection.",
  )
  parser.add_argument(
    "--allow-missing-locales",
    action="store_true",
    help="Validation allows a subset of target locales; extra locales still fail.",
  )
  return parser.parse_args()


def main() -> int:
  args = parse_args()

  try:
    source = load_source(args.input)
    requested_locales = parse_locales_arg(args.locales)
    config_label: Optional[str] = None
    if requested_locales is None:
      config_label, requested_locales = detect_agent_locales(args.input)
    if not requested_locales:
      raise ValueError("cannot determine target locales; configure agent.md locales or pass --locales de-DE,en-US,...")

    if not (args.template_output or args.prompt_output or args.validate_output):
      raise ValueError("nothing to do; pass --template-output, --prompt-output, or --validate-output")

    if args.template_output:
      write_json(args.template_output, build_template(source, requested_locales))

    if args.prompt_output:
      output_path = args.output or args.validate_output or "/tmp/i18n-diff-translations.json"
      template_path = args.template_output or "<template JSON path>"
      write_prompt(args.prompt_output, args.input, template_path, output_path, requested_locales)

    if args.validate_output:
      translations = load_json_object(args.validate_output)
      validate_translations(source, translations, requested_locales, args.allow_missing_locales)

    print(f"[translate] agentConfig={config_label or '(missing)'}")
    print("[translate] mode=direct-llm")
    print(f"[translate] requested ({len(requested_locales)}): {', '.join(requested_locales)}")
    if args.template_output:
      print(f"[translate] template: {args.template_output}")
    if args.prompt_output:
      print(f"[translate] prompt: {args.prompt_output}")
    if args.validate_output:
      print(f"[translate] validated: {args.validate_output}")

    return 0
  except Exception as error:  # noqa: BLE001
    print(str(error), file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
