"""
✦ Enzino H3 Studio — MiniMax H3 in one node.

Text · Image · First + Last · End frame · References → video with native stereo sound, on ComfyUI's own
MiniMax H3 implementation (no custom model code): the node chains the native H3 conditioning nodes, the
native sampler and the native VAEs, and adds what a workflow can't do nicely: the official H3 keyframe header
written for you, auto canvas, style embeddings, audio drive, a middle keyframe, model caching, save + history.

by Enzino · https://enzinoai.com
"""

import json
import logging
import math
import os
import re
import time
from fractions import Fraction

import numpy as np
import torch

import comfy.model_management
import comfy.samplers
import folder_paths
import nodes as comfy_nodes

from . import catalog as C

log = logging.getLogger("EnzinoH3Studio")
CAT = "Enzino/H3 Studio"
FPS = 24
MODES = ["text", "image", "first_last", "last", "references"]
ASPECTS = {"16:9": (16, 9), "9:16": (9, 16), "1:1": (1, 1), "4:3": (4, 3), "3:4": (3, 4), "21:9": (21, 9), "3:2": (3, 2), "2:3": (2, 3)}
BASE_SHORT, MAX_PIXELS, MULT = 768, 768 * 1344, 32
STYLE_NAMES = ["none"] + list(C.STYLES.keys())

DEFAULT_PROMPT = """integrated_multimodal_description: [Shot 1] Live-action, cinematic, a wide shot at blue hour frames a red-and-white lighthouse on a granite headland of the Breton coast, heavy Atlantic waves bursting white against the rocks below. The camera pushes in with small amplitude at slow speed as the lantern room flickers on and its beam begins to sweep across the low storm clouds. [Shot 2] At 00:02.500, the camera cuts to a medium close-up of an old lighthouse keeper in a yellow oilskin coat at the top railing, rain streaming down his weathered face; the gruff, low-voiced old man (S1) squints into the wind and says: <d>[French] Elle tiendra encore cette nuit.</d>

overall_soundscape: Strong wind gusts howl around the tower while waves crash and drain back over the rocks. Rain spatters on oilskin fabric and metal railings, and the lantern mechanism hums steadily overhead.

non_diegetic_music: Low sustained cello drones at a slow tempo, joined by a distant solo fiddle melody that swells gently on the cut and fades with the last wave."""

# official H3 alignment instructions (VIDEO_PROMPT_WRITING_GUIDE_base_en)
HDR_I2V = "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced."
HDR_FL = ("How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of "
          "the target video; Picture 2 (from Shot {n}) aligns with the {s:.2f}-second mark of the target video.")
HDR_L = "How the reference pictures align with the target video — <Picture 1> (from [Shot {n}]) aligns with the {s:.2f}-second mark of the target video."

_CACHE = {}


# ------------------------------------------------------------------------------------------------ helpers
def _native(name):
    cls = comfy_nodes.NODE_CLASS_MAPPINGS.get(name)
    if cls is None:
        raise RuntimeError(f"[Enzino H3 Studio] ComfyUI node '{name}' is missing: update ComfyUI (MiniMax H3 needs a recent version).")
    return cls


def _run(name, **kw):
    """Call a native V3 node and return its outputs tuple."""
    out = _native(name).execute(**kw)
    return out.result if hasattr(out, "result") else out


def _run_compat(name, **kw):
    """Like _run, but only passes the arguments the installed version of a third-party node accepts
    (e.g. older Nvidia VFX nodes have no `strength`)."""
    import inspect
    fn = _native(name).execute
    try:
        params = inspect.signature(fn).parameters
        if not any(p.kind == p.VAR_KEYWORD for p in params.values()):
            kw = {k: v for k, v in kw.items() if k in params}
    except (TypeError, ValueError):
        pass
    out = fn(**kw)
    return out.result if hasattr(out, "result") else out


def _status(uid, text):
    try:
        from server import PromptServer
        PromptServer.instance.send_sync("enzino_h3.status", {"node": str(uid), "text": text})
    except Exception:
        pass
    log.info(f"[Enzino H3 Studio] {text}")


def frames_for(seconds):
    n = max(5, round(float(seconds) * FPS))
    while n % 17 != 5:
        n += 1
    return n


RESOLUTIONS = ["480p", "576p", "640p", "720p", "768p", "896p", "1024p", "1080p", "custom_mp", "custom"]
UPSCALES = ["off", "1080p", "1440p", "2160p"]


def budget(resolution, mp=None):
    """Pixel budget of a preset: the area of its 16:9 frame (768p = 1344×768 ≈ 1.03 MP, H3's native cap).
    custom_mp: your own budget in megapixels (above ~1 MP is beyond what H3 was trained on: more detail, slower, riskier)."""
    if resolution == "custom_mp":
        return max(0.15, float(mp or 1.0)) * 1e6
    try:
        short = int(str(resolution).rstrip("p"))
    except ValueError:
        short = BASE_SHORT
    a = short * short * 16 / 9
    return min(a, MAX_PIXELS) if short <= BASE_SHORT else a


def canvas(aspect, resolution, ref=None, mp=None):
    """H3 canvas by PIXEL BUDGET (like the official Resolution Selector in megapixels): every aspect gets the same
    number of pixels as 16:9 at that preset (768p: 1344×768, 992×992, 1152×864, 768×1344…), ×32, never above the budget."""
    A = budget(resolution, mp)
    if aspect == "auto" and ref is not None:
        w, h = ref.shape[2], ref.shape[1]
    else:
        w, h = ASPECTS.get(aspect, (16, 9))
    r = w / h
    w0, h0 = math.sqrt(A * r), math.sqrt(A / r)
    best, score = None, -1
    for cw in (math.floor(w0 / MULT) * MULT, math.floor(w0 / MULT) * MULT + MULT):
        for ch in (math.floor(h0 / MULT) * MULT, math.floor(h0 / MULT) * MULT + MULT):
            cw_, ch_ = max(cw, 384), max(ch, 384)
            if cw_ * ch_ > A * 1.015:
                continue
            sc = cw_ * ch_ * (1 - abs(math.log((cw_ / ch_) / r)))
            if sc > score:
                best, score = (cw_, ch_), sc
    return best or (max(384, round(w0 / MULT) * MULT), max(384, round(h0 / MULT) * MULT))


def upscale_frames(frames, target, upscaler, uid):
    """Frame-by-frame upscale so the short edge reaches `target` (1080p / 1440p / 2160p), small chunks to keep RAM sane."""
    import comfy.utils
    short = min(frames.shape[1], frames.shape[2])
    t = int(str(target).rstrip("p"))
    if t <= short:
        return frames
    s = t / short
    W, H = round(frames.shape[2] * s / 2) * 2, round(frames.shape[1] * s / 2) * 2
    if upscaler == "rtx_vsr":   # NVIDIA RTX Video Super Resolution (Comfy-Org Nvidia VFX nodes): video-grade, very fast
        out = torch.empty((frames.shape[0], H, W, 3), dtype=torch.float16)
        W8, H8 = round(W / 8) * 8, round(H / 8) * 8
        n = frames.shape[0]
        for i in range(0, n, 16):
            comfy.model_management.throw_exception_if_processing_interrupted()
            chunk = _run_compat("RTXVideoSuperResolution", images=frames[i:i + 16].float(),
                                resize_type={"resize_type": "target dimensions", "width": W8, "height": H8}, quality="ULTRA", strength=1.0)[0]
            if chunk.shape[1:3] != (H, W):
                chunk = comfy.utils.common_upscale(chunk.movedim(-1, 1), W, H, "lanczos", "disabled").movedim(1, -1)
            out[i:i + 16] = chunk[..., :3].clamp(0, 1).to(torch.float16).cpu()
            if i % 48 == 0:
                _status(uid, f"RTX Video Super Resolution to {W}×{H} · {min(n, i + 16)}/{n}")
        return out.float()
    model = None
    if upscaler and upscaler != "lanczos":
        model = _cached(("ups", upscaler), lambda: _run("UpscaleModelLoader", model_name=upscaler)[0], group="ups")
    out = torch.empty((frames.shape[0], H, W, 3), dtype=torch.float16)
    n = frames.shape[0]
    for i in range(0, n, 4):
        comfy.model_management.throw_exception_if_processing_interrupted()
        chunk = frames[i:i + 4]
        if model is not None:
            chunk = _run("ImageUpscaleWithModel", upscale_model=model, image=chunk)[0]
        chunk = comfy.utils.common_upscale(chunk.movedim(-1, 1), W, H, "lanczos", "disabled").movedim(1, -1).clamp(0, 1)
        out[i:i + 4] = chunk.to(torch.float16)
        if i % 24 == 0:
            _status(uid, f"Upscaling to {W}×{H} · {min(n, i + 4)}/{n}")
    return out.float()


