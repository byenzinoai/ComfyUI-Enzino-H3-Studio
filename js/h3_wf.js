import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { LANGS, CAM_MOVES, FRAMES, TRANS, AGES, GENDERS, VOICES, PACES, EMOTIONS, TEXT_KINDS, SOUNDS, MUSIC, TEMPOS, DYNAMICS, speakersIn, lastShot, helperBuild } from "./h3_helpers.js";

/* ✦ Enzino H3 WF — MiniMax H3 in six readable steps joined by one wire (same look as Enzino Krea 2 WF).
   ① Models → ② LoRAs → ③ Prompt → ④ Render → ⑤ Enhance → ⑥ Output.   by Enzino · https://enzinoai.com */

const ED = await (async () => { try { return await (await api.fetchApi("/enzino_h3/version")).json(); } catch { return { edition: "free" }; } })();
const PRO = ED.edition === "full";
const FULL_URL = ED.full_url || "https://ko-fi.com/enzinoxl/";
const FREE_MAX = ED.free_max_loras || 3;
const fr = () => { try { return (app.extensionManager?.setting?.get?.("EnzinoH3.Language") || "English") === "Français"; } catch { return false; } };
const L = (en, f) => (fr() ? f : en);
const T2 = (a) => (Array.isArray(a) ? (fr() ? a[1] : a[0]) : a || "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FPS = 24;
const framesFor = (s) => { let n = Math.max(5, Math.round(s * FPS)); while (n % 17 !== 5) n++; return n; };
const ASPECTS = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1], "4:3": [4, 3], "3:4": [3, 4], "21:9": [21, 9], "3:2": [3, 2], "2:3": [2, 3] };
const budgetOf = (res, mp) => { if (res === "custom_mp") return Math.max(0.15, +mp || 1) * 1e6; const sh = parseInt(res) || 768; const a = sh * sh * 16 / 9; return sh <= 768 ? Math.min(a, 768 * 1344) : a; };
function canvasSize(aspect, res, dims, mp) {
    const A = budgetOf(res, mp);
    const [w, h] = aspect === "auto" && dims ? dims : (ASPECTS[aspect] || ASPECTS["16:9"]);
    const r = w / h, w0 = Math.sqrt(A * r), h0 = Math.sqrt(A / r);
    let best = null, score = -1;
    for (const cw of [Math.floor(w0 / 32) * 32, Math.floor(w0 / 32) * 32 + 32]) for (const ch of [Math.floor(h0 / 32) * 32, Math.floor(h0 / 32) * 32 + 32]) {
        const a = Math.max(cw, 384), b = Math.max(ch, 384);
        if (a * b > A * 1.015) continue;
        const sc = a * b * (1 - Math.abs(Math.log((a / b) / r)));
        if (sc > score) { score = sc; best = [a, b]; }
    }
    return best || [Math.round(w0 / 32) * 32, Math.round(h0 / 32) * 32];
}
const inputUrl = (v) => { if (!v) return ""; const i = v.lastIndexOf("/"); return api.apiURL("/view?" + new URLSearchParams({ filename: i >= 0 ? v.slice(i + 1) : v, subfolder: i >= 0 ? v.slice(0, i) : "", type: "input" })); };
const viewUrl = (f, r = "") => api.apiURL("/view?" + new URLSearchParams({ filename: f.filename, subfolder: f.subfolder || "", type: f.type || "output", r }));
const baseName = (v) => String(v || "").split("/").pop();
const fmtSize = (b) => !b ? "" : b >= 1e9 ? (b / 1e9).toFixed(1) + (fr() ? " Go" : " GB") : Math.round(b / 1e6) + (fr() ? " Mo" : " MB");

