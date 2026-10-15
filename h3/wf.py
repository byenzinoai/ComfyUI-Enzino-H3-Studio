"""✦ Enzino H3 WF — the same engine as H3 Studio, split in readable steps joined by one wire (the ✦ bus):
① Models → ② LoRAs → ③ Prompt → ④ Render → ⑤ Enhance → ⑥ Output.   by Enzino · https://enzinoai.com
"""
import logging
import time

import torch

from .edition import PRO, PF
from . import node as H

log = logging.getLogger("EnzinoH3Studio")
BUS = "ENZINO_H3"
CAT = "Enzino/H3 WF"
HIDDEN = {"unique_id": "UNIQUE_ID", "prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"}


def _spec():
    return H.EnzinoH3Studio.INPUT_TYPES()["required"]


def _pick(*names):
    s = _spec()
    return {n: s[n] for n in names}


def _defaults():
    out = {}
    for n, sp in _spec().items():
        o = sp[1] if len(sp) > 1 and isinstance(sp[1], dict) else {}
        out[n] = o.get("default", sp[0][0] if isinstance(sp[0], list) and sp[0] else None)
    return out


def _bus(bus):
    b = dict(bus or {})
    b["s"] = dict(b.get("s") or {})
    return b


# ------------------------------------------------------------------------------------------------ ① Models
class EnzinoH3WFModels:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": _pick("model_keyframes", "text_encoder", "video_vae", "audio_vae", "turbo_keyframes", "weight_dtype",
                                     "model_references", "turbo_references")}

    RETURN_TYPES = (BUS,)
    RETURN_NAMES = ("✦",)
    FUNCTION = "run"
    CATEGORY = CAT

    def run(self, **k):
        return ({"s": dict(k)},)


# ------------------------------------------------------------------------------------------------ ② LoRAs
class EnzinoH3WFLoRAs:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"bus": (BUS,), **_pick("loras")}}

    RETURN_TYPES = (BUS,)
    RETURN_NAMES = ("✦",)
    FUNCTION = "run"
    CATEGORY = CAT

    def run(self, bus, loras):
        b = _bus(bus)
        b["s"]["loras"] = loras
        return (b,)


# ------------------------------------------------------------------------------------------------ ③ Prompt
class EnzinoH3WFPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        # new widgets go at the end, so the values of a workflow saved before them still land on the right widget
        p = _pick("first_image", "last_image", "prompt", "auto_header", "style", "duration", "aspect", "resolution", "custom_mp",
                  "ref_images", "ref_image_size")
        # "last" (End frame) is no longer offered in the card, kept so older workflows still load
        return {"required": {"bus": (BUS,), "mode": (["text", "image", "first_last", "references", "last"], {"default": "image"}), **p},
                "optional": {"first_frame": ("IMAGE",), "last_frame": ("IMAGE",),
                             "references": ("IMAGE", {"tooltip": "References mode: extra reference pictures, added after the card's pictures (9 max)."})}}

    RETURN_TYPES = (BUS,)
    RETURN_NAMES = ("✦",)
    FUNCTION = "run"
    CATEGORY = CAT

    def run(self, bus, first_frame=None, last_frame=None, references=None, **k):
        b = _bus(bus)
        b["s"].update(k)
        b["first_frame"], b["last_frame"], b["references"] = first_frame, last_frame, references
        return (b,)


# ------------------------------------------------------------------------------------------------ ④ Render
RENDER_KEYS = ("speed", "steps", "seed", "sampler_name", "scheduler", "step_cache", "low_vram", "attention", "sparse_attention", "sparse_tau",
               "prompt_cache", "keep_loaded", "free_text_encoder", "preview_every", "tiled_decode")