def _tae():
    """Optional tiny H3 decoder (models/vae_approx/taeh3*) for sharp live previews."""
    if "tae" in _CACHE:
        return _CACHE["tae"]
    tae = None
    try:
        name = next((f for f in folder_paths.get_filename_list("vae_approx") if os.path.basename(f).startswith("taeh3")), None)
        if name:
            import comfy.sd
            import comfy.utils
            tae = comfy.sd.VAE(comfy.utils.load_torch_file(folder_paths.get_full_path("vae_approx", name)))
            tae.first_stage_model.show_progress_bar = False
    except Exception as e:
        log.warning(f"[Enzino H3 Studio] taeh3 not usable, fast preview instead: {e}")
        tae = None
    _CACHE["tae"] = tae
    return tae


ATT_ORDER = ["sage", "sage3", "flash", "comfy_kitchen_int8"]
AUTO_ORDER = ["sage", "sage3", "flash"]          # INT8 Comfy Kitchen is never picked automatically (not stable on every torch build)
BROKEN_ATT = {}                                   # backend → error, filled when a backend fails at run time


def safe_attention(name):
    """The chosen backend, wrapped: if it raises (e.g. "'torch.Stream' object has no attribute 'cuda_stream'" with some
    torch / kitchen builds) the run continues with PyTorch attention and the backend is skipped until ComfyUI restarts."""
    import comfy.ldm.modules.attention as A
    fn = A.get_attention_function(name)
    fallback = A.get_attention_function("pytorch")

    def attention(*args, **kwargs):
        if name in BROKEN_ATT:
            return fallback(*args, **kwargs)
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            BROKEN_ATT[name] = str(e)[:200]
            log.warning(f"[Enzino H3 Studio] attention '{name}' failed ({e}); using PyTorch attention instead")
            return fallback(*args, **kwargs)
    return attention


def available_attention():
    try:
        import comfy.ldm.modules.attention as A
        return [n for n in ATT_ORDER if n in A.REGISTERED_ATTENTION_FUNCTIONS]
    except Exception:
        return []


def pick_attention(choice):
    """'auto' = fastest backend installed (SageAttention 3 → Sage → Flash → INT8 kitchen); None keeps ComfyUI's default."""
    av = available_attention()
    name = {"int8": "comfy_kitchen_int8"}.get(choice, choice)
    if choice == "auto":
        ok = [a for a in AUTO_ORDER if a in av and a not in BROKEN_ATT]
        return ok[0] if ok else None
    if choice == "default":
        return None
    if name in BROKEN_ATT:
        log.warning(f"[Enzino H3 Studio] attention '{choice}' failed earlier in this session, using ComfyUI's default")
        return None
    if name in av:
        return name
    log.warning(f"[Enzino H3 Studio] attention '{choice}' is not installed, using ComfyUI's default")
    return None