// ------------------------------------------------------------------ theme (the Krea 2 WF kit)
const CSS = `
.hw{--bg:#17191e;--card:#1f2228;--raise:#272b33;--line:#30353f;--line2:#3a404c;--ink:#ecebe7;--mute:#8e95a3;--dim:#646b78;--acc:#f2a65a;--acc2:#e86fa6;--ok:#5fc48a;--bad:#e8705f;
 font:12.5px/1.4 Inter,system-ui,-apple-system,sans-serif;color:var(--ink);box-sizing:border-box;width:100%;height:100%;overflow:hidden}
.hw *{box-sizing:border-box}
.hw-in{display:flex;flex-direction:column;gap:10px;padding:2px 2px 6px}
.hw-sec{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.hw-sec.off{opacity:.55}
.hw-sh{display:flex;align-items:center;gap:9px;padding:10px 12px}
.hw-sh .ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--raise);color:var(--mute);font-size:13px;flex:none}
.hw-sec:not(.off) .hw-sh .ic.on{background:rgba(242,166,90,.15);color:var(--acc)}
.hw-sh .t{font-weight:650;font-size:13px;flex:1;min-width:0}
.hw-sh .t small{display:block;font-weight:500;color:var(--mute);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hw-sb{padding:0 12px 12px;display:flex;flex-direction:column;gap:10px}
.hw-sec.off .hw-sb{display:none}
.hw-f{display:flex;flex-direction:column;gap:5px}
.hw-f > label{font-size:10.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.hw-row{display:flex;gap:8px;align-items:center}
.hw-sel,.hw-tx,.hw-ta{width:100%;background:#121418;border:1px solid var(--line);border-radius:8px;color:var(--ink);padding:7px 9px;font:inherit;outline:none}
.hw-sel:focus,.hw-tx:focus,.hw-ta:focus{border-color:var(--acc)}
.hw-ta{resize:vertical;min-height:150px;line-height:1.45}
.hw-sl{display:flex;align-items:center;gap:9px}
.hw-sl input{flex:1;accent-color:var(--acc);height:16px;margin:0}
.hw-sl .v{min-width:46px;text-align:right;font-variant-numeric:tabular-nums;font-weight:650;color:var(--acc)}
.hw-sw{all:unset;cursor:pointer;width:34px;height:19px;border-radius:999px;background:var(--line2);position:relative;flex:none}
.hw-sw::after{content:"";position:absolute;top:2.5px;left:2.5px;width:14px;height:14px;border-radius:50%;background:#9aa1ad;transition:.15s}
.hw-sw.on{background:var(--acc)}.hw-sw.on::after{left:17.5px;background:#17191e}
.hw-seg{display:flex;background:#121418;border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px;flex-wrap:wrap}
.hw-seg button{all:unset;cursor:pointer;flex:1;text-align:center;padding:5px 6px;border-radius:7px;font-weight:600;font-size:11.5px;color:var(--mute);white-space:nowrap}
.hw-seg button.on{background:var(--raise);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line2)}
.hw-chips{display:flex;gap:5px;flex-wrap:wrap}
.hw-chip{all:unset;cursor:pointer;padding:4px 9px;border-radius:999px;border:1px solid var(--line);color:var(--mute);font-size:11px;font-weight:600}
.hw-chip.on{border-color:var(--acc);color:var(--ink);background:rgba(242,166,90,.12)}
.hw-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 12px;border-radius:9px;background:var(--raise);border:1px solid var(--line);font-weight:650;text-decoration:none;color:var(--ink)}
.hw-btn:hover{border-color:var(--acc)}
.hw-btn.pri{background:var(--acc);border-color:var(--acc);color:#17191e}
.hw-btn.sm{padding:5px 10px;font-size:11px;border-radius:8px}
.hw-adv{border-top:1px dashed var(--line);margin:0 -12px;padding:8px 12px 0}
.hw-adv > button{all:unset;cursor:pointer;color:var(--dim);font-size:11px;font-weight:650;letter-spacing:.04em}
.hw-adv > button:hover{color:var(--ink)}
.hw-adv .hw-sb{padding:10px 0 0}
.hw-note{color:var(--mute);font-size:11px}
.hw-warn{color:var(--bad);font-size:11px}
.hw-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hw-full{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:9px;border:1px dashed var(--line2);color:var(--mute);text-decoration:none;font-size:11px;font-weight:650;white-space:nowrap}
.hw-full b{font-size:9px;letter-spacing:.06em;padding:2px 5px;border-radius:5px;background:linear-gradient(90deg,var(--acc),var(--acc2));color:#17191e}
.hw-mrow{display:grid;grid-template-columns:8px 1fr auto;gap:10px;align-items:center;padding:6px 9px;border-radius:10px;background:#121418;border:1px solid var(--line)}
.hw-mrow .st{width:8px;height:8px;border-radius:50%;background:var(--ok)}.hw-mrow.miss .st{background:var(--bad)}
.hw-mrow .nm{min-width:0;display:flex;flex-direction:column;gap:3px}.hw-mrow .nm b{font-size:11.5px}
.hw-mrow select{all:unset;box-sizing:border-box;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;padding:3px 22px 3px 7px;border-radius:7px;background:var(--raise) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%238e95a3'/%3E%3C/svg%3E") no-repeat right 7px center;border:1px solid var(--line);cursor:pointer}
.hw-mrow select option,.hw-mrow select optgroup{background:#1f2228}
.hw-tabs{display:grid;gap:6px}
.hw-tab{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:7px;padding:7px 8px;border-radius:10px;background:var(--card);border:1px solid var(--line);min-width:0}
.hw-tab:hover{border-color:var(--line2)}
.hw-tab.sel{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc) inset}
.hw-tab .ic{width:22px;height:22px;flex:none;border-radius:7px;display:grid;place-items:center;font-size:11px;background:rgba(242,166,90,.14);color:var(--acc)}
.hw-tab .t{display:flex;flex-direction:column;min-width:0;white-space:nowrap;overflow:hidden;font-size:11.5px;font-weight:700;line-height:1.2}
.hw-tab .t small{font-size:9.5px;font-weight:500;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hw-tab.off .ic{background:rgba(255,255,255,.05);color:var(--dim)}.hw-tab.off .t{color:var(--dim)}
.hw-slots{display:grid;gap:8px}
.hw-slot{position:relative;border-radius:10px;border:1px dashed var(--line2);background:#121418;min-height:150px;display:grid;place-items:center;cursor:pointer;overflow:hidden}
.hw-slot.has{border-style:solid}
.hw-slot img{width:100%;height:150px;object-fit:contain;display:block}
.hw-slot .ph{color:var(--dim);font-size:11px;text-align:center}.hw-slot .ph b{display:block;font-size:24px;font-weight:300}
.hw-slot .lb{position:absolute;left:6px;bottom:6px;padding:2px 7px;border-radius:6px;background:rgba(23,25,30,.85);font-size:10px;font-weight:700}
.hw-slot .x{all:unset;cursor:pointer;position:absolute;right:6px;top:6px;width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:rgba(23,25,30,.85)}
.hw-slot.sm{min-height:96px}.hw-slot.sm img{height:96px}
.hw-slot button.lb{all:unset;cursor:pointer;position:absolute;left:6px;bottom:6px;padding:2px 7px;border-radius:6px;background:rgba(23,25,30,.85);font-size:10px;font-weight:700;color:var(--acc)}
.hw-slot button.lb:hover{background:var(--acc);color:#17191e}
.hw-slot.over{border-color:var(--acc);background:rgba(242,166,90,.06)}
.hw-size{display:flex;align-items:center;gap:12px;padding:9px 11px;border-radius:10px;background:#121418;border:1px solid var(--line)}
.hw-size .bx{width:44px;height:44px;display:grid;place-items:center}.hw-size .bx i{display:block;border:2px solid var(--acc);border-radius:3px}
.hw-size b{font-size:15px}.hw-size small{display:block;color:var(--mute);font-size:10.5px}
.hw-pv{position:relative;border-radius:12px;overflow:hidden;background:#0f1013;border:1px solid var(--line);min-height:160px;display:grid;place-items:center;max-width:100%}
.hw-pv video,.hw-pv img{width:100%;max-height:520px;object-fit:contain;display:block}
.hw-pv.empty{border-style:dashed;color:var(--dim);font-size:11.5px;text-align:center;padding:12px}
.hw-pv .tag{position:absolute;left:8px;top:8px;padding:3px 9px;border-radius:999px;background:rgba(23,25,30,.85);font-size:10.5px;font-weight:700;color:var(--acc)}
.hw-pv .bar{position:absolute;left:0;bottom:0;height:3px;background:var(--acc);transition:width .3s}
.hw-st{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--mute)}.hw-st i{width:7px;height:7px;border-radius:50%;background:var(--ok)}.hw-st.busy i{background:var(--acc);animation:hwp 1s infinite}
@keyframes hwp{50%{opacity:.25}}
.hw-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.hw-meta div{padding:6px 8px;border-radius:9px;background:#121418;border:1px solid var(--line)}.hw-meta small{display:block;font-size:9.5px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em}.hw-meta b{font-size:11.5px}
.hw-hist{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
.hw-hist button{all:unset;cursor:pointer;flex:none;width:76px;height:50px;border-radius:8px;overflow:hidden;border:2px solid transparent;background:#0d0e11 center/cover;position:relative}
.hw-hist button.on{border-color:var(--acc)}
.hw-hist span{position:absolute;bottom:2px;right:4px;font-size:9px;font-weight:700;color:#fff;text-shadow:0 1px 2px #000}
.hw-lr{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px;border-radius:10px;background:#121418;border:1px solid var(--line);border-left:3px solid var(--acc)}
.hw-lr.off{opacity:.45}
.hw-lr b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:650;font-size:11.5px}
.hw-x{all:unset;cursor:pointer;color:var(--dim);font-size:12px;padding:0 3px}.hw-x:hover{color:var(--ink)}
.hw ::-webkit-scrollbar{width:8px;height:8px}.hw ::-webkit-scrollbar-thumb{background:#30353f;border-radius:8px}
/* prompt tools */
.hw-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.hw-tool{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;padding:7px 4px 6px;border-radius:9px;background:#121418;border:1px solid var(--line);min-width:0;text-align:center}
.hw-tool:hover{border-color:var(--line2);background:#16181d}
.hw-tool.on{border-color:var(--c);box-shadow:inset 0 0 0 1px var(--c);background:color-mix(in srgb,var(--c) 10%,#121418)}
.hw-tool .i{width:22px;height:22px;flex:none;border-radius:7px;display:grid;place-items:center;font-size:12px;background:color-mix(in srgb,var(--c) 18%,transparent)}
.hw-tool .t{font-size:10.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.hw-form{border-radius:11px;border:1px solid color-mix(in srgb,var(--c) 55%,var(--line));background:linear-gradient(180deg,color-mix(in srgb,var(--c) 7%,#1b1d22),#1b1d22 60%);padding:10px;display:flex;flex-direction:column;gap:9px}
.hw-form .hd{display:flex;align-items:center;gap:8px}.hw-form .hd .i{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 20%,transparent)}
.hw-form .hd b{flex:1;font-size:12.5px}.hw-form .hd small{display:block;font-weight:500;color:var(--mute);font-size:10.5px}
.hw-form .chips2 .hw-chip{padding:4px 8px}
.hw-prev{font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#d9d3c8;background:#0f1013;border:1px solid var(--line);border-left:3px solid var(--c);border-radius:8px;padding:7px 9px;white-space:pre-wrap;word-break:break-word}
.hw-hdr{font:10.5px/1.45 ui-monospace,Menlo,Consolas,monospace;color:var(--dim);background:#121418;border:1px dashed var(--line2);border-radius:8px;padding:6px 8px}
.hw-hdr b{color:var(--acc);font-family:Inter,system-ui,sans-serif;font-size:9.5px;letter-spacing:.08em;margin-right:6px}
/* header */
.hwh{position:relative;height:100%;box-sizing:border-box;border-radius:16px;overflow:hidden;background:#121418;border:1px solid #2a2e36;display:flex;align-items:center;gap:28px;padding:0 34px;font-family:Inter,system-ui,sans-serif;color:#ecebe7}
.hwh::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(520px 200px at 8% 0%,rgba(242,166,90,.18),transparent 70%),radial-gradient(620px 240px at 75% 130%,rgba(232,111,166,.10),transparent 70%)}
.hwh .mk{position:relative;flex:none;width:76px;height:76px;border-radius:22px;display:grid;place-items:center;font-size:40px;color:#17191e;background:conic-gradient(from 210deg,#f2a65a,#e86fa6,#a58be8,#5ba8e0,#f2a65a);box-shadow:0 0 44px rgba(242,166,90,.28)}
.hwh .tx{position:relative;min-width:0}
.hwh .k{font-size:12px;font-weight:700;letter-spacing:.38em;color:#f2a65a;text-transform:uppercase}
.hwh h1{margin:2px 0 0;font:800 58px/1 "Space Grotesk",Inter,system-ui,sans-serif;letter-spacing:-.03em;white-space:nowrap;display:inline-block;background:linear-gradient(100deg,#fff 0%,#f8dcc0 25%,#f2a65a 50%,#e86fa6 78%,#a58be8 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.hwh .sub{color:#a9a49b;font-size:15px;margin-top:6px}
.hwh .sp{flex:1}
.hwh .ctl{position:relative;display:flex;flex-direction:column;gap:10px;align-items:flex-end}
.hwh .modes{display:flex;gap:6px;background:#0d0e11;border:1px solid #2a2e36;border-radius:12px;padding:4px}
.hwh .modes button{all:unset;cursor:pointer;padding:9px 18px;border-radius:9px;font-weight:700;font-size:13.5px;color:#8e95a3}
.hwh .modes button.on{background:#f2a65a;color:#17191e}
.hwh .by{font-size:11px;color:#646b78;letter-spacing:.14em}.hwh .by a{color:#ecebe7;text-decoration:none;font-weight:700}
.hwh .getfull{display:flex;flex-direction:column;gap:4px;padding:10px 16px;border-radius:12px;border:1px solid rgba(242,166,90,.55);background:linear-gradient(135deg,rgba(242,166,90,.16),rgba(232,111,166,.12));color:#f2a65a;text-decoration:none;font-weight:800}
.hwh .getfull small{color:#8e95a3;font-weight:500;font-size:10.5px}
`;
const injectCSS = () => {
    if (document.getElementById("enzino-h3wf-css")) return;
    const s = document.createElement("style"); s.id = "enzino-h3wf-css"; s.textContent = CSS; document.head.appendChild(s);
    if (!document.getElementById("enzino-k2-font")) {
        const l = document.createElement("link"); l.id = "enzino-k2-font"; l.rel = "stylesheet";
        l.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&display=swap"; document.head.appendChild(l);
    }
};

// ------------------------------------------------------------------ widgets & controls
const W = (node, n) => node.widgets?.find((w) => w.name === n);
const val = (node, n, d) => { const w = W(node, n); return w ? w.value : d; };
// onWidgetChanged lets the frontend drop its "missing model" / validation flags (the red frame) for that widget
function setVal(node, n, v) { const w = W(node, n); if (!w) return; const old = w.value; w.value = v; w.callback?.(v); try { node.onWidgetChanged?.(n, v, old, w); } catch { } node.setDirtyCanvas?.(true, true); }
const P = (node) => (node.properties = node.properties || {});
const sw = (node, n) => `<button class="hw-sw ${val(node, n) ? "on" : ""}" data-w="${n}" data-k="bool"></button>`;
const seg = (node, n, items) => `<div class="hw-seg">${items.map(([v, l]) => `<button class="${String(val(node, n)) === String(v) ? "on" : ""}" data-w="${n}" data-k="seg" data-v="${esc(v)}">${l}</button>`).join("")}</div>`;
const chips = (node, n, items) => `<div class="hw-chips">${items.map(([v, l]) => `<button class="hw-chip ${String(val(node, n)) === String(v) ? "on" : ""}" data-w="${n}" data-k="seg" data-v="${esc(v)}">${l}</button>`).join("")}</div>`;
const slider = (node, n, min, max, step, fmt) => { const v = +val(node, n); return `<div class="hw-sl"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-w="${n}" data-k="num"><span class="v" data-fmt="${n}">${fmt ? fmt(v) : v}</span></div>`; };
const select = (node, n, labels = {}) => {
    const w = W(node, n); if (!w) return "";
    const vs = w.options?.values || [];
    return `<select class="hw-sel" data-w="${n}" data-k="sel">${vs.includes(w.value) ? "" : `<option selected>${esc(w.value)}</option>`}${vs.map((x) => `<option value="${esc(x)}" ${x === w.value ? "selected" : ""}>${esc(labels[x] ? T2(labels[x]) : x)}</option>`).join("")}</select>`;
};
const field = (lab, inner) => `<div class="hw-f"><label>${lab}</label>${inner}</div>`;
const row = (lab, inner, note = "") => `<div class="hw-row" style="justify-content:space-between"><span><b>${lab}</b>${note ? `<br><span class="hw-note">${note}</span>` : ""}</span>${inner}</div>`;
function section(node, { id, icon, title, sub = "", toggle = null, body = "", advanced = "", locked = false }) {
    const on = toggle ? !!val(node, toggle) : true;
    const advOpen = P(node).hw_adv?.[id];
    if (locked) return `<div class="hw-sec off" data-sec="${id}"><div class="hw-sh"><span class="ic">${icon}</span><span class="t">${esc(title)}<small>${esc(sub)}</small></span><a class="hw-full" href="${FULL_URL}" target="_blank" rel="noopener">${L("Full edition", "Édition complète")} <b>✦ FULL</b></a></div></div>`;
    return `<div class="hw-sec ${on ? "" : "off"}" data-sec="${id}">
      <div class="hw-sh"><span class="ic ${on ? "on" : ""}">${icon}</span><span class="t">${esc(title)}${sub ? `<small>${sub}</small>` : ""}</span>${toggle ? sw(node, toggle) : ""}</div>
      <div class="hw-sb">${body}${advanced ? `<div class="hw-adv"><button data-adv="${id}">${advOpen ? "▾" : "▸"} ${L("Advanced", "Avancé")}</button>${advOpen ? `<div class="hw-sb">${advanced}</div>` : ""}</div>` : ""}</div></div>`;
}

