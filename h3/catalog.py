"""Enzino H3 Studio — the files MiniMax H3 needs, their status, and one-click downloads.

Only the files listed in CATALOG can be downloaded (no arbitrary URL), always into ComfyUI's own model folders.
Downloads run in a background thread, resume after an interruption (HTTP Range) and can be cancelled."""

import os
import threading
import time
import urllib.request

import folder_paths

HF = "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/"
LX = "https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/main/"
HYB = "https://huggingface.co/smhfacct/Minimax-H3-fl2va-ref2va-hybrid-models/resolve/main/"  # community fl2va+ref2va merge (adaln_proj of the last blocks from ref2va), recommended by PlagueKind

# id, folder, title [en, fr], required, widget it feeds, choices (first starred = recommended)
CATALOG = [
    {"id": "fl", "folder": "diffusion_models", "required": True, "widget": "model_keyframes",
     "title": ["Keyframes model", "Modèle images-clés"], "for": ["Text · Image · First+Last · End frame", "Texte · Image · Début+Fin · Fin"],
     "choices": [
         {"id": "fl_int8", "file": "minimax_h3_fl2va_pruned_int8_convrot.safetensors", "size": 20970379616, "star": True,
          "label": "FL2VA pruned INT8", "note": ["recommended · official ComfyUI pick", "recommandé · choix officiel ComfyUI"]},
         {"id": "fl_w6a8", "file": "minimax_h3_fl2va_pruned_w6a8.safetensors", "size": 15983746636,
          "label": "FL2VA pruned W6A8", "note": ["lightest · 16 GB", "le plus léger · 16 Go"]},
         {"id": "fl_fp8", "file": "minimax_h3_fl2va_pruned_fp8_scaled.safetensors", "size": 20958205608,
          "label": "FL2VA pruned FP8", "note": ["fp8 scaled", "fp8 scaled"]},
         {"id": "fl_hyb25", "file": "minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors", "size": 20970379632,
          "url": "%sminimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors" % HYB,
          "label": "Hybrid FL+REF b25 INT8", "note": ["one model for every mode (no reload when you switch to References)", "un seul modèle pour tous les modes (pas de rechargement en Références)"]},
     ]},
    {"id": "ref", "folder": "diffusion_models", "required": False, "widget": "model_references",
     "title": ["References model", "Modèle références"], "for": ["References mode", "Mode Références"],
     "choices": [
         {"id": "ref_int8", "file": "minimax_h3_ref2va_pruned_int8_convrot.safetensors", "size": 20970379616, "star": True,
          "label": "REF2VA pruned INT8", "note": ["recommended", "recommandé"]},
         {"id": "ref_w6a8", "file": "minimax_h3_ref2va_pruned_w6a8.safetensors", "size": 15983746636,
          "label": "REF2VA pruned W6A8", "note": ["lightest · 16 GB", "le plus léger · 16 Go"]},
         {"id": "ref_hyb25", "file": "minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors", "size": 20970379632,
          "url": "%sminimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors" % HYB,
          "label": "Hybrid FL+REF b25 INT8", "note": ["FL2VA quality with references · same file as the keyframes hybrid", "qualité FL2VA avec les références · même fichier que l'hybride images-clés"]},
         {"id": "ref_hyb20", "file": "minimax_h3_hybrid_fl2va_ref2va_b20-49-int8.safetensors", "size": 20970379632,
          "url": "%sminimax_h3_hybrid_fl2va_ref2va_b20-49-int8.safetensors" % HYB,
          "label": "Hybrid FL+REF b20 INT8", "note": ["stronger reference adherence", "respect des références plus fort"]},
     ]},
    {"id": "te", "folder": "text_encoders", "required": True, "widget": "text_encoder",
     "title": ["Text encoder", "Encodeur de texte"], "for": ["Qwen3-VL 32B", "Qwen3-VL 32B"],
     "choices": [
         {"id": "te_nvfp4", "file": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", "size": 15687142551, "star": True,
          "label": "Qwen3-VL 32B NVFP4", "note": ["recommended · any GPU", "recommandé · toutes cartes"]},
         {"id": "te_int8", "file": "qwen3vl_32b_minimax_h3_int8_convrot.safetensors", "size": 27141342152,
          "label": "Qwen3-VL 32B INT8", "note": ["heavier", "plus lourd"]},
     ]},
    {"id": "vvae", "folder": "vae", "required": True, "widget": "video_vae",
     "title": ["Video VAE", "VAE vidéo"], "for": ["", ""],
     "choices": [
         {"id": "vvae_int8", "file": "minimax_h3_video_vae_int8_convrot.safetensors", "size": 2811065184, "star": True,
          "label": "Video VAE INT8", "note": ["recommended", "recommandé"]},
         {"id": "vvae_fp16", "file": "minimax_h3_video_vae_fp16.safetensors", "size": 5207808496,
          "label": "Video VAE FP16", "note": ["full precision", "pleine précision"]},
     ]},
    {"id": "avae", "folder": "vae", "required": True, "widget": "audio_vae",
     "title": ["Audio VAE", "VAE audio"], "for": ["stereo 32 kHz", "stéréo 32 kHz"],
     "choices": [
         {"id": "avae_fp32", "file": "minimax_h3_audio_vae_fp32.safetensors", "size": 605254808, "star": True,
          "label": "Audio VAE", "note": ["required", "obligatoire"]},
     ]},
    {"id": "lfl", "folder": "loras", "required": False, "widget": "turbo_keyframes",
     "title": ["Turbo LoRA · keyframes", "LoRA Turbo · images-clés"], "for": ["⚡ Turbo speed", "vitesse ⚡ Turbo"],
     "choices": [
         {"id": "lfl8", "file": "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors", "size": 1956193000, "star": True,
          "url": LX + "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
          "label": "Turbo 8 steps", "note": ["best quality / speed", "meilleur compromis"]},
         {"id": "lfl4", "file": "minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors", "size": 1956193000,
          "url": LX + "minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors",
          "label": "Turbo 4 steps (v1.2 · 768p)", "note": ["fastest", "le plus rapide"]},
     ]},
    {"id": "lref", "folder": "loras", "required": False, "widget": "turbo_references",
     "title": ["Turbo LoRA · references", "LoRA Turbo · références"], "for": ["⚡ Turbo speed", "vitesse ⚡ Turbo"],
     "choices": [
         {"id": "lref4", "file": "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors", "size": 1956193000, "star": True,
          "label": "Turbo 4 steps", "note": ["official template", "template officiel"]},
         {"id": "lref8", "file": "minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors", "size": 1956193000,
          "url": LX + "minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors",
          "label": "Turbo 8 steps (768p)", "note": ["higher quality", "plus de qualité"]},
     ]},
]

