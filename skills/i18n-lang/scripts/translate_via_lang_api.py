#!/usr/bin/env python3
"""Deprecated compatibility entry point.

The i18n-lang skill no longer calls any translation service. Use
scripts/translate_via_llm.py to prepare a direct-LLM translation template and
validate the model-produced JSON.
"""
from __future__ import annotations

import os
import sys


def main() -> int:
  script_dir = os.path.dirname(os.path.abspath(__file__))
  replacement = os.path.join(script_dir, "translate_via_llm.py")
  print(
    "translate_via_lang_api.py is deprecated and no longer calls any translation service.\n"
    f"Use: python3 {replacement} --input <source.json> "
    "--template-output <template.json> --prompt-output <prompt.md> "
    "--output <translations.json>",
    file=sys.stderr,
  )
  return 2


if __name__ == "__main__":
  raise SystemExit(main())