function mount(node, { width, minHeight = 120, render }) {
    injectCSS();
    const root = document.createElement("div"); root.className = "hw"; root.dataset.enzino = "h3wf";
    const inner = document.createElement("div"); inner.className = "hw-in"; root.appendChild(inner);
    root.addEventListener("pointerdown", (e) => { if (e.target.closest("input,textarea,select,button,a,video,.hw-slot")) e.stopPropagation(); });
    root.addEventListener("wheel", (e) => { if (e.target.closest("textarea,.hw-hist")) e.stopPropagation(); }, { passive: true });
    const ui = { root, inner, node, h: minHeight };
    const fit = () => {
        const h = Math.max(minHeight, Math.ceil(inner.scrollHeight) + 8);
        if (Math.abs(h - ui.h) > 2) { ui.h = h; const sz = node.computeSize?.(); if (sz) node.setSize([Math.max(node.size[0], width), sz[1]]); node.setDirtyCanvas?.(true, true); }
    };
    ui.refresh = () => {
        const ae = document.activeElement;
        const keep = ae && inner.contains(ae) && ae.dataset?.w && ae.tagName !== "SELECT" ? { w: ae.dataset.w, s: ae.selectionStart, e: ae.selectionEnd, t: ae.scrollTop } : null;
        inner.innerHTML = render(ui);
        bind(node, inner, ui);
        ui.after?.(inner);
        if (keep) { const el = inner.querySelector(`[data-w="${keep.w}"]`); if (el?.focus) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch { } el.scrollTop = keep.t; } }
        requestAnimationFrame(fit);
    };
    // the card follows its content: a video that finishes loading, a tab or a form that opens… never cut off
    try { new ResizeObserver(() => requestAnimationFrame(fit)).observe(inner); } catch { }
    for (const w of node.widgets || []) if (w.name && !w.__hw) { w.__hw = true; w.hidden = true; w.computeSize = () => [0, -4]; }
    const dw = node.addDOMWidget("hwui", "hw", root, { serialize: false, hideOnZoom: false, getMinHeight: () => ui.h, getHeight: () => ui.h });
    if (dw) dw.serialize = false;
    node.color = "#1b1d22"; node.bgcolor = "#17191e";
    node.setSize([Math.max(node.size[0], width), node.size[1]]);
    requestAnimationFrame(() => ui.refresh());
    return ui;
}
function bind(node, root, ui) {
    root.querySelectorAll("[data-w]").forEach((el) => {
        const n = el.dataset.w, k = el.dataset.k;
        if (k === "bool") el.onclick = () => { setVal(node, n, !val(node, n)); ui.refresh(); };
        else if (k === "seg") el.onclick = () => { const w = W(node, n); const vs = w?.options?.values; const x = vs ? vs.find((y) => String(y) === el.dataset.v) : (typeof w.value === "number" ? +el.dataset.v : el.dataset.v); setVal(node, n, x ?? el.dataset.v); ui.refresh(); };
        else if (k === "sel") el.onchange = () => { setVal(node, n, el.value); ui.refresh(); };
        else if (k === "num") {
            el.oninput = () => { const v = parseFloat(el.value); setVal(node, n, Number.isInteger(W(node, n).value) && Number.isInteger(+el.step) ? Math.round(v) : v); const f = root.querySelector(`[data-fmt="${n}"]`); if (f) f.textContent = (ui.fmt?.[n] || ((x) => x))(v); };
            el.onchange = () => ui.refresh();
        } else if (k === "txt") { el.oninput = () => setVal(node, n, el.value); el.addEventListener("keydown", (e) => e.stopPropagation()); }
        else if (k === "int") { el.onchange = () => { setVal(node, n, Math.max(0, parseInt(el.value || "0"))); ui.refresh(); }; el.addEventListener("keydown", (e) => e.stopPropagation()); }
    });
    root.querySelectorAll("[data-adv]").forEach((b) => b.onclick = () => { P(node).hw_adv = { ...(P(node).hw_adv || {}), [b.dataset.adv]: !P(node).hw_adv?.[b.dataset.adv] }; ui.refresh(); });
}
async function upload(file) {
    const fd = new FormData(); fd.append("image", file, file.name); fd.append("subfolder", "enzino_h3"); fd.append("type", "input");
    const r = await (await api.fetchApi("/upload/image", { method: "POST", body: fd })).json();
    return (r.subfolder ? r.subfolder + "/" : "") + r.name;
}
const graphNodes = (type) => (app.canvas?.graph?._nodes || []).filter((n) => n.type === type);

// ------------------------------------------------------------------ server data
let MODELS = null, LORAS = null, HISTORY = [];
async function loadModels(force) { if (MODELS && !force) return MODELS; try { MODELS = await (await api.fetchApi("/enzino_h3/models")).json(); } catch { } return MODELS; }
async function loadLoras() { try { LORAS = await (await api.fetchApi("/enzino_h3/loras")).json(); } catch { LORAS = { h3: [], other: [] }; } return LORAS; }
async function loadHistory() { try { HISTORY = await (await api.fetchApi("/enzino_h3/history")).json(); } catch { } return HISTORY; }

// ================================================================== ① Models
const MODEL_ROWS = [["model_keyframes", "fl", ["Video model", "Modèle vidéo"]], ["text_encoder", "te", ["Text encoder", "Encodeur de texte"]], ["video_vae", "vvae", ["Video VAE", "VAE vidéo"]],
    ["audio_vae", "avae", ["Audio VAE", "VAE audio"]], ["turbo_keyframes", "lfl", ["Turbo LoRA", "LoRA Turbo"]],
    ["model_references", "ref", ["References model · optional", "Modèle Références · optionnel"]], ["turbo_references", "lref", ["Turbo LoRA · References", "LoRA Turbo · Références"]]];
const OPTIONAL_MODELS = ["turbo_keyframes", "model_references", "turbo_references"];
function setupModels(node) {
    const ui = mount(node, { width: 340, render: () => {
        if (!MODELS) { loadModels().then(() => ui.refresh()); return section(node, { id: "m", icon: "◆", title: L("Models", "Modèles"), sub: "…" }); }
        clearRed(node, MODEL_WIDGETS.EnzinoH3WFModels);
        const files = MODELS.files || {};
        let missing = 0;
        const rows = MODEL_ROWS.map(([wn, gid, title]) => {
            const g = (MODELS.groups || []).find((x) => x.id === gid);
            const w = W(node, wn); const cur = w?.value;
            const has = !cur || cur === "none" ? OPTIONAL_MODELS.includes(wn) : (files[g?.folder] || []).includes(baseName(cur));
            if (!has) missing++;
            const split = MODELS.split?.[wn];
            const opts = (w?.options?.values || []).map((x, i) => `${i === split ? `<option disabled>── ${L("other files", "autres fichiers")} ──</option>` : ""}<option value="${esc(x)}" ${x === cur ? "selected" : ""}>${esc(x === "none" ? L("— none —", "— aucune —") : (g?.choices.find((c) => c.file === baseName(x))?.label || baseName(x)))}</option>`).join("");
            const more = (g?.choices || []).filter((c) => !c.installed);
            const dl = more.length ? `<optgroup label="${L("Download another version", "Télécharger une autre version")}">${more.map((c) => `<option value="dl:${esc(c.id)}">⬇ ${esc(c.label)} · ${fmtSize(c.size)}</option>`).join("")}</optgroup>` : "";
            const job = (g?.choices || []).find((c) => ["downloading", "starting"].includes(c.job?.state))?.job;
            return `<div class="hw-mrow ${has ? "" : "miss"}"><span class="st"></span><span class="nm"><b>${T2(title)}</b><select data-msel="${wn}">${opts}${dl}</select></span>
                <span class="hw-note">${job ? (job.total ? Math.floor(100 * job.done / job.total) : 0) + "%" : has ? "✓" : ""}</span></div>`;
        }).join("");
        const busy = (MODELS.groups || []).some((g) => g.choices.some((c) => ["downloading", "starting"].includes(c.job?.state)));
        if (busy && !ui.poll) ui.poll = setInterval(async () => { await loadModels(true); try { await app.refreshComboInNodes?.(); } catch { } ui.refresh(); if (!(MODELS.groups || []).some((g) => g.choices.some((c) => ["downloading", "starting"].includes(c.job?.state)))) { clearInterval(ui.poll); ui.poll = null; } }, 2000);
        return section(node, { id: "m", icon: "◆", title: L("Models", "Modèles"), sub: missing ? `${missing} ${L("missing", "manquant(s)")}` : L("✓ all files installed", "✓ tous les fichiers installés"),
            body: `<div style="display:flex;flex-direction:column;gap:5px">${rows}</div><div class="hw-row" style="justify-content:space-between"><span class="hw-note">${L("Pick a ⬇ version to download it.", "Choisis une version ⬇ pour la télécharger.")}</span><button class="hw-btn sm" data-rescan>↻ ${L("Rescan", "Actualiser")}</button></div>`,
            advanced: field(L("Weight precision", "Précision des poids"), select(node, "weight_dtype")) });
    } });
    ui.after = (root) => {
        root.querySelectorAll("[data-msel]").forEach((el) => el.onchange = async () => {
            if (el.value.startsWith("dl:")) { await api.fetchApi("/enzino_h3/models", { method: "POST", body: JSON.stringify({ id: el.value.slice(3) }) }); await loadModels(true); ui.refresh(); return; }
            setVal(node, el.dataset.msel, el.value); clearRed(node, MODEL_WIDGETS.EnzinoH3WFModels); ui.refresh();
        });
        root.querySelector("[data-rescan]")?.addEventListener("click", async () => { await loadModels(true); try { await app.refreshComboInNodes?.(); } catch { } ui.refresh(); });
    };
    return ui;
}