CATALOG.append({"id": "ups", "folder": "upscale_models", "required": False, "widget": "upscaler",
                "title": ["Upscaler", "Upscaler"], "for": ["for 1080p / 1440p / 4K output", "pour une sortie 1080p / 1440p / 4K"],
                "choices": [
                    {"id": "ups_ultrasharp", "file": "4x-UltraSharp.pth", "size": 66961958, "star": True,
                     "url": "https://huggingface.co/Kim2091/UltraSharp/resolve/main/4x-UltraSharp.pth",
                     "label": "4x-UltraSharp", "note": ["sharp, clean detail", "détail net et propre"]},
                ]})

CATALOG.append({"id": "ctl", "folder": "model_patches", "required": False, "widget": "control_patch",
                "title": ["Fun ControlNet (motion & retouch)", "Fun ControlNet (mouvement & retouche)"], "for": ["Motion control · Retouch", "Contrôle du mouvement · Retouche"],
                "choices": [
                    {"id": "ctl_int8", "file": "minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors", "size": 4531220608, "star": True,
                     "label": "Fun ControlNet union 2.0 INT8", "note": ["recommended", "recommandé"]},
                    {"id": "ctl_bf16", "file": "minimax_h3_fun_controlnet_union_2.0_pruned_bf16.safetensors", "size": 8382288792,
                     "label": "Fun ControlNet union 2.0 BF16", "note": ["full precision", "pleine précision"]},
                ]})
CATALOG.append({"id": "itp", "folder": "frame_interpolation", "required": False, "widget": "interp_model",
                "title": ["Frame interpolation", "Interpolation d'images"], "for": ["48 / 72 fps", "48 / 72 i/s"],
                "choices": [
                    {"id": "rife426", "file": "rife_v4.26.safetensors", "size": 22674688, "star": True,
                     "url": "https://huggingface.co/Comfy-Org/frame_interpolation/resolve/main/frame_interpolation/rife_v4.26.safetensors",
                     "label": "RIFE 4.26", "note": ["fast, clean", "rapide, propre"]},
                    {"id": "film", "file": "film_net_fp16.safetensors", "size": 68882302,
                     "url": "https://huggingface.co/Comfy-Org/frame_interpolation/resolve/main/frame_interpolation/film_net_fp16.safetensors",
                     "label": "FILM", "note": ["large motion", "grands mouvements"]},
                ]})
