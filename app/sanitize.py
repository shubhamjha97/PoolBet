"""Input sanitization for user-supplied text.

React escapes on render, but we also strip at the source so stored values can
never carry markup/scripts (defense in depth against stored XSS, and clean data
for any future non-escaping consumer). Used via pydantic BeforeValidator so the
cleaning runs before length/other constraints.
"""
import re
from typing import Annotated

from pydantic import BeforeValidator

_TAG = re.compile(r"<[^>]*?>")          # any angle-bracket tag
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")  # control chars (keep \t \n \r)
_ZWSP = re.compile(r"[​-‍﻿]")  # zero-width / BOM


def clean_text(v: object) -> object:
    if not isinstance(v, str):
        return v
    v = _TAG.sub("", v)
    v = _CTRL.sub("", v)
    v = _ZWSP.sub("", v)
    return v.strip()


# Annotated str that is sanitized before any Field length checks apply.
CleanStr = Annotated[str, BeforeValidator(clean_text)]