// a model value that isn't on this computer (a workflow made elsewhere) → the first recognised file, and the
// red "missing model" frame the frontend puts on the node is cleared as soon as every value is a real file
function fixModelValues(node, names) {
    let changed = false;
    for (const n of names) {
        const w = W(node, n); const vs = w?.options?.values || [];
        if (!w || !vs.length || vs.includes(w.value)) continue;
        const pick = vs.find((v) => v !== "none") ?? vs[0];
        if (pick !== undefined) { const old = w.value; w.value = pick; w.callback?.(pick); try { node.onWidgetChanged?.(n, pick, old, w); } catch { } changed = true; }
    }
    return changed;
}
function clearRed(node, names) {
    const ok = names.every((n) => { const w = W(node, n); return !w || (w.options?.values || []).includes(w.value); });
    if (ok && node.has_errors) { node.has_errors = false; node.setDirtyCanvas?.(true, true); app.canvas?.setDirty?.(true, true); }
    return ok;
}
const MODEL_WIDGETS = { EnzinoH3WFModels: ["model_keyframes", "text_encoder", "video_vae", "audio_vae", "turbo_keyframes", "model_references", "turbo_references"],
    EnzinoH3WFEnhance: ["polish_model", "polish_te", "polish_vae", "interp_model", "upscaler"] };