CATALOG.append({"id": "tae", "folder": "vae_approx", "required": False, "widget": None,
                "title": ["Sharp live preview (taeh3)", "Aperçu net en direct (taeh3)"], "for": ["community tiny decoder · 23 MB", "petit décodeur communautaire · 23 Mo"],
                "choices": [
                    {"id": "taeh3", "file": "taeh3.safetensors", "size": 22709752, "star": True,
                     "url": "https://huggingface.co/OzzyGT/taeh3/resolve/main/taeh3.safetensors",
                     "label": "taeh3", "note": ["optional", "optionnel"]},
                ]})

KREA = "https://huggingface.co/Comfy-Org/Krea-2/resolve/main/"
# ---- Krea 2 second pass (Full): an image model that re-details every frame at low denoise
CATALOG.append({"id": "kmodel", "folder": "diffusion_models", "required": False, "widget": "polish_model",
                "title": ["Krea 2 model (polish)", "Modèle Krea 2 (finition)"], "for": ["second pass · IntoRealism Krea 2 Flash recommended (Civitai)", "2e passe · IntoRealism Krea 2 Flash recommandé (Civitai)"],
                "choices": [
                    {"id": "k_fp8", "file": "krea2_turbo_fp8_scaled.safetensors", "size": 13141730784, "star": True,
                     "url": KREA + "diffusion_models/krea2_turbo_fp8_scaled.safetensors",
                     "label": "Krea 2 Turbo fp8", "note": ["8 steps (4 is enough for a polish)", "8 steps (4 suffisent pour une finition)"]},
                    {"id": "k_nvfp4", "file": "krea2_turbo_nvfp4.safetensors", "size": 7670000000,
                     "url": KREA + "diffusion_models/krea2_turbo_nvfp4.safetensors",
                     "label": "Krea 2 Turbo nvfp4", "note": ["RTX 50 only · lightest", "RTX 50 uniquement · le plus léger"]},
                ]})
CATALOG.append({"id": "kte", "folder": "text_encoders", "required": False, "widget": "polish_te",
                "title": ["Krea 2 text encoder", "Encodeur de texte Krea 2"], "for": ["Qwen3-VL 4B", "Qwen3-VL 4B"],
                "choices": [
                    {"id": "kte_fp8", "file": "qwen3vl_4b_fp8_scaled.safetensors", "size": 5240000000, "star": True,
                     "url": KREA + "text_encoders/qwen3vl_4b_fp8_scaled.safetensors", "label": "Qwen3-VL 4B fp8", "note": ["recommended", "recommandé"]},
                ]})
CATALOG.append({"id": "kvae", "folder": "vae", "required": False, "widget": "polish_vae",
                "title": ["Krea 2 VAE", "VAE Krea 2"], "for": ["Qwen Image VAE", "VAE Qwen Image"],
                "choices": [
                    {"id": "kvae", "file": "qwen_image_vae.safetensors", "size": 254000000, "star": True,
                     "url": KREA + "vae/qwen_image_vae.safetensors", "label": "Krea 2 VAE", "note": ["required for the polish", "nécessaire à la finition"]},
                ]})

STYLES = {
    "art_is_explosion": "Art is explosion", "blooming_flowers": "Blooming flowers", "bullet_time": "Bullet time",
    "dark_magic": "Dark magic", "fire_breath": "Fire breath", "four_seasons": "Four seasons", "kiss_camera": "Kiss camera",
    "spiral_ascent": "Spiral ascent", "storm_magic": "Storm magic", "truman_show": "Truman show",
}
CATALOG.append({"id": "emb", "folder": "embeddings", "required": False, "widget": None,
                "title": ["Style embeddings", "Styles (embeddings)"], "for": ["10 official H3 effects", "10 effets H3 officiels"],
                "choices": [{"id": "emb_" + k, "file": f"minimaxh3_{k}.safetensors", "size": 1_000_000, "label": v, "note": ["", ""],
                             "star": True} for k, v in STYLES.items()]})

_FOLDER_FROM_HF = {"diffusion_models": "diffusion_models/", "text_encoders": "text_encoders/", "vae": "vae/",
                   "loras": "loras/", "embeddings": "embeddings/", "upscale_models": "", "model_patches": "model_patches/", "frame_interpolation": "", "vae_approx": ""}