class EnzinoH3WFRender:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"bus": (BUS,), **_pick(*RENDER_KEYS)}, "hidden": HIDDEN}

    RETURN_TYPES = (BUS, "IMAGE", "AUDIO")
    RETURN_NAMES = ("✦", "frames", "audio")
    FUNCTION = "run"
    CATEGORY = CAT

    def run(self, bus, unique_id=None, prompt=None, extra_pnginfo=None, **k):
        t0 = time.time()
        b = _bus(bus)
        P = _defaults()
        P.update(b["s"])
        P.update(k)
        if P.get("mode") == "references" and P.get("model_references") in (None, "", "none"):
            raise ValueError("[Enzino H3 WF] References mode: pick a References model in ① Models (the REF2VA file, or the Hybrid FL+REF one).")
        # the render only: finishing happens in ⑤ Enhance and ⑥ Output
        P.update(save_on=False, upscale="off", interpolate="off", polish_on=False, sign_on=False, social="[]",
                 story_on=False, variations=1, control_mode="off", drive_on=False, refmods="[]", mid_on=False)
        out = H.EnzinoH3Studio().generate(first_frame=b.get("first_frame"), last_frame=b.get("last_frame"), references=b.get("references"),
                                          unique_id=unique_id, prompt_meta=prompt, extra_pnginfo=extra_pnginfo, **P)
        info = out["ui"]["enzino_h3"][0]
        frames, audio = out["result"][1], out["result"][2]
        b.update(frames=frames, audio=audio, fps=H.FPS, P=P, info=info, t0=t0)
        return {"ui": {"enzino_h3": [info]}, "result": (b, frames, audio)}


# ------------------------------------------------------------------------------------------------ ⑤ Enhance
ENH_KEYS = ("polish_on", "polish_model", "polish_te", "polish_vae", "polish_denoise", "polish_steps", "polish_mode", "polish_stable", "polish_prompt",
            "upscale", "upscaler", "interpolate", "interp_model")


class EnzinoH3WFEnhance:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"bus": (BUS,), **_pick(*ENH_KEYS)}, "hidden": {"unique_id": "UNIQUE_ID"}}

    RETURN_TYPES = (BUS, "IMAGE")
    RETURN_NAMES = ("✦", "frames")
    FUNCTION = "run"
    CATEGORY = CAT

    def run(self, bus, unique_id=None, **k):
        b = _bus(bus)
        if b.get("frames") is None:
            raise ValueError("[Enzino H3 WF] ⑤ Enhance needs the ✦ wire from ④ Render.")
        P = dict(b["P"])
        P.update(k)
        P.update(sign_on=False, social="[]")          # signature & social formats are done in ⑥ Output
        if not PRO:
            skipped = [n for n, on in (("Krea 2 polish", P["polish_on"]), ("interpolation", P["interpolate"] != "off"),
                                       ("4K", P["upscale"] == "2160p")) if on]
            if skipped:
                H._status(unique_id, "Free edition: " + ", ".join(skipped) + " skipped")
            P.update(polish_on=False, interpolate="off", upscale="1440p" if P["upscale"] == "2160p" else P["upscale"])
        ctx = {"P": P, "uid": unique_id}
        frames, fps, _ = H.EnzinoH3Studio()._finish(b["frames"], ctx)
        b.update(frames=frames, fps=fps, P=P)
        pv = _preview(frames, b.get("audio"), fps, unique_id)
        H._status(unique_id, f"Enhanced · {frames.shape[2]}×{frames.shape[1]} · {fps} fps")
        return {"ui": {"enzino_h3": [pv]}, "result": (b, frames)}


def _preview(frames, audio, fps, uid):
    """A temp MP4 for the card (not in your history)."""
    import os
    import folder_paths
    from fractions import Fraction
    from comfy_api.latest import InputImpl, Types
    d = os.path.join(folder_paths.get_temp_directory(), "enzino_h3")
    os.makedirs(d, exist_ok=True)
    name = f"wf_{uid}_{int(time.time() * 1000)}.mp4"
    v = InputImpl.VideoFromComponents(Types.VideoComponents(images=frames, audio=audio, frame_rate=Fraction(fps)))
    v.save_to(os.path.join(d, name), format=Types.VideoContainer("mp4"), codec=Types.VideoCodec("auto"))
    return {"video": {"filename": name, "subfolder": "enzino_h3", "type": "temp"}, "width": int(frames.shape[2]), "height": int(frames.shape[1]),
            "frames": int(frames.shape[0]), "fps": fps, "seconds": round(frames.shape[0] / fps, 2)}