// ================================================================== ② LoRAs
function setupLoras(node) {
    const get = () => { try { const a = JSON.parse(val(node, "loras") || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
    const set = (a) => { setVal(node, "loras", JSON.stringify(a)); ui.refresh(); };
    const ui = mount(node, { width: 340, render: () => {
        if (!LORAS) { loadLoras().then(() => ui.refresh()); }
        const list = get();
        const full = list.length >= (PRO ? 8 : FREE_MAX);
        const all = [...(LORAS?.h3 || []), ...(LORAS?.other || [])].filter((n) => !list.some((x) => x.name === n));
        const items = list.map((x, i) => `<div class="hw-lr ${x.on === false ? "off" : ""}"><div style="min-width:0"><b title="${esc(x.name)}">${esc(baseName(x.name).replace(/\.safetensors$/, ""))}</b>
              <div class="hw-sl"><input type="range" min="-1" max="2" step="0.05" value="${x.strength ?? 1}" data-lstr="${i}"><span class="v">${(+(x.strength ?? 1)).toFixed(2)}</span></div></div>
              <div class="hw-row"><button class="hw-sw ${x.on === false ? "" : "on"}" data-lon="${i}"></button><button class="hw-x" data-ldel="${i}">✕</button></div></div>`).join("");
        return section(node, { id: "l", icon: "◈", title: "LoRAs", sub: list.length ? `${list.filter((x) => x.on !== false).length} ${L("active", "active(s)")}` : L("characters, styles, motions", "persos, styles, mouvements"),
            body: `${items || `<div class="hw-note" style="text-align:center;padding:6px">${L("No LoRA yet.", "Aucune LoRA.")}</div>`}
              ${full ? (PRO ? `<span class="hw-note">${L("8 LoRAs max", "8 LoRAs max")}</span>` : `<a class="hw-full" href="${FULL_URL}" target="_blank" rel="noopener">${FREE_MAX} ${L("LoRAs max in Free", "LoRAs max en Free")} <b>✦ FULL</b></a>`)
                : `<select class="hw-sel" data-ladd style="background:var(--acc);color:#17191e;font-weight:700"><option value="">＋ ${L("Add a LoRA", "Ajouter une LoRA")}</option>
                   ${LORAS?.h3?.length ? `<optgroup label="MiniMax H3">${LORAS.h3.filter((n) => all.includes(n)).map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</optgroup>` : ""}
                   ${LORAS?.other?.length ? `<optgroup label="${L("Other LoRAs", "Autres LoRAs")}">${LORAS.other.filter((n) => all.includes(n)).map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</optgroup>` : ""}</select>`}` });
    } });
    ui.after = (root) => {
        root.querySelector("[data-ladd]")?.addEventListener("change", (e) => { if (e.target.value) set([...get(), { name: e.target.value, strength: 1, on: true }]); });
        root.querySelectorAll("[data-ldel]").forEach((b) => b.onclick = () => { const a = get(); a.splice(+b.dataset.ldel, 1); set(a); });
        root.querySelectorAll("[data-lon]").forEach((b) => b.onclick = () => { const a = get(); a[+b.dataset.lon].on = a[+b.dataset.lon].on === false; set(a); });
        root.querySelectorAll("[data-lstr]").forEach((el) => { el.oninput = () => { el.nextElementSibling.textContent = (+el.value).toFixed(2); }; el.onchange = () => { const a = get(); a[+el.dataset.lstr].strength = +el.value; set(a); }; });
    };
    return ui;
}

// ================================================================== ③ Prompt
const MODES = [["text", "✎", ["Text", "Texte"], ["text → video", "texte → vidéo"]], ["image", "▣", ["Image", "Image"], ["animate a picture", "anime une image"]],
    ["first_last", "⇆", ["First + Last", "Début + Fin"], ["from one to the other", "de l'une à l'autre"]], ["references", "✦", ["References", "Références"], ["characters, objects, looks", "persos, objets, looks"]]];
const refNames = (node) => { try { const a = JSON.parse(val(node, "ref_images") || "[]"); return Array.isArray(a) ? a.filter(Boolean) : []; } catch { return []; } };
const TEMPLATE = `integrated_multimodal_description: [Shot 1] Live-action, cinematic. A medium shot frames …. The camera pushes in slowly as …

overall_soundscape: …

non_diegetic_music: …`;
const TOOLS = [["tpl", "⧉", ["Structure", "Structure"], "#9aa1ad"], ["shot", "🎬", ["Shot", "Plan"], "#f2a65a"], ["cam", "🎥", ["Camera", "Caméra"], "#5ba8e0"],
    ["talk", "💬", ["Dialogue", "Dialogue"], "#e86fa6"], ["vo", "🎙", ["Voice-over", "Voix off"], "#a58be8"], ["text", "🔤", ["Text on screen", "Texte écran"], "#5fc4b6"],
    ["sound", "🌊", ["Soundscape", "Ambiance"], "#4fb3e8"], ["music", "🎵", ["Music", "Musique"], "#b58be8"]];
const HDR_I2V = "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.";
function autoHeader(mode, prompt, secs) {
    if (/^\s*(For the target video|How the reference pictures)/.test(prompt || "")) return "";
    const n = lastShot(prompt);
    if (mode === "image") return HDR_I2V;
    if (mode === "first_last") return `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot ${n}) aligns with the ${secs.toFixed(2)}-second mark of the target video.`;
    if (mode === "last") return `How the reference pictures align with the target video — <Picture 1> (from [Shot ${n}]) aligns with the ${secs.toFixed(2)}-second mark of the target video.`;
    return "";
}
function setupPrompt(node) {
    const dims = {};
    // ---- helper forms (same sentences as H3 Studio, laid out as tiles)
    const ctx = () => { const pr = val(node, "prompt") || ""; const sp = speakersIn(pr); return { nextShot: lastShot(pr) + 1, speakers: sp, nextSpeaker: (sp.length ? Math.max(...sp) : 0) + 1 }; };
    const openHelper = (id) => {
        if (id === "tpl") { if (!String(val(node, "prompt")).trim() || confirm(L("Replace the prompt with the structure?", "Remplacer le prompt par la structure ?"))) { setVal(node, "prompt", TEMPLATE); ui.hf = null; ui.refresh(); } return; }
        const vo = id === "vo"; const key = vo ? "talk" : id;
        if (ui.hf && ui.hf.tool === id) { ui.hf = null; ui.refresh(); return; }
        const dur = framesFor(+val(node, "duration")) / FPS, c = ctx();
        const D = {
            shot: { time: Math.min(dur - 0.2, Math.max(0.5, dur * (c.nextShot - 1) / c.nextShot)), trans: "cut", frame: "medium shot", what: "" },
            cam: { move: "push", amp: "small", speed: "slow", target: "" },
            talk: { who: "new", age: "young", gender: "woman", voice: ["warm"], pace: "measured", emotion: "", lang: fr() ? "French" : "English", words: "", vo },
            text: { kind: "sign", style: "", words: "" }, sound: { sel: [], extra: "" }, music: { genre: "piano", tempo: "slow", dyn: "build", extra: "", none: false },
        };
        ui.hf = { tool: id, id: key, d: D[key] };
        ui.refresh();
    };
    const hChips = (key, opts, multi) => `<div class="hw-chips chips2">${opts.map((o) => { const v = o[0], lab = T2(o[o.length - 1]); const on = multi ? (ui.hf.d[key] || []).includes(v) : ui.hf.d[key] === v;
        return `<button class="hw-chip ${on ? "on" : ""}" data-hfk="${key}" data-hfv="${esc(v)}" ${multi ? 'data-hfm="1"' : ""}>${esc(lab)}</button>`; }).join("")}</div>`;
    const hText = (key, ph) => `<input class="hw-tx" data-hft="${key}" value="${esc(ui.hf.d[key] || "")}" placeholder="${esc(ph)}">`;
    const hRow = (label, inner) => `<div class="hw-f"><label>${esc(label)}</label>${inner}</div>`;
    const form = () => {
        const { tool, id, d } = ui.hf, c = ctx(), dur = framesFor(+val(node, "duration")) / FPS;
        const T = TOOLS.find((x) => x[0] === tool);
        let f = "", sub = "";
        if (id === "shot") {
            sub = `[Shot ${c.nextShot}]`;
            f = hRow(L("Starts at", "Commence à"), `<div class="hw-sl"><input type="range" min="0.1" max="${Math.max(0.2, dur - 0.1).toFixed(1)}" step="0.1" value="${d.time}" data-hfr="time"><span class="v">${(+d.time).toFixed(1)} s</span></div>`)
                + `<div class="hw-grid2">${hRow(L("Transition", "Transition"), hChips("trans", TRANS.map((x) => [x[0], x[2]])))}${hRow(L("Framing", "Cadrage"), hChips("frame", FRAMES.slice(0, 6)))}</div>`
                + hRow(L("What we see (English)", "Ce qu'on voit (en anglais)"), hText("what", "of the keeper turning toward the sea"));
        } else if (id === "cam") {
            sub = L("one clear move works best", "un seul mouvement clair, c'est le mieux");
            f = hRow(L("Move", "Mouvement"), hChips("move", CAM_MOVES.map((x) => [x[0], x[2]])))
                + (["static", "shake"].includes(d.move) ? "" : `<div class="hw-grid2">${hRow(L("Amplitude", "Amplitude"), hChips("amp", [["small", ["small", "petite"]], ["normal", ["normal", "normale"]], ["large", ["large", "grande"]]]))}${hRow(L("Speed", "Vitesse"), hChips("speed", [["slow", ["slow", "lente"]], ["normal", ["normal", "normale"]], ["fast", ["fast", "rapide"]]]))}</div>`)
                + hRow(d.move === "static" ? L("While…", "Pendant que…") : L("Toward / on (optional)", "Vers / sur (optionnel)"), hText("target", d.move === "static" ? "the runner exits the frame" : "her face"));
        } else if (id === "talk") {
            sub = d.vo ? L("off-screen, lips closed", "hors champ, bouche fermée") : L("words kept exactly as written", "texte gardé tel quel");
            const whoOpts = [["new", [L(`New voice (S${c.nextSpeaker})`, `Nouvelle voix (S${c.nextSpeaker})`), L(`New voice (S${c.nextSpeaker})`, `Nouvelle voix (S${c.nextSpeaker})`)]], ...c.speakers.map((n) => [String(n), [`S${n}`, `S${n}`]])];
            f = hRow(L("Who speaks", "Qui parle"), hChips("who", whoOpts))
                + (d.who === "new" ? `<div class="hw-grid2">${hRow(L("Age", "Âge"), hChips("age", AGES))}${hRow(L("Who", "Qui"), hChips("gender", GENDERS))}</div>${hRow(L("Voice", "Voix"), hChips("voice", VOICES, true))}` : "")
                + (d.vo ? "" : hRow(L("Tone", "Ton"), hChips("emotion", EMOTIONS.map((x) => [x[0], x[1]]))))
                + `<div class="hw-grid2">${hRow(L("Language", "Langue"), `<select class="hw-sel" data-hfs="lang">${LANGS.map(([v, lb]) => `<option value="${v}" ${d.lang === v ? "selected" : ""}>${esc(lb)}</option>`).join("")}</select>`)}${hRow(L("Pace", "Débit"), hChips("pace", PACES))}</div>`
                + hRow(L("Exact words", "Texte exact"), hText("words", L("I'll be back before dawn.", "Je reviens avant l'aube.")));
        } else if (id === "text") {
            sub = L("H3 writes it in the picture", "H3 l'écrit dans l'image");
            f = hRow(L("Where", "Où"), hChips("kind", TEXT_KINDS)) + `<div class="hw-grid2">${hRow(L("Text", "Texte"), hText("words", "OPEN 24/7"))}${hRow(L("Look (optional)", "Style (optionnel)"), hText("style", "red neon"))}</div>`;
        } else if (id === "sound") {
            sub = L("replaces the overall_soundscape line", "remplace la ligne overall_soundscape");
            f = hRow(L("Sounds", "Sons"), hChips("sel", SOUNDS.map((x) => [x[0], x[2]]), true)) + hRow(L("More (optional, English)", "En plus (optionnel, anglais)"), hText("extra", "a door creaks open"));
        } else if (id === "music") {
            sub = L("replaces the non_diegetic_music line", "remplace la ligne non_diegetic_music");
            f = row(L("No background music", "Pas de musique de fond"), `<button class="hw-sw ${d.none ? "on" : ""}" data-hfb="none"></button>`)
                + (d.none ? "" : hRow(L("Style", "Style"), hChips("genre", MUSIC.map((x) => [x[0], x[2]]))) + `<div class="hw-grid2">${hRow(L("Tempo", "Tempo"), hChips("tempo", TEMPOS))}${hRow(L("Shape", "Évolution"), hChips("dyn", DYNAMICS.map((x) => [x[0], x[2]])))}</div>`);
        }
        const setLine = id === "sound" || id === "music";
        return `<div class="hw-form" style="--c:${T[3]}"><div class="hd"><span class="i">${T[1]}</span><b>${T2(T[2])}<small>${esc(sub)}</small></b><button class="hw-x" data-hfclose>✕</button></div>${f}
            <div class="hw-prev" data-hfprev>${esc(helperBuild(id, d, c).trim() || "…")}</div>
            <div class="hw-row" style="justify-content:flex-end"><button class="hw-btn sm" data-hfclose>${L("Cancel", "Annuler")}</button><button class="hw-btn sm pri" data-hfins>${setLine ? L("✓ Set", "✓ Appliquer") : L("＋ Insert at cursor", "＋ Insérer au curseur")}</button></div></div>`;
    };
    const setField = (field, value) => {
        let v = val(node, "prompt") || "";
        const re = new RegExp(`^${field}:.*$`, "m");
        v = re.test(v) ? v.replace(re, `${field}: ${value}`) : v.replace(/\s*$/, "") + `\n\n${field}: ${value}`;
        setVal(node, "prompt", v);
    };
    const insert = (txt) => {
        const v = val(node, "prompt") || "";
        const s0 = ui.caret ? Math.min(ui.caret[0], v.length) : v.length, e0 = ui.caret ? Math.min(ui.caret[1], v.length) : v.length;
        if (/\s$/.test(v.slice(0, s0)) || s0 === 0) txt = txt.replace(/^\s+/, "");
        if (/^\s/.test(v.slice(e0))) txt = txt.replace(/\s+$/, "");
        if (/(^|[.!?:]\s*)$/.test(v.slice(0, s0).trimEnd() + " ") && /^\s*[a-z]/.test(txt)) txt = txt.replace(/[a-z]/, (ch) => ch.toUpperCase());
        setVal(node, "prompt", v.slice(0, s0) + txt + v.slice(e0));
        ui.caret = [s0 + txt.length, s0 + txt.length];
        ui.refresh();
        requestAnimationFrame(() => { const ta = ui.inner.querySelector('[data-w="prompt"]'); if (ta) { ta.focus(); try { ta.setSelectionRange(ui.caret[0], ui.caret[1]); } catch { } } });
    };
    const dimsOf = (v) => { if (!v) return null; if (dims[v]) return dims[v]; const im = new Image(); im.onload = () => { dims[v] = [im.naturalWidth, im.naturalHeight]; ui.refresh(); }; im.src = inputUrl(v); return null; };
    const slot = (n, lab) => { const v = val(node, n); if (v) dimsOf(v); return `<div class="hw-slot ${v ? "has" : ""}" data-slot="${n}">${v ? `<img src="${inputUrl(v)}"><button class="x" data-clear="${n}">✕</button>` : `<div class="ph"><b>＋</b>${L("Drop or click", "Glisse ou clique")}</div>`}<span class="lb">${lab}</span></div>`; };
    const ui = mount(node, { width: 420, render: (u) => {
        const mode = val(node, "mode");
        const first = mode === "image" || mode === "first_last", last = mode === "first_last" || mode === "last";
        const refs = mode === "references", rn = refs ? refNames(node) : [];
        const anchor = first ? val(node, "first_image") : last ? val(node, "last_image") : rn[0] || "";
        const res = val(node, "resolution");
        const [cw, ch] = canvasSize(val(node, "aspect"), res === "custom" ? "768p" : res, anchor ? dimsOf(anchor) : null, val(node, "custom_mp"));
        const secs = framesFor(+val(node, "duration")) / FPS;
        u.fmt = { duration: (v) => (+v).toFixed(1) + " s", custom_mp: (v) => (+v).toFixed(2) + " MP" };
        const tabs = `<div class="hw-tabs" style="grid-template-columns:repeat(2,1fr)">${MODES.map(([id, ic, t, s]) => `<button class="hw-tab ${mode === id ? "sel" : ""}" data-w="mode" data-k="seg" data-v="${id}"><span class="ic">${ic}</span><span class="t">${T2(t)}<small>${T2(s)}</small></span></button>`).join("")}</div>`;
        const pics = first || last ? `<div class="hw-slots" style="grid-template-columns:repeat(${first && last ? 2 : 1},1fr)">${first ? slot("first_image", L("First frame", "Première image")) : ""}${last ? slot("last_image", L("Last frame", "Dernière image")) : ""}</div>` : "";
        const refTiles = refs ? `<div class="hw-slots" style="grid-template-columns:repeat(3,1fr)">${rn.map((n, i) => { dimsOf(n); return `<div class="hw-slot has sm" data-refi="${i}"><img src="${inputUrl(n)}" draggable="false"><button class="x" data-refdel="${i}">✕</button><button class="lb tag" data-ins="&lt;Picture ${i + 1}&gt;">&lt;Picture ${i + 1}&gt;</button></div>`; }).join("")}
              ${rn.length < 9 ? `<div class="hw-slot sm" data-refadd="1"><div class="ph"><b>＋</b>${L("Add pictures", "Ajouter des images")}<br>${rn.length}/9</div></div>` : ""}</div>
              <span class="hw-note">${L("A character, an object, a place, a look… Cite them in the prompt: click a tag to insert it. A picture connected to the references input is added after these.", "Un perso, un objet, un lieu, un look… Cite-les dans le prompt : clique une étiquette pour l'insérer. Une image branchée sur l'entrée references s'ajoute après celles-ci.")}</span>` : "";
        const mp = +val(node, "custom_mp");
        const bw = cw >= ch ? 40 : Math.round(40 * cw / ch), bh = cw >= ch ? Math.round(40 * ch / cw) : 40;
        return tabs + section(node, { id: "p", icon: "✎", title: "Prompt", sub: L("official H3 format · the picture header is added for you", "format officiel H3 · l'en-tête image est ajouté pour toi"),
            body: `${pics}${refTiles}
                <div class="hw-tools">${TOOLS.map(([id, ic, lb, c]) => `<button class="hw-tool ${ui.hf?.tool === id ? "on" : ""}" style="--c:${c}" data-tool="${id}" title="${esc(T2(lb))}"><span class="i">${ic}</span><span class="t">${T2(lb)}</span></button>`).join("")}</div>
                ${ui.hf ? form() : ""}
                ${val(node, "auto_header") && autoHeader(mode, val(node, "prompt"), secs) ? `<div class="hw-hdr"><b>AUTO</b>${esc(autoHeader(mode, val(node, "prompt"), secs))}</div>` : ""}
                <textarea class="hw-ta" data-w="prompt" data-k="txt" spellcheck="false" placeholder="${esc(TEMPLATE)}">${esc(val(node, "prompt"))}</textarea>
                <span class="hw-note">${lastShot(val(node, "prompt"))} ${L("shot(s)", "plan(s)")} · ${String(val(node, "prompt") || "").length} ${L("characters", "caractères")} · ${L("describe what moves, the sound and the music", "décris ce qui bouge, le son et la musique")}</span>`,
            advanced: `${field("Style", select(node, "style"))}${row(L("Automatic picture header", "En-tête image automatique"), sw(node, "auto_header"))}${refs ? field(L("Reference picture size", "Taille des images de référence"), seg(node, "ref_image_size", [["match", L("Match · fast", "Adaptée · rapide")], ["max", L("Max · best likeness", "Max · meilleure ressemblance")]])) : ""}` })
        + section(node, { id: "f", icon: "▭", title: "Format", sub: `${cw} × ${ch} · ${(cw * ch / 1e6).toFixed(2)} MP · ${secs.toFixed(1)} s`,
            body: `${field(L("Duration", "Durée"), chips(node, "duration", [[3, "3 s"], [5, "5 s"], [8, "8 s"], [10, "10 s"], [12, "12 s"], [15, "15 s"]]))}
                ${field(L("Format", "Format"), chips(node, "aspect", [["auto", L("Auto · picture", "Auto · image")], ...Object.keys(ASPECTS).map((a) => [a, a])]))}
                ${field(L("Size (MP)", "Taille (MP)"), chips(node, "resolution", [["576p", "0.6"], ["720p", "0.9"], ["768p", "1.0 ★"], ["custom_mp", "✎ " + L("Custom", "Perso")]]))}
                ${res === "custom_mp" ? slider(node, "custom_mp", 0.3, 3, 0.05, u.fmt.custom_mp) + (mp > 1.06 ? `<span class="hw-note">${L("Above ~1 MP is beyond what H3 learned: slower, and past ~1.5 MP faces can fall apart.", "Au-delà de ~1 MP, H3 sort de ce qu'il a appris : plus lent, et après ~1,5 MP les visages peuvent se dégrader.")}</span>` : "") : ""}
                <div class="hw-size"><span class="bx"><i style="width:${bw}px;height:${bh}px"></i></span><span><b>${cw} × ${ch}</b><small>${(cw * ch / 1e6).toFixed(2)} MP · ${framesFor(+val(node, "duration"))} ${L("frames", "images")} · 24 fps</small></span></div>` });
    } });
    ui.after = (root) => {
        root.querySelectorAll("[data-tool]").forEach((b) => b.onclick = () => openHelper(b.dataset.tool));
        const ta = root.querySelector('[data-w="prompt"]');
        if (ta) ["keyup", "click", "select", "blur"].forEach((ev) => ta.addEventListener(ev, () => { ui.caret = [ta.selectionStart, ta.selectionEnd]; }));
        const prev = () => { const el = root.querySelector("[data-hfprev]"); if (el && ui.hf) el.textContent = helperBuild(ui.hf.id, ui.hf.d, ctx()).trim() || "…"; };
        root.querySelectorAll("[data-hfk]").forEach((b) => b.onclick = () => { const k = b.dataset.hfk, v = b.dataset.hfv; if (b.dataset.hfm) { const a = ui.hf.d[k] || []; ui.hf.d[k] = a.includes(v) ? a.filter((x) => x !== v) : [...a, v]; } else ui.hf.d[k] = v; ui.refresh(); });
        root.querySelectorAll("[data-hft]").forEach((el) => { el.oninput = () => { ui.hf.d[el.dataset.hft] = el.value; prev(); }; el.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") root.querySelector("[data-hfins]")?.click(); }); });
        root.querySelectorAll("[data-hfr]").forEach((el) => { el.oninput = () => { ui.hf.d[el.dataset.hfr] = +el.value; el.nextElementSibling.textContent = (+el.value).toFixed(1) + " s"; prev(); }; });
        root.querySelectorAll("[data-hfs]").forEach((el) => el.onchange = () => { ui.hf.d[el.dataset.hfs] = el.value; prev(); });
        root.querySelectorAll("[data-hfb]").forEach((b) => b.onclick = () => { ui.hf.d[b.dataset.hfb] = !ui.hf.d[b.dataset.hfb]; ui.refresh(); });
        root.querySelectorAll("[data-hfclose]").forEach((b) => b.onclick = () => { ui.hf = null; ui.refresh(); });
        root.querySelector("[data-hfins]")?.addEventListener("click", () => {
            const { id, d } = ui.hf, txt = helperBuild(id, d, ctx());
            if (!txt.trim()) return;
            ui.hf = null;
            if (id === "sound") { setField("overall_soundscape", txt.trim()); ui.refresh(); }
            else if (id === "music") { setField("non_diegetic_music", txt.trim()); ui.refresh(); }
            else insert(txt);
        });
        // references: add (click / drop, several at once), remove, insert the <Picture n> tag at the cursor
        const addRefs = async (files) => { const a = refNames(node); for (const f of files) { if (a.length >= 9) break; if (!f.type.startsWith("image")) continue; try { a.push(await upload(f)); } catch { } } setVal(node, "ref_images", JSON.stringify(a)); ui.refresh(); };
        root.querySelectorAll("[data-refdel]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); const a = refNames(node); a.splice(+b.dataset.refdel, 1); setVal(node, "ref_images", JSON.stringify(a)); ui.refresh(); });
        root.querySelectorAll("[data-ins]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); insert(" " + b.dataset.ins.replace(/&lt;/g, "<").replace(/&gt;/g, ">") + " "); });
        root.querySelectorAll("[data-refadd],[data-refi]").forEach((el) => {
            if (el.dataset.refadd) el.onclick = () => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.multiple = true; i.onchange = () => i.files?.length && addRefs([...i.files]); i.click(); };
            el.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add("over"); });
            el.addEventListener("dragleave", () => el.classList.remove("over"));
            el.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove("over"); if (e.dataTransfer?.files?.length) addRefs([...e.dataTransfer.files]); });
        });
        root.querySelectorAll("[data-clear]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); setVal(node, b.dataset.clear, ""); ui.refresh(); });
        root.querySelectorAll("[data-slot]").forEach((el) => {
            const put = async (f) => { setVal(node, el.dataset.slot, await upload(f)); ui.refresh(); };
            el.onclick = () => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.onchange = () => i.files?.[0] && put(i.files[0]); i.click(); };
            el.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add("over"); });
            el.addEventListener("dragleave", () => el.classList.remove("over"));
            el.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove("over"); const f = e.dataTransfer?.files?.[0]; if (f) put(f); });
        });
    };
    return ui;
}