for _g in CATALOG:
    for _c in _g["choices"]:
        _c.setdefault("url", HF + _FOLDER_FROM_HF[_g["folder"]] + _c["file"])

_jobs = {}
_lock = threading.Lock()
FOLDER_ALIASES = {"diffusion_models": ["diffusion_models", "unet"], "text_encoders": ["text_encoders", "clip"]}


def file_list(folder):
    out = []
    for fd in FOLDER_ALIASES.get(folder, [folder]):
        try:
            out += [f for f in folder_paths.get_filename_list(fd) if f not in out]
        except Exception:
            pass
    return out


def _folder_dirs(folder):
    try:
        return list(folder_paths.get_folder_paths(folder))
    except Exception:
        return [os.path.join(folder_paths.models_dir, folder)]


def installed(folder, name):
    base = os.path.basename(name)
    return any(os.path.basename(f) == base for f in file_list(folder))


def resolve(folder, name):
    """Installed relative name matching a catalog/basename (sub-folders allowed), or None."""
    base = os.path.basename(name)
    for f in file_list(folder):
        if f == name or os.path.basename(f) == base:
            return f
    return None


def recommended(group_id):
    g = next(x for x in CATALOG if x["id"] == group_id)
    return g["choices"][0]["file"]


_HDR = {}


def _st_keys(path):
    """Tensor names of a .safetensors file, read from its JSON header only (a few KB, no weights). Cached by mtime."""
    import json, struct
    try:
        st = os.stat(path)
        k = (path, st.st_mtime, st.st_size)
        if k in _HDR:
            return _HDR[k]
        with open(path, "rb") as f:
            n = struct.unpack("<Q", f.read(8))[0]
            keys = set(json.loads(f.read(n)).keys()) if 0 < n < 200_000_000 else set()
        _HDR[k] = keys
        return keys
    except Exception:
        return set()


def is_h3_dit(folder, name):
    """True when a diffusion model file is a MiniMax H3 transformer, whatever its file name
    (same test as ComfyUI's model detection: video_patch_proj + audio_patch_proj)."""
    if not name.lower().endswith(".safetensors"):
        return False
    path = None
    for fd in FOLDER_ALIASES.get(folder, [folder]):
        try:
            path = folder_paths.get_full_path(fd, name)
        except Exception:
            path = None
        if path:
            break
    if not path:
        return False
    keys = _st_keys(path)
    return any(k.endswith("video_patch_proj.weight") for k in keys) and any(k.endswith("audio_patch_proj.weight") for k in keys)


SPLIT = {}   # widget → index where "other files of the folder" start (for the UI separator)


def options(group_id, rx=r"minimax|h3", required=False, detect=None):
    """Combo values for a widget: ONLY files that are really installed (a listed-but-missing file makes the new
    ComfyUI frontend frame the node in red). Optional groups start with "none"; a required group with nothing
    installed shows its recommended file (it is genuinely missing: the ◆ Models card downloads it).
    `detect(name)` also accepts files whose name doesn't match (e.g. an H3 model renamed by its author)."""
    import re
    g = next(x for x in CATALOG if x["id"] == group_id)
    cat = {c["file"] for c in g["choices"]}
    named, found = [], []
    for f in file_list(g["folder"]):
        b = os.path.basename(f)
        if re.search(rx, b, re.I) or b in cat:
            named.append(f)
        elif detect is not None and detect(f):
            found.append(f)
    names = named + found
    # every other file of the folder too, after the recognised ones: your own models must stay selectable
    # whatever their name (only real files are listed, so the frontend's missing-model frame never shows)
    others = [f for f in file_list(g["folder"]) if f not in names and f.lower().endswith((".safetensors", ".sft", ".gguf", ".pt", ".pth", ".ckpt", ".bin"))]
    if required:
        head = names or [g["choices"][0]["file"]]
        SPLIT[g["widget"] or group_id] = len(head)
        return head + others
    SPLIT[g["widget"] or group_id] = 1 + len(names)
    return ["none"] + names + others