def _live_callback(uid, latent, steps, length=124, every=1):
    """Progress bar + an animated preview of the whole clip (latent → RGB, every step) sent to the node card."""
    import base64
    import io as _io
    import comfy.utils
    from PIL import Image
    pbar = comfy.utils.ProgressBar(steps)
    lf = None
    try:
        from comfy import latent_formats
        lf = latent_formats.MiniMaxH3Video()
        fac = torch.tensor(lf.latent_rgb_factors, dtype=torch.float32)
        bias = torch.tensor(lf.latent_rgb_factors_bias or [0, 0, 0], dtype=torch.float32)
    except Exception:
        fac = None
    samples = latent["samples"]
    shapes = [t.shape for t in samples.unbind()] if getattr(samples, "is_nested", False) else None
    try:
        from server import PromptServer
        srv = PromptServer.instance
    except Exception:
        srv = None

    def cb(step, x0, x, total):
        pbar.update_absolute(step + 1, total, None)
        if srv is None or uid is None or not every or ((step + 1) % every and step + 1 != total):
            return
        try:
            v = x0.tensors[0] if getattr(x0, "is_nested", False) else (comfy.utils.unpack_latents(x0, shapes)[0] if shapes else x0)
            T = v.shape[2]
            tae = _tae()
            rgb = None
            if tae is not None:                                      # sharp preview with the tiny H3 decoder
                try:
                    dec = tae.decode(v[:1].to(tae.device if hasattr(tae, "device") else v.device))[0]
                    dec = dec.reshape(-1, *dec.shape[-3:]).float().cpu()
                    step_ = max(1, dec.shape[0] // max(1, T))
                    rgb = dec[::step_][:max(T, 1) * 2].clamp(0, 1)
                except Exception as e:
                    log.debug(f"[Enzino H3 Studio] taeh3 preview failed, using fast preview: {e}")
                    rgb = None
            if rgb is None:
                vv = v[0].float().cpu()                              # [24, T, h, w]
                rgb = torch.einsum("cthw,cr->thwr", vv, fac) + bias  # [T, h, w, 3]
                rgb = ((rgb + 1) / 2).clamp(0, 1)
            T, h, w, _ = rgb.shape
            sc = min(1.0, 320 / max(h, w)) if max(h, w) > 320 else 320 / max(h, w)
            rgb = torch.nn.functional.interpolate(rgb.permute(0, 3, 1, 2), size=(max(1, round(h * sc)), max(1, round(w * sc))), mode="bilinear").permute(0, 2, 3, 1)
            frames = []
            for f in (rgb.numpy() * 255).astype(np.uint8):
                b = _io.BytesIO()
                Image.fromarray(f).save(b, "JPEG", quality=66)
                frames.append(base64.b64encode(b.getvalue()).decode())
            srv.send_sync("enzino_h3.preview", {"node": str(uid), "step": step + 1, "total": total, "fps": max(2.0, T * FPS / max(1, length)), "frames": frames})
        except Exception as e:
            log.debug(f"[Enzino H3 Studio] live preview: {e}")
    return cb


def _sample(model, positive, latent, seed, sampler_name, scheduler, n_steps, uid, length=124, every=1):
    """Same as ComfyUI's SamplerCustomAdvanced, with the live video preview callback."""
    import comfy.sample
    import comfy.utils
    noise = _run("RandomNoise", noise_seed=seed)[0]
    guider = _run("BasicGuider", model=model, conditioning=positive)[0]
    sampler = _run("KSamplerSelect", sampler_name=sampler_name)[0]
    sigmas = _run("BasicScheduler", model=model, scheduler=scheduler, steps=n_steps, denoise=1.0)[0]
    lat = latent.copy()
    lat["samples"] = comfy.sample.fix_empty_latent_channels(guider.model_patcher, lat["samples"], lat.get("downscale_ratio_spacial", None), lat.get("downscale_ratio_temporal", None))
    cb = _live_callback(uid, lat, sigmas.shape[-1] - 1, length, every)
    out = guider.sample(noise.generate_noise(lat), lat["samples"], sampler, sigmas, denoise_mask=lat.get("noise_mask"),
                        callback=cb, disable_pbar=not comfy.utils.PROGRESS_BAR_ENABLED, seed=noise.seed)
    res = {k: v for k, v in lat.items() if k not in ("downscale_ratio_spacial", "downscale_ratio_temporal")}
    res["samples"] = out.to(comfy.model_management.intermediate_device())
    return res


def last_shot(text):
    nums = [int(x) for x in re.findall(r"\[\s*Shot\s+(\d+)\s*\]", text or "", re.I)]
    return max(nums) if nums else 1


def build_prompt(mode, body, auto_header, style, frames):
    body = (body or "").strip()
    parts = []
    if auto_header and not re.match(r"^\s*(For the target video|How the reference pictures)", body):
        secs = frames / FPS
        if mode == "image":
            parts.append(HDR_I2V)
        elif mode == "first_last":
            parts.append(HDR_FL.format(n=last_shot(body), s=secs))
        elif mode == "last":
            parts.append(HDR_L.format(n=last_shot(body), s=secs))
    if style and style != "none":
        emb = f"minimaxh3_{style}"
        if C.installed("embeddings", emb + ".safetensors"):
            body = f"embedding:{emb} {body}"
        else:
            log.warning(f"[Enzino H3 Studio] style '{style}' skipped: {emb}.safetensors is not in models/embeddings")
    parts.append(body)
    return "\n\n".join(p for p in parts if p)


def _load_image(name):
    if not name:
        return None
    try:
        return comfy_nodes.LoadImage().load_image(name)[0][:1]
    except Exception as e:
        raise ValueError(f"[Enzino H3 Studio] can't read image '{name}': {e}")


def _load_audio(name):
    if not name:
        return None
    return _run("LoadAudio", audio=name)[0]


def _load_video(name, max_frames=15 * FPS):
    """Reference video → (frames at 24 fps, soundtrack or None)."""
    if not name:
        return None, None
    src = _run("LoadVideo", file=name)[0]
    comp = src.get_components()
    imgs, fps = comp.images, float(comp.frame_rate or FPS)
    if abs(fps - FPS) > 0.01 and imgs.shape[0] > 1:
        n = int(imgs.shape[0] * FPS / fps)
        idx = torch.clamp(torch.round(torch.arange(n) * fps / FPS).long(), 0, imgs.shape[0] - 1)
        imgs = imgs[idx]
    imgs = imgs[:max_frames]
    audio = comp.audio
    if audio is not None:
        w = audio["waveform"]
        audio = {"waveform": w[..., : int(audio["sample_rate"] * imgs.shape[0] / FPS)], "sample_rate": audio["sample_rate"]}
    return imgs, audio


def _cached(key, fn, group=None):
    if key in _CACHE:
        return _CACHE[key]
    if group:  # one diffusion model in RAM at a time (each one is ~16-21 GB)
        for k in [k for k in _CACHE if k[0] == group or (group == "unet" and k[0] == "patched")]:
            del _CACHE[k]
        comfy.model_management.soft_empty_cache()
    _CACHE[key] = fn()
    return _CACHE[key]


_COND = {}


def _thash(t):
    if t is None:
        return None
    if isinstance(t, dict):  # audio
        w = t.get("waveform")
        return ("a", t.get("sample_rate"), tuple(w.shape), float(w.float().abs().sum())) if w is not None else None
    t = t.float()
    return (tuple(t.shape), float(t.sum()), float(t[..., ::7, ::7, :].std()) if t.numel() > 1 else 0.0)


def _cond_key(*parts):
    import hashlib
    h = hashlib.sha1()
    for p in parts:
        if isinstance(p, list):
            p = [_thash(x) for x in p]
        elif isinstance(p, (torch.Tensor, dict)):
            p = _thash(p)
        h.update(repr(p).encode())
    return h.hexdigest()


def free_memory():
    _CACHE.clear()
    _COND.clear()
    comfy.model_management.unload_all_models()
    comfy.model_management.soft_empty_cache()


def _ram_free_gb():
    try:
        import psutil
        return psutil.virtual_memory().available / 2 ** 30
    except Exception:
        return None


def _model_gb(m):
    try:
        return m.model_size() / 2 ** 30
    except Exception:
        return 20.0


def _relieve_text_encoder(clip_key, model_gb, force=False):
    """Before sampling: take the 15 GB text encoder out of the way of the diffusion model.
    On 16 GB cards the diffusion model is streamed from RAM; if the text encoder still holds VRAM and
    pinned RAM, Windows starts paging and a step can go from 16 s to 200 s (seen on shot 2 of a story).
    It always leaves VRAM; it also leaves RAM when RAM is short (reloading it costs ~15 s, paging costs minutes)."""
    import gc
    mm = comfy.model_management
    clip = _CACHE.get(clip_key)
    try:
        mm.unload_all_models()  # ComfyUI's own path (safe with dynamic VRAM); the video model is staged again anyway
    except Exception as e:
        log.warning(f"[Enzino H3 Studio] could not unload the text encoder: {e}")
    gc.collect()
    free = _ram_free_gb()
    need = model_gb + 10
    if clip is not None and (force or (free is not None and free < need)):
        _CACHE.pop(clip_key, None)
        del clip
        gc.collect()
        log.info(f"[Enzino H3 Studio] text encoder released from RAM ({free:.0f} GB free, ~{need:.0f} GB needed to sample without paging)"
                 if free is not None else "[Enzino H3 Studio] text encoder released from RAM")
    mm.soft_empty_cache()
    return _ram_free_gb()


def _file_gb(folder, name):
    try:
        return os.path.getsize(folder_paths.get_full_path(folder, name)) / 2 ** 30
    except Exception:
        return 16.0


def _cpu(x):
    """Cached conditionings live on the CPU: a GPU tensor kept between runs can point to memory that ComfyUI's
    dynamic VRAM has handed to something else (=> CUDA illegal memory access on the next run)."""
    if isinstance(x, torch.Tensor):
        return x.detach().to("cpu", copy=True)
    if isinstance(x, dict):
        return {k: _cpu(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_cpu(v) for v in x]
    if isinstance(x, tuple):
        return tuple(_cpu(v) for v in x)
    return x


def _drop_krea(need_gb):
    """Krea 2 (polish) stays in RAM between runs only while there is room for H3 next to it."""
    import gc
    ks = [k for k in _CACHE if isinstance(k, tuple) and k[0] in ("krea", "kclip", "kvae")]
    free = _ram_free_gb()
    if ks and free is not None and free < need_gb:
        for k in ks:
            del _CACHE[k]
        comfy.model_management.unload_all_models()
        gc.collect()
        comfy.model_management.soft_empty_cache()


def _evict_video_model(uid, tag=""):
    import gc
    ks = [k for k in _CACHE if k[0] in ("unet", "patched")]
    if not ks:
        return False
    _status(uid, tag + "Low RAM: setting the video model aside while the prompt is read…")
    for k in ks:
        del _CACHE[k]
    comfy.model_management.unload_all_models()
    gc.collect()
    comfy.model_management.soft_empty_cache()
    return True


def _prefer(opts, rx):
    return next((o for o in opts if re.search(rx, os.path.basename(o), re.I)), None)


def _free_for_krea():
    """Before the Krea 2 polish: H3 leaves VRAM, and RAM too when Krea 2 (~13 + 5 GB) wouldn't fit next to it."""
    import gc
    comfy.model_management.unload_all_models()
    free = _ram_free_gb()
    if free is not None and free < 26:
        for k in [k for k in _CACHE if isinstance(k, tuple) and k[0] in ("unet", "patched", "clip", "ctl")]:
            del _CACHE[k]
        log.info(f"[Enzino H3 Studio] Krea 2 polish: H3 models released from RAM ({free:.0f} GB free)")
    gc.collect()
    comfy.model_management.soft_empty_cache()


def _vram_gb():
    try:
        mm = comfy.model_management
        return mm.get_total_memory(mm.get_torch_device()) / 2 ** 30
    except Exception:
        return 0.0


def _low_vram(choice):
    return choice == "on" or (choice == "auto" and 0 < _vram_gb() < 20)


def _step_cache(choice, is_full):
    if choice == "auto":
        choice = "light" if is_full else "off"
    return {"light": 0.15, "strong": 0.3}.get(choice)


def chunk_feed_forward(model, chunks=4, min_tokens=16384):
    """Runs every DiT block's MLP over the tokens in `chunks` pieces (same result, ~1/chunks of the activation peak).
    Done with object patches on `mlp.forward`, so weights, LoRAs and ComfyUI's streaming stay untouched."""
    try:
        blocks = model.get_model_object("diffusion_model.blocks")
    except Exception:
        return model
    m = model.clone()

    def make(mlp):
        fwd = type(mlp).forward

        def forward(x):
            n = x.shape[1] if x.dim() == 3 else 0
            if n < min_tokens:
                return fwd(mlp, x)
            step = -(-n // chunks)
            out = None
            for a in range(0, n, step):
                y = fwd(mlp, x[:, a:a + step])
                if out is None:
                    out = torch.empty((x.shape[0], n, y.shape[-1]), dtype=y.dtype, device=y.device)
                out[:, a:a + y.shape[1]] = y
                del y
            return out
        return forward

    for i, blk in enumerate(blocks):
        if hasattr(blk, "mlp"):
            m.add_object_patch(f"diffusion_model.blocks.{i}.mlp.forward", make(blk.mlp))
    log.info(f"[Enzino H3 Studio] low-VRAM feed-forward: {len(blocks)} blocks in {chunks} chunks")
    return m


class _headroom:
    """Temporarily asks ComfyUI to keep `gb` more VRAM free while sampling."""
    def __init__(self, gb):
        self.add = int(gb * 1024 ** 3)

    def __enter__(self):
        mm = comfy.model_management
        self.old = mm.EXTRA_RESERVED_VRAM
        mm.EXTRA_RESERVED_VRAM = self.old + self.add
        return self

    def __exit__(self, *a):
        comfy.model_management.EXTRA_RESERVED_VRAM = self.old
        return False


def _gpu_crash(e):
    t = f"{type(e).__name__}: {e}"
    return "illegal memory access" in t or "CUDA error" in t or "AcceleratorError" in t


def _safe_load(what, name, fn):
    try:
        return fn()
    except Exception as e:
        raise RuntimeError(f"[Enzino H3 Studio] {what} '{os.path.basename(name)}' could not be loaded "
                           f"(incomplete download or wrong file?): {str(e)[:200]}") from e


def _need(folder, name, what):
    real = C.resolve(folder, name)
    if not real:
        raise ValueError(f"[Enzino H3 Studio] {what} missing: {name}. Open the ◆ Models card of the node to download it.")
    return real


def _save_dir(folder):
    out = folder_paths.get_output_directory()
    sub = re.sub(r"[^\w\-. /]+", "_", (folder or "").replace("\\", "/")).strip("/ .")
    sub = "/".join(p for p in sub.split("/") if p not in ("", ".", ".."))
    return out, sub


def store_dir():
    d = os.path.join(folder_paths.get_user_directory(), "default", "enzino_h3_studio")
    os.makedirs(d, exist_ok=True)
    return d


def add_history(item, keep=48):
    p = os.path.join(store_dir(), "history.json")
    try:
        with open(p, encoding="utf-8") as f:
            h = json.load(f)
    except Exception:
        h = []
    h = [item] + [x for x in h if x.get("video") != item.get("video")]
    with open(p, "w", encoding="utf-8") as f:
        json.dump(h[:keep], f, ensure_ascii=False)


def _upscalers():
    try:
        rtx = ["rtx_vsr"] if "RTXVideoSuperResolution" in comfy_nodes.NODE_CLASS_MAPPINGS else []
        return ["lanczos"] + rtx + folder_paths.get_filename_list("upscale_models")
    except Exception:
        return ["lanczos"]


def _default_upscaler():
    ups = _upscalers()
    for key in ("rtx_vsr", "ultrasharp", "4x", "2x"):
        for u in ups:
            if key in u.lower():
                return u
    return "lanczos"


# ------------------------------------------------------------------------------------------------ node
from .edition import PRO, PF, PC, PK, EDITION, FREE_MAX_LORAS, FULL_URL  # noqa: E402

SOCIAL_FORMATS = ["9:16", "1:1", "4:5", "16:9"]


def _list(folder):
    try:
        return folder_paths.get_filename_list(folder)
    except Exception:
        return []


MODEL_WIDGETS = {"model_keyframes", "model_references", "text_encoder", "video_vae", "audio_vae", "turbo_keyframes", "turbo_references",
                 "control_patch", "interp_model", "upscaler"}


def _sanitize(k, uid=None):
    """Repair values that don't fit the inputs (old workflows): out-of-list → default, numbers clamped."""
    spec = EnzinoH3Studio.INPUT_TYPES()["required"]
    P, fixed = dict(k), []
    for name, sp in spec.items():
        opts = sp[1] if len(sp) > 1 else {}
        default = opts.get("default")
        if name not in P:
            P[name] = default
            continue
        v = P[name]
        if isinstance(sp[0], list):
            if v not in sp[0] and name not in MODEL_WIDGETS:
                P[name] = default if default is not None else sp[0][0]
                fixed.append(name)
        elif sp[0] in ("INT", "FLOAT"):
            try:
                v = int(v) if sp[0] == "INT" else float(v)
            except Exception:
                v = default
                fixed.append(name)
            if "min" in opts and v < opts["min"]:
                v = opts["min"]; fixed.append(name)
            if "max" in opts and v > opts["max"]:
                v = opts["max"]; fixed.append(name)
            P[name] = v
        elif sp[0] == "BOOLEAN" and not isinstance(v, bool):
            P[name] = bool(default); fixed.append(name)
    if fixed:
        log.warning(f"[Enzino H3 Studio] repaired settings: {', '.join(sorted(set(fixed)))}")
        _status(uid, "Some settings were repaired (old workflow)")
    return P


class EnzinoH3Studio:
    @classmethod
    def INPUT_TYPES(cls):
        samplers = comfy.samplers.KSampler.SAMPLERS
        schedulers = comfy.samplers.KSampler.SCHEDULERS
        MO = C.model_options()
        loras_fl, loras_ref = MO["turbo_keyframes"], MO["turbo_references"]
        o_ctl, o_itp = MO["control_patch"], MO["interp_model"]
        o_fl, o_ref = MO["model_keyframes"], MO["model_references"]
        o_te, o_vv, o_av = MO["text_encoder"], MO["video_vae"], MO["audio_vae"]
        o_km, o_kt, o_kv = MO["polish_model"], MO["polish_te"], MO["polish_vae"]
        return {
            "required": {
                "mode": (MODES, {"default": "text"}),
                "prompt": ("STRING", {"multiline": True, "dynamicPrompts": True, "default": DEFAULT_PROMPT}),
                "auto_header": ("BOOLEAN", {"default": True}),
                "style": (STYLE_NAMES, {"default": "none"}),
                "first_image": ("STRING", {"default": ""}),
                "last_image": ("STRING", {"default": ""}),
                "mid_on": ("BOOLEAN", {"default": False}),
                "mid_image": ("STRING", {"default": ""}),
                "mid_position": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "ref_images": ("STRING", {"default": "[]"}),
                "ref_video": ("STRING", {"default": ""}),
                "ref_video_sound": ("BOOLEAN", {"default": True}),
                "ref_audio": ("STRING", {"default": ""}),
                "ref_image_size": (["match", "max"], {"default": "match"}),
                "refmods": ("STRING", {"default": "[]", "tooltip": "Saved H3 references (ComfyUI-MiniMaxH3Mod): JSON list of {name, strength, copies, on}"}),
                "refmod_retention": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "refmod_hint": ("BOOLEAN", {"default": True}),
                "drive_on": ("BOOLEAN", {"default": False}),
                "drive_audio": ("STRING", {"default": ""}),
                "drive_start": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 15.0, "step": 0.1}),
                "duration": ("FLOAT", {"default": 5.0, "min": 1.0, "max": 15.0, "step": 0.5}),
                "aspect": (["auto"] + list(ASPECTS.keys()), {"default": "auto"}),
                "resolution": (RESOLUTIONS, {"default": "768p"}),
                "custom_width": ("INT", {"default": 1344, "min": 256, "max": 4096, "step": 32}),
                "custom_height": ("INT", {"default": 768, "min": 256, "max": 4096, "step": 32}),
                "custom_mp": ("FLOAT", {"default": 1.0, "min": 0.2, "max": 4.0, "step": 0.05, "tooltip": "Your own pixel budget (resolution = custom_mp). 1.0 ≈ H3 native."}),
                "upscale": (UPSCALES, {"default": "off"}),
                "upscaler": (_upscalers(), {"default": _default_upscaler()}),
                "speed": (["turbo", "full"], {"default": "turbo"}),
                "loras": ("STRING", {"default": "[]", "tooltip": "LoRA stack: JSON list of {name, strength, on}"}),
                "steps": ("INT", {"default": 0, "min": 0, "max": 60}),
                "seed": ("INT", {"default": 2026, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": True}),
                "sampler_name": (samplers, {"default": "res_multistep"}),
                "scheduler": (schedulers, {"default": "simple"}),
                "shift_on": ("BOOLEAN", {"default": False}),
                "shift_video": ("FLOAT", {"default": 12.0, "min": 0.5, "max": 50.0, "step": 0.1}),
                "shift_audio": ("FLOAT", {"default": 3.0, "min": 0.5, "max": 50.0, "step": 0.1}),
                # ---- Full edition
                "variations": ("INT", {"default": 1, "min": 1, "max": 4}),
                "story_on": ("BOOLEAN", {"default": False}),
                "story": ("STRING", {"default": "[]"}),
                "control_mode": (["off", "motion", "retouch"], {"default": "off"}),
                "control_video": ("STRING", {"default": ""}),
                "control_type": (["as_is", "canny"], {"default": "as_is"}),
                "control_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05}),
                "control_end": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 1.0, "step": 0.05}),
                "control_patch": (o_ctl, {"default": C.default("ctl", o_ctl)}),
                "retouch_source": ("STRING", {"default": ""}),
                "retouch_box": ("STRING", {"default": '{"x":0.3,"y":0.2,"w":0.4,"h":0.5}'}),
                "retouch_start": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 15.0, "step": 0.1}),
                "retouch_end": ("FLOAT", {"default": 15.0, "min": 0.0, "max": 15.0, "step": 0.1}),
                "retouch_keep_sound": ("BOOLEAN", {"default": True}),
                "interpolate": (["off", "x2", "x3"], {"default": "off"}),
                "interp_model": (o_itp, {"default": C.default("itp", o_itp)}),
                "sign_on": ("BOOLEAN", {"default": False}),
                "sign_text": ("STRING", {"default": "@enzinoai"}),
                "sign_pos": (["bottom-right", "bottom-left", "bottom-center", "top-right", "top-left"], {"default": "bottom-right"}),
                "sign_size": ("FLOAT", {"default": 0.035, "min": 0.015, "max": 0.1, "step": 0.005}),
                "sign_opacity": ("FLOAT", {"default": 0.85, "min": 0.1, "max": 1.0, "step": 0.05}),
                "social": ("STRING", {"default": "[]"}),
                "social_focus": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                # ---- models
                "model_keyframes": (o_fl, {"default": C.default("fl", o_fl)}),
                "model_references": (o_ref, {"default": C.default("ref", o_ref)}),
                "text_encoder": (o_te, {"default": C.default("te", o_te)}),
                "video_vae": (o_vv, {"default": C.default("vvae", o_vv)}),
                "audio_vae": (o_av, {"default": C.default("avae", o_av)}),
                "turbo_keyframes": (loras_fl, {"default": C.default("lfl", loras_fl)}),
                "turbo_references": (loras_ref, {"default": C.default("lref", loras_ref)}),
                "weight_dtype": (["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"], {"default": "default"}),
                # ---- speed & memory
                "prompt_cache": ("BOOLEAN", {"default": True}),
                "keep_loaded": ("BOOLEAN", {"default": True}),
                "free_text_encoder": ("BOOLEAN", {"default": False}),
                "attention": (["auto", "default", "sage", "sage3", "flash", "int8"], {"default": "auto"}),
                "torch_compile": ("BOOLEAN", {"default": False}),
                "preview_every": ("INT", {"default": 1, "min": 0, "max": 8}),
                "sparse_attention": ("BOOLEAN", {"default": False}),
                "sparse_tau": ("FLOAT", {"default": 1.3, "min": 0.5, "max": 3.0, "step": 0.05}),
                "tiled_decode": ("BOOLEAN", {"default": False}),
                "step_cache": (["auto", "off", "light", "strong"], {"default": "auto", "tooltip": "Native EasyCache: skips steps whose result barely changes (auto = on for Full, off for Turbo)"}),
                "low_vram": (["auto", "on", "off"], {"default": "auto", "tooltip": "Splits the feed-forward of each block in chunks: much lower VRAM peak (auto = on under 20 GB)"}),
                "polish_on": ("BOOLEAN", {"default": False, "tooltip": "Full: Krea 2 second pass on every frame (fine detail only, motion and colours stay H3's)"}),
                "polish_model": (o_km, {"default": _prefer(o_km, r"intorealism") or C.default("kmodel", o_km)}),
                "polish_te": (o_kt, {"default": C.default("kte", o_kt)}),
                "polish_vae": (o_kv, {"default": C.default("kvae", o_kv)}),
                "polish_denoise": ("FLOAT", {"default": 0.15, "min": 0.03, "max": 0.6, "step": 0.01}),
                "polish_steps": ("INT", {"default": 4, "min": 1, "max": 30}),
                "polish_mode": (["texture", "full"], {"default": "texture"}),
                "polish_stable": ("BOOLEAN", {"default": True}),
                "polish_prompt": ("STRING", {"multiline": True, "default": ""}),
                "save_on": ("BOOLEAN", {"default": True}),
                "folder": ("STRING", {"default": "MiniMax_H3"}),
                "filename": ("STRING", {"default": "enzino_h3"}),
            },
            "optional": {
                "first_frame": ("IMAGE", {"tooltip": "Overrides the First frame slot (Image / First + Last modes)."}),
                "last_frame": ("IMAGE", {"tooltip": "Overrides the Last frame slot."}),
                "references": ("IMAGE", {"tooltip": "Extra reference pictures (References mode), added after the slots."}),
                "audio": ("AUDIO", {"tooltip": "References mode: reference audio. Other modes: drives the soundtrack."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "prompt_meta": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("VIDEO", "IMAGE", "AUDIO", "IMAGE")
    RETURN_NAMES = ("video", "frames", "audio", "last_frame")
    FUNCTION = "generate"
    OUTPUT_NODE = True
    CATEGORY = CAT
    DESCRIPTION = "MiniMax H3 in one node: text, image, first + last, end frame or references → video with native stereo sound. by Enzino"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        # stale values (old workflow, moved model file…) are repaired in generate() with a clear message instead of a wall of errors
        return True

    @classmethod
    def IS_CHANGED(cls, **k):
        sig = []
        for key in ("first_image", "last_image", "mid_image", "ref_video", "ref_audio", "drive_audio", "control_video", "retouch_source"):
            sig.append(_mtime(k.get(key)))
        try:
            sig += [_mtime(n) for n in json.loads(k.get("ref_images") or "[]")]
        except Exception:
            pass
        return "|".join(map(str, sig))

    # ------------------------------------------------------------------------------------------- run
    def generate(self, first_frame=None, last_frame=None, references=None, audio=None,
                 unique_id=None, prompt_meta=None, extra_pnginfo=None, **k):
        t0 = time.time()
        uid = unique_id
        P = _sanitize(k, uid)
        mode = P["mode"] if P["mode"] in MODES else "text"

        # ---- Free edition: Full features are switched off (a Full workflow still runs, without them)
        if not PRO:
            off = [n for n, on in (("story", P["story_on"]), ("motion control / retouch", P["control_mode"] != "off"),
                                   ("variations", P["variations"] > 1), ("interpolation", P["interpolate"] != "off"),
                                   ("signature", P["sign_on"]), ("social formats", P["social"] not in ("", "[]")),
                                   ("4K upscale", P["upscale"] == "2160p"), ("Krea 2 polish", P["polish_on"])) if on]
            if off:
                log.warning(f"[Enzino H3 Studio] Free edition: skipped {', '.join(off)} (Full edition: {'ko-fi.com/enzinoxl'})")
                _status(uid, "Free edition: " + ", ".join(off) + " skipped")
            P.update(polish_on=False, story_on=False, control_mode="off", variations=1, interpolate="off", sign_on=False, social="[]",
                     upscale="1440p" if P["upscale"] == "2160p" else P["upscale"])

        retouch = P["control_mode"] == "retouch"
        motion = P["control_mode"] == "motion" and mode != "references"
        if retouch:
            mode = "text"
        refs_mode = mode == "references"
        length = frames_for(P["duration"])

        # ---- inputs (a connected socket wins over the slot)
        first = last = None
        if mode in ("image", "first_last"):
            first = first_frame[:1] if first_frame is not None else _load_image(P["first_image"])
            if first is None:
                raise ValueError("[Enzino H3 Studio] Image mode: drop a First frame (or connect first_frame).")
        if mode in ("first_last", "last"):
            last = last_frame[:1] if last_frame is not None else _load_image(P["last_image"])
            if last is None:
                raise ValueError("[Enzino H3 Studio] add a Last frame (or connect last_frame).")
        mid_on = P["mid_on"] and not refs_mode and not retouch
        mid = _load_image(P["mid_image"]) if mid_on else None
        if mid_on and mid is None:
            raise ValueError("[Enzino H3 Studio] Mid keyframe is ON: drop an image in its slot (or turn it off).")

        pics, vid, vid_audio, ref_aud = [], None, None, None
        if refs_mode:
            try:
                names = [n for n in json.loads(P["ref_images"] or "[]") if n][:9]
            except Exception:
                names = []
            pics = [_load_image(n) for n in names]
            if references is not None:
                pics += [references[i:i + 1] for i in range(references.shape[0])]
            pics = pics[:9]
            vid, vid_audio = _load_video(P["ref_video"])
            if not P["ref_video_sound"]:
                vid_audio = None
            ref_aud = audio if audio is not None else _load_audio(P["ref_audio"])

        drive = None
        if not refs_mode and not retouch and (P["drive_on"] or audio is not None):
            drive = audio if audio is not None else _load_audio(P["drive_audio"])
            if drive is None and P["drive_on"]:
                raise ValueError("[Enzino H3 Studio] Audio drive is ON: drop an audio file in its slot (or turn it off).")

        # retouch: the source video sets the length and the canvas
        src_frames = src_audio = None
        if retouch:
            src_frames, src_audio = _load_video(P["retouch_source"])
            if src_frames is None:
                raise ValueError("[Enzino H3 Studio] Retouch: drop the video to retouch (or use ↪ Retouch this on a render).")
            length = frames_for(src_frames.shape[0] / FPS)

        # ---- canvas
        anchor = first if first is not None else (last if last is not None else (pics[0] if pics else (src_frames[:1] if src_frames is not None else None)))
        if P["resolution"] == "custom":
            width, height = (max(256, round(int(v) / MULT) * MULT) for v in (P["custom_width"], P["custom_height"]))
        else:
            width, height = canvas("auto" if retouch else P["aspect"], P["resolution"], anchor, P["custom_mp"])

        # ---- models (cached between runs)
        is_full = P["speed"] == "full"
        unet_name = _need("diffusion_models", P["model_references"] if refs_mode else P["model_keyframes"],
                          "References model" if refs_mode else "Keyframes model")
        lora_name = P["turbo_references"] if refs_mode else P["turbo_keyframes"]
        _status(uid, "Loading models…")
        te = _need("text_encoders", P["text_encoder"], "Text encoder")
        vv = _need("vae", P["video_vae"], "Video VAE")
        av = _need("vae", P["audio_vae"], "Audio VAE")
        vae = _cached(("vvae", vv), lambda: _safe_load("Video VAE", vv, lambda: comfy_nodes.VAELoader().load_vae(vv)[0]), group="vvae")
        avae = _cached(("avae", av), lambda: _safe_load("Audio VAE", av, lambda: comfy_nodes.VAELoader().load_vae(av)[0]), group="avae")
        # ---- Turbo LoRA, your LoRAs, attention & sparse patches: built once and reused while the settings don't change
        #      (re-patching a 33B model on every run costs seconds; ComfyUI keeps the patched weights in VRAM)
        def _patch(model):
            if not is_full:
                if not lora_name or lora_name == "none":   # Turbo with no LoRA: the model itself is already distilled (merged Turbo)
                    n_steps = P["steps"] or (4 if re.search(r"4[\W_]?step", unet_name, re.I) else 8)
                    log.info(f"[Enzino H3 Studio] ⚡ Turbo without LoRA: {os.path.basename(unet_name)} used as a Turbo model, {n_steps} steps")
                else:
                    ln = _need("loras", lora_name, "Turbo LoRA")
                    model = comfy_nodes.LoraLoaderModelOnly().load_lora_model_only(model, ln, 1.0)[0]
                    n_steps = P["steps"] or (4 if re.search(r"4[\W_]?step", ln, re.I) else 8)
            else:
                n_steps = P["steps"] or (13 if _step_cache(P["step_cache"], True) else 20)
            # ---- your LoRAs (characters, styles, motions…) on top of the Turbo LoRA
            try:
                stack = [x for x in json.loads(P["loras"] or "[]") if x.get("on", True) and x.get("name") and abs(float(x.get("strength", 1))) > 1e-4]
            except Exception:
                stack = []
            if not PRO and len(stack) > FREE_MAX_LORAS:
                log.warning(f"[Enzino H3 Studio] Free edition: {FREE_MAX_LORAS} LoRAs max, the others are skipped")
                stack = stack[:FREE_MAX_LORAS]
            for x in stack:
                ln_ = _need("loras", x["name"], f"LoRA {x['name']}")
                model = comfy_nodes.LoraLoaderModelOnly().load_lora_model_only(model, ln_, float(x.get("strength", 1.0)))[0]
            if stack:
                log.info("[Enzino H3 Studio] LoRAs: " + ", ".join(f"{x['name']} {float(x.get('strength', 1)):.2f}" for x in stack))
            if P["shift_on"]:
                model = _run("MiniMaxH3SigmaShift", model=model, shift_video=P["shift_video"], shift_audio=P["shift_audio"])[0]
            att = pick_attention(P["attention"])
            if att:
                model = model.clone()
                model.set_model_optimized_attention(safe_attention(att))
                log.info(f"[Enzino H3 Studio] attention: {att}")
            if P["sparse_attention"]:
                model = _run("BlockSparseAttention", model=model, selection={"selection": "sol-attn", "tau": float(P["sparse_tau"])},
                             start_percent=0.2, end_percent=1.0, dense_blocks="", min_tokens=12288, extra_tokens=256,
                             sink_conditioning="exact_kv_and_rows", verbose=False)[0]

            # ---- low-VRAM feed-forward: the 33B MLP intermediate is ~5 GB on a 5 s 720p clip; in 4 chunks it fits 16 GB cards
            if _low_vram(P["low_vram"]):
                model = chunk_feed_forward(model)
            # ---- step cache (native EasyCache): reuses the change of the previous step when the output barely moves
            sc = _step_cache(P["step_cache"], is_full)
            if sc:
                try:
                    model = _run("EasyCache", model=model, reuse_threshold=sc, start_percent=0.2, end_percent=0.9, verbose=False)[0]
                    log.info(f"[Enzino H3 Studio] step cache on (threshold {sc})")
                except Exception as e:
                    log.warning(f"[Enzino H3 Studio] step cache unavailable in this ComfyUI, skipped: {e}")
            if P["torch_compile"]:
                try:
                    model = _run("TorchCompileModel", model=model, backend="inductor")[0]
                except Exception as e:
                    log.warning(f"[Enzino H3 Studio] torch.compile unavailable, skipped: {e}")
            return model, n_steps

        pkey = ("patched", unet_name, P["weight_dtype"], P["speed"], lora_name, P["steps"], P["loras"], P["shift_on"], P["shift_video"],
                P["shift_audio"], P["attention"], P["sparse_attention"], P["sparse_tau"], P["torch_compile"], P["step_cache"], P["low_vram"])
        # the video model is fetched only once the prompt is encoded (on 64 GB machines both don't fit in RAM together)
        unet_gb = _file_gb("diffusion_models", unet_name)
        ctl_apply = None

        def get_model(with_control=False):
            if pkey not in _CACHE:
                _drop_krea(unet_gb + 10)
                _status(uid, "Loading the video model…")
            base = None
            if pkey not in _CACHE:
                base = _cached(("unet", unet_name, P["weight_dtype"]), lambda: _safe_load("Diffusion model", unet_name, lambda: comfy_nodes.UNETLoader().load_unet(unet_name, P["weight_dtype"])[0]), group="unet")
            m, _ = _cached(pkey, lambda: _patch(base), group="patched")
            return ctl_apply(m) if (with_control and ctl_apply) else m

        if is_full:
            n_steps = P["steps"] or (13 if _step_cache(P["step_cache"], True) else 20)
        else:
            if not lora_name or lora_name == "none":
                n_steps = P["steps"] or (4 if re.search(r"4[\W_]?step", unet_name, re.I) else 8)
            else:
                n_steps = P["steps"] or (4 if re.search(r"4[\W_]?step", _need("loras", lora_name, "Turbo LoRA"), re.I) else 8)

        # ---- Full: motion control / retouch (native H3 Fun ControlNet patch, first shot only)
        if motion or retouch:
            pn = _need("model_patches", P["control_patch"], "Fun ControlNet")
            patch = _cached(("ctl", pn), lambda: comfy_nodes.NODE_CLASS_MAPPINGS["ModelPatchLoader"]().load_model_patch(pn)[0], group="ctl")
            if motion:
                cv, _ = _load_video(P["control_video"])
                if cv is None:
                    raise ValueError("[Enzino H3 Studio] Motion control: drop a control video (pose, depth or any clip with Canny).")
                _status(uid, "Preparing the motion control video…")
                cv = PC.control_frames(cv, P["control_type"], _run)
                ctl_apply = lambda m: PC.apply(m, patch, vae, P["control_strength"], P["control_end"], _run, control_video=cv)
            else:
                mask = PC.retouch_mask(src_frames.shape[0], src_frames.shape[1], src_frames.shape[2], P["retouch_box"],
                                       P["retouch_start"], P["retouch_end"])
                ctl_apply = lambda m: PC.apply(m, patch, vae, P["control_strength"], P["control_end"], _run, mask=mask, source_video=src_frames)

        ctx = dict(uid=uid, vae=vae, avae=avae, te=te, vv=vv, av=av, width=width, height=height, P=P, unet_gb=unet_gb)

        # ---- shots: the main one, then (Full) the story shots, each starting on the previous last frame
        shots = [dict(mode=mode, body=P["prompt"], length=length, first=first, last=last, mid=mid, drive=drive,
                      pics=pics, vid=vid, vid_audio=vid_audio, ref_aud=ref_aud, model=lambda: get_model(True))]
        if P["story_on"] and not refs_mode and not retouch:
            try:
                extra = [s for s in json.loads(P["story"] or "[]") if (s.get("prompt") or "").strip()]
            except Exception:
                extra = []
            for s_ in extra[:11]:
                shots.append(dict(mode="image", body=s_["prompt"], length=frames_for(float(s_.get("duration", 5))), first=None,
                                  last=None, mid=None, drive=None, pics=[], vid=None, vid_audio=None, ref_aud=None, model=lambda: get_model(False)))

        seed = int(P["seed"])
        n_var = 1 if len(shots) > 1 else int(P["variations"])
        results = []
        for vi in range(n_var):
            parts, prev_last = [], None
            for si, sh in enumerate(shots):
                if si > 0:
                    sh["first"] = prev_last
                tag = (f"Shot {si + 1}/{len(shots)} · " if len(shots) > 1 else "") + (f"Variation {vi + 1}/{n_var} · " if n_var > 1 else "")
                try:
                    frames, sound = self._render(sh, ctx, seed + vi + si * 1000, n_steps, tag)
                except Exception as e:
                    if _gpu_crash(e):
                        _CACHE.clear(); _COND.clear()
                        raise RuntimeError("[Enzino H3 Studio] The GPU crashed (CUDA illegal memory access). Restart ComfyUI: after this error "
                                           "the graphics card state is lost and every next run fails. If it comes back, set ⚙ Attention to "
                                           "'ComfyUI default' and send the full console error.") from e
                    raise
                prev_last = frames[-1:].clone()
                parts.append((frames, sound))
                if si < len(shots) - 1:  # next shot needs the text encoder again: free the VAEs' VRAM and RAM garbage first
                    import gc
                    gc.collect()
                    comfy.model_management.soft_empty_cache()
            if len(parts) > 1:
                frames, sound = PF.concat_shots(parts)
            else:
                frames, sound = parts[0]
            if retouch and P["retouch_keep_sound"] and src_audio is not None:
                sound = {"waveform": src_audio["waveform"][..., : int(src_audio["sample_rate"] * frames.shape[0] / FPS)], "sample_rate": src_audio["sample_rate"]}
            results.append((seed + vi, frames, sound))

        # ---- finish & save every result
        infos, first_out = [], None
        for ri, (sd, frames, sound) in enumerate(results):
            out_frames, out_fps, socials = self._finish(frames, ctx)
            info = self._save(out_frames, sound, out_fps, socials, ctx, sd, mode if not retouch else "retouch", len(shots), n_steps,
                              width, height, prompt_meta, extra_pnginfo, time.time() - t0)
            infos.append(info)
            if first_out is None:
                first_out = (out_frames, sound, out_fps)

        if not P["keep_loaded"]:
            free_memory()
        dt = time.time() - t0
        _status(uid, f"Done in {dt:.0f} s")
        out_frames, sound, out_fps = first_out
        from comfy_api.latest import InputImpl, Types
        video = InputImpl.VideoFromComponents(Types.VideoComponents(images=out_frames, audio=sound, frame_rate=Fraction(out_fps)))
        return {"ui": {"enzino_h3": infos}, "result": (video, out_frames, sound, out_frames[-1:].clone())}

    # ------------------------------------------------------------------------------------------- one shot
    def _render(self, sh, ctx, seed, n_steps, tag=""):
        P, uid, vae, avae = ctx["P"], ctx["uid"], ctx["vae"], ctx["avae"]
        width, height, length, mode = ctx["width"], ctx["height"], sh["length"], sh["mode"]
        mods, hint = None, ""
        if mode == "references":
            try:
                rm = json.loads(P["refmods"] or "[]")
            except Exception:
                rm = []
            if rm:
                from . import refmod as RM
                mods, hint = RM.load(rm)
        body = sh["body"] + (("\n\n" + hint) if (hint and P["refmod_hint"]) else "")
        text = build_prompt(mode, body, P["auto_header"] and mode != "references", P["style"], length)
        first, last, mid, drive = sh["first"], sh["last"], sh["mid"], sh["drive"]
        ckey = _cond_key(mode, text, width, height, length, ctx["te"], ctx["vv"], ctx["av"], P["ref_image_size"], first, last, mid,
                         P["mid_position"] if mid is not None else None, drive, P["drive_start"] if drive is not None else None,
                         sh["pics"], sh["vid"], sh["vid_audio"], sh["ref_aud"])
        hit = _COND.get(ckey) if P["prompt_cache"] else None
        if hit is not None:
            _status(uid, tag + "Prompt unchanged: re-using its encoding")
            positive, latent = hit
        else:
            _status(uid, tag + "Reading the prompt and the pictures…")
            te = ctx["te"]
            if ("clip", te) not in _CACHE:
                free = _ram_free_gb()
                te_gb = _file_gb("text_encoders", te)
                _drop_krea(te_gb + 8)
                free = _ram_free_gb()
                if free is not None and free < te_gb + 8:
                    _evict_video_model(uid, tag)
                _status(uid, tag + "Loading the text encoder…")
            clip = _cached(("clip", te), lambda: _safe_load("Text encoder", te, lambda: comfy_nodes.CLIPLoader().load_clip(te, "minimax", "default")[0]), group="clip")
            if mode == "references":
                positive, latent = _run("MiniMaxH3ReferenceToVideo", clip=clip, vae=vae, audio_vae=avae, prompt=text, width=width, height=height,
                                        length=length, ref_image_size=P["ref_image_size"],
                                        ref_images={f"ref_image_{i}": p for i, p in enumerate(sh["pics"])},
                                        ref_videos={"ref_video_0": sh["vid"]} if sh["vid"] is not None else {},
                                        ref_video_audios={"ref_video_audio_0": sh["vid_audio"]} if (sh["vid"] is not None and sh["vid_audio"] is not None) else {},
                                        ref_audios={"ref_audio_0": sh["ref_aud"]} if sh["ref_aud"] is not None else {})
            else:
                positive, latent = _run("MiniMaxH3ImageToVideo", clip=clip, vae=vae, prompt=text, width=width, height=height,
                                        length=length, first_frame=first, last_frame=last)
                if mid is not None:
                    idx = min(max(int(round(float(P["mid_position"]) * (length - 1))), 1), length - 2)
                    positive = _run("MiniMaxH3AddGuide", positive=positive, latent=latent, frame_idx=idx, vae=vae, image=mid)[0]
                if drive is not None:
                    fi = min(int(round(float(P["drive_start"]) * FPS)), length - 1)
                    positive = _run("MiniMaxH3AddGuide", positive=positive, latent=latent, frame_idx=fi, audio_vae=avae, audio=drive)[0]
            if P["prompt_cache"]:
                positive, latent = _cpu(positive), _cpu(latent)
                _COND[ckey] = (positive, latent)
                while len(_COND) > 6:
                    _COND.pop(next(iter(_COND)))
            free = _relieve_text_encoder(("clip", te), ctx["unet_gb"], force=P["free_text_encoder"])
            if free is not None:
                log.info(f"[Enzino H3 Studio] {tag}RAM free before sampling: {free:.0f} GB")

        if mods:
            from . import refmod as RM
            positive = RM.apply(positive, mods, P["refmod_retention"])
            _status(uid, tag + f"{len(mods)} RefMod reference(s) added")
        model = sh["model"]()
        _status(uid, tag + f"Rendering {width}×{height} · {length} frames · {n_steps} steps…")
        # VRAM headroom: ComfyUI fills the card with streamed weights and keeps only its own estimate free; sparse attention,
        # the live preview and PyTorch attention need more than that estimate on 16 GB cards (=> "out of memory" with 0 bytes free)
        tokens = (length // 4 + 1) * (width // 16) * (height // 16)
        extra = 0.75 + (1.5 * max(1.0, tokens / 96000) if P["sparse_attention"] else 0.0)
        run = lambda: _sample(model, positive, latent, seed, P["sampler_name"], P["scheduler"], n_steps, uid, length, int(P["preview_every"]))
        try:
            with _headroom(extra):
                samples = run()
        except torch.OutOfMemoryError:
            log.warning(f"[Enzino H3 Studio] {tag}out of VRAM, retrying with more room for the computation")
            _status(uid, tag + "Out of VRAM: retrying with more headroom…")
            comfy.model_management.unload_all_models()
            comfy.model_management.soft_empty_cache()
            with _headroom(extra + 3.0):
                samples = run()
        _status(uid, tag + "Decoding picture and sound…")
        if P["tiled_decode"]:
            frames = comfy_nodes.VAEDecodeTiled().decode(vae, samples, 512, 64, 64, 8)[0]
        else:
            frames = comfy_nodes.VAEDecode().decode(vae, samples)[0]
        if frames.ndim == 5:
            frames = frames.reshape(-1, *frames.shape[-3:])
        sound = _run("VAEDecodeAudio", vae=avae, samples=samples)[0]
        return frames, sound

    # ------------------------------------------------------------------------------------------- finish
    def _finish(self, frames, ctx):
        P, uid = ctx["P"], ctx["uid"]
        fps = FPS
        if P["polish_on"] and PK is not None:   # before upscale/interpolation: fewer pixels, and those steps see the detail
            frames = PK.polish(frames, P["polish_prompt"], P, _run, _cached, _status, uid, _free_for_krea)
            if not P["keep_loaded"]:
                for k in [k for k in _CACHE if isinstance(k, tuple) and k[0] in ("krea", "kclip", "kvae")]:
                    del _CACHE[k]
        if P["upscale"] and P["upscale"] != "off":
            frames = upscale_frames(frames, P["upscale"], P["upscaler"], uid)
        if P["interpolate"] != "off" and PF is not None:
            mult = int(P["interpolate"][1:])
            _status(uid, f"Interpolating to {FPS * mult} fps…")
            frames = PF.interpolate(frames, _need("frame_interpolation", P["interp_model"], "Interpolation model"), mult, _run, _cached)
            fps = FPS * mult
        socials = []
        if PF is not None:
            try:
                fmts = [f for f in json.loads(P["social"] or "[]") if f in PF.SOCIAL]
            except Exception:
                fmts = []
            for f in fmts:
                c = PF.crop_ratio(frames, f, P["social_focus"])
                if P["sign_on"]:
                    c = PF.sign(c, P["sign_text"], P["sign_pos"], P["sign_size"], P["sign_opacity"])
                socials.append((f, c))
            if P["sign_on"]:
                frames = PF.sign(frames, P["sign_text"], P["sign_pos"], P["sign_size"], P["sign_opacity"])
        return frames, fps, socials

    def _save(self, frames, sound, fps, socials, ctx, seed, mode, n_shots, n_steps, rw, rh, prompt_meta, extra_pnginfo, elapsed):
        from comfy_api.latest import InputImpl, Types
        from PIL import Image
        P = ctx["P"]
        if P["save_on"]:
            base, sub = _save_dir(P["folder"])
            ftype = "output"
        else:
            base, sub = folder_paths.get_temp_directory(), "enzino_h3"
            ftype = "temp"
        prefix = (sub + "/" if sub else "") + (re.sub(r"[^\w\-.]+", "_", P["filename"] or "enzino_h3").strip("._") or "enzino_h3")
        full_dir, fname, counter, subfolder, _ = folder_paths.get_save_image_path(prefix, base, frames.shape[2], frames.shape[1])
        os.makedirs(full_dir, exist_ok=True)
        meta = None
        if P["save_on"]:
            meta = {}
            if extra_pnginfo:
                meta.update(extra_pnginfo)
            if prompt_meta:
                meta["prompt"] = prompt_meta

        def write(fr, name):
            v = InputImpl.VideoFromComponents(Types.VideoComponents(images=fr, audio=sound, frame_rate=Fraction(fps)))
            v.save_to(os.path.join(full_dir, name), format=Types.VideoContainer("mp4"), codec=Types.VideoCodec("auto"), metadata=meta or None)
            return {"filename": name, "subfolder": subfolder, "type": ftype}

        _status(ctx["uid"], "Saving…")
        vinfo = write(frames, f"{fname}_{counter:05}_.mp4")
        extra = []
        for f, c in socials:
            extra.append({"format": f} | write(c, f"{fname}_{counter:05}_{f.replace(':', 'x')}.mp4"))
        to8 = lambda t: (t.cpu().numpy() * 255).clip(0, 255).astype(np.uint8)  # noqa: E731
        lfile, ffile = f"{fname}_{counter:05}_last.png", f"{fname}_{counter:05}_first.webp"
        Image.fromarray(to8(frames[-1])).save(os.path.join(full_dir, lfile))
        Image.fromarray(to8(frames[0])).save(os.path.join(full_dir, ffile), quality=85)
        info = {"video": vinfo, "socials": extra,
                "last": {"filename": lfile, "subfolder": subfolder, "type": ftype},
                "thumb": {"filename": ffile, "subfolder": subfolder, "type": ftype},
                "seed": int(seed), "mode": mode, "shots": n_shots, "width": int(frames.shape[2]), "height": int(frames.shape[1]),
                "render_size": f"{rw}×{rh}", "fps": fps, "frames": int(frames.shape[0]), "seconds": round(frames.shape[0] / fps, 2),
                "steps": n_steps, "speed": P["speed"], "time": round(elapsed, 1), "prompt": P["prompt"], "date": time.strftime("%Y-%m-%d %H:%M")}
        if P["save_on"]:
            try:
                add_history(info | {"settings": {k: P[k] for k in SETTING_KEYS if k in P} | {"seed": int(seed)}})
            except Exception as e:
                log.warning(f"[Enzino H3 Studio] history: {e}")
        return info


SETTING_KEYS = ["mode", "prompt", "auto_header", "style", "first_image", "last_image", "mid_on", "mid_image", "mid_position",
                "ref_images", "ref_video", "ref_video_sound", "ref_audio", "ref_image_size", "refmods", "refmod_retention", "refmod_hint", "drive_on", "drive_audio", "drive_start",
                "duration", "aspect", "resolution", "custom_width", "custom_height", "custom_mp", "upscale", "upscaler", "speed", "loras", "steps", "seed",
                "sampler_name", "scheduler", "shift_on", "shift_video", "shift_audio", "attention", "torch_compile", "preview_every", "sparse_attention", "sparse_tau", "step_cache", "low_vram",
                "polish_on", "polish_model", "polish_te", "polish_vae", "polish_denoise", "polish_steps", "polish_mode", "polish_stable", "polish_prompt",
                "variations", "story_on", "story", "control_mode", "control_video", "control_type", "control_strength", "control_end",
                "retouch_source", "retouch_box", "retouch_start", "retouch_end", "retouch_keep_sound", "interpolate", "interp_model",
                "sign_on", "sign_text", "sign_pos", "sign_size", "sign_opacity", "social", "social_focus"]


def _settings(loc):
    return {k: loc[k] for k in SETTING_KEYS if k in loc}


def _mtime(name):
    if not name:
        return ""
    try:
        return os.path.getmtime(folder_paths.get_annotated_filepath(name))
    except Exception:
        return name


class EnzinoH3Simple(EnzinoH3Studio):
    """Same engine, a short card: picture, prompt, duration, format, quality. Everything else on its best default."""
    DESCRIPTION = "MiniMax H3 in one simple card: picture + prompt + duration + format + quality → video with sound."


class _FullOnly:
    """Free edition: the Studio and Simple nodes are part of the Full edition. A workflow that uses them still
    opens (no red "missing node"), the card says where to get them, and Run stops with a clear message."""
    TITLE = "Enzino H3"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "run"
    CATEGORY = CAT
    OUTPUT_NODE = True

    def run(self, **_):
        raise ValueError(f"[{self.TITLE}] This node is part of the Full edition ({FULL_URL}). "
                         "The Free edition includes the ✦ Enzino H3 WF nodes: open workflows/enzino_h3_wf.json.")


class EnzinoH3StudioLocked(_FullOnly):
    TITLE = "✦ Enzino H3 Studio"
    DESCRIPTION = "Full edition: every mode and every setting in one node."


class EnzinoH3SimpleLocked(_FullOnly):
    TITLE = "✦ Enzino H3 Simple"
    DESCRIPTION = "Full edition: MiniMax H3 in one simple card."


if PRO:
    NODE_CLASS_MAPPINGS = {"EnzinoH3Studio": EnzinoH3Studio, "EnzinoH3Simple": EnzinoH3Simple}
    NODE_DISPLAY_NAME_MAPPINGS = {"EnzinoH3Studio": "✦ Enzino H3 Studio · MiniMax H3", "EnzinoH3Simple": "✦ Enzino H3 Simple · MiniMax H3"}
else:   # Free edition = the ✦ Enzino H3 WF nodes (registered below); Studio and Simple are Full
    NODE_CLASS_MAPPINGS = {"EnzinoH3Studio": EnzinoH3StudioLocked, "EnzinoH3Simple": EnzinoH3SimpleLocked}
    NODE_DISPLAY_NAME_MAPPINGS = {"EnzinoH3Studio": "✦ Enzino H3 Studio · Full edition 🔒", "EnzinoH3Simple": "✦ Enzino H3 Simple · Full edition 🔒"}

from . import wf as _wf  # noqa: E402  (✦ Enzino H3 WF: the same engine split in 6 steps)
NODE_CLASS_MAPPINGS.update(_wf.NODES)
NODE_DISPLAY_NAME_MAPPINGS.update(_wf.NAMES)
