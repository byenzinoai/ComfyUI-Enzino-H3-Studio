"""Bridge to ComfyUI-MiniMaxH3Mod (RefMod, by Luisa · MIT): saved H3 references (.safetensors) applied in the
References mode. Nothing is copied from that pack: when it is installed, its own nodes are called."""

import logging
import sys

import nodes as comfy_nodes

log = logging.getLogger("EnzinoH3Studio")
REPO = "https://github.com/Luisacaotica/ComfyUI-MiniMaxH3Mod"


def available():
    m = comfy_nodes.NODE_CLASS_MAPPINGS
    return "MiniMaxH3RefModsLoader" in m and "MiniMaxH3RefModApply" in m


def _module():
    return sys.modules.get(comfy_nodes.NODE_CLASS_MAPPINGS["MiniMaxH3RefModsLoader"].__module__)


def listing():
    """[{name, kind}] of the RefMods the pack can see."""
    if not available():
        return []
    cls = comfy_nodes.NODE_CLASS_MAPPINGS["MiniMaxH3RefModsLoader"]
    names = [n for n in cls.INPUT_TYPES()["required"]["mod_1"][0] if n not in ("(none)", "None", "")]
    mod = _module()
    out = []
    for n in names:
        kind, tokens, desc = "", 0, ""
        try:
            meta = mod.read_refmod_meta(mod._find_mod_path(n)) or {}
            kind = meta.get("kind", "")
            tokens = int(meta.get("token_count") or 0)
            desc = str(meta.get("description") or "")[:120]
        except Exception:
            pass
        out.append({"name": n, "kind": kind, "tokens": tokens, "description": desc})
    return out


def load(items):
    """items: [{name, strength, copies, on}] → (H3_REF_MODS bundle, prompt hint)."""
    if not items:
        return None, ""
    if not available():
        raise ValueError(f"[Enzino H3 Studio] RefMods need the ComfyUI-MiniMaxH3Mod pack: {REPO}")
    cls = comfy_nodes.NODE_CLASS_MAPPINGS["MiniMaxH3RefModsLoader"]
    kw = {}
    rows = [x for x in items if x.get("on", True) and x.get("name")][: cls.MAX_SLOTS]
    for i in range(1, cls.MAX_SLOTS + 1):
        x = rows[i - 1] if i <= len(rows) else None
        kw[f"mod_{i}"] = x["name"] if x else "(none)"
        kw[f"strength_{i}"] = float(x.get("strength", 1.0)) if x else 1.0
        kw[f"copies_{i}"] = int(x.get("copies", 1)) if x else 1
    loads, hint = cls().load(show_info=False, max_total_tokens=0, **kw)
    return (loads or None), (hint or "")


def apply(positive, loads, retention):
    out = comfy_nodes.NODE_CLASS_MAPPINGS["MiniMaxH3RefModApply"].execute(conditioning=positive, mods=loads, retention=float(retention))
    res = out.result if hasattr(out, "result") else out
    return res[0]