# ------------------------------------------------------------------------------------------------ ⑥ Output
OUT_KEYS = ("save_on", "folder", "filename", "sign_on", "sign_text", "sign_pos", "sign_size", "sign_opacity", "social", "social_focus")


class EnzinoH3WFOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"bus": (BUS,), **_pick(*OUT_KEYS)}, "hidden": HIDDEN}

    RETURN_TYPES = ("VIDEO", "IMAGE", "AUDIO")
    RETURN_NAMES = ("video", "frames", "audio")
    FUNCTION = "run"
    CATEGORY = CAT
    OUTPUT_NODE = True

    def run(self, bus, unique_id=None, prompt=None, extra_pnginfo=None, **k):
        import json
        from fractions import Fraction
        b = _bus(bus)
        if b.get("frames") is None:
            raise ValueError("[Enzino H3 WF] ⑥ Output needs the ✦ wire from ④ Render or ⑤ Enhance.")
        P = dict(b["P"])
        P.update(k)
        frames, audio, fps = b["frames"], b.get("audio"), b.get("fps", H.FPS)
        socials = []
        if PRO and PF is not None:
            signed = P["sign_on"] and (P["sign_text"] or "").strip()
            try:
                fmts = [f for f in json.loads(P["social"] or "[]") if f in PF.SOCIAL]
            except Exception:
                fmts = []
            for f in fmts:   # framed from the clean picture, then signed
                c = PF.crop_ratio(frames, f, P["social_focus"])
                socials.append((f, PF.sign(c, P["sign_text"], P["sign_pos"], P["sign_size"], P["sign_opacity"]) if signed else c))
            if signed:
                frames = PF.sign(frames, P["sign_text"], P["sign_pos"], P["sign_size"], P["sign_opacity"])
        info0 = b.get("info") or {}
        ctx = {"P": P, "uid": unique_id}
        rw, rh = (info0.get("render_size") or "×").split("×") if info0.get("render_size") else (frames.shape[2], frames.shape[1])
        info = H.EnzinoH3Studio()._save(frames, audio, fps, socials, ctx, info0.get("seed", P.get("seed", 0)), P.get("mode", "text"), 1,
                                        info0.get("steps", P.get("steps", 0)), rw, rh, prompt, extra_pnginfo, time.time() - b.get("t0", time.time()))
        H._status(unique_id, "Saved" if P["save_on"] else "Preview ready")
        from comfy_api.latest import InputImpl, Types
        video = InputImpl.VideoFromComponents(Types.VideoComponents(images=frames, audio=audio, frame_rate=Fraction(fps)))
        return {"ui": {"enzino_h3": [info]}, "result": (video, frames, audio)}


NODES = {"EnzinoH3WFModels": EnzinoH3WFModels, "EnzinoH3WFLoRAs": EnzinoH3WFLoRAs, "EnzinoH3WFPrompt": EnzinoH3WFPrompt,
         "EnzinoH3WFRender": EnzinoH3WFRender, "EnzinoH3WFEnhance": EnzinoH3WFEnhance, "EnzinoH3WFOutput": EnzinoH3WFOutput}
NAMES = {"EnzinoH3WFModels": "① Models · Enzino H3 WF ✦", "EnzinoH3WFLoRAs": "② LoRAs · Enzino H3 WF ✦", "EnzinoH3WFPrompt": "③ Prompt · Enzino H3 WF ✦",
         "EnzinoH3WFRender": "④ Render · Enzino H3 WF ✦", "EnzinoH3WFEnhance": "⑤ Enhance · Enzino H3 WF ✦", "EnzinoH3WFOutput": "⑥ Output · Enzino H3 WF ✦"}