def model_options():
    """Every model combo of the node, by widget name (also served to the UI so a new file shows up without reloading the page)."""
    import re
    refish = lambda f: re.search(r"ref", os.path.basename(f), re.I) is not None
    o = {}
    o["model_keyframes"] = options("fl", r"fl2va", required=True, detect=lambda f: not refish(f) and is_h3_dit("diffusion_models", f))
    o["model_references"] = options("ref", r"ref2va", detect=lambda f: refish(f) and is_h3_dit("diffusion_models", f))
    o["text_encoder"] = options("te", r"qwen3vl.*minimax|minimax.*qwen|h3", required=True)
    o["video_vae"] = options("vvae", r"minimax_h3_video|h3.*video", required=True)
    o["audio_vae"] = options("avae", r"minimax_h3_audio|h3.*audio", required=True)
    o["turbo_keyframes"] = options("lfl", r"minimax.*fl2v|h3.*fl2v")
    o["turbo_references"] = options("lref", r"minimax.*ref2v|h3.*ref2v")
    o["control_patch"] = options("ctl", r"minimax.*fun|h3.*control")
    o["interp_model"] = options("itp", r"rife|film")
    o["polish_model"] = options("kmodel", r"krea|intorealism")
    o["polish_te"] = options("kte", r"qwen3[\W_]?vl[\W_]?4b")
    o["polish_vae"] = options("kvae", r"qwen[\W_]?image.*vae|wan[\W_]?2[\W_.]?1.*vae")
    return o


def default(group_id, opts):
    g = next(x for x in CATALOG if x["id"] == group_id)
    for c in g["choices"]:
        for o in opts:
            if os.path.basename(o) == c["file"]:
                return o
    cut = SPLIT.get(g.get("widget") or group_id)
    recognised = opts[:cut] if cut else opts          # never default to an unrelated file of the folder
    real = [o for o in recognised if o != "none"]
    return real[0] if real else opts[0]


def status():
    out = []
    for g in CATALOG:
        items = []
        for c in g["choices"]:
            with _lock:
                j = dict(_jobs.get(c["id"], {}))
            j.pop("cancel", None)
            items.append({k: c[k] for k in ("id", "file", "label", "note", "size", "star") if k in c}
                         | {"installed": installed(g["folder"], c["file"]), "job": j or None})
        out.append({"id": g["id"], "title": g["title"], "for": g["for"], "folder": g["folder"], "required": g["required"],
                    "widget": g["widget"], "ok": any(i["installed"] for i in items), "choices": items})
    return out


def _find(choice_id):
    for g in CATALOG:
        for c in g["choices"]:
            if c["id"] == choice_id:
                return g, c
    return None, None


def _run(choice_id, url, dest, size):
    part = dest + ".part"
    job = _jobs[choice_id]
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        have = os.path.getsize(part) if os.path.exists(part) else 0
        req = urllib.request.Request(url, headers={"User-Agent": "Enzino-H3-Studio/1.0", **({"Range": f"bytes={have}-"} if have else {})})
        with urllib.request.urlopen(req, timeout=60) as r:
            if have and r.status != 206:
                have = 0
            total = int(r.headers.get("Content-Length") or 0) + have or size or 0
            job.update(total=total, done=have, state="downloading")
            t0, d0 = time.time(), have
            with open(part, "ab" if have else "wb") as f:
                while True:
                    if job.get("cancel"):
                        job.update(state="cancelled")
                        return
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
                    job["done"] += len(chunk)
                    dt = time.time() - t0
                    if dt > 1:
                        job["speed"] = (job["done"] - d0) / dt
        if job["total"] and job["done"] < job["total"]:
            raise IOError("incomplete download, click again to resume")
        os.replace(part, dest)
        job.update(state="done")
        try:  # make ComfyUI see the new file without a restart
            folder_paths.filename_list_cache.clear()
        except Exception:
            pass
    except Exception as e:  # network error: the .part file stays, the next click resumes
        job.update(state="error", error=str(e)[:200])


def start(choice_id):
    g, c = _find(choice_id)
    if not c:
        return {"error": "unknown file"}
    if installed(g["folder"], c["file"]):
        return {"ok": True, "installed": True}
    with _lock:
        j = _jobs.get(choice_id)
        if j and j.get("state") in ("downloading", "starting"):
            return {"ok": True}
        dest = os.path.join(_folder_dirs(g["folder"])[0], c["file"])
        _jobs[choice_id] = {"done": 0, "total": c.get("size", 0), "state": "starting", "speed": 0}
    threading.Thread(target=_run, args=(choice_id, c["url"], dest, c.get("size", 0)), daemon=True).start()
    return {"ok": True}


def cancel(choice_id):
    with _lock:
        if choice_id in _jobs:
            _jobs[choice_id]["cancel"] = True
    return {"ok": True}