// ================================================================== ④ Render
function videoBox(node, ph, info, live) {
    if (live) return `<div class="hw-pv"><img data-live src="data:image/jpeg;base64,${live.frames[live.i || 0]}"><span class="tag">● LIVE · step ${live.step}/${live.total}</span><span class="bar" style="width:${Math.round(100 * live.step / live.total)}%"></span></div>`;
    if (info?.video) {   // the box has its final size before the video loads (no jump, no cut-off settings below it)
        const w = +info.width || 16, h = +info.height || 9, port = h > w;
        return `<div class="hw-pv" style="aspect-ratio:${w}/${h};${port ? "height:460px;width:auto;margin:0 auto" : ""}"><video style="width:100%;height:100%;max-height:none" controls loop playsinline src="${viewUrl(info.video, info.r || "")}" ${info.thumb ? `poster="${viewUrl(info.thumb)}"` : ""}></video></div>`;
    }
    return `<div class="hw-pv empty">${ph}</div>`;
}
function setupRender(node) {
    const ui = mount(node, { width: 380, render: (u) => {
        const turbo = val(node, "speed") === "turbo";
        const scv = val(node, "step_cache"), cacheOn = scv === "light" || scv === "strong" || (scv === "auto" && !turbo);
        const auto = turbo ? 8 : cacheOn ? 13 : 20;
        u.fmt = { steps: (v) => (+v ? v : "auto · " + auto) };
        const ctl = node.widgets?.find((w) => w.name?.startsWith?.("control_after"));
        const locked = ctl ? ctl.value === "fixed" : false;
        return `<div class="hw-st ${ui.busy ? "busy" : ""}"><i></i>${esc(ui.status || L("Ready", "Prêt"))}</div>`
            + videoBox(node, L("The raw render shows here, live while it renders.", "Le rendu brut s'affiche ici, en direct pendant le calcul."), ui.info, ui.live)
            + section(node, { id: "r", icon: "▶", title: L("Render", "Rendu"), sub: `${+val(node, "steps") || auto} steps · ${turbo ? "⚡ Turbo" : "✦ Full"}${cacheOn ? " · cache" : ""}`,
            body: `${seg(node, "speed", [["turbo", L("⚡ Turbo · fast", "⚡ Turbo · rapide")], ["full", L("✦ Full · best", "✦ Full · meilleur")]])}
                ${field("Seed", `<div class="hw-row"><input class="hw-tx" type="number" data-w="seed" data-k="int" value="${val(node, "seed")}"><button class="hw-btn" data-dice>🎲</button><button class="hw-btn ${locked ? "pri" : ""}" data-lock>${locked ? "🔒" : "🔓"}</button></div>`)}
                ${field("Steps", slider(node, "steps", 0, 40, 1, u.fmt.steps))}`,
            advanced: `<div class="hw-grid2">${field("Sampler", select(node, "sampler_name"))}${field("Scheduler", select(node, "scheduler"))}</div>
                ${field(L("Step cache", "Cache des steps"), seg(node, "step_cache", [["auto", "Auto"], ["off", L("Off", "Non")], ["light", L("Light", "Léger")], ["strong", L("Strong", "Fort")]]))}
                ${field(L("Low VRAM", "Faible VRAM"), seg(node, "low_vram", [["auto", "Auto"], ["on", L("On", "Oui")], ["off", L("Off", "Non")]]))}
                ${field("Attention", select(node, "attention", { auto: ["Auto · fastest installed", "Auto · la plus rapide installée"], default: ["ComfyUI default", "Défaut ComfyUI"] }))}
                ${row(L("Sparse attention", "Attention sparse"), sw(node, "sparse_attention"), L("long clips only", "clips longs seulement"))}
                ${row(L("Prompt cache", "Cache du prompt"), sw(node, "prompt_cache"))}${row(L("Keep models loaded", "Garder les modèles chargés"), sw(node, "keep_loaded"))}` });
    } });
    ui.after = (root) => {
        root.querySelector("[data-dice]")?.addEventListener("click", () => { setVal(node, "seed", Math.floor(Math.random() * 2 ** 48)); ui.refresh(); });
        root.querySelector("[data-lock]")?.addEventListener("click", () => { const c = node.widgets?.find((w) => w.name?.startsWith?.("control_after")); if (c) { c.value = c.value === "fixed" ? "randomize" : "fixed"; ui.refresh(); } });
    };
    ui.setLive = (d) => {
        const first = !ui.live;
        ui.live = { frames: d.frames, step: d.step, total: d.total, fps: d.fps || 6, i: ui.live?.i || 0 };
        if (first) ui.refresh(); else { const t = ui.inner.querySelector(".hw-pv .tag"); if (t) t.textContent = `● LIVE · step ${d.step}/${d.total}`; const b = ui.inner.querySelector(".hw-pv .bar"); if (b) b.style.width = Math.round(100 * d.step / d.total) + "%"; }
        if (!ui.anim) ui.anim = setInterval(() => { const im = ui.inner.querySelector("[data-live]"); if (!ui.live || !im) return; ui.live.i = (ui.live.i + 1) % ui.live.frames.length; im.src = "data:image/jpeg;base64," + ui.live.frames[ui.live.i]; }, Math.round(1000 / (ui.live.fps || 6)));
    };
    ui.stopLive = () => { clearInterval(ui.anim); ui.anim = null; ui.live = null; };
    return ui;
}

