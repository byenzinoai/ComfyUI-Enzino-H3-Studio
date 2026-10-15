"""Enzino H3 Studio — HTTP routes (all under /enzino_h3/)."""

import json
import os
import shutil
import time

import folder_paths

from . import catalog as C
from .node import store_dir, free_memory
from .edition import PRO, EDITION, FULL_URL, FULL_PRICE, BUILD, FREE_MAX_LORAS

VERSION = "3.0.0"


def _history():
    try:
        with open(os.path.join(store_dir(), "history.json"), encoding="utf-8") as f:
            h = json.load(f)
    except Exception:
        return []
    out = []
    for it in h:  # drop renders whose file was deleted
        v = it.get("video") or {}
        base = folder_paths.get_output_directory() if v.get("type") == "output" else folder_paths.get_temp_directory()
        if os.path.isfile(os.path.join(base, v.get("subfolder", ""), v.get("filename", ""))):
            out.append(it)
    return out


def _triggers(name):
    """Trigger words from a .civitai.info / .json next to the LoRA, or from its safetensors metadata."""
    import struct
    full = folder_paths.get_full_path("loras", name)
    out = []
    if not full:
        return out
    stem = os.path.splitext(full)[0]
    for ext in (".civitai.info", ".info", ".json"):
        try:
            with open(stem + ext, encoding="utf-8") as f:
                j = json.load(f)
            w = j.get("trainedWords") or j.get("activation text") or j.get("triggerWords") or []
            if isinstance(w, str):
                w = [x.strip() for x in w.split(",")]
            out += [x for x in w if x and x not in out]
        except Exception:
            pass
    if not out and full.endswith(".safetensors"):
        try:
            with open(full, "rb") as f:
                n = struct.unpack("<Q", f.read(8))[0]
                md = json.loads(f.read(n)).get("__metadata__", {}) if n < 100_000_000 else {}
            tp = md.get("modelspec.trigger_phrase") or md.get("trigger_phrase") or md.get("ss_trigger_words")
            if tp:
                out = [x.strip() for x in str(tp).split(",") if x.strip()]
            elif md.get("ss_tag_frequency"):
                freq = {}
                for ds in json.loads(md["ss_tag_frequency"]).values():
                    for t, c in ds.items():
                        freq[t.strip()] = freq.get(t.strip(), 0) + c
                out = [t for t, _ in sorted(freq.items(), key=lambda kv: -kv[1])[:3]]
        except Exception:
            pass
    return out[:6]


def register_routes():
    try:
        from server import PromptServer
        from aiohttp import web
    except Exception:
        return
    if getattr(PromptServer, "instance", None) is None:
        return
    r = PromptServer.instance.routes

    @r.get("/enzino_h3/version")
    async def version(request):
        return web.json_response({"version": VERSION, "edition": EDITION, "full_url": FULL_URL, "full_price": FULL_PRICE, "build": BUILD, "free_max_loras": FREE_MAX_LORAS})

    # ---- LoRA list (Turbo LoRAs hidden) and trigger words
    @r.get("/enzino_h3/loras")
    async def loras(request):
        import re as _re
        names = [n for n in folder_paths.get_filename_list("loras") if not _re.search(r"turbo_\d?step|_turbo_", os.path.basename(n), _re.I)]
        h3 = [n for n in names if _re.search(r"h3|minimax|hailuo", n, _re.I)]
        return web.json_response({"h3": h3, "other": [n for n in names if n not in h3]})

    @r.get("/enzino_h3/refmods")
    async def refmods(request):
        from . import refmod as RM
        return web.json_response({"installed": RM.available(), "repo": RM.REPO, "mods": RM.listing() if RM.available() else []})

    @r.get("/enzino_h3/lora_info")
    async def lora_info(request):
        name = request.query.get("name", "")
        if name not in folder_paths.get_filename_list("loras"):
            return web.json_response({"triggers": []}, status=404)
        return web.json_response({"triggers": _triggers(name)})

    # ---- Full edition: presets (every setting except prompt, pictures and seed)
    BUILTIN = [
        {"name": "⚡ Quick draft", "s": {"resolution": "576p", "speed": "turbo", "upscale": "off", "interpolate": "off", "variations": 4}},
        {"name": "✦ Final 1 MP", "s": {"resolution": "768p", "speed": "full", "upscale": "off", "interpolate": "off", "variations": 1, "step_cache": "off", "steps": 0}},
        {"name": "◎ Full + step cache (13 steps, no Turbo)", "s": {"resolution": "768p", "speed": "full", "steps": 13, "sampler_name": "res_multistep", "scheduler": "simple", "step_cache": "light", "sparse_attention": True, "sparse_tau": 1.3, "low_vram": "auto", "variations": 1}},
        {"name": "🎬 Cinema 4K", "s": {"resolution": "768p", "speed": "full", "upscale": "2160p", "interpolate": "x2", "variations": 1, "aspect": "21:9"}},
        {"name": "📱 Reels / TikTok", "s": {"resolution": "768p", "speed": "turbo", "aspect": "9:16", "upscale": "1080p", "variations": 1, "sign_on": True}},
        {"name": "🧪 Low VRAM", "s": {"resolution": "640p", "speed": "turbo", "free_text_encoder": True, "tiled_decode": True, "sparse_attention": True, "low_vram": "on"}},
    ]

    def _ppath():
        return os.path.join(store_dir(), "presets.json")

    def _user_presets():
        try:
            with open(_ppath(), encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    @r.get("/enzino_h3/presets")
    async def presets(request):
        if not PRO:
            return web.json_response({"builtin": [], "user": []})
        return web.json_response({"builtin": BUILTIN, "user": _user_presets()})

    @r.post("/enzino_h3/presets")
    async def presets_post(request):
        if not PRO:
            return web.json_response({"error": "Full edition"}, status=403)
        b = await request.json()
        name = str(b.get("name", "")).strip()[:80]
        user = [p for p in _user_presets() if p.get("name") != name]
        if not b.get("delete") and name:
            user.append({"name": name, "s": b.get("s") or {}})
        with open(_ppath(), "w", encoding="utf-8") as f:
            json.dump(user, f, ensure_ascii=False)
        return web.json_response({"user": user})

    @r.get("/enzino_h3/system")
    async def system(request):
        out = {"vram_gb": 0, "gpu": "", "attention": []}
        try:
            import comfy.model_management as mm
            dev = mm.get_torch_device()
            out["vram_gb"] = round(mm.get_total_memory(dev) / (1024 ** 3), 1)
            out["gpu"] = mm.get_torch_device_name(dev)
        except Exception:
            pass
        try:
            from .node import available_attention, BROKEN_ATT
            out["attention"] = available_attention()
            out["broken"] = dict(BROKEN_ATT)
            import nodes as _N
            out["rtx_vsr"] = "RTXVideoSuperResolution" in _N.NODE_CLASS_MAPPINGS
        except Exception:
            pass
        return web.json_response(out)

    @r.get("/enzino_h3/models")
    async def models(request):
        files = {fd: sorted({os.path.basename(f) for f in C.file_list(fd)}) for fd in ("diffusion_models", "text_encoders", "vae", "loras", "embeddings", "upscale_models", "model_patches", "frame_interpolation", "vae_approx")}
        try:
            opts = C.model_options()
        except Exception:
            opts = {}
        return web.json_response({"groups": C.status(), "files": files, "options": opts, "split": dict(C.SPLIT)})

    @r.post("/enzino_h3/models")
    async def models_post(request):
        b = await request.json()
        cid = str(b.get("id", ""))
        return web.json_response(C.cancel(cid) if b.get("cancel") else C.start(cid))

    @r.post("/enzino_h3/free")
    async def free(request):
        free_memory()
        return web.json_response({"ok": True})

    @r.get("/enzino_h3/history")
    async def history(request):
        return web.json_response(_history())

    @r.post("/enzino_h3/history")
    async def history_post(request):
        b = await request.json()
        p = os.path.join(store_dir(), "history.json")
        h = _history()
        if b.get("clear"):
            h = []
        elif b.get("remove"):
            h = [x for x in h if x.get("video", {}).get("filename") != b["remove"]]
        with open(p, "w", encoding="utf-8") as f:
            json.dump(h, f, ensure_ascii=False)
        return web.json_response(h)

    # copy a rendered frame (output/temp) into input/enzino_h3 so it can be a keyframe of the next shot
    @r.post("/enzino_h3/to_input")
    async def to_input(request):
        b = await request.json()
        t = b.get("type", "output")
        base = folder_paths.get_output_directory() if t == "output" else folder_paths.get_temp_directory()
        src = os.path.abspath(os.path.join(base, b.get("subfolder", ""), b.get("filename", "")))
        if not src.startswith(os.path.abspath(base) + os.sep) or not os.path.isfile(src):
            return web.json_response({"error": "not found"}, status=404)
        dst_dir = os.path.join(folder_paths.get_input_directory(), "enzino_h3")
        os.makedirs(dst_dir, exist_ok=True)
        name = f"chain_{time.strftime('%Y%m%d_%H%M%S')}_{os.path.basename(src)}"
        shutil.copyfile(src, os.path.join(dst_dir, name))
        return web.json_response({"name": f"enzino_h3/{name}"})