// ================================================================== ⑤ Enhance
function setupEnhance(node) {
    const ui = mount(node, { width: 380, render: (u) => {
        clearRed(node, MODEL_WIDGETS.EnzinoH3WFEnhance);
        u.fmt = { polish_denoise: (v) => (+v).toFixed(2) };
        const up = val(node, "upscale"), itp = val(node, "interpolate");
        const tiles = [["polish", "✧", "Krea 2", val(node, "polish_on"), (+val(node, "polish_denoise")).toFixed(2), "polish_on"],
            ["up", "⤢", "Upscale", up !== "off", up, null], ["fps", "≋", "Fps", itp !== "off", itp === "off" ? "24 fps" : 24 * +itp.slice(1) + " fps", null]];
        let sel = P(node).hw_tab || "up";
        const tabs = `<div class="hw-tabs" style="grid-template-columns:repeat(3,1fr)">${tiles.map(([id, ic, t, on, s]) => `<button class="hw-tab ${sel === id ? "sel" : ""} ${on ? "" : "off"}" data-etab="${id}"><span class="ic">${ic}</span><span class="t">${t}<small>${esc(String(s))}</small></span></button>`).join("")}</div>`;
        const lockedPro = !PRO;
        const panels = {
            polish: section(node, { id: "polish", icon: "✧", title: L("Krea 2 second pass", "2e passe Krea 2"), toggle: "polish_on", locked: lockedPro, sub: L("fine detail on every frame, motion untouched", "détail fin sur chaque image, mouvement intact"),
                body: `${field(L("Strength", "Intensité"), slider(node, "polish_denoise", 0.05, 0.4, 0.01, u.fmt.polish_denoise))}
                    ${field(L("Krea 2 may change", "Krea 2 peut changer"), seg(node, "polish_mode", [["texture", L("Fine detail only", "Détail fin seul")], ["full", L("Whole image", "Image entière")]]))}
                    ${row(L("Anti-flicker", "Anti-scintillement"), sw(node, "polish_stable"))}
                    <div class="hw-grid2">${field(L("Krea 2 model", "Modèle Krea 2"), select(node, "polish_model"))}${field("Steps", seg(node, "polish_steps", [[4, "4"], [6, "6"], [8, "8"]]))}</div>`,
                advanced: `${field(L("Text encoder", "Encodeur"), select(node, "polish_te"))}${field("VAE", select(node, "polish_vae"))}
                    ${field(L("Polish prompt", "Prompt de finition"), `<textarea class="hw-ta" style="min-height:60px" data-w="polish_prompt" data-k="txt">${esc(val(node, "polish_prompt"))}</textarea>`)}` }),
            up: section(node, { id: "up", icon: "⤢", title: "Upscale", sub: up === "off" ? L("off", "désactivé") : up,
                body: `${seg(node, "upscale", [["off", L("Off", "Non")], ["1080p", "1080p"], ["1440p", "1440p"], ...(PRO ? [["2160p", "4K"]] : [])])}
                    ${up !== "off" ? field("Upscaler", select(node, "upscaler", { rtx_vsr: ["⚡ NVIDIA RTX Video Super Resolution", "⚡ NVIDIA RTX Video Super Resolution"], lanczos: ["Lanczos (no model)", "Lanczos (sans modèle)"] })) : ""}` }),
            fps: section(node, { id: "fps", icon: "≋", title: L("Smoothness", "Fluidité"), locked: lockedPro, sub: L("frame interpolation", "interpolation d'images"),
                body: `${seg(node, "interpolate", [["off", "24 fps"], ["x2", "48 fps"], ["x3", "72 fps"]])}${itp !== "off" ? field(L("Model", "Modèle"), select(node, "interp_model")) : ""}` }),
        };
        return `<div class="hw-st ${ui.busy ? "busy" : ""}"><i></i>${esc(ui.status || L("Each enhancement runs after the render.", "Chaque amélioration passe après le rendu."))}</div>`
            + videoBox(node, L("The enhanced clip shows here.", "Le clip amélioré s'affiche ici."), ui.info) + tabs + panels[sel];
    } });
    ui.after = (root) => root.querySelectorAll("[data-etab]").forEach((b) => b.onclick = () => { P(node).hw_tab = b.dataset.etab; ui.refresh(); });
    return ui;
}

// ================================================================== ⑥ Output
const SOCIAL = [["9:16", "Reels · 9:16"], ["1:1", "Feed · 1:1"], ["4:5", "Portrait · 4:5"], ["16:9", "YouTube · 16:9"]];
function setupOutput(node) {
    const ui = mount(node, { width: 420, render: () => {
        let soc = []; try { soc = JSON.parse(val(node, "social") || "[]"); } catch { }
        const cur = ui.sel || ui.info || HISTORY[0];
        if (!ui.histLoaded) { ui.histLoaded = true; loadHistory().then(() => ui.refresh()); }
        return `<div class="hw-st ${ui.busy ? "busy" : ""}"><i></i>${esc(ui.status || L("Your final video appears here.", "Ta vidéo finale apparaît ici."))}</div>`
            + videoBox(node, `✦<br>${L("Your final video appears here, with its sound.", "Ta vidéo finale apparaît ici, avec son son.")}`, cur)
            + (cur ? `<div class="hw-meta"><div><small>${L("Size", "Taille")}</small><b>${cur.width} × ${cur.height}</b></div><div><small>${L("Length", "Durée")}</small><b>${cur.seconds} s</b></div><div><small>Fps</small><b>${cur.fps || 24}</b></div></div>
                <div class="hw-row"><a class="hw-btn sm" href="${viewUrl(cur.video)}" target="_blank" rel="noopener">↗ ${L("Open", "Ouvrir")}</a><a class="hw-btn sm" href="${viewUrl(cur.video)}" download="${esc(cur.video.filename)}">⬇ ${L("Download", "Télécharger")}</a></div>` : "")
            + section(node, { id: "save", icon: "⬇", title: L("Save", "Enregistrer"), toggle: "save_on", sub: val(node, "save_on") ? `output/${esc(val(node, "folder"))}/${esc(val(node, "filename"))}_00001_.mp4` : L("preview only", "aperçu seulement"),
                body: `<div class="hw-grid2">${field(L("File name", "Nom du fichier"), `<input class="hw-tx" data-w="filename" data-k="txt" value="${esc(val(node, "filename"))}">`)}${field(L("Folder", "Dossier"), `<input class="hw-tx" data-w="folder" data-k="txt" value="${esc(val(node, "folder"))}">`)}</div>` })
            + section(node, { id: "sign", icon: "✍", title: L("Signature", "Signature"), toggle: "sign_on", locked: !PRO, sub: L("your name on the video", "ton nom sur la vidéo"),
                body: `${field(L("Text", "Texte"), `<input class="hw-tx" data-w="sign_text" data-k="txt" value="${esc(val(node, "sign_text"))}" placeholder="@enzinoai">`)}${field("Position", select(node, "sign_pos"))}` })
            + (PRO ? `<div class="hw-sec"><div class="hw-sh"><span class="ic on">▣</span><span class="t">${L("Social formats", "Formats réseaux")}<small>${L("extra MP4 files, framed on the action", "MP4 en plus, cadrés sur l'action")}</small></span></div>
                <div class="hw-sb"><div class="hw-chips">${SOCIAL.map(([k, l]) => `<button class="hw-chip ${soc.includes(k) ? "on" : ""}" data-soc="${k}">${l}</button>`).join("")}</div></div></div>`
                : section(node, { id: "soc", icon: "▣", title: L("Social formats", "Formats réseaux"), locked: true, sub: "Reels · Feed · YouTube" }))
            + (HISTORY.length ? `<div class="hw-sec"><div class="hw-sh"><span class="ic on">↺</span><span class="t">${L("History", "Historique")}<small>${HISTORY.length} ${L("recent renders", "rendus récents")}</small></span><button class="hw-btn sm" data-clearhist title="${L("Empties the list (your video files stay on disk)", "Vide la liste (tes fichiers vidéo restent sur le disque)")}">${L("Clear", "Vider")}</button></div>
                <div class="hw-sb"><div class="hw-hist">${HISTORY.slice(0, 24).map((h, i) => `<button class="${cur?.video?.filename === h.video?.filename ? "on" : ""}" data-hist="${i}" style="background-image:url('${viewUrl(h.thumb || h.last)}')"><span>${h.seconds}s</span></button>`).join("")}</div></div></div>` : "");
    } });
    ui.after = (root) => {
        root.querySelectorAll("[data-soc]").forEach((b) => b.onclick = () => { let a = []; try { a = JSON.parse(val(node, "social") || "[]"); } catch { } const k = b.dataset.soc; a = a.includes(k) ? a.filter((x) => x !== k) : [...a, k]; setVal(node, "social", JSON.stringify(a)); ui.refresh(); });
        root.querySelectorAll("[data-hist]").forEach((b) => b.onclick = () => { ui.sel = HISTORY[+b.dataset.hist]; ui.refresh(); });
        root.querySelector("[data-clearhist]")?.addEventListener("click", async (e) => { e.stopPropagation(); try { HISTORY = await (await api.fetchApi("/enzino_h3/history", { method: "POST", body: JSON.stringify({ clear: true }) })).json(); } catch { HISTORY = []; } ui.sel = null; ui.refresh(); });
    };
    return ui;
}

// ================================================================== header (virtual node)
function buildHeader(node) {
    injectCSS();
    const root = document.createElement("div"); root.className = "hwh"; root.dataset.enzino = "h3wf";
    const draftKey = "hw_final";
    const isDraft = () => !!P(node)[draftKey];
    const setDraft = (d) => {
        const r = graphNodes("EnzinoH3WFRender"), p = graphNodes("EnzinoH3WFPrompt"), e = graphNodes("EnzinoH3WFEnhance");
        if (d && !isDraft()) {
            P(node)[draftKey] = { r: r.map((n) => [n.id, val(n, "speed")]), p: p.map((n) => [n.id, val(n, "resolution")]), e: e.map((n) => [n.id, val(n, "upscale"), val(n, "polish_on"), val(n, "interpolate")]) };
            r.forEach((n) => setVal(n, "speed", "turbo")); p.forEach((n) => setVal(n, "resolution", "576p"));
            e.forEach((n) => { setVal(n, "upscale", "off"); setVal(n, "polish_on", false); setVal(n, "interpolate", "off"); });
        } else if (!d && isDraft()) {
            const s = P(node)[draftKey];
            for (const [id, v] of s.r || []) { const n = app.canvas.graph.getNodeById(id); if (n) setVal(n, "speed", v); }
            for (const [id, v] of s.p || []) { const n = app.canvas.graph.getNodeById(id); if (n) setVal(n, "resolution", v); }
            for (const [id, a, b, d2] of s.e || []) { const n = app.canvas.graph.getNodeById(id); if (n) { setVal(n, "upscale", a); setVal(n, "polish_on", b); setVal(n, "interpolate", d2); } }
            delete P(node)[draftKey];
        }
        for (const t of Object.keys(SETUP)) for (const n of graphNodes(t)) n.__hw?.refresh();
        render();
    };
    const render = () => {
        const d = isDraft();
        root.innerHTML = `<div class="mk">✦</div>
          <div class="tx"><div class="k">Enzino H3 WF${PRO ? "" : " · Free"} <span style="opacity:.45;letter-spacing:.1em">· ${esc(ED.version || "")}</span></div><h1>MiniMax H3</h1>
            <div class="sub">${L("Picture & prompt → render → Krea 2 pass & upscale → save & share. Video with sound, one wire.", "Image & prompt → rendu → passe Krea 2 & upscale → enregistrer & partager. Vidéo avec le son, un seul fil.")}</div></div>
          ${PRO ? "" : `<a class="getfull" href="${FULL_URL}" target="_blank" rel="noopener">✦ ${L("Full edition", "Édition complète")}<small>${L("Krea 2 pass · 4K · 48/72 fps · signature · social formats · 8 LoRAs", "passe Krea 2 · 4K · 48/72 i/s · signature · formats réseaux · 8 LoRAs")}</small></a>`}
          <div class="sp"></div>
          <div class="ctl"><div class="modes"><button class="${d ? "on" : ""}" data-m="draft" title="${L("0.6 MP · Turbo · no enhancement", "0.6 MP · Turbo · sans amélioration")}">⚡ ${L("Draft", "Brouillon")}</button><button class="${d ? "" : "on"}" data-m="final">✦ Final</button></div>
            <div class="by">BY <a href="https://enzinoai.com" target="_blank" rel="noopener">ENZINO</a> · ENZINOAI.COM</div></div>`;
        root.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => setDraft(b.dataset.m === "draft"));
    };
    render();
    return { root, render };
}

// ================================================================== registration
const SETUP = { EnzinoH3WFModels: setupModels, EnzinoH3WFLoRAs: setupLoras, EnzinoH3WFPrompt: setupPrompt, EnzinoH3WFRender: setupRender, EnzinoH3WFEnhance: setupEnhance, EnzinoH3WFOutput: setupOutput };
const wfNodes = () => (app.canvas?.graph?._nodes || []).filter((n) => SETUP[n.type]);
app.registerExtension({
    name: "Enzino.H3WF",
    setup() {
        api.addEventListener("enzino_h3.status", ({ detail }) => {
            const n = wfNodes().find((x) => String(x.id) === String(detail?.node));
            if (n?.__hw) { n.__hw.status = detail.text; n.__hw.busy = !/^(Done|Saved|Preview ready|Enhanced)/.test(detail.text); n.__hw.refresh(); }
        });
        api.addEventListener("enzino_h3.preview", ({ detail }) => { const n = wfNodes().find((x) => String(x.id) === String(detail?.node)); n?.__hw?.setLive?.(detail); });
        api.addEventListener("executing", ({ detail }) => { const id = detail?.node ?? detail; const n = wfNodes().find((x) => String(x.id) === String(id)); if (n?.__hw) { n.__hw.busy = true; n.__hw.status = L("Working…", "En cours…"); n.__hw.refresh(); } });
        api.addEventListener("execution_error", ({ detail }) => { const n = wfNodes().find((x) => String(x.id) === String(detail?.node_id)); if (n?.__hw) { n.__hw.busy = false; n.__hw.stopLive?.(); n.__hw.status = `⚠ ${detail.exception_message || "Error"}`.slice(0, 300); n.__hw.refresh(); } });
        api.addEventListener("execution_interrupted", () => wfNodes().forEach((n) => { if (n.__hw?.busy) { n.__hw.busy = false; n.__hw.stopLive?.(); n.__hw.status = L("Cancelled", "Annulé"); n.__hw.refresh(); } }));
    },
    registerCustomNodes() {
        const LG = window.LiteGraph, Base = window.LGraphNode || LG?.LGraphNode;
        if (!LG || !Base) return;
        class EnzinoH3WFHeader extends Base {
            constructor(title) {
                super(title);
                this.isVirtualNode = true; this.serialize_widgets = false; this.properties = this.properties || {};
                this.color = "#121418"; this.bgcolor = "#121418";
                this.__hdr = buildHeader(this);
                const dw = this.addDOMWidget("hwheader", "hwh", this.__hdr.root, { serialize: false, hideOnZoom: false, getMinHeight: () => 150 });
                if (dw) dw.serialize = false;
                if (!this.size || this.size[0] < 900) this.size = [2200, 170];
            }
        }
        EnzinoH3WFHeader.title = "Enzino H3 WF ✦ header";
        EnzinoH3WFHeader.title_mode = LG.NO_TITLE ?? 1;
        EnzinoH3WFHeader.category = "Enzino/H3 WF";
        LG.registerNodeType("EnzinoH3WFHeader", EnzinoH3WFHeader);
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const setup = SETUP[nodeData.name];
        if (!setup) return;
        const oc = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () { const r = oc?.apply(this, arguments); this.__hw = setup(this); return r; };
        const ocf = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = ocf?.apply(this, arguments);
            for (const w of this.widgets || []) if (w.name && w.type !== "hw") { w.hidden = true; w.computeSize = () => [0, -4]; }
            const mw = MODEL_WIDGETS[nodeData.name];
            if (mw) { fixModelValues(this, mw); setTimeout(() => { fixModelValues(this, mw); clearRed(this, mw); this.__hw?.refresh(); }, 1200); }
            requestAnimationFrame(() => this.__hw?.refresh());
            return r;
        };
        const oe = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (msg) {
            const r = oe?.apply(this, arguments);
            const d = msg?.enzino_h3?.[0];
            if (d && this.__hw) {
                this.__hw.info = { ...d, r: Date.now() }; this.__hw.sel = null; this.__hw.busy = false; this.__hw.stopLive?.();
                if (nodeData.name === "EnzinoH3WFOutput") loadHistory().then(() => this.__hw.refresh()); else this.__hw.refresh();
            }
            return r;
        };
    },
});
