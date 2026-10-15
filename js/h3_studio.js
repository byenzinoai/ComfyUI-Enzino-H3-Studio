import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/* ✦ Enzino H3 Studio — MiniMax H3 in one node. by Enzino · https://enzinoai.com */

// ------------------------------------------------------------------ edition (Free / Full)
const ED = await (async () => { try { return await (await api.fetchApi("/enzino_h3/version")).json(); } catch { return { edition: "free" }; } })();
const PRO = ED.edition === "full";
const FULL_URL = ED.full_url || "https://ko-fi.com/enzinoxl/";
const FULL_PRICE = ED.full_price || "$11.99";

// ------------------------------------------------------------------ i18n & small helpers
const fr = () => { try { return (app.extensionManager?.setting?.get?.("EnzinoH3.Language") || "English") === "Français"; } catch { return false; } };
const L = (en, f) => (fr() ? f : en);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const W = (node, n) => node.widgets?.find((w) => w.name === n);
const val = (node, n, d) => { const w = W(node, n); return w ? w.value : d; };
function setVal(node, n, v) { const w = W(node, n); if (!w) return; const old = w.value; w.value = v; w.callback?.(v); try { node.onWidgetChanged?.(n, v, old, w); } catch { } node.setDirtyCanvas?.(true, true); }
const T2 = (a) => (Array.isArray(a) ? (fr() ? a[1] : a[0]) : a || "");
const fmtSize = (b) => !b ? "" : b >= 1e9 ? (b / 1e9).toFixed(1) + (fr() ? " Go" : " GB") : Math.round(b / 1e6) + (fr() ? " Mo" : " MB");
const FPS = 24;
const framesFor = (s) => { let n = Math.max(5, Math.round(s * FPS)); while (n % 17 !== 5) n++; return n; };
const ASPECTS = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1], "4:3": [4, 3], "3:4": [3, 4], "21:9": [21, 9], "3:2": [3, 2], "2:3": [2, 3] };
// H3 canvas by pixel budget (same as h3/node.py canvas()): every aspect gets the pixels of 16:9 at that preset
const budgetOf = (res, mp) => { if (res === "custom_mp") return Math.max(0.15, +mp || 1) * 1e6; const sh = parseInt(res) || 768; const a = sh * sh * 16 / 9; return sh <= 768 ? Math.min(a, 768 * 1344) : a; };
const mpOf = (res, mp) => budgetOf(res, mp) / 1e6;
const mpTxt = (v) => (v < 1 ? v.toFixed(2) : v.toFixed(v * 10 % 1 ? 2 : 1)) + " MP";
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
    return best || [Math.max(384, Math.round(w0 / 32) * 32), Math.max(384, Math.round(h0 / 32) * 32)];
}
function finalSize(cw, ch, up) {
    const t = parseInt(up); if (!t) return [cw, ch];
    const s = t / Math.min(cw, ch); if (s <= 1) return [cw, ch];
    return [Math.round(cw * s / 2) * 2, Math.round(ch * s / 2) * 2];
}
const lastShot = (t) => { const m = [...String(t || "").matchAll(/\[\s*Shot\s+(\d+)\s*\]/gi)].map((x) => +x[1]); return m.length ? Math.max(...m) : 1; };
const inputUrl = (v) => {
    if (!v) return "";
    const i = v.lastIndexOf("/");
    return api.apiURL("/view?" + new URLSearchParams({ filename: i >= 0 ? v.slice(i + 1) : v, subfolder: i >= 0 ? v.slice(0, i) : "", type: "input" }));
};
const viewUrl = (f, r = "") => api.apiURL("/view?" + new URLSearchParams({ filename: f.filename, subfolder: f.subfolder || "", type: f.type || "output", r }));
const baseName = (v) => String(v || "").split("/").pop();

// ------------------------------------------------------------------ theme (same kit as Enzino Krea 2)
const CSS = `
.h3{--bg:#17191e;--card:#1f2228;--raise:#272b33;--line:#30353f;--line2:#3a404c;--ink:#ecebe7;--mute:#8e95a3;--dim:#646b78;--acc:#f2a65a;--acc2:#e86fa6;--acc3:#a58be8;--ok:#5fc48a;--bad:#e8705f;
 font:12.5px/1.4 Inter,system-ui,-apple-system,sans-serif;color:var(--ink);box-sizing:border-box;width:100%;overflow:hidden}
.h3 *{box-sizing:border-box}
.h3-in{display:flex;flex-direction:column;gap:12px;padding:4px 4px 10px}
.h3-hd{position:relative;border-radius:16px;overflow:hidden;background:#121418;border:1px solid #2a2e36;display:flex;align-items:center;gap:20px;padding:18px 22px}
.h3-hd::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(460px 170px at 4% 0%,rgba(242,166,90,.10),transparent 72%)}
.h3-hd .mk{position:relative;flex:none;width:54px;height:54px;border-radius:15px;display:grid;place-items:center;font-size:24px;color:var(--acc);background:rgba(242,166,90,.10);border:1px solid rgba(242,166,90,.28)}
.h3-hd .tx{position:relative;min-width:0}
.h3-hd .k{font-size:10.5px;font-weight:700;letter-spacing:.34em;color:var(--acc);text-transform:uppercase}
.h3-hd h1{margin:2px 0 0;font:800 40px/1 "Space Grotesk",Inter,system-ui,sans-serif;letter-spacing:-.03em;white-space:nowrap;display:inline-block;color:#efebe5}
.h3-hd h1 span{color:var(--acc)}
.h3-hd .sub{color:#a9a49b;font-size:12.5px;margin-top:5px}
.h3-hd .sp{flex:1}
.h3-hd .ctl{position:relative;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.h3-hd .modes{display:flex;gap:4px;background:#0d0e11;border:1px solid #2a2e36;border-radius:12px;padding:4px}
.h3-hd .modes button{all:unset;cursor:pointer;padding:8px 16px;border-radius:9px;font-weight:700;font-size:13px;color:#8e95a3}
.h3-hd .modes button.on{background:var(--acc);color:#17191e}
.h3-hd .by{font-size:10.5px;color:#646b78;letter-spacing:.14em}.h3-hd .by a{color:#ecebe7;text-decoration:none;font-weight:700}
.h3-hd .st{font-size:11px;color:var(--mute);display:flex;align-items:center;gap:6px;max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.h3-hd .st i{width:7px;height:7px;border-radius:50%;background:var(--ok);flex:none}.h3-hd .st.busy i{background:var(--acc);animation:h3p 1s infinite}
@keyframes h3p{50%{opacity:.25}}
.h3-tabs{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.h3-tab{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--card);border:1px solid var(--line)}
.h3-tab .ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--raise);color:var(--mute);font-size:15px;flex:none}
.h3-tab b{display:block;font-size:12.5px}.h3-tab small{display:block;color:var(--mute);font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.h3-tab:hover{border-color:var(--line2)}
.h3-tab.on{border-color:var(--acc);background:rgba(242,166,90,.08)}.h3-tab.on .ic{background:rgba(242,166,90,.18);color:var(--acc)}
.h3-grid{display:grid;grid-template-columns:1.38fr 1fr;gap:12px;align-items:start}
.h3-col{display:flex;flex-direction:column;gap:12px;min-width:0}
.h3-sec{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.h3-sec.off .h3-sb{display:none}.h3-sec.off{opacity:.62}
.h3-sh{display:flex;align-items:center;gap:9px;padding:10px 12px}
.h3-sh .ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:rgba(242,166,90,.15);color:var(--acc);font-size:13px;flex:none}
.h3-sec.off .h3-sh .ic{background:var(--raise);color:var(--mute)}
.h3-sh .t{font-weight:650;font-size:13px;flex:1;min-width:0}
.h3-sh .t small{display:block;font-weight:500;color:var(--mute);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.h3-sb{padding:0 12px 12px;display:flex;flex-direction:column;gap:10px}
.h3-f{display:flex;flex-direction:column;gap:5px}
.h3-f>label,.h3-lab{font-size:10.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.h3-row{display:flex;gap:8px;align-items:center}
.h3-sel,.h3-tx,.h3-ta{width:100%;background:#121418;border:1px solid var(--line);border-radius:8px;color:var(--ink);padding:7px 9px;font:inherit;outline:none}
.h3-sel:focus,.h3-tx:focus,.h3-ta:focus{border-color:var(--acc)}
.h3-sel option{background:#1f2228}
.h3-ta{resize:vertical;min-height:250px;line-height:1.5;font-size:12.5px}
.h3-sl{display:flex;align-items:center;gap:9px}
.h3-sl input{flex:1;accent-color:var(--acc);height:16px;margin:0}
.h3-sl .v{min-width:46px;text-align:right;font-variant-numeric:tabular-nums;font-weight:650;color:var(--acc)}
.h3-sw{all:unset;cursor:pointer;width:34px;height:19px;border-radius:999px;background:var(--line2);position:relative;flex:none}
.h3-sw::after{content:"";position:absolute;top:2.5px;left:2.5px;width:14px;height:14px;border-radius:50%;background:#9aa1ad;transition:.15s}
.h3-sw.on{background:var(--acc)}.h3-sw.on::after{left:17.5px;background:#17191e}
.h3-seg{display:flex;background:#121418;border:1px solid var(--line);border-radius:9px;padding:2px;gap:2px;flex-wrap:wrap}
.h3-seg button{all:unset;cursor:pointer;flex:1;text-align:center;padding:6px 6px;border-radius:7px;font-weight:600;font-size:11.5px;color:var(--mute);white-space:nowrap}
.h3-seg button.on{background:var(--raise);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line2)}
.h3-chips{display:flex;gap:5px;flex-wrap:wrap}
.h3-chip{all:unset;cursor:pointer;padding:4px 9px;border-radius:999px;border:1px solid var(--line);color:var(--mute);font-size:11px;font-weight:600;white-space:nowrap}
.h3-chip:hover{color:var(--ink);border-color:var(--line2)}
.h3-chip.on{border-color:var(--acc);color:var(--ink);background:rgba(242,166,90,.12)}
.h3-chip.tag{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:#f8dcc0;border-color:rgba(242,166,90,.35)}
.h3-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 12px;border-radius:9px;background:var(--raise);border:1px solid var(--line);font-weight:650;white-space:nowrap;color:var(--ink);text-decoration:none}
.h3-btn:hover{border-color:var(--acc)}.h3-btn.pri{background:var(--acc);border-color:var(--acc);color:#17191e}.h3-btn.sm{padding:5px 9px;font-size:11px;border-radius:8px}
.h3-btn[disabled]{opacity:.4;pointer-events:none}
.h3-adv{border-top:1px dashed var(--line);margin:0 -12px;padding:8px 12px 0}
.h3-adv>button{all:unset;cursor:pointer;color:var(--dim);font-size:11px;font-weight:650;letter-spacing:.04em}.h3-adv>button:hover{color:var(--ink)}
.h3-adv .h3-sb{padding:10px 0 0}
.h3-note{color:var(--mute);font-size:11px}.h3-warn{color:var(--bad);font-size:11px}
.h3-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
/* slots */
.h3-slots{display:grid;gap:10px}
.h3-slot{position:relative;border-radius:11px;border:1px dashed var(--line2);background:#121418 repeating-linear-gradient(135deg,transparent 0 10px,rgba(255,255,255,.015) 10px 20px);min-height:150px;display:flex;flex-direction:column;overflow:hidden;cursor:pointer;transition:border-color .15s}
.h3-slot:hover,.h3-slot.over{border-color:var(--acc)}
.h3-slot.has{border-style:solid;border-color:var(--line)}
.h3-slot .im{flex:1;min-height:0;display:grid;place-items:center;position:relative}
.h3-slot img,.h3-slot video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#0d0e11}
.h3-slot .ph{display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--dim);font-size:11px;text-align:center;padding:8px}
.h3-slot .ph b{font-size:22px;color:var(--mute);font-weight:400}
.h3-slot .bar{display:flex;align-items:center;gap:6px;padding:6px 8px;background:#17191e;border-top:1px solid var(--line);font-size:11px}
.h3-slot .bar .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:650}
.h3-slot .bar .tg{font-family:ui-monospace,Consolas,monospace;font-size:10px;color:var(--acc)}
.h3-slot .x{all:unset;cursor:pointer;position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:7px;display:grid;place-items:center;background:rgba(13,14,17,.8);color:var(--ink);font-size:11px;z-index:2}
.h3-slot .x:hover{background:var(--bad)}
.h3-slot.sm{min-height:112px}
.h3-slot audio{width:100%;height:30px}
.h3-file{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:#121418;border:1px dashed var(--line2);cursor:pointer}
.h3-file:hover,.h3-file.over{border-color:var(--acc)}.h3-file.has{border-style:solid;border-color:var(--line)}
.h3-file .ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--raise);color:var(--acc);flex:none}
.h3-file .nm{flex:1;min-width:0;display:flex;flex-direction:column}.h3-file .nm b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px}.h3-file .nm small{color:var(--mute);font-size:10.5px}
.h3-file audio{height:28px;max-width:190px}
/* prompt */
.h3-tools{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.h3-tools select{all:unset;cursor:pointer;padding:4px 22px 4px 9px;border-radius:999px;border:1px solid var(--line);color:var(--mute);font-size:11px;font-weight:600;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%238e95a3'/%3E%3C/svg%3E") no-repeat right 8px center}
.h3-tools select option{background:#1f2228;color:var(--ink)}
.h3-hdr{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:var(--dim);background:#121418;border:1px solid var(--line);border-radius:8px;padding:6px 9px;line-height:1.45}
.h3-hdr b{color:var(--acc);font-family:Inter,system-ui,sans-serif;font-weight:650;font-size:10px;letter-spacing:.06em;margin-right:6px}
/* size preview */
.h3-size{display:flex;align-items:center;gap:14px;padding:10px 14px;border-radius:11px;background:#121418;border:1px solid var(--line)}
.h3-size .bx{width:56px;height:56px;display:grid;place-items:center;flex:none}.h3-size .bx i{display:block;border:2px solid var(--acc);border-radius:4px;background:rgba(242,166,90,.12)}
.h3-size b{font-size:17px;font-variant-numeric:tabular-nums}.h3-size small{display:block;color:var(--mute);font-size:11px}
/* models */
.h3-mrow{display:grid;grid-template-columns:8px 1fr auto;gap:9px;align-items:center;padding:6px 9px;border-radius:10px;background:#121418;border:1px solid var(--line)}
.h3-mrow .d{width:8px;height:8px;border-radius:50%;background:var(--bad)}.h3-mrow.ok .d{background:var(--ok)}.h3-mrow.opt .d{background:var(--line2)}
.h3-mrow .nm{min-width:0;display:flex;flex-direction:column;gap:3px}.h3-mrow .nm b{font-size:11.5px}.h3-mrow .nm small{font-size:10px;color:var(--mute)}
.h3-mrow select{all:unset;box-sizing:border-box;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10.5px;padding:2px 22px 2px 7px;border-radius:7px;background:var(--raise) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%238e95a3'/%3E%3C/svg%3E") no-repeat right 7px center;border:1px solid var(--line);cursor:pointer}
.h3-mrow select option{background:#1f2228}
.h3-prog{display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-size:10px;color:var(--mute);min-width:96px}
.h3-prog .b{width:96px;height:4px;border-radius:9px;background:var(--line);overflow:hidden}.h3-prog .b i{display:block;height:100%;background:var(--acc)}
.h3-okline{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:rgba(95,196,138,.08);border:1px solid rgba(95,196,138,.25);color:var(--ok);font-weight:650;font-size:11.5px}
/* output */
.h3-out{display:grid;grid-template-columns:1fr 300px;gap:12px}
.h3-grid.wide{grid-template-columns:1.25fr 1fr 1.15fr}
.h3-out.v{grid-template-columns:1fr}
.h3-out.v.port{grid-template-columns:auto minmax(0,1fr);align-items:start}
.h3-out.v.port .h3-player{margin:0}
.h3-out.v.port .h3-meta{gap:4px}.h3-out.v.port .h3-meta>div{padding:5px 8px}
.h3-out.v.port .h3-acts{gap:4px}.h3-out.v.port .h3-acts .h3-btn{padding:6px 6px;font-size:11px}
.h3-out.v.port .h3-hist button{width:72px;height:44px}
.h3-grid.studio{grid-template-columns:1.2fr 1fr 1.1fr;align-items:stretch}
.h3-grid.studio>.h3-col>*{flex:none}
.h3-grid.studio>.h3-col:first-child [data-sec="prompt"] .h3-ta{min-height:max(250px,calc(var(--bh) - 400px))}
.h3-grid.studio>.h3-col{overflow-y:auto;overscroll-behavior:contain;padding-right:5px;scrollbar-width:thin;scrollbar-color:#3a3f49 transparent}
.h3-grid.studio>.h3-col::-webkit-scrollbar{width:6px}.h3-grid.studio>.h3-col::-webkit-scrollbar-thumb{background:#3a3f49;border-radius:9px}
.h3-ptabs{position:sticky;top:0;z-index:3;display:grid;gap:4px;padding:4px;border-radius:12px;background:#0d0e11;border:1px solid var(--line);box-shadow:0 6px 12px -6px #000}
.h3-ptabs button{all:unset;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:1px;padding:7px 4px;border-radius:9px;text-align:center;min-width:0}
.h3-ptabs .ic{font-size:14px;color:var(--mute)}.h3-ptabs b{font-size:11.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.h3-ptabs small{font-size:10px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.h3-ptabs button:hover{background:var(--raise)}
.h3-ptabs button.on{background:rgba(242,166,90,.12);box-shadow:inset 0 0 0 1px rgba(242,166,90,.45)}.h3-ptabs button.on .ic,.h3-ptabs button.on small{color:var(--acc)}
.h3-hd.compact{padding:10px 16px;gap:14px}.h3-hd.compact .mk{width:40px;height:40px;font-size:18px;border-radius:12px}
.h3-hd.compact h1{font-size:28px}.h3-hd.compact .sub{display:none}.h3-hd.compact .ctl{flex-direction:row;align-items:center;flex-wrap:wrap;justify-content:flex-end;gap:10px}
.h3-hd.compact .modes button{padding:6px 13px}
.h3-hd.compact .h3-getfull small{display:none}
.h3-out.v .h3-player{max-height:640px}
.h3-col.res{position:relative}
.h3-lay{all:unset;cursor:pointer;font-size:10.5px;color:var(--mute);border:1px solid #2a2e36;border-radius:8px;padding:4px 8px;background:#0d0e11}
.h3-lay:hover{color:var(--ink);border-color:var(--acc)}
.h3-player{position:relative;border-radius:12px;overflow:hidden;background:#0d0e11;border:1px solid var(--line);display:grid;place-items:center;width:100%;margin:0 auto}
.h3-player video{width:100%;height:100%;object-fit:contain;background:#0d0e11}
.h3-livebadge{position:absolute;top:10px;left:10px;padding:4px 9px;border-radius:999px;background:rgba(13,14,17,.82);border:1px solid rgba(242,166,90,.4);color:var(--acc);font-size:11px;font-weight:700;letter-spacing:.04em}
.h3-livebar{position:absolute;left:0;bottom:0;height:3px;background:var(--acc);transition:width .3s}
.h3-player .ph{color:var(--dim);text-align:center;display:flex;flex-direction:column;gap:6px;align-items:center}
.h3-player .ph b{font-size:36px;font-weight:300;color:var(--line2)}
.h3-side{display:flex;flex-direction:column;gap:10px;min-width:0}
.h3-meta{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.h3-meta div{padding:7px 9px;border-radius:9px;background:#121418;border:1px solid var(--line)}
.h3-meta small{display:block;color:var(--dim);font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:650}
.h3-meta b{font-size:12px;font-variant-numeric:tabular-nums}
.h3-acts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.h3-histbox{display:flex;flex-direction:column;gap:6px;width:100%;margin-top:4px;padding-top:10px;border-top:1px solid var(--line)}
.h3-hist{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
.h3-hist button{all:unset;cursor:pointer;flex:none;width:92px;height:56px;border-radius:8px;overflow:hidden;border:2px solid transparent;background:#0d0e11;position:relative}
.h3-hist button.on{border-color:var(--acc)}
.h3-hist img{width:100%;height:100%;object-fit:cover}
.h3-hist span{position:absolute;bottom:2px;right:4px;font-size:9px;font-weight:700;color:#fff;text-shadow:0 1px 2px #000}
.h3-full{display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:800;letter-spacing:.06em;padding:2px 6px;border-radius:5px;background:var(--acc);color:#17191e;text-decoration:none;vertical-align:middle}
.h3-lock{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--card);border:1px dashed var(--line2);color:var(--mute);text-decoration:none}
.h3-lock:hover{border-color:var(--acc)}
.h3-lock .ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--raise);flex:none}
.h3-lock b{color:var(--ink);font-size:13px;display:block}.h3-lock small{font-size:11px}
.h3-lock .sp{flex:1}
.h3-getfull{display:flex;flex-direction:column;gap:3px;padding:9px 14px;border-radius:12px;border:1px solid rgba(242,166,90,.5);background:rgba(242,166,90,.08);color:var(--acc);text-decoration:none;font-weight:700;font-size:13px;max-width:360px}
.h3-getfull small{color:var(--mute);font-weight:500;font-size:10.5px}
.h3-hd .pre{display:flex;gap:6px;align-items:center}
.h3-hd .pre select,.h3-hd .pre input{background:#0d0e11;border:1px solid #2a2e36;border-radius:9px;color:#ecebe7;padding:7px 9px;font:inherit;outline:none;min-width:190px}
.h3-hd .pre select option{background:#1f2228}
.h3-hd .b{all:unset;cursor:pointer;width:32px;height:32px;display:grid;place-items:center;border-radius:9px;background:#1f2228;border:1px solid #2a2e36;font-weight:700}
.h3-hd .b:hover{border-color:var(--acc)}.h3-hd .b[disabled]{opacity:.35;pointer-events:none}
.h3-shot{border:1px solid var(--line);border-radius:10px;background:#121418;padding:8px;display:flex;flex-direction:column;gap:6px}
.h3-shot .hd{display:flex;align-items:center;gap:6px}
.h3-shot .hd b{font-size:11.5px;flex:1}
.h3-shot .h3-ta{min-height:86px;font-size:12px}
.h3-shot .x{all:unset;cursor:pointer;width:22px;height:22px;border-radius:6px;display:grid;place-items:center;color:var(--mute)}.h3-shot .x:hover{background:var(--raise);color:var(--ink)}
.h3-rt{position:relative;border-radius:10px;overflow:hidden;background:#0d0e11;border:1px solid var(--line);user-select:none;touch-action:none}
.h3-rt video{display:block;width:100%;height:auto}
.h3-rt .bx{position:absolute;border:2px solid var(--acc);background:rgba(242,166,90,.18);box-shadow:0 0 0 9999px rgba(0,0,0,.45);cursor:move}
.h3-rt .bx i{position:absolute;right:-7px;bottom:-7px;width:14px;height:14px;border-radius:4px;background:var(--acc);cursor:nwse-resize}
.h3-rt .bx span{position:absolute;left:4px;top:3px;font-size:10px;font-weight:700;color:#17191e;background:var(--acc);padding:1px 5px;border-radius:4px}
.h3-vars{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.h3-vars button{all:unset;cursor:pointer;position:relative;border-radius:9px;overflow:hidden;border:2px solid var(--line);aspect-ratio:16/9;background:#0d0e11}
.h3-vars button.on{border-color:var(--acc)}
.h3-vars img{width:100%;height:100%;object-fit:cover}
.h3-vars span{position:absolute;left:5px;bottom:4px;font-size:10px;font-weight:700;color:#fff;text-shadow:0 1px 2px #000}
.h3-foot{display:flex;justify-content:space-between;align-items:center;color:var(--dim);font-size:10.5px;padding:0 4px}
.h3-foot a{color:var(--acc);text-decoration:none;font-weight:700}
`;
function injectCSS() {
    if (!document.getElementById("enzino-h3-css")) { const s = document.createElement("style"); s.id = "enzino-h3-css"; s.textContent = CSS; document.head.appendChild(s); }
    if (!document.getElementById("enzino-k2-font")) {
        const l = document.createElement("link"); l.id = "enzino-k2-font"; l.rel = "stylesheet";
        l.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&display=swap";
        document.head.appendChild(l);
    }
}

// ------------------------------------------------------------------ prompt snippets (official H3 format)
const TEMPLATE_BASE = `integrated_multimodal_description: [Shot 1] Live-action, cinematic, a medium-wide shot frames …. The camera pushes in with small amplitude at slow speed as …

overall_soundscape: …

non_diegetic_music: …`;
const TEMPLATE_REF = `subject_definitions:
<Subject 1> is the person in <Picture 1>; keep their face, hair and clothing exactly.

summary: [reference generation] <Subject 1> …

retention_analysis: <Subject 1> keeps full identity and outfit in every shot.

detailed_description: [Shot 1] Live-action, cinematic, a medium shot frames <Subject 1> …. The camera tracks …

overall_soundscape: …

non_diegetic_music: …`;
const CAMERA = [
    ["push", "The camera pushes in with small amplitude at slow speed toward "], ["pull", "The camera pulls out at slow speed, revealing "],
    ["panl", "The camera pans left "], ["panr", "The camera pans right with large amplitude at fast speed, revealing "],
    ["truckl", "The camera trucks left with small amplitude "], ["truckr", "The camera trucks right with small amplitude at slow speed as "],
    ["tiltu", "The camera tilts up at slow speed to "], ["tiltd", "The camera tilts down to "], ["pedu", "The camera pedestals up as "],
    ["arc", "The camera arcs around "], ["track", "In a tracking shot, the camera follows "], ["static", "The camera holds a static shot as "],
    ["shake", "The camera shakes slightly as "], ["pov", "In a POV shot from "], ["zoom", "The camera zooms in at slow speed on "],
];
const CAMERA_LABEL = { push: ["Push in", "Avancée"], pull: ["Pull out", "Recul"], panl: ["Pan left", "Pano gauche"], panr: ["Pan right · fast", "Pano droite · rapide"],
    truckl: ["Truck left", "Travelling gauche"], truckr: ["Truck right", "Travelling droite"], tiltu: ["Tilt up", "Tilt haut"], tiltd: ["Tilt down", "Tilt bas"],
    pedu: ["Pedestal up", "Élévation"], arc: ["Arc shot", "Arc"], track: ["Tracking shot", "Suivi"], static: ["Static", "Fixe"], shake: ["Shake", "Secousse"],
    pov: ["POV", "Vue subjective"], zoom: ["Zoom in", "Zoom avant"] };
const STYLE_LABEL = { none: ["No style", "Aucun style"], art_is_explosion: "Art is explosion", blooming_flowers: "Blooming flowers", bullet_time: "Bullet time",
    dark_magic: "Dark magic", fire_breath: "Fire breath", four_seasons: "Four seasons", kiss_camera: "Kiss camera", spiral_ascent: "Spiral ascent",
    storm_magic: "Storm magic", truman_show: "Truman show" };

const MODES = [
    { id: "text", icon: "✎", t: ["Text", "Texte"], s: ["text → video", "texte → vidéo"] },
    { id: "image", icon: "▣", t: ["Image", "Image"], s: ["animate a picture", "animer une image"] },
    { id: "first_last", icon: "⇆", t: ["First + Last", "Début + Fin"], s: ["from one frame to another", "d'une image à l'autre"] },
    { id: "last", icon: "⚑", t: ["End frame", "Image de fin"], s: ["land on a picture", "finir sur une image"] },
    { id: "references", icon: "✦", t: ["References", "Références"], s: ["people, places, voices", "persos, lieux, voix"] },
];


// ------------------------------------------------------------------ prompt helpers: small forms that write correct H3 sentences
const LANGS = [["English", "English"], ["French", "Français"], ["Spanish", "Español"], ["German", "Deutsch"], ["Italian", "Italiano"], ["Portuguese", "Português"],
    ["Japanese", "日本語"], ["Chinese", "中文"], ["Korean", "한국어"], ["Russian", "Русский"], ["Arabic", "العربية"]];
const CAM_MOVES = [["push", "pushes in", ["Push in", "Avancée"]], ["pull", "pulls out", ["Pull out", "Recul"]], ["panl", "pans left", ["Pan left", "Pano gauche"]],
    ["panr", "pans right", ["Pan right", "Pano droite"]], ["truckl", "trucks left", ["Truck left", "Travelling gauche"]], ["truckr", "trucks right", ["Truck right", "Travelling droite"]],
    ["tiltu", "tilts up", ["Tilt up", "Tilt haut"]], ["tiltd", "tilts down", ["Tilt down", "Tilt bas"]], ["pedu", "pedestals up", ["Rise", "Élévation"]], ["pedd", "pedestals down", ["Lower", "Descente"]],
    ["arc", "arcs around", ["Arc around", "Arc autour"]], ["track", "tracks", ["Tracking", "Suivi"]], ["zoomi", "zooms in", ["Zoom in", "Zoom avant"]], ["zoomo", "zooms out", ["Zoom out", "Zoom arrière"]],
    ["static", "holds a static shot", ["Static", "Fixe"]], ["shake", "shakes slightly", ["Handheld shake", "Caméra à l'épaule"]], ["pov", "moves in a POV shot", ["POV", "Vue subjective"]], ["roll", "rolls clockwise", ["Roll", "Rotation"]]];
const FRAMES = [["wide shot", ["Wide", "Large"]], ["medium-wide shot", ["Medium-wide", "Moyen-large"]], ["medium shot", ["Medium", "Moyen"]], ["medium close-up", ["Medium close-up", "Plan poitrine"]],
    ["close-up", ["Close-up", "Gros plan"]], ["extreme close-up", ["Extreme close-up", "Très gros plan"]], ["over-the-shoulder shot", ["Over-shoulder", "Par-dessus l'épaule"]],
    ["low-angle shot", ["Low angle", "Contre-plongée"]], ["high-angle shot", ["High angle", "Plongée"]], ["top-down shot", ["Top-down", "Vue du dessus"]], ["aerial shot", ["Aerial", "Vue aérienne"]]];
const TRANS = [["cut", "cuts to", ["Cut", "Coupe"]], ["dissolve", "cross-dissolves to", ["Dissolve", "Fondu enchaîné"]], ["fade", "fades to", ["Fade", "Fondu"]], ["whip", "whip-pans to", ["Whip pan", "Filé"]]];
const AGES = [["child", ["child", "enfant"]], ["teenage", ["teen", "ado"]], ["young", ["young", "jeune"]], ["middle-aged", ["middle-aged", "40-50 ans"]], ["old", ["old", "âgé"]]];
const GENDERS = [["woman", ["woman", "femme"]], ["man", ["man", "homme"]], ["girl", ["girl", "fille"]], ["boy", ["boy", "garçon"]], ["person", ["person", "personne"]]];
const VOICES = [["warm", ["warm", "chaude"]], ["deep", ["deep", "grave"]], ["raspy", ["raspy", "éraillée"]], ["breathy", ["breathy", "soufflée"]], ["bright", ["bright", "claire"]],
    ["soft", ["soft", "douce"]], ["husky", ["husky", "rauque"]], ["gruff", ["gruff", "bourrue"]], ["calm", ["calm", "posée"]]];
const PACES = [["slow", ["slow", "lent"]], ["measured", ["measured", "posé"]], ["fast", ["fast", "rapide"]]];
const EMOTIONS = [["", ["neutral", "neutre"], "says"], ["calmly", ["calm", "calme"], "says calmly"], ["happily", ["happy", "joyeux"], "says happily"], ["sadly", ["sad", "triste"], "says sadly"],
    ["angrily", ["angry", "en colère"], "says angrily"], ["excitedly", ["excited", "excité"], "says excitedly"], ["nervously", ["nervous", "nerveux"], "says nervously"],
    ["whisper", ["whispering", "chuchote"], "whispers"], ["shout", ["shouting", "crie"], "shouts"], ["laugh", ["laughing", "en riant"], "says with a laugh"]];
const TEXT_KINDS = [["sign", ["sign", "panneau"]], ["neon sign", ["neon sign", "néon"]], ["title card", ["title card", "carton titre"]], ["caption", ["caption", "légende"]],
    ["poster", ["poster", "affiche"]], ["screen", ["screen", "écran"]], ["T-shirt print", ["T-shirt print", "imprimé T-shirt"]], ["handwritten note", ["handwritten note", "mot manuscrit"]]];
const SOUNDS = [["rain", "steady rain falls", ["Rain", "Pluie"]], ["wind", "wind gusts howl", ["Wind", "Vent"]], ["ocean", "waves crash and wash back", ["Waves", "Vagues"]],
    ["city", "distant city traffic hums", ["City", "Ville"]], ["crowd", "a crowd murmurs", ["Crowd", "Foule"]], ["birds", "birds chirp", ["Birds", "Oiseaux"]],
    ["forest", "leaves rustle in the trees", ["Forest", "Forêt"]], ["steps", "footsteps echo", ["Footsteps", "Pas"]], ["fire", "a fire crackles", ["Fire", "Feu"]],
    ["thunder", "thunder rumbles in the distance", ["Thunder", "Tonnerre"]], ["cafe", "cups clink in a busy café", ["Café", "Café"]], ["room", "a quiet room tone hums", ["Room tone", "Ambiance pièce"]],
    ["engine", "an engine roars", ["Engine", "Moteur"]], ["night", "crickets chirp in the night", ["Night", "Nuit"]]];
const MUSIC = [["piano", "Soft piano", ["Piano", "Piano"]], ["strings", "Sustained strings", ["Strings", "Cordes"]], ["orch", "An epic orchestral score", ["Epic orchestral", "Orchestral épique"]],
    ["synth", "A retro synthwave track", ["Synthwave", "Synthwave"]], ["lofi", "A lo-fi hip-hop beat", ["Lo-fi", "Lo-fi"]], ["guitar", "Fingerpicked acoustic guitar", ["Acoustic guitar", "Guitare acoustique"]],
    ["ambient", "Ambient pads", ["Ambient", "Ambient"]], ["jazz", "A brushed jazz trio", ["Jazz", "Jazz"]], ["electro", "A pulsing electronic beat", ["Electronic", "Électro"]],
    ["rock", "Driving electric guitars and drums", ["Rock", "Rock"]], ["celtic", "A Celtic fiddle and bodhrán", ["Celtic", "Celtique"]]];
const TEMPOS = [["slow", ["slow", "lent"]], ["moderate", ["moderate", "modéré"]], ["fast", ["fast", "rapide"]]];
const DYNAMICS = [["steady", ", steady throughout", ["steady", "constant"]], ["build", ", gradually building up", ["builds up", "monte"]], ["fade", ", fading out at the end", ["fades out", "s'éteint"]],
    ["swell", ", swelling on the cut", ["swells on the cut", "monte sur la coupe"]], ["stop", ", stopping abruptly at the end", ["stops abruptly", "s'arrête net"]]];
const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(3).padStart(6, "0")}`;
const speakersIn = (txt) => [...new Set([...String(txt || "").matchAll(/\(S(\d+)\)/g)].map((m) => +m[1]))].sort((a, b) => a - b);
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);
const joinAnd = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

function helperBuild(id, d, ctx) {
    if (id === "shot") {
        const tr = TRANS.find((x) => x[0] === d.trans) || TRANS[0];
        return ` [Shot ${ctx.nextShot}] At ${mmss(+d.time)}, the camera ${tr[1]} a ${d.frame} ${(d.what || "").trim() || "of …"}${/[.!?]$/.test((d.what || "").trim()) ? "" : "."} `;
    }
    if (id === "cam") {
        const mv = CAM_MOVES.find((x) => x[0] === d.move) || CAM_MOVES[0];
        const tg = (d.target || "").trim();
        const direct = ["arc", "track"].includes(d.move);
        let t = `The camera ${mv[1]}` + (direct ? " " + (tg || (d.move === "arc" ? "the subject" : "the subject")) : "");
        if (!["static", "shake"].includes(d.move)) { if (d.amp !== "normal") t += ` with ${d.amp} amplitude`; if (d.speed !== "normal") t += ` at ${d.speed} speed`; }
        if (tg && !direct) t += (d.move === "static" || d.move === "shake" ? " as " : " toward ") + tg;
        return " " + t + ". ";
    }
    if (id === "talk") {
        const lang = d.lang || "English", words = (d.words || "").trim() || "…";
        const em = EMOTIONS.find((x) => x[0] === d.emotion) || EMOTIONS[0];
        let who;
        if (d.who === "new") {
            const n = ctx.nextSpeaker;
            const voice = [...(d.voice || []), d.pace && d.pace !== "measured" ? d.pace + "-paced" : ""].filter(Boolean);
            who = `the ${[d.age, d.gender].filter(Boolean).join(" ")}${voice.length ? ` with a ${voice.join(", ")} voice` : ""} (S${n})`;
        } else who = `(S${d.who})`;
        if (d.vo) return ` ${who} says in an off-screen voiceover: <d>[${lang}] ${words}</d> while ${d.gender === "woman" || d.gender === "girl" ? "her" : d.gender === "person" ? "their" : "his"} lips remain completely closed. `;
        return ` ${who} ${em[2]}: <d>[${lang}] ${words}</d> `;
    }
    if (id === "text") {
        const style = (d.style || "").trim();
        return ` a ${style ? style + " " : ""}${d.kind} reading "${(d.words || "").trim() || "TEXT"}" `;
    }
    if (id === "sound") {
        const ph = (d.sel || []).map((k) => SOUNDS.find((x) => x[0] === k)?.[1]).filter(Boolean);
        const extra = (d.extra || "").trim();
        if (!ph.length && !extra) return "";
        return cap(joinAnd(ph)) + (ph.length ? "." : "") + (extra ? (ph.length ? " " : "") + cap(extra) + (/[.!?]$/.test(extra) ? "" : ".") : "");
    }
    if (id === "music") {
        if (d.none) return "N/A";
        const g = MUSIC.find((x) => x[0] === d.genre) || MUSIC[0];
        const dy = DYNAMICS.find((x) => x[0] === d.dyn) || DYNAMICS[0];
        return `${g[1]} at a ${d.tempo} tempo${dy[1]}.` + ((d.extra || "").trim() ? " " + cap(d.extra.trim()) + (/[.!?]$/.test(d.extra.trim()) ? "" : ".") : "");
    }
    return "";
}

// ------------------------------------------------------------------ shared state
let MODELS = null, modelsAt = 0, modelsPoll = null;
// new model files show up in the lists without reloading the page (same lists as the server's, H3 files detected by content)
function applyModelOptions() {
    const O = MODELS?.options || {};
    for (const n of app.graph?._nodes || []) {
        if (!H3TYPES.includes(n.type)) continue;
        for (const [k, vals] of Object.entries(O)) {
            const w = n.widgets?.find((x) => x.name === k);
            if (!w || !w.options || !Array.isArray(vals) || !vals.length) continue;
            w.options.values = vals;
            if (!vals.includes(w.value)) w.value = vals.find((v) => v !== "none") ?? vals[0];
        }
    }
}
async function loadModels(force) {
    if (!force && MODELS && Date.now() - modelsAt < 8000) return MODELS;
    try { MODELS = await (await api.fetchApi("/enzino_h3/models")).json(); modelsAt = Date.now(); applyModelOptions(); } catch { }
    return MODELS;
}
let HISTORY = [];
let LORAS = null;
let REFMODS = null;
let SYS = null;
async function loadSys() { try { SYS = await (await api.fetchApi("/enzino_h3/system")).json(); } catch { SYS = { attention: [] }; } return SYS; }
async function loadRefmods(force) { if (REFMODS && !force) return REFMODS; try { REFMODS = await (await api.fetchApi("/enzino_h3/refmods")).json(); } catch { REFMODS = { installed: false, mods: [] }; } return REFMODS; }
const TRIG = {};
async function loadLoras(force) { if (LORAS && !force) return LORAS; try { LORAS = await (await api.fetchApi("/enzino_h3/loras")).json(); } catch { LORAS = { h3: [], other: [] }; } return LORAS; }
async function loraTriggers(name) { if (name in TRIG) return TRIG[name]; TRIG[name] = []; try { TRIG[name] = (await (await api.fetchApi("/enzino_h3/lora_info?name=" + encodeURIComponent(name))).json()).triggers || []; } catch { } return TRIG[name]; }
async function loadHistory() { try { HISTORY = await (await api.fetchApi("/enzino_h3/history")).json(); } catch { } return HISTORY; }
const H3TYPES = ["EnzinoH3Studio", "EnzinoH3Simple"];
const allNodes = () => (app.canvas?.graph?._nodes || []).filter((n) => H3TYPES.includes(n.type));
const refreshAll = () => { allNodes().forEach((n) => n.__h3?.refresh()); (app.graph?._nodes || []).forEach((n) => n.__h3paint?.()); };

async function upload(file) {
    const fd = new FormData();
    fd.append("image", file, file.name);
    fd.append("subfolder", "enzino_h3");
    fd.append("type", "input");
    const r = await (await api.fetchApi("/upload/image", { method: "POST", body: fd })).json();
    return (r.subfolder ? r.subfolder + "/" : "") + r.name;
}
function pickFile(accept, cb) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = accept;
    inp.onchange = () => { if (inp.files?.[0]) cb(inp.files[0]); };
    inp.click();
}

// ------------------------------------------------------------------ the card UI
function buildUI(node) {
    injectCSS();
    const root = document.createElement("div");
    root.className = "h3";
    const inner = document.createElement("div");
    inner.className = "h3-in";
    root.appendChild(inner);
    root.addEventListener("pointerdown", (e) => { if (e.target.closest("input,textarea,select,button,video,audio,a,.h3-slot,.h3-file")) e.stopPropagation(); });
    root.addEventListener("wheel", (e) => {
        if (e.target.closest("textarea,.h3-hist")) { e.stopPropagation(); return; }
        const col = e.target.closest(".h3-scroll");
        if (col && col.scrollHeight > col.clientHeight + 2 && !e.ctrlKey) e.stopPropagation();
    }, { passive: true });
    const ui = { root, inner, h: 900, dims: {}, status: "", busy: false, sel: null };
    node.properties = node.properties || {};
    node.__h3def = val(node, "prompt");

    const P = () => node.properties;
    const SIMPLE = node.type === "EnzinoH3Simple" || node.comfyClass === "EnzinoH3Simple";
    const layoutOf = () => SIMPLE ? "simple" : (["studio", "wide", "tall"].includes(P().h3_layout) ? P().h3_layout : "studio");
    if (!P().h3_lay2) { P().h3_layout = "studio"; P().h3_lay2 = 1; } // 2.4: everyone starts on the new landscape layout once
    const bodyH = () => ([620, 760, 900, 1060].includes(+P().h3_bodyh) ? +P().h3_bodyh : 900);   // L by default
    const adv = (id) => !!P().h3_adv?.[id];
    const toggleAdv = (id) => { P().h3_adv = { ...(P().h3_adv || {}), [id]: !adv(id) }; ui.refresh(); };

    // ---- Draft / Final (header)
    const DRAFT_KEYS = ["resolution", "speed", "upscale", "interpolate", "variations"];
    const isDraft = () => !!P().h3_draft;
    const setDraft = (on) => {
        if (on && !isDraft()) {
            P().h3_final = Object.fromEntries(DRAFT_KEYS.map((k) => [k, val(node, k)]));
            setVal(node, "resolution", "576p"); setVal(node, "speed", "turbo"); setVal(node, "upscale", "off"); setVal(node, "interpolate", "off");
            if (PRO) setVal(node, "variations", 4);
            P().h3_draft = true;
        } else if (!on && isDraft()) {
            const f = P().h3_final || { resolution: "768p", variations: 1 };
            for (const [k, v] of Object.entries(f)) setVal(node, k, v);
            if (val(node, "resolution") === "576p") setVal(node, "resolution", "768p");
            setVal(node, "variations", 1);
            P().h3_draft = false;
        }
        ui.refresh();
    };
    // ---- presets (Full)
    const PRESET_KEYS = ["aspect", "resolution", "custom_width", "custom_height", "custom_mp", "upscale", "upscaler", "speed", "steps", "sampler_name", "scheduler",
        "shift_on", "shift_video", "shift_audio", "duration", "style", "auto_header", "variations", "interpolate", "interp_model", "sign_on", "sign_text",
        "sign_pos", "sign_size", "sign_opacity", "social", "social_focus", "prompt_cache", "keep_loaded", "free_text_encoder", "attention",
        "sparse_attention", "sparse_tau", "tiled_decode", "ref_image_size", "folder", "loras", "torch_compile", "preview_every"];
    let PRESETS = { builtin: [], user: [] }, presetSel = "", presetSaving = false;
    const loadPresets = async () => { try { PRESETS = await (await api.fetchApi("/enzino_h3/presets")).json(); } catch { } ui.refresh(); };
    const presetsHTML = () => presetSaving
        ? `<div class="pre"><input data-pname placeholder="${L("Preset name", "Nom du preset")}" maxlength="80"><button class="b" data-a="psave">✓</button><button class="b" data-a="pcancel">✕</button></div>`
        : `<div class="pre"><select data-preset><option value="">★ Presets</option><optgroup label="Enzino">${PRESETS.builtin.map((p) => `<option value="b:${esc(p.name)}" ${presetSel === "b:" + p.name ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>
            ${PRESETS.user.length ? `<optgroup label="${L("Mine", "Les miens")}">${PRESETS.user.map((p) => `<option value="u:${esc(p.name)}" ${presetSel === "u:" + p.name ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>` : ""}</select>
            <button class="b" data-a="padd" title="${L("Save current settings", "Enregistrer les réglages actuels")}">＋</button><button class="b" data-a="pdel" ${presetSel.startsWith("u:") ? "" : "disabled"} title="${L("Delete preset", "Supprimer le preset")}">🗑</button></div>`;
    if (PRO) loadPresets();
    const fullLock = (icon, title, sub, id) => (SEC[id] = `<a class="h3-lock" href="${FULL_URL}" target="_blank" rel="noopener"><span class="ic">${icon}</span><span><b>${esc(title)}</b><small>${esc(sub)}</small></span><span class="sp"></span><span class="h3-full">✦ FULL</span></a>`);
    const getStory = () => { try { const a = JSON.parse(val(node, "story") || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
    const setStory = (a, refresh = true) => { setVal(node, "story", JSON.stringify(a)); if (refresh) ui.refresh(); };
    const getLoras = () => { try { const a = JSON.parse(val(node, "loras") || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
    const setLoras = (a, refresh = true) => { setVal(node, "loras", JSON.stringify(a)); if (refresh) ui.refresh(); };
    const getRefmods = () => { try { const a = JSON.parse(val(node, "refmods") || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
    const setRefmods = (a, refresh = true) => { setVal(node, "refmods", JSON.stringify(a)); if (refresh) ui.refresh(); };
    const getSocial = () => { try { return JSON.parse(val(node, "social") || "[]"); } catch { return []; } };

    // ---- prompt helper forms
    const hfCtx = () => { const pr = val(node, "prompt") || ""; const sp = speakersIn(pr); return { nextShot: lastShot(pr) + (/\[\s*Shot\s+1\s*\]/i.test(pr) ? 1 : 1), speakers: sp, nextSpeaker: (sp.length ? Math.max(...sp) : 0) + 1 }; };
    const openHelper = (id) => {
        const vo = id === "vo"; if (vo) id = "talk";
        if (ui.hf && ui.hf.id === id && (id !== "talk" || !!ui.hf.d.vo === vo)) { ui.hf = null; ui.refresh(); return; }
        const dur = framesFor(+val(node, "duration")) / FPS, c = hfCtx();
        const D = {
            shot: { time: Math.min(dur - 0.2, Math.max(0.5, dur * (c.nextShot - 1) / c.nextShot)), trans: "cut", frame: "medium shot", what: "" },
            cam: { move: "push", amp: "small", speed: "slow", target: "" },
            talk: { who: "new", age: "young", gender: "woman", voice: ["warm"], pace: "measured", emotion: "", lang: fr() ? "French" : "English", words: "", vo },
            text: { kind: "sign", style: "", words: "" },
            sound: { sel: [], extra: "" },
            music: { genre: "piano", tempo: "slow", dyn: "build", extra: "", none: false },
        };
        ui.hf = { id, d: D[id] };
        ui.refresh();
    };
    const hChips = (key, opts, multi) => `<div class="h3-chips">${opts.map((o) => { const v = o[0], lab = T2(o[o.length - 1]); const on = multi ? (ui.hf.d[key] || []).includes(v) : ui.hf.d[key] === v;
        return `<button class="h3-chip ${on ? "on" : ""}" data-hfk="${key}" data-hfv="${esc(v)}" ${multi ? 'data-hfm="1"' : ""}>${esc(lab)}</button>`; }).join("")}</div>`;
    const hText = (key, ph) => `<input class="h3-tx" data-hft="${key}" value="${esc(ui.hf.d[key] || "")}" placeholder="${esc(ph)}">`;
    const hRow = (label, inner2) => `<div class="h3-f"><label>${esc(label)}</label>${inner2}</div>`;
    const helperForm = () => {
        const { id, d } = ui.hf, c = hfCtx(), dur = framesFor(+val(node, "duration")) / FPS;
        let f = "", title = "";
        if (id === "shot") {
            title = L(`New shot · [Shot ${c.nextShot}]`, `Nouveau plan · [Shot ${c.nextShot}]`);
            f = hRow(L("Starts at", "Commence à"), `<div class="h3-sl"><input type="range" min="0.1" max="${Math.max(0.2, dur - 0.1).toFixed(1)}" step="0.1" value="${d.time}" data-hfr="time"><span class="v">${(+d.time).toFixed(1)} s</span></div>`)
                + hRow(L("Transition", "Transition"), hChips("trans", TRANS.map((x) => [x[0], x[2]])))
                + hRow(L("Framing", "Cadrage"), hChips("frame", FRAMES))
                + hRow(L("What we see", "Ce qu'on voit"), hText("what", L("of the keeper turning toward the sea", "of the keeper turning toward the sea (en anglais)")));
        } else if (id === "cam") {
            title = L("Camera move", "Mouvement de caméra");
            f = hRow(L("Move", "Mouvement"), hChips("move", CAM_MOVES.map((x) => [x[0], x[2]])))
                + (["static", "shake"].includes(d.move) ? "" : `<div class="h3-grid2">${hRow(L("Amplitude", "Amplitude"), hChips("amp", [["small", ["small", "petite"]], ["normal", ["normal", "normale"]], ["large", ["large", "grande"]]]))}
                   ${hRow(L("Speed", "Vitesse"), hChips("speed", [["slow", ["slow", "lente"]], ["normal", ["normal", "normale"]], ["fast", ["fast", "rapide"]]]))}</div>`)
                + hRow(d.move === "static" ? L("While…", "Pendant que…") : L("Toward / on (optional)", "Vers / sur (optionnel)"), hText("target", d.move === "static" ? "the runner exits the frame" : "her face"));
        } else if (id === "talk") {
            title = d.vo ? L("Voice-over", "Voix off") : L("Dialogue line", "Réplique");
            const whoOpts = [["new", [L(`New speaker (S${c.nextSpeaker})`, `Nouvelle voix (S${c.nextSpeaker})`), L(`New speaker (S${c.nextSpeaker})`, `Nouvelle voix (S${c.nextSpeaker})`)]], ...c.speakers.map((n) => [String(n), [`S${n}`, `S${n}`]])];
            f = hRow(L("Who speaks", "Qui parle"), hChips("who", whoOpts))
                + (d.who === "new" ? `<div class="h3-grid2">${hRow(L("Age", "Âge"), hChips("age", AGES))}${hRow(L("Who", "Qui"), hChips("gender", GENDERS))}</div>
                    ${hRow(L("Voice", "Voix"), hChips("voice", VOICES, true))}${hRow(L("Pace", "Débit"), hChips("pace", PACES))}` : "")
                + (d.vo ? "" : hRow(L("Tone", "Ton"), hChips("emotion", EMOTIONS.map((x) => [x[0], x[1]]))))
                + hRow(L("Language", "Langue"), `<select class="h3-sel" data-hfs="lang">${LANGS.map(([v, lb]) => `<option value="${v}" ${d.lang === v ? "selected" : ""}>${esc(lb)}</option>`).join("")}</select>`)
                + hRow(L("Exact words (kept as written)", "Texte exact (gardé tel quel)"), hText("words", L("I'll be back before dawn.", "Je reviens avant l'aube.")))
                + `<div class="h3-row" style="justify-content:space-between"><span>${L("Off-screen voice-over (lips closed)", "Voix off hors champ (bouche fermée)")}</span><button class="h3-sw ${d.vo ? "on" : ""}" data-hfb="vo"></button></div>`;
        } else if (id === "text") {
            title = L("On-screen text", "Texte à l'écran");
            f = hRow(L("Where", "Où"), hChips("kind", TEXT_KINDS)) + hRow(L("Look (optional)", "Style (optionnel)"), hText("style", "red glowing / chalk / bold white"))
                + hRow(L("Text (kept as written)", "Texte (gardé tel quel)"), hText("words", "OPEN 24/7"));
        } else if (id === "sound") {
            title = L("Soundscape · replaces the overall_soundscape line", "Ambiance · remplace la ligne overall_soundscape");
            f = hRow(L("Sounds", "Sons"), hChips("sel", SOUNDS.map((x) => [x[0], x[2]]), true)) + hRow(L("More (optional, in English)", "En plus (optionnel, en anglais)"), hText("extra", "a door creaks open"));
        } else if (id === "music") {
            title = L("Music · replaces the non_diegetic_music line", "Musique · remplace la ligne non_diegetic_music");
            f = `<div class="h3-row" style="justify-content:space-between"><span>${L("No background music", "Pas de musique de fond")}</span><button class="h3-sw ${d.none ? "on" : ""}" data-hfb="none"></button></div>`
                + (d.none ? "" : hRow(L("Style", "Style"), hChips("genre", MUSIC.map((x) => [x[0], x[2]]))) + `<div class="h3-grid2">${hRow(L("Tempo", "Tempo"), hChips("tempo", TEMPOS))}${hRow(L("Shape", "Évolution"), hChips("dyn", DYNAMICS.map((x) => [x[0], x[2]])))}</div>`
                    + hRow(L("More (optional, in English)", "En plus (optionnel, en anglais)"), hText("extra", "with a low cello drone")));
        }
        const setLine = id === "sound" || id === "music";
        return `<div class="h3-shot" style="border-color:rgba(242,166,90,.45)"><div class="hd"><b>${esc(title)}</b><button class="x" data-hfclose>✕</button></div>${f}
            <div class="h3-hdr" data-hfprev>${esc(helperBuild(id, d, c).trim() || "…")}</div>
            <div class="h3-row" style="justify-content:flex-end"><button class="h3-btn sm" data-hfclose>${L("Cancel", "Annuler")}</button><button class="h3-btn sm pri" data-hfins>${setLine ? L("✓ Set", "✓ Appliquer") : L("＋ Insert at cursor", "＋ Insérer au curseur")}</button></div></div>`;
    };
    const setField = (field, value) => {
        let v = val(node, "prompt") || "";
        const re = new RegExp(`^${field}:.*$`, "m");
        v = re.test(v) ? v.replace(re, `${field}: ${value}`) : v.replace(/\s*$/, "") + `\n\n${field}: ${value}`;
        setVal(node, "prompt", v);
    };

    // remember natural sizes of slot pictures (auto canvas preview)
    const dimsOf = (v) => {
        if (!v) return null;
        if (ui.dims[v]) return ui.dims[v];
        const im = new Image();
        im.onload = () => { ui.dims[v] = [im.naturalWidth, im.naturalHeight]; ui.refresh(); };
        im.src = inputUrl(v);
        return null;
    };

    // --------------------------------------------------------------- pieces
    const sw = (name, title = "") => `<button class="h3-sw ${val(node, name) ? "on" : ""}" data-sw="${name}" title="${esc(title)}"></button>`;
    let SEC = {};
    const sec = ({ id, icon, title, sub = "", toggle = null, body = "", advanced = "", right = "" }) => {
        const on = toggle ? !!val(node, toggle) : true;
        return SEC[id] = `<div class="h3-sec ${on ? "" : "off"}" data-sec="${id}">
          <div class="h3-sh"><span class="ic">${icon}</span><span class="t">${esc(title)}${sub ? `<small>${sub}</small>` : ""}</span>${right}${toggle ? sw(toggle, "ON / OFF") : ""}</div>
          <div class="h3-sb">${body}${advanced ? `<div class="h3-adv"><button data-adv="${id}">${adv(id) ? "▾" : "▸"} ${L("Advanced", "Avancé")}</button>${adv(id) ? `<div class="h3-sb">${advanced}</div>` : ""}</div>` : ""}</div></div>`;
    };
    const FMT = {};
    const slider = (name, min, max, step, fmt) => {
        const v = +val(node, name);
        if (fmt) FMT[name] = fmt;
        return `<div class="h3-sl"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-num="${name}"><span class="v">${fmt ? fmt(v) : v}</span></div>`;
    };
    const select = (name, labels) => {
        const w = W(node, name); if (!w) return "";
        const vs = w.options?.values || [];
        const lab = (x) => (labels?.[x] ? T2(labels[x]) : x);
        return `<select class="h3-sel" data-sel="${name}">${vs.includes(w.value) ? "" : `<option selected>${esc(w.value)}</option>`}${vs.map((x) => `<option value="${esc(x)}" ${x === w.value ? "selected" : ""}>${esc(lab(x))}</option>`).join("")}</select>`;
    };
    const mpSlider = () => {
        const v = +val(node, "custom_mp");
        return `<div class="h3-f">${slider("custom_mp", 0.3, 3, 0.05, (x) => mpTxt(+x) + (x > 1.06 ? " · " + L("beyond native", "au-delà du natif") : x >= 0.95 ? " · " + L("native", "natif") : ""))}
            <span class="h3-note">${v > 1.06 ? L("Above ~1 MP is beyond what H3 was trained on: more pixels and slower; past ~1.5 MP, faces and motion can start to fall apart. Upscaling a 1 MP render is often cleaner.", "Au-delà de ~1 MP, H3 sort de ce qu'il a appris : plus de pixels et plus lent ; après ~1,5 MP, visages et mouvement peuvent se dégrader. Upscaler un rendu à 1 MP est souvent plus propre.") : L("Same pixel count for every format.", "Même nombre de pixels pour tous les formats.")}</span></div>`;
    };
    const seg = (name, items) => `<div class="h3-seg">${items.map(([v, l]) => `<button class="${val(node, name) === v ? "on" : ""}" data-seg="${name}" data-v="${esc(v)}">${l}</button>`).join("")}</div>`;

    const imgSlot = (name, label, tag, cls = "") => {
        const v = val(node, name);
        if (v) dimsOf(v);
        return `<div class="h3-slot ${v ? "has" : ""} ${cls}" data-slot="${name}" data-accept="image/*">
            <div class="im">${v ? `<img src="${inputUrl(v)}" draggable="false"><button class="x" data-clear="${name}" title="${L("Remove", "Retirer")}">✕</button>`
                : `<div class="ph"><b>＋</b>${L("Drop or click", "Glisse ou clique")}</div>`}</div>
            <div class="bar"><span class="nm">${esc(label)}</span>${tag ? `<span class="tg">${esc(tag)}</span>` : ""}</div></div>`;
    };
    const fileSlot = (name, kind, label, tag) => {
        const v = val(node, name);
        const icon = kind === "video" ? "▶" : "♪";
        const media = !v ? "" : kind === "audio" ? `<audio controls src="${inputUrl(v)}" preload="none"></audio>` : "";
        return `<div class="h3-file ${v ? "has" : ""}" data-slot="${name}" data-accept="${kind}/*">
            <span class="ic">${icon}</span><span class="nm"><b>${v ? esc(baseName(v)) : esc(label)}</b><small>${v ? esc(tag || "") : L("Drop or click to add", "Glisse ou clique pour ajouter")}</small></span>
            ${media}${v ? `<button class="h3-btn sm" data-clear="${name}">✕</button>` : ""}</div>`;
    };

    // --------------------------------------------------------------- render
    ui.refresh = () => {
        const ae = document.activeElement;
        const keep = ae && inner.contains(ae) && ae.dataset?.txt ? { k: ae.dataset.txt, s: ae.selectionStart, e: ae.selectionEnd, t: ae.scrollTop } : null;
        const scroll = inner.querySelector(".h3-hist")?.scrollLeft || 0;
        render();
        if (keep) {
            const el = inner.querySelector(`[data-txt="${keep.k}"]`);
            if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch { } el.scrollTop = keep.t; }
        }
        const hs = inner.querySelector(".h3-hist"); if (hs) hs.scrollLeft = scroll;
        requestAnimationFrame(fit);
    };

    const render = () => {
        const mode = val(node, "mode");
        const refs = mode === "references";
        const dur = +val(node, "duration");
        const frames = framesFor(dur);
        const secs = frames / FPS;
        const anchorName = mode === "image" || mode === "first_last" ? val(node, "first_image") : mode === "last" ? val(node, "last_image") : refs ? (JSON.parse(val(node, "ref_images") || "[]")[0] || "") : "";
        const custom = val(node, "resolution") === "custom";
        const r32 = (v) => Math.max(256, Math.round((+v || 0) / 32) * 32);
        const [cw, ch] = custom ? [r32(val(node, "custom_width")), r32(val(node, "custom_height"))] : canvasSize(val(node, "aspect"), val(node, "resolution"), anchorName ? dimsOf(anchorName) : null, val(node, "custom_mp"));
        const [fw, fh] = finalSize(cw, ch, val(node, "upscale"));
        const turbo = val(node, "speed") === "turbo";
        const loraName = val(node, refs ? "turbo_references" : "turbo_keyframes") || "";
        const scv = val(node, "step_cache");
        const cacheOn = scv === "light" || scv === "strong" || (scv === "auto" && !turbo);
        const autoSteps = turbo ? (/4[\W_]?step/i.test(loraName) ? 4 : 8) : (cacheOn ? 13 : 20);
        const steps = +val(node, "steps") || autoSteps;
        const prompt = val(node, "prompt") || "";

        SEC = {};
        const lay = layoutOf();
        const wide = lay !== "tall";
        const studio = lay === "studio";
        // ---------------- header
        const header = `<div class="h3-hd ${studio ? "compact" : ""}"><div class="mk">✦</div>
            <div class="tx"><div class="k">Enzino · H3 Studio</div><h1>MiniMax <span>H3</span></h1>
              <div class="sub">${L("Text, pictures & references → video with native stereo sound. One node.", "Texte, images & références → vidéo avec son stéréo natif. Un seul node.")}</div></div>
            <div class="sp"></div>
            ${PRO ? "" : `<a class="h3-getfull" href="${FULL_URL}" target="_blank" rel="noopener"><span>✦ ${L("Full edition", "Édition complète")} · ${FULL_PRICE}</span><small>${L("story mode · motion control · retouch · variations · 4K · 48/72 fps · signature & social formats · presets", "mode histoire · contrôle du mouvement · retouche · variations · 4K · 48/72 i/s · signature & formats réseaux · presets")}</small></a>`}
            <div class="ctl"><div class="modes"><button class="${isDraft() ? "on" : ""}" data-a="draft" title="${L("576p · Turbo · 4 variations · no upscale", "576p · Turbo · 4 variations · sans upscale")}">⚡ ${L("Draft", "Brouillon")}</button><button class="${isDraft() ? "" : "on"}" data-a="final" title="${L("back to your final settings", "retour à tes réglages finaux")}">✦ Final</button></div>
              ${PRO ? presetsHTML() : ""}
              <div class="st ${ui.busy ? "busy" : ""}"><i></i>${esc(ui.status || L(`Ready · ${cw}×${ch} · ${secs.toFixed(1)} s · ${steps} steps`, `Prêt · ${cw}×${ch} · ${secs.toFixed(1)} s · ${steps} steps`))}</div>
              <div class="by"><button class="h3-lay" data-a="layout" title="${L("Switch layout", "Changer la disposition")}">${{ studio: L("▣ Studio", "▣ Studio"), wide: L("▥ Columns", "▥ Colonnes"), tall: L("▤ Tall", "▤ Haute") }[lay]} ⇄</button>${studio ? ` <button class="h3-lay" data-a="bodyh" title="${L("Height of the node", "Hauteur du node")}">↕ ${{ 620: "S", 760: "M", 900: "L", 1060: "XL" }[bodyH()] || "L"}</button>` : ""} &nbsp;BY <a href="https://enzinoai.com" target="_blank" rel="noopener">ENZINO</a> · ENZINOAI.COM</div></div></div>`;

        const tabs = `<div class="h3-tabs">${MODES.map((m) => `<button class="h3-tab ${mode === m.id ? "on" : ""}" data-seg="mode" data-v="${m.id}"><span class="ic">${m.icon}</span><span><b>${T2(m.t)}</b><small>${T2(m.s)}</small></span></button>`).join("")}</div>`;

        // ---------------- left column
        let left = "";
        if (!refs) {
            const showFirst = mode === "image" || mode === "first_last";
            const showLast = mode === "first_last" || mode === "last";
            const midOn = !!val(node, "mid_on");
            const cols = [showFirst, midOn, showLast].filter(Boolean).length || 1;
            const midPct = Math.round(+val(node, "mid_position") * 100);
            const slots = [
                showFirst ? imgSlot("first_image", L("First frame", "Première image"), "0.00 s") : "",
                midOn ? imgSlot("mid_image", L("Mid keyframe", "Image-clé milieu"), `${(secs * +val(node, "mid_position")).toFixed(2)} s`) : "",
                showLast ? imgSlot("last_image", L("Last frame", "Dernière image"), `${secs.toFixed(2)} s`) : "",
            ].join("");
            const subs = { text: L("optional: anchor a picture in the middle", "optionnel : ancrer une image au milieu"), image: L("the video starts on this picture", "la vidéo démarre sur cette image"),
                first_last: L("H3 finds the motion between the two", "H3 trouve le mouvement entre les deux"), last: L("H3 invents the beginning and lands on it", "H3 invente le début et atterrit dessus") };
            left += sec({ id: "keys", icon: "▣", title: L("Keyframes", "Images-clés"), sub: subs[mode],
                right: SIMPLE ? "" : `<span class="h3-note" style="margin-right:6px">${L("Mid keyframe", "Image milieu")}</span>${sw("mid_on")}`,
                body: (cols && (showFirst || showLast || midOn) ? `<div class="h3-slots" style="grid-template-columns:repeat(${cols},1fr)">${slots}</div>` : `<div class="h3-note">${L("Text mode needs no picture. Turn on Mid keyframe to pin one image in the middle of the clip.", "Le mode Texte n'a besoin d'aucune image. Active Image milieu pour fixer une image au milieu du clip.")}</div>`)
                    + (midOn ? `<div class="h3-f"><label>${L("Mid keyframe position", "Position de l'image milieu")}</label>${slider("mid_position", 0.05, 0.95, 0.01, (v) => Math.round(v * 100) + " %")}</div>` : "")
                    + (showFirst || showLast ? `<div class="h3-note">${L("Tip: describe what moves, not the picture itself. H3 already sees it.", "Astuce : décris ce qui bouge, pas l'image elle-même. H3 la voit déjà.")}</div>` : ""),
            });
            void midPct;
        } else {
            let names = []; try { names = JSON.parse(val(node, "ref_images") || "[]"); } catch { }
            const tiles = names.map((n, i) => { dimsOf(n); return `<div class="h3-slot has sm" data-ref="${i}"><div class="im"><img src="${inputUrl(n)}" draggable="false"><button class="x" data-refdel="${i}">✕</button></div><div class="bar" style="justify-content:center"><button class="h3-chip tag" data-ins="&lt;Picture ${i + 1}&gt;">&lt;Picture ${i + 1}&gt;</button></div></div>`; }).join("");
            const add = names.length < 9 ? `<div class="h3-slot sm" data-refadd="1" data-accept="image/*"><div class="im"><div class="ph"><b>＋</b>${L("Add pictures", "Ajouter des images")}<br>${names.length}/9</div></div></div>` : "";
            const vSound = !!val(node, "ref_video_sound") && !!val(node, "ref_video");
            const audioTag = `<Audio ${vSound ? 2 : 1}>`;
            left += sec({ id: "refs", icon: "✦", title: L("References", "Références"), sub: L("up to 9 pictures, 1 video, 1 audio · cite them in the prompt", "jusqu'à 9 images, 1 vidéo, 1 audio · cite-les dans le prompt"),
                body: `<div class="h3-slots" style="grid-template-columns:repeat(4,1fr)">${tiles}${add}</div>
                    ${fileSlot("ref_video", "video", L("Reference video (motion, edit, continuation)", "Vidéo de référence (mouvement, montage, suite)"), "<Video 1>" + (vSound ? " · <Audio 1>" : ""))}
                    ${val(node, "ref_video") ? `<div class="h3-row" style="justify-content:space-between"><span class="h3-note">${L("Use the video's own sound as", "Utiliser le son de la vidéo comme")} &lt;Audio 1&gt;</span>${sw("ref_video_sound")}</div>` : ""}
                    ${fileSlot("ref_audio", "audio", L("Reference audio (voice, music, sound)", "Audio de référence (voix, musique, son)"), audioTag)}
                    <div class="h3-note">${L("Numbers follow the order above. Videos are conformed to 24 fps and cut at 15 s.", "La numérotation suit l'ordre ci-dessus. Les vidéos sont mises à 24 i/s et coupées à 15 s.")}</div>`,
                advanced: `<div class="h3-f"><label>${L("Reference picture size", "Taille des images de référence")}</label>${seg("ref_image_size", [["match", L("Match · fast", "Adaptée · rapide")], ["max", L("Max · best identity, slower", "Max · meilleure ressemblance, plus lent")]])}</div>`,
            });
            // ---- saved references (RefMod pack by Luisa)
            if (!REFMODS) loadRefmods().then(() => ui.refresh());
            const rms = getRefmods();
            const KIND = { image: L("image", "image"), video: L("video", "vidéo"), audio: "audio", bundle: L("image + audio", "image + audio") };
            let rbody = "";
            if (REFMODS && !REFMODS.installed) {
                rbody = `<div class="h3-note">${L("Load saved references (.safetensors) made with RefMod: a character, an outfit, a motion or a voice you reuse in every video, without picking the files again.", "Charge des références enregistrées (.safetensors) faites avec RefMod : un perso, une tenue, un mouvement ou une voix réutilisés dans chaque vidéo, sans reprendre les fichiers.")}</div>
                    <a class="h3-btn sm" href="${esc(REFMODS.repo)}" target="_blank" rel="noopener">↗ ${L("Install ComfyUI-MiniMaxH3Mod (by Luisa)", "Installer ComfyUI-MiniMaxH3Mod (par Luisa)")}</a>
                    <span class="h3-note">${L("Then restart ComfyUI: your RefMods appear here.", "Puis redémarre ComfyUI : tes RefMods apparaissent ici.")}</span>`;
            } else if (REFMODS) {
                const opts = (cur) => `<option value="">${L("— pick a RefMod —", "— choisis un RefMod —")}</option>${cur && !REFMODS.mods.some((m) => m.name === cur) ? `<option selected>${esc(cur)} ⚠</option>` : ""}${REFMODS.mods.map((m) => `<option value="${esc(m.name)}" ${m.name === cur ? "selected" : ""}>${esc(m.name)}${m.kind ? " · " + esc(KIND[m.kind] || m.kind) : ""}${m.tokens ? " · " + m.tokens + " tok" : ""}</option>`).join("")}`;
                rbody = (rms.map((x, i) => {
                    const info = REFMODS.mods.find((m) => m.name === x.name);
                    return `<div class="h3-shot" style="${x.on === false ? "opacity:.55" : ""}"><div class="hd"><select class="h3-sel" data-rmname="${i}" style="flex:1;min-width:0">${opts(x.name)}</select>
                        <button class="h3-sw ${x.on !== false ? "on" : ""}" data-rmon="${i}"></button><button class="x" data-rmdel="${i}">✕</button></div>
                        <div class="h3-row"><div class="h3-sl" style="flex:1"><input type="range" min="0" max="1" step="0.01" value="${+(x.strength ?? 1)}" data-rmstr="${i}"><span class="v">${(+(x.strength ?? 1)).toFixed(2)}</span></div>
                        <div class="h3-seg" style="flex:none">${[1, 2, 3].map((c) => `<button class="${(+x.copies || 1) === c ? "on" : ""}" data-rmcop="${i}:${c}" title="${L("copies: stronger, slower", "copies : plus fort, plus lent")}">×${c}</button>`).join("")}</div></div>
                        ${info?.description ? `<span class="h3-note">${esc(info.description)}</span>` : ""}</div>`;
                }).join("") || `<div class="h3-note">${REFMODS.mods.length ? L("Add a saved reference to reuse it.", "Ajoute une référence enregistrée pour la réutiliser.") : L("No RefMod found in models/refmods yet. Create them with the RefMod nodes.", "Aucun RefMod dans models/refmods pour l'instant. Crée-les avec les nodes RefMod.")}</div>`)
                    + `<div class="h3-row" style="justify-content:space-between">${rms.length < 8 ? `<button class="h3-btn sm pri" data-a="rmadd">＋ ${L("Add a RefMod", "Ajouter un RefMod")}</button>` : `<span class="h3-note">8 max</span>`}<button class="h3-chip" data-a="rmreload">↻</button></div>
                    ${rms.length ? `<div class="h3-f"><label>${L("Retention", "Rétention")}</label>${slider("refmod_retention", 0, 1, 0.01, (v) => (+v).toFixed(2) + (v >= 0.95 ? " · " + L("full", "complète") : v >= 0.6 ? " · " + L("partial", "partielle") : v >= 0.3 ? " · " + L("attributes", "attributs") : " · " + L("weak", "faible")))}</div>
                    <div class="h3-row" style="justify-content:space-between"><span>${L("Add the RefMods' descriptions to the prompt", "Ajouter les descriptions des RefMods au prompt")}</span>${sw("refmod_hint")}</div>` : ""}`;
            }
            left += sec({ id: "refmods", icon: "⧉", title: L("Saved references · RefMod", "Références enregistrées · RefMod"),
                sub: REFMODS?.installed ? `${rms.filter((x) => x.on !== false && x.name).length} ${L("active", "actif(s)")} · ${REFMODS.mods.length} ${L("available", "disponibles")}` : L("optional pack by Luisa", "pack optionnel de Luisa"), body: rbody });
        }

        // prompt
        const lang = fr() ? "French" : "English";
        const tags = refs ? (() => {
            let names = []; try { names = JSON.parse(val(node, "ref_images") || "[]"); } catch { }
            const t = names.map((_, i) => `<Picture ${i + 1}>`);
            const vs = !!val(node, "ref_video_sound") && !!val(node, "ref_video");
            if (val(node, "ref_video")) { if (vs) t.push("<Audio 1>"); t.push("<Video 1>"); }
            if (val(node, "ref_audio")) t.push(`<Audio ${vs ? 2 : 1}>`);
            t.push("<Subject 1>", "<Subject 2>");
            return t;
        })() : [];
        let hdr = "";
        if (val(node, "auto_header") && !refs && mode !== "text") {
            const n = lastShot(prompt);
            hdr = mode === "image" ? "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced."
                : mode === "first_last" ? `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot ${n}) aligns with the ${secs.toFixed(2)}-second mark of the target video.`
                    : `How the reference pictures align with the target video — <Picture 1> (from [Shot ${n}]) aligns with the ${secs.toFixed(2)}-second mark of the target video.`;
        }
        const styleOk = (s) => s === "none" || (MODELS?.files?.embeddings || []).includes(`minimaxh3_${s}.safetensors`);
        const st = val(node, "style");
        left += sec({ id: "prompt", icon: "✎", title: "Prompt", sub: refs ? L("official reference format · six sections", "format officiel références · six sections") : L("official H3 format · the keyframe header is added for you", "format officiel H3 · l'en-tête des images-clés est ajouté pour toi"),
            body: `<div class="h3-tools">
                    <button class="h3-chip" data-snip="tpl">⧉ ${L("Structure", "Structure")}</button>
                    ${[["shot", "🎬", L("Shot", "Plan")], ["cam", "🎥", L("Camera", "Caméra")], ["talk", "💬", L("Dialogue", "Dialogue")], ["vo", "🎙", L("Voice-over", "Voix off")],
                        ["text", "🔤", L("On-screen text", "Texte à l'écran")], ["sound", "🌊", L("Soundscape", "Ambiance")], ["music", "🎵", L("Music", "Musique")]]
                        .map(([k, ic, lb]) => `<button class="h3-chip ${ui.hf && (ui.hf.id === k || (k === "vo" && ui.hf.id === "talk" && ui.hf.d.vo)) ? "on" : ""}" data-help="${k}">${ic} ${lb}</button>`).join("")}
                  </div>
                  ${ui.hf ? helperForm() : ""}
                  ${tags.length ? `<div class="h3-chips">${tags.map((t) => `<button class="h3-chip tag" data-ins="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
                  ${hdr ? `<div class="h3-hdr"><b>AUTO</b>${esc(hdr)}</div>` : ""}
                  <textarea class="h3-ta" data-txt="prompt" spellcheck="false" placeholder="${L("Describe the shots, the motion, the voices and the sound…", "Décris les plans, le mouvement, les voix et le son…")}">${esc(prompt)}</textarea>
                  <div class="h3-row" style="justify-content:space-between"><span class="h3-note">${lastShot(prompt)} ${L("shot(s)", "plan(s)")} · ${prompt.length} ${L("characters", "caractères")} · <span title="${L("Dialogue language tag", "Balise de langue des dialogues")}">[${lang}]</span></span>
                    <span class="h3-row"><span class="h3-note">${L("Style", "Style")}</span><select class="h3-sel" style="width:170px;padding:4px 8px" data-sel="style">${(W(node, "style")?.options?.values || []).map((x) => `<option value="${x}" ${x === st ? "selected" : ""}>${esc(T2(STYLE_LABEL[x] || x))}${styleOk(x) ? "" : " ⬇"}</option>`).join("")}</select></span></div>
                  ${refs && prompt.trim() && !/subject_definitions|summary:|detailed_description/i.test(prompt) ? `<div class="h3-note" style="color:var(--acc)">${L("Tip: References work best with the six-section format. Click ⧉ Structure to start from it.", "Astuce : les Références marchent mieux avec le format en six sections. Clique ⧉ Structure pour partir de là.")}</div>` : ""}
                  ${!styleOk(st) ? `<div class="h3-warn">${L("This style file isn't installed: download it in ◆ Models (tiny).", "Ce style n'est pas installé : télécharge-le dans ◆ Modèles (léger).")}</div>` : ""}`,
            advanced: refs ? "" : `<div class="h3-row" style="justify-content:space-between"><span>${L("Write the keyframe header automatically", "Écrire l'en-tête des images-clés automatiquement")}</span>${sw("auto_header")}</div>`,
        });

        // ---------------- LoRAs
        {
            if (!LORAS) loadLoras().then(() => ui.refresh());
            const stack = getLoras();
            const maxL = PRO ? 8 : (ED.free_max_loras || 3);
            const active = stack.filter((x) => x.on !== false && x.name).length;
            const opt = (cur) => {
                const all = [...(LORAS?.h3 || []), ...(LORAS?.other || [])];
                const miss = cur && !all.includes(cur) ? `<option selected>${esc(cur)} ⚠</option>` : "";
                return `<option value="">${L("— pick a LoRA —", "— choisis une LoRA —")}</option>${miss}
                    ${LORAS?.h3?.length ? `<optgroup label="MiniMax H3">${LORAS.h3.map((n) => `<option value="${esc(n)}" ${n === cur ? "selected" : ""}>${esc(n)}</option>`).join("")}</optgroup>` : ""}
                    ${LORAS?.other?.length ? `<optgroup label="${L("Other", "Autres")}">${LORAS.other.map((n) => `<option value="${esc(n)}" ${n === cur ? "selected" : ""}>${esc(n)}</option>`).join("")}</optgroup>` : ""}`;
            };
            const rows = stack.map((x, i) => {
                const tr = x.name ? TRIG[x.name] : null;
                if (x.name && !(x.name in TRIG)) loraTriggers(x.name).then(() => ui.refresh());
                return `<div class="h3-shot" style="${x.on === false ? "opacity:.55" : ""}"><div class="hd"><select class="h3-sel" data-lname="${i}" style="flex:1;min-width:0">${opt(x.name)}</select>
                    <button class="h3-sw ${x.on !== false ? "on" : ""}" data-lon="${i}"></button><button class="x" data-ldel="${i}" title="${L("Remove", "Retirer")}">✕</button></div>
                    <div class="h3-sl"><input type="range" min="-1" max="2" step="0.05" value="${+(x.strength ?? 1)}" data-lstr="${i}"><span class="v">${(+(x.strength ?? 1)).toFixed(2)}</span></div>
                    ${tr && tr.length ? `<div class="h3-chips">${tr.map((t) => `<button class="h3-chip tag" data-ins="${esc(t)}" title="${L("insert in the prompt", "insérer dans le prompt")}">${esc(t)}</button>`).join("")}</div>` : ""}</div>`;
            }).join("");
            left += sec({ id: "loras", icon: "◈", title: "LoRAs", sub: active ? `${active} ${L("active", "active(s)")}` + (refs ? " · " + L("trained on the References model?", "entraînées sur le modèle Références ?") : "") : L("characters, styles, motions trained for MiniMax H3", "persos, styles, mouvements entraînés pour MiniMax H3"),
                right: `<button class="h3-chip" data-a="lreload" title="${L("Refresh the list", "Rafraîchir la liste")}">↻</button>`,
                body: `${rows || `<div class="h3-note">${L("No LoRA yet. Add one trained for MiniMax H3 (models/loras). The Turbo LoRA is handled separately in Render.", "Aucune LoRA. Ajoute une LoRA entraînée pour MiniMax H3 (models/loras). La LoRA Turbo est gérée à part, dans Rendu.")}</div>`}
                    <div class="h3-row" style="justify-content:space-between">${stack.length < maxL ? `<button class="h3-btn sm pri" data-a="ladd">＋ ${L("Add a LoRA", "Ajouter une LoRA")}</button>` : `<span class="h3-note">${maxL} LoRAs max${PRO ? "" : ` · <a class="h3-full" href="${FULL_URL}" target="_blank" rel="noopener">✦ FULL ${L("unlimited", "illimité")}</a>`}</span>`}
                    <span class="h3-note">${L("Click a trigger word to add it to the prompt", "Clique un mot déclencheur pour l'ajouter au prompt")}</span></div>` });
        }

        if (!refs) {
            left += sec({ id: "drive", icon: "♪", title: L("Your sound", "Ton son"), sub: L("drive the clip with a voice or a music track", "piloter le clip avec une voix ou une musique"), toggle: "drive_on",
                body: `${fileSlot("drive_audio", "audio", L("Voice, dialogue or music", "Voix, dialogue ou musique"), L("anchored at", "ancré à") + ` ${(+val(node, "drive_start")).toFixed(1)} s`)}
                    <div class="h3-f"><label>${L("Starts at", "Commence à")}</label>${slider("drive_start", 0, Math.max(0.5, secs - 0.5), 0.1, (v) => (+v).toFixed(1) + " s")}</div>
                    <div class="h3-note">${L("H3 keeps your audio and builds picture and lip-sync around it. Describe the speaker in the prompt.", "H3 garde ton audio et construit l'image et la synchro labiale autour. Décris la personne qui parle dans le prompt.")}</div>` });
        }

        {
            if (!SYS) loadSys().then(() => ui.refresh());
            const att = SYS?.attention || [];
            const attNow = val(node, "attention");
            const broken = SYS?.broken || {};
            const autoAtt = att.find((a) => a !== "comfy_kitchen_int8" && !broken[a]) || "default";
            const attReal = attNow === "auto" ? autoAtt : (broken[attNow === "int8" ? "comfy_kitchen_int8" : attNow] ? "default" : attNow);
            const ATTL = { sage: "SageAttention", sage3: "SageAttention 3 (RTX 50)", flash: "FlashAttention", comfy_kitchen_int8: "INT8 · Comfy Kitchen", int8: "INT8 · Comfy Kitchen", default: L("ComfyUI default", "Défaut ComfyUI") };
            const prof = val(node, "step_cache") === "strong" || (val(node, "sparse_attention") && +val(node, "sparse_tau") >= 1.6) ? "max" : (!val(node, "sparse_attention") && val(node, "step_cache") === "off") ? "quality" : "balanced";
            const vram = SYS?.vram_gb || 0;
            const lowV = vram && vram < 20;
            const w6 = (MODELS?.files?.diffusion_models || []).some((f) => /w6a8/i.test(f));
            const curModel = val(node, refs ? "model_references" : "model_keyframes") || "";
            const tip = lowV && !/w6a8/i.test(curModel) ? `<div class="h3-note" style="color:var(--acc)">💡 ${L(`Your GPU has ${vram} GB: the W6A8 model (16 GB) fits better than INT8 (21 GB) and renders faster.`, `Ta carte a ${vram} Go : le modèle W6A8 (16 Go) tient mieux que l'INT8 (21 Go) et rend plus vite.`)} ${w6 ? L("Pick it in ◆ Models.", "Choisis-le dans ◆ Modèles.") : L("Download it in ◆ Models (Advanced).", "Télécharge-le dans ◆ Modèles (Avancé).")}</div>` : "";
            left += sec({ id: "perf", icon: "⚙", title: L("Speed & memory", "Vitesse & mémoire"),
                sub: `${ATTL[attReal] || attReal}${val(node, "sparse_attention") ? " · sparse" : ""}${val(node, "prompt_cache") ? " · cache" : ""}${vram ? ` · ${esc(SYS.gpu || "GPU")} ${vram} GB` : ""}`,
                body: `<div class="h3-f"><label>${L("Speed profile", "Profil de vitesse")}</label>${`<div class="h3-seg">${[["quality", L("✦ Quality", "✦ Qualité")], ["balanced", L("◎ Balanced", "◎ Équilibré")], ["max", L("⚡ Max speed", "⚡ Vitesse max")]].map(([k2, l]) => `<button class="${prof === k2 ? "on" : ""}" data-prof="${k2}">${l}</button>`).join("")}</div>`}
                    <span class="h3-note">${prof === "quality" ? L("Fastest exact attention installed, no sparse attention, preview every step.", "Attention exacte la plus rapide installée, sans attention sparse, aperçu à chaque step.")
                        : prof === "balanced" ? L("Fast attention + light sparse attention (only on long clips) + prompt cache.", "Attention rapide + attention sparse légère (seulement sur les longs clips) + cache du prompt.")
                        : L("Fastest attention, stronger sparse attention, 4-step Turbo LoRA if installed, preview every 2 steps.", "Attention la plus rapide, attention sparse plus forte, LoRA Turbo 4 steps si installée, aperçu tous les 2 steps.")}</span></div>
                    <div class="h3-f"><label>${L("Attention", "Attention")}</label><select class="h3-sel" data-sel="attention">${["auto", "default", ...att.map((a) => (a === "comfy_kitchen_int8" ? "int8" : a))].map((a) => `<option value="${a}" ${attNow === a ? "selected" : ""}>${a === "auto" ? `Auto · ${esc(ATTL[autoAtt] || L("ComfyUI default", "Défaut ComfyUI"))}` : esc(ATTL[a] || a)}</option>`).join("")}</select>
                      ${!att.length ? `<span class="h3-note">${L("Install SageAttention in your ComfyUI Python to roughly double attention speed (pip install sageattention).", "Installe SageAttention dans le Python de ComfyUI pour environ doubler la vitesse de l'attention (pip install sageattention).")}</span>` : ""}
                      ${Object.keys(broken).length ? `<span class="h3-note" style="color:var(--acc)">⚠ ${L("Failed on your setup, PyTorch attention used instead:", "Incompatible avec ta config, attention PyTorch utilisée à la place :")} ${Object.keys(broken).map((b) => esc(ATTL[b] || b)).join(", ")}</span>` : ""}</div>
                    <div class="h3-row" style="justify-content:space-between"><span><b>${L("Sparse attention", "Attention sparse")}</b><br><span class="h3-note">${L("native H3 sol-attn · skips unimportant attention on long clips", "sol-attn natif H3 · saute l'attention inutile sur les longs clips")}</span></span>${sw("sparse_attention")}</div>
                    ${val(node, "sparse_attention") ? `<div class="h3-f"><label>${L("Sparsity", "Intensité")} (tau)</label>${slider("sparse_tau", 0.8, 2.0, 0.05, (v) => (+v).toFixed(2) + (v >= 1.6 ? " · " + L("fast", "rapide") : v <= 1.1 ? " · " + L("safe", "sûr") : ""))}</div>` : ""}
                    <div class="h3-row" style="justify-content:space-between"><span><b>${L("Prompt cache", "Cache du prompt")}</b><br><span class="h3-note">${L("same prompt & pictures: the 32B text encoder is skipped", "même prompt et images : l'encodeur 32B est sauté")}</span></span>${sw("prompt_cache")}</div>
                    <div class="h3-f"><label>${L("Step cache", "Cache des steps")} <span class="h3-note">· EasyCache</span></label>${seg("step_cache", [["auto", "Auto"], ["off", L("Off", "Non")], ["light", L("Light", "Léger")], ["strong", L("Strong", "Fort")]])}
                      <span class="h3-note">${L("Skips the steps whose result barely changes (about 4 out of 13 in Full). Auto: on with ✦ Full, off with ⚡ Turbo.", "Saute les steps dont le résultat change à peine (environ 4 sur 13 en Full). Auto : actif en ✦ Full, coupé en ⚡ Turbo.")}</span></div>
                    <div class="h3-f"><label>${L("Low VRAM", "Faible VRAM")}</label>${seg("low_vram", [["auto", "Auto"], ["on", L("On", "Oui")], ["off", L("Off", "Non")]])}
                      <span class="h3-note">${L("Feed-forward in 4 chunks: same result, ~4 GB less VRAM at peak. Auto: on under 20 GB.", "Feed-forward en 4 morceaux : même résultat, ~4 Go de VRAM en moins au pic. Auto : actif sous 20 Go.")}</span></div>
                    <div class="h3-row" style="justify-content:space-between"><span><b>${L("Keep models loaded", "Garder les modèles chargés")}</b><br><span class="h3-note">${L("next run starts without reloading ~40 GB", "le rendu suivant démarre sans recharger ~40 Go")}</span></span>${sw("keep_loaded")}</div>
                    ${tip}`,
                advanced: `<div class="h3-f"><label>${L("Live preview", "Aperçu en direct")}</label>${seg("preview_every", [[1, L("every step", "chaque step")], [2, L("every 2", "tous les 2")], [0, L("off", "désactivé")]])}</div>
                    <div class="h3-row" style="justify-content:space-between"><span>${L("torch.compile (needs Triton · first run slower, then faster)", "torch.compile (Triton requis · 1er rendu plus lent, ensuite plus rapide)")}</span>${sw("torch_compile")}</div>
                    <div class="h3-row" style="justify-content:space-between"><span>${L("Always free the text encoder from RAM (done automatically when RAM is short)", "Toujours libérer l'encodeur de texte de la RAM (fait automatiquement si la RAM manque)")}</span>${sw("free_text_encoder")}</div>
                    <div class="h3-row" style="justify-content:space-between"><span>${L("Tiled VAE decode (long clips, low VRAM)", "Décodage VAE en tuiles (clips longs, peu de VRAM)")}</span>${sw("tiled_decode")}</div>
                    <button class="h3-btn sm" data-a="free">🧹 ${L("Free memory now", "Libérer la mémoire maintenant")}</button>` });
        }
        // ---------------- Full: story mode & control
        if (!refs) {
            if (!PRO) {
                left += fullLock("☰", L("Story mode", "Mode histoire"), L("chain up to 12 shots into one long video, sound included", "enchaîne jusqu'à 12 plans en une longue vidéo, son compris"), "story");
                left += fullLock("✋", L("Motion control & retouch", "Contrôle du mouvement & retouche"), L("copy a pose / depth video · regenerate a zone of a clip", "copie une vidéo de pose / profondeur · regénère une zone d'un clip"), "control");
            } else {
                const shots = getStory();
                const total = secs + shots.reduce((a, x) => a + framesFor(+x.duration || 5) / FPS - 1 / FPS, 0);
                const storyOn = !!val(node, "story_on") && val(node, "control_mode") !== "retouch";
                left += sec({ id: "story", icon: "☰", title: L("Story mode", "Mode histoire"),
                    sub: storyOn ? `${shots.length + 1} ${L("shots", "plans")} · ≈ ${total.toFixed(1)} s` : L("chain shots into one long video", "enchaîne des plans en une longue vidéo"), toggle: "story_on",
                    body: `<div class="h3-note">${L("Shot 1 is the prompt above. Each next shot starts on the last frame of the previous one; the sound is joined.", "Le plan 1 est le prompt ci-dessus. Chaque plan suivant démarre sur la dernière image du précédent ; le son est raccordé.")}</div>
                        ${shots.map((x, i) => `<div class="h3-shot"><div class="hd"><b>${L("Shot", "Plan")} ${i + 2}</b>
                            <div class="h3-chips">${[3, 5, 8, 10, 15].map((d) => `<button class="h3-chip ${+x.duration === d ? "on" : ""}" data-sdur="${i}:${d}">${d} s</button>`).join("")}</div>
                            <button class="x" data-smove="${i}:-1" title="↑">↑</button><button class="x" data-smove="${i}:1" title="↓">↓</button><button class="x" data-sdel="${i}" title="${L("Remove", "Retirer")}">✕</button></div>
                            <textarea class="h3-ta" data-story="${i}" spellcheck="false" placeholder="integrated_multimodal_description: [Shot 1] ${L("What happens next…", "Ce qui se passe ensuite…")}">${esc(x.prompt || "")}</textarea></div>`).join("")}
                        ${shots.length < 11 ? `<button class="h3-btn sm" data-a="saddshot">＋ ${L("Add a shot", "Ajouter un plan")}</button>` : ""}` });

                const cm = val(node, "control_mode");
                let cbody = seg("control_mode", [["off", L("Off", "Non")], ["motion", L("✋ Motion control", "✋ Contrôle du mouvement")], ["retouch", L("✂ Retouch", "✂ Retouche")]]);
                if (cm === "motion") {
                    cbody += `${fileSlot("control_video", "video", L("Control video (pose, depth, or any clip)", "Vidéo de contrôle (pose, profondeur ou n'importe quel clip)"), val(node, "control_type") === "canny" ? "Canny" : L("used as is", "utilisée telle quelle"))}
                        ${seg("control_type", [["as_is", L("Pose / depth video", "Vidéo de pose / profondeur")], ["canny", L("Any video → edges", "N'importe quelle vidéo → contours")]])}
                        <div class="h3-f"><label>${L("Strength", "Intensité")}</label>${slider("control_strength", 0, 2, 0.05, (v) => (+v).toFixed(2))}</div>
                        <div class="h3-note">${L("H3 follows the motion of the control video while your prompt and pictures set the look. Make pose/depth videos with any preprocessor, or pick Canny for a plain clip.", "H3 suit le mouvement de la vidéo de contrôle, ton prompt et tes images donnent le rendu. Fais les vidéos de pose/profondeur avec n'importe quel préprocesseur, ou choisis Canny pour un clip normal.")}</div>`;
                } else if (cm === "retouch") {
                    const src = val(node, "retouch_source");
                    let bx = { x: 0.3, y: 0.2, w: 0.4, h: 0.5 }; try { bx = { ...bx, ...JSON.parse(val(node, "retouch_box") || "{}") }; } catch { }
                    const rs = +val(node, "retouch_start"), re_ = +val(node, "retouch_end"), dmax = Math.max(0.5, ui.rtDur || 15);
                    cbody += `${fileSlot("retouch_source", "video", L("Video to retouch", "Vidéo à retoucher"), L("the length follows this video", "la durée suit cette vidéo"))}
                        ${src ? `<div class="h3-rt" data-rt><video src="${inputUrl(src)}" muted playsinline preload="metadata" data-rtv></video>
                            <div class="bx" data-rtbox style="left:${bx.x * 100}%;top:${bx.y * 100}%;width:${bx.w * 100}%;height:${bx.h * 100}%"><span>${L("regenerated", "regénéré")}</span><i data-rtres></i></div></div>
                          <div class="h3-note">${L("Drag the box over the zone to change, describe the new content in the prompt.", "Place le cadre sur la zone à changer et décris le nouveau contenu dans le prompt.")}</div>
                          <div class="h3-grid2"><div class="h3-f"><label>${L("From", "De")}</label>${slider("retouch_start", 0, dmax, 0.1, (v) => (+v).toFixed(1) + " s")}</div>
                          <div class="h3-f"><label>${L("To", "À")}</label>${slider("retouch_end", 0, dmax, 0.1, (v) => (+v).toFixed(1) + " s")}</div></div>
                          ${rs >= re_ ? `<div class="h3-warn">${L("“From” must be before “To”.", "« De » doit être avant « À ».")}</div>` : ""}
                          <div class="h3-row" style="justify-content:space-between"><span>${L("Keep the original sound", "Garder le son d'origine")}</span>${sw("retouch_keep_sound")}</div>` : ""}
                        <div class="h3-f"><label>${L("Strength", "Intensité")}</label>${slider("control_strength", 0, 2, 0.05, (v) => (+v).toFixed(2))}</div>`;
                }
                left += sec({ id: "control", icon: "✋", title: L("Motion control & retouch", "Contrôle du mouvement & retouche"),
                    sub: cm === "off" ? L("follow a motion video, or regenerate part of a clip", "suivre une vidéo de mouvement ou regénérer une partie d'un clip") : cm === "motion" ? L("following the control video", "suit la vidéo de contrôle") : L("regenerating the box, the rest is kept", "regénère le cadre, le reste est gardé"),
                    body: cbody, advanced: cm !== "off" ? `<div class="h3-f"><label>${L("Control until", "Contrôle jusqu'à")}</label>${slider("control_end", 0.1, 1, 0.05, (v) => Math.round(v * 100) + " %")}</div>` : "" });
            }
        }

        // ---------------- right column
        let right = "";
        right += sec({ id: "dur", icon: "◷", title: L("Duration", "Durée"), sub: `${frames} ${L("frames", "images")} · ${secs.toFixed(2)} s · 24 fps`,
            body: `${slider("duration", 1, 15, 0.5, (v) => (+v).toFixed(1) + " s")}
                <div class="h3-chips">${[3, 5, 8, 10, 12, 15].map((s) => `<button class="h3-chip ${+dur === s ? "on" : ""}" data-dur="${s}">${s} s</button>`).join("")}</div>
                ${dur < 5 ? `<div class="h3-note">${L("H3 is trained on 5 to 15 s: very short clips are less reliable.", "H3 est entraîné de 5 à 15 s : les clips très courts sont moins fiables.")}</div>` : ""}` });

        const asp = val(node, "aspect");
        const bw = cw >= ch ? 48 : Math.round(48 * cw / ch), bh = cw >= ch ? Math.round(48 * ch / cw) : 48;
        const res = val(node, "resolution"), up = val(node, "upscale"), short = parseInt(res);
        const resLab = { "480p": L("fast draft", "brouillon rapide"), "576p": L("draft", "brouillon"), "640p": L("preview", "aperçu"), "720p": "HD",
            "768p": L("native · best", "natif · idéal"), "896p": L("beyond native", "au-delà du natif"), "1024p": L("beyond native", "au-delà du natif"), "1080p": "Full HD" };
        right += sec({ id: "fmt", icon: "▭", title: L("Format & resolution", "Format & résolution"), sub: up !== "off" ? `${cw} × ${ch} → ${fw} × ${fh}` : `${cw} × ${ch}`,
            body: `${custom ? "" : `<div class="h3-chips">${["auto", ...Object.keys(ASPECTS)].map((a) => `<button class="h3-chip ${asp === a ? "on" : ""}" data-seg="aspect" data-v="${a}">${a === "auto" ? L("Auto · from picture", "Auto · d'après l'image") : a}</button>`).join("")}</div>`}
                <div class="h3-f"><label>${L("Pixel budget", "Budget de pixels")} <span style="text-transform:none;letter-spacing:0;font-weight:500">· ${L("same pixels for every format, like the official H3 selector", "mêmes pixels pour tous les formats, comme le sélecteur officiel H3")}</span></label>
                  <div class="h3-chips">${(W(node, "resolution")?.options?.values || []).map((r) => `<button class="h3-chip ${res === r ? "on" : ""}" data-seg="resolution" data-v="${r}" title="${esc((r === "custom" ? "" : r + " · ") + (resLab[r] || ""))}">${r === "custom" ? "✎ " + L("W × H", "L × H") : r === "custom_mp" ? "✎ " + (res === "custom_mp" ? mpTxt(+val(node, "custom_mp")) : L("Custom MP", "MP perso")) : (mpOf(r) < 1 ? mpOf(r).toFixed(2) : mpOf(r).toFixed(1)) + " MP"}${r === "768p" ? " ★" : ""}</button>`).join("")}</div>
                  ${res === "custom_mp" ? mpSlider() : ""}
                  ${custom ? `<div class="h3-row"><input class="h3-tx" type="number" step="32" min="256" max="4096" data-int="custom_width" value="${val(node, "custom_width")}" title="${L("Width", "Largeur")}"><span class="h3-note">×</span><input class="h3-tx" type="number" step="32" min="256" max="4096" data-int="custom_height" value="${val(node, "custom_height")}" title="${L("Height", "Hauteur")}"><button class="h3-btn" data-a="swap" title="${L("Swap width / height", "Inverser largeur / hauteur")}">⇄</button></div>
                    <div class="h3-chips">${[["1344×768", 1344, 768], ["768×1344", 768, 1344], ["1024×1024", 1024, 1024], ["1280×720", 1280, 720], ["1920×1088", 1920, 1088], ["1536×640", 1536, 640]].map(([l, w, h]) => `<button class="h3-chip ${cw === w && ch === h ? "on" : ""}" data-wh="${w}x${h}">${l}</button>`).join("")}</div>` : ""}
                  <span class="h3-note">${custom ? `${L("Any size, rounded to multiples of 32", "N'importe quelle taille, arrondie au multiple de 32")} · ${(cw * ch / 1e6).toFixed(2)} MP${cw * ch > 768 * 1344 * 1.05 ? " · " + L("bigger than H3's native 768×1344 area: slower, may drift", "plus grand que la surface native H3 (768×1344) : plus lent, peut dériver") : ""}` : esc(resLab[res] || "")}${custom ? "" : short > 768 ? " · " + L("H3 is trained at 768p: higher can drift, needs more VRAM and time. Upscale is safer.", "H3 est entraîné en 768p : au-dessus ça peut dériver et demande plus de VRAM et de temps. L'upscale est plus sûr.") : !custom && short < 768 ? " · " + L("faster, softer", "plus rapide, plus doux") : ""}</span></div>
                <div class="h3-f"><label>${L("Upscale the result", "Agrandir le résultat")}</label>${seg("upscale", [["off", L("Off", "Non")], ["1080p", "1080p"], ["1440p", "1440p"], ...(PRO ? [["2160p", "4K"]] : [])])}${PRO ? "" : `<span class="h3-note">4K · 48/72 fps <a class="h3-full" href="${FULL_URL}" target="_blank" rel="noopener">✦ FULL</a></span>`}</div>
                ${up !== "off" ? `<div class="h3-f"><label>${L("Upscaler", "Upscaler")}</label>${select("upscaler", { rtx_vsr: ["⚡ NVIDIA RTX Video Super Resolution", "⚡ NVIDIA RTX Video Super Resolution"], lanczos: ["Lanczos (no model)", "Lanczos (sans modèle)"] })}
                  ${val(node, "upscaler") === "rtx_vsr" ? `<span class="h3-note">${L("NVIDIA's video AI upscaler: very fast, made for moving pictures.", "L'upscaler IA vidéo de NVIDIA : très rapide, fait pour l'image en mouvement.")}</span>`
                    : SYS && !SYS.rtx_vsr ? `<span class="h3-note">${L("Tip: install “ComfyUI Nvidia VFX Nodes” (ComfyUI Manager) to get NVIDIA RTX Video Super Resolution here.", "Astuce : installe « ComfyUI Nvidia VFX Nodes » (ComfyUI Manager) pour avoir NVIDIA RTX Video Super Resolution ici.")}</span>` : ""}</div>` : ""}
                <div class="h3-size"><span class="bx"><i style="width:${bw}px;height:${bh}px"></i></span><span><b>${up !== "off" ? `${fw} × ${fh}` : `${cw} × ${ch}`}</b><small>${up !== "off" ? `${L("rendered at", "rendu en")} ${cw} × ${ch} · ${L("upscaled frame by frame", "agrandi image par image")}` : custom ? L("custom size", "taille personnalisée") : res === "custom_mp" ? `${mpTxt(+val(node, "custom_mp"))} · ${L("your pixel budget", "ton budget de pixels")}` : short === 768 ? L("native H3 canvas · best quality", "canevas natif H3 · meilleure qualité") : `${(cw * ch / 1e6).toFixed(2)} MP`}${!custom && asp === "auto" ? (anchorName ? ` · ${L("picture ratio", "ratio de l'image")}` : ` · ${L("16:9 without picture", "16:9 sans image")}`) : ""}</small></span></div>` });

        const seedCtl = W(node, "control_after_generate") || node.widgets?.find((w) => w.name?.startsWith?.("control_after"));
        const locked = seedCtl ? seedCtl.value === "fixed" : false;
        right += sec({ id: "render", icon: "▶", title: L("Render", "Rendu"), sub: `${steps} steps · ${turbo ? "⚡ Turbo LoRA" : L("✦ Full quality", "✦ Qualité max")}`,
            body: `${seg("speed", [["turbo", L("⚡ Turbo · fast", "⚡ Turbo · rapide")], ["full", L("✦ Full · 20 steps", "✦ Full · 20 steps")]])}
                <div class="h3-f"><label>${L("Variations", "Variations")} ${PRO ? "" : `<a class="h3-full" href="${FULL_URL}" target="_blank" rel="noopener">✦ FULL</a>`}</label>${PRO ? seg("variations", [[1, "1"], [2, "2"], [3, "3"], [4, "4"]]) : `<div class="h3-seg"><button class="on">1</button></div>`}
                  ${PRO && +val(node, "variations") > 1 ? `<span class="h3-note">${L("seeds", "seeds")} ${val(node, "seed")} → ${+val(node, "seed") + +val(node, "variations") - 1} · ${L("pick the best, then ✦ Final from it", "choisis la meilleure, puis ✦ Final à partir d'elle")}${val(node, "story_on") ? " · " + L("off in story mode", "désactivé en mode histoire") : ""}</span>` : ""}</div>
                <div class="h3-f"><label>Seed</label><div class="h3-row"><input class="h3-tx" type="number" data-int="seed" value="${val(node, "seed")}"><button class="h3-btn" data-a="dice" title="${L("New seed", "Nouveau seed")}">🎲</button><button class="h3-btn ${locked ? "pri" : ""}" data-a="lock" title="${locked ? L("Seed locked", "Seed verrouillé") : L("New seed each run", "Nouveau seed à chaque lancement")}">${locked ? "🔒" : "🔓"}</button></div></div>`,
            advanced: `<div class="h3-f"><label>Steps <span style="text-transform:none;letter-spacing:0;font-weight:500">· ${L("0 = auto", "0 = auto")} (${autoSteps})</span></label>${slider("steps", 0, 40, 1, (v) => (+v ? v : "auto"))}</div>
                <div class="h3-grid2"><div class="h3-f"><label>Sampler</label>${select("sampler_name")}</div><div class="h3-f"><label>Scheduler</label>${select("scheduler")}</div></div>
                <div class="h3-row" style="justify-content:space-between"><span>${L("Custom sigma shift", "Sigma shift personnalisé")}</span>${sw("shift_on")}</div>
                ${val(node, "shift_on") ? `<div class="h3-grid2"><div class="h3-f"><label>${L("Video", "Vidéo")}</label>${slider("shift_video", 1, 30, 0.5)}</div><div class="h3-f"><label>Audio</label>${slider("shift_audio", 0.5, 10, 0.1)}</div></div>` : ""}` });

        if (PRO) {
            const pmOk = (k) => { const v = val(node, k); return v && v !== "none"; };
            const pReady = pmOk("polish_model") && pmOk("polish_te") && pmOk("polish_vae");
            const nFr = framesFor(dur) * (val(node, "story_on") ? Math.max(1, getStory().filter((x) => (x.prompt || "").trim()).length + 1) : 1);
            const pEst = Math.round(nFr * +val(node, "polish_steps") * 0.45 * (cw * ch) / (1344 * 768) / 6) * 6;
            right += sec({ id: "polish", icon: "✧", title: L("Krea 2 second pass", "2e passe Krea 2"), toggle: "polish_on",
                sub: val(node, "polish_on") ? `${L("denoise", "denoise")} ${(+val(node, "polish_denoise")).toFixed(2)} · ${val(node, "polish_steps")} steps · ${val(node, "polish_mode") === "texture" ? L("detail only", "détail seul") : L("full image", "image complète")}` : L("re-details every frame with Krea 2, motion untouched", "redétaille chaque image avec Krea 2, mouvement intact"),
                body: `${!pReady ? `<div class="h3-warn">${L("Needs a Krea 2 model, its text encoder and VAE: see ◆ Models (IntoRealism Krea 2 Flash is a great pick).", "Il faut un modèle Krea 2, son encodeur et son VAE : voir ◆ Modèles (IntoRealism Krea 2 Flash est idéal).")}</div>` : ""}
                    <div class="h3-f"><label>${L("Strength (denoise)", "Intensité (denoise)")}</label>${slider("polish_denoise", 0.05, 0.4, 0.01, (v) => (+v).toFixed(2) + (v <= 0.12 ? " · " + L("subtle", "subtil") : v <= 0.2 ? " · " + L("balanced", "équilibré") : " · " + L("strong", "fort")))}</div>
                    <div class="h3-f"><label>${L("What Krea 2 may change", "Ce que Krea 2 peut changer")}</label>${seg("polish_mode", [["texture", L("Fine detail only", "Détail fin seulement")], ["full", L("Whole image", "Image entière")]])}
                      <span class="h3-note">${val(node, "polish_mode") === "texture" ? L("Skin, hair, fabric texture from Krea 2. Colours, faces, shapes and motion stay exactly H3's.", "Texture de peau, cheveux, tissus par Krea 2. Couleurs, visages, formes et mouvement restent ceux de H3.") : L("Krea 2's frames as they come out: more realism, more risk of drift and flicker.", "Les images de Krea 2 telles quelles : plus de réalisme, plus de risque de dérive et de scintillement.")}</span></div>
                    <div class="h3-row" style="justify-content:space-between"><span><b>${L("Anti-flicker", "Anti-scintillement")}</b><br><span class="h3-note">${L("smooths the added detail over neighbour frames", "lisse le détail ajouté sur les images voisines")}</span></span>${sw("polish_stable")}</div>
                    <span class="h3-note">${L(`≈ ${pEst || 6} s on an RTX 5080 for this clip (${nFr} frames).`, `≈ ${pEst || 6} s sur une RTX 5080 pour ce clip (${nFr} images).`)}</span>`,
                advanced: `<div class="h3-f"><label>Steps</label>${seg("polish_steps", [[4, "4 · Flash"], [6, "6"], [8, "8 · Turbo"]])}</div>
                    <div class="h3-f"><label>${L("Polish prompt (optional)", "Prompt de finition (optionnel)")}</label><textarea class="h3-ta" data-txt="polish_prompt" style="min-height:70px" placeholder="${L("Empty: realistic skin, hair and fabric detail. Add a LoRA trigger or a look here.", "Vide : détail réaliste de peau, cheveux et tissus. Mets ici un mot-clé de LoRA ou un style.")}">${esc(val(node, "polish_prompt") || "")}</textarea></div>` });
            const soc = getSocial(), itp = val(node, "interpolate");
            right += sec({ id: "finish", icon: "✦", title: L("Finish", "Finition"), sub: [itp !== "off" ? `${24 * +itp.slice(1)} fps` : "24 fps", val(node, "sign_on") ? L("signed", "signé") : "", soc.length ? soc.join(" · ") : ""].filter(Boolean).join(" · "),
                body: `<div class="h3-f"><label>${L("Smoothness", "Fluidité")}</label>${seg("interpolate", [["off", "24 fps"], ["x2", "48 fps"], ["x3", "72 fps"]])}
                    ${itp !== "off" ? `${select("interp_model")}<span class="h3-note">${L("New frames are invented between the real ones: smoother motion, same duration and sound.", "Des images sont inventées entre les vraies : mouvement plus fluide, même durée et même son.")}</span>` : ""}</div>
                  <div class="h3-row" style="justify-content:space-between"><span><b>${L("Signature", "Signature")}</b></span>${sw("sign_on")}</div>
                  ${val(node, "sign_on") ? `<input class="h3-tx" data-txt="sign_text" value="${esc(val(node, "sign_text"))}" placeholder="@enzinoai">
                    ${seg("sign_pos", [["bottom-left", "↙"], ["bottom-center", "↓"], ["bottom-right", "↘"], ["top-left", "↖"], ["top-right", "↗"]])}
                    <div class="h3-grid2"><div class="h3-f"><label>${L("Size", "Taille")}</label>${slider("sign_size", 0.015, 0.1, 0.005, (v) => Math.round(v * 1000) / 10 + " %")}</div><div class="h3-f"><label>${L("Opacity", "Opacité")}</label>${slider("sign_opacity", 0.1, 1, 0.05, (v) => Math.round(v * 100) + " %")}</div></div>` : ""}
                  <div class="h3-f"><label>${L("Social formats (extra files)", "Formats réseaux (fichiers en plus)")}</label><div class="h3-chips">${["9:16", "1:1", "4:5", "16:9"].map((f) => `<button class="h3-chip ${soc.includes(f) ? "on" : ""}" data-soc="${f}">${f === "9:16" ? "9:16 · Reels" : f === "1:1" ? "1:1 · Feed" : f === "4:5" ? "4:5 · Portrait" : "16:9 · YouTube"}</button>`).join("")}</div>
                  ${soc.length ? `<div class="h3-f"><label>${L("Framing", "Cadrage")}</label>${slider("social_focus", 0, 1, 0.01, (v) => (v < 0.4 ? L("left", "gauche") : v > 0.6 ? L("right", "droite") : L("centre", "centre")))}</div>` : ""}</div>` });
        } else {
            right += fullLock("✧", L("Krea 2 second pass", "2e passe Krea 2"), L("re-details every frame with Krea 2, motion untouched", "redétaille chaque image avec Krea 2, mouvement intact"), "polish");
            right += fullLock("✦", L("Finish", "Finition"), L("48 / 72 fps · signature · Reels / Feed / YouTube formats · 4K", "48 / 72 i/s · signature · formats Reels / Feed / YouTube · 4K"), "finish");
        }

        right += modelsCard(refs);
        right += sec({ id: "save", icon: "⬇", title: L("Save", "Enregistrer"), sub: val(node, "save_on") ? `output/${esc(val(node, "folder"))}/${esc(val(node, "filename"))}_00001_.mp4` : L("preview only (temp)", "aperçu seulement (temp)"), toggle: "save_on",
            body: `<div class="h3-grid2"><div class="h3-f"><label>${L("Folder", "Dossier")}</label><input class="h3-tx" data-txt="folder" value="${esc(val(node, "folder"))}"></div>
                <div class="h3-f"><label>${L("File name", "Nom du fichier")}</label><input class="h3-tx" data-txt="filename" value="${esc(val(node, "filename"))}"></div></div>
                <div class="h3-note">${L("MP4 with sound · the workflow is embedded · the last frame is saved next to it.", "MP4 avec son · le workflow est intégré · la dernière image est enregistrée à côté.")}</div>` });

        // ---------------- output
        const cur = ui.sel || node.__h3last || null;
        const batch = (node.__h3batch || []).length > 1 ? node.__h3batch : null;
        const out = `<div class="h3-sec"><div class="h3-sh"><span class="ic">◉</span><span class="t">${L("Result", "Résultat")}<small>${cur ? `${esc(cur.date || "")} · ${T2(MODES.find((m) => m.id === cur.mode)?.t || cur.mode)}` : L("your video appears here, with its sound", "ta vidéo apparaît ici, avec son son")}</small></span></div>
          <div class="h3-sb"><div class="h3-out ${wide ? "v" : ""} ${wide && !SIMPLE && (() => { const pw = ui.live && ui.busy ? cw : cur ? cur.width : cw, ph = ui.live && ui.busy ? ch : cur ? cur.height : ch; return pw < ph; })() ? "port" : ""}">
            <div class="h3-player" data-player style="${(() => { const pw = ui.live && ui.busy ? cw : cur ? cur.width : cw, ph = ui.live && ui.busy ? ch : cur ? cur.height : ch; return pw >= ph ? `aspect-ratio:${pw}/${ph}` : `height:${studio ? Math.max(300, Math.min(520, bodyH() - 250)) : SIMPLE ? 500 : 560}px;aspect-ratio:${pw}/${ph};width:auto;max-width:100%`; })()}">${ui.live && ui.busy ? `<img data-live src="data:image/jpeg;base64,${ui.live.frames[0]}" style="width:100%;height:100%;object-fit:contain;image-rendering:auto"><span class="h3-livebadge">● LIVE · step ${ui.live.step}/${ui.live.total}</span><span class="h3-livebar" style="width:${Math.round(100 * ui.live.step / ui.live.total)}%"></span>` : cur ? `<video controls loop playsinline src="${viewUrl(cur.video, cur.date || "")}" poster="${cur.thumb ? viewUrl(cur.thumb) : ""}"></video>` : `<div class="ph"><b>▶</b>${L("Press Run", "Lance le rendu (Run)")}</div>`}</div>
            <div class="h3-side">
              ${batch ? `<div class="h3-lab">${L("Variations", "Variations")}</div><div class="h3-vars">${batch.map((b, i) => `<button class="${cur && cur.video?.filename === b.video?.filename ? "on" : ""}" data-var="${i}" title="seed ${b.seed}"><img src="${viewUrl(b.thumb)}"><span>${i + 1} · ${b.seed}</span></button>`).join("")}</div>
                <button class="h3-btn pri" data-a="finalseed">✦ ${L("Final from this one", "Final à partir de celle-ci")}</button>` : ""}
              ${cur ? `<div class="h3-meta">
                  <div><small>${L("Size", "Taille")}</small><b>${cur.width} × ${cur.height}</b></div><div><small>${L("Length", "Durée")}</small><b>${cur.seconds} s · ${cur.frames} fr</b></div>
                  <div><small>Steps</small><b>${cur.steps} · ${cur.speed === "turbo" ? "⚡" : "✦"}</b></div><div><small>${L("Render time", "Temps")}</small><b>${cur.time} s</b></div>
                  <div><small>Seed</small><b>${cur.seed}</b></div><div><small>${L("Frame rate", "Images/s")}</small><b>${cur.fps || 24} fps${cur.shots > 1 ? ` · ${cur.shots} ${L("shots", "plans")}` : ""}</b></div></div>
                ${(cur.socials || []).length ? `<div class="h3-chips">${cur.socials.map((x) => `<a class="h3-chip" href="${viewUrl(x)}" target="_blank" rel="noopener">${esc(x.format)} ↗</a>`).join("")}</div>` : ""}
                <div class="h3-acts">
                  <button class="h3-btn pri" data-a="chain" style="grid-column:span 2" title="${L("Next shot starts exactly where this one ends", "Le plan suivant démarre exactement où celui-ci finit")}">↪ ${L("Continue from last frame", "Continuer depuis la dernière image")}</button>
                  <a class="h3-btn sm" href="${viewUrl(cur.video)}" target="_blank" rel="noopener">↗ ${L("Open", "Ouvrir")}</a>
                  <a class="h3-btn sm" href="${viewUrl(cur.video)}" download="${esc(cur.video.filename)}">⬇ ${L("Download", "Télécharger")}</a>
                  <button class="h3-btn sm" data-a="useseed">🔒 ${L("Reuse seed", "Garder ce seed")}</button>
                  <button class="h3-btn sm" data-a="restore" ${cur.settings ? "" : "disabled"}>↺ ${L("Restore settings", "Restaurer réglages")}</button>
                  ${PRO ? `<button class="h3-btn sm" data-a="retouch" style="grid-column:span 2">✂ ${L("Retouch a zone of this video", "Retoucher une zone de cette vidéo")}</button>` : ""}
                </div>` : `<div class="h3-note">${L("After a render: play it with sound, continue the story from its last frame, reuse its seed or restore all its settings.", "Après un rendu : lis-le avec le son, continue l'histoire depuis sa dernière image, garde son seed ou restaure tous ses réglages.")}</div>`}
              ${HISTORY.length ? `<div class="h3-histbox"><div class="h3-row" style="justify-content:space-between"><span class="h3-lab">${L("History", "Historique")}</span><button class="h3-chip" data-a="clearhist">${L("Clear", "Vider")}</button></div>
              <div class="h3-hist">${HISTORY.map((h, i) => `<button class="${cur && cur.video?.filename === h.video?.filename ? "on" : ""}" data-hist="${i}" title="${esc(h.date)} · seed ${h.seed}"><img src="${viewUrl(h.thumb || h.last)}" loading="lazy"><span>${h.seconds}s</span></button>`).join("")}</div></div>` : ""}
            </div></div></div></div>`;

        const foot = `<div class="h3-foot"><span>✦ Enzino H3 Studio · MiniMax H3 ${L("native in ComfyUI", "natif dans ComfyUI")}</span><span><a href="https://ko-fi.com/enzinoxl/" target="_blank" rel="noopener">Ko-Fi</a> · <a href="https://enzinoai.com" target="_blank" rel="noopener">enzinoai.com</a></span></div>`;

        // ---------------- errors of the last run, in plain words, at the top of the node
        const verr = (app.lastNodeErrors?.[String(node.id)]?.errors || []).map((e) => `${e.message}${e.details ? " · " + e.details : ""}`);
        const allErr = [...verr, ...(ui.runError ? [ui.runError] : [])];
        const errBox = allErr.length ? `<div class="h3-sec" style="border-color:var(--bad);background:rgba(232,112,95,.08)"><div class="h3-sh"><span class="ic" style="background:rgba(232,112,95,.15);color:var(--bad)">!</span>
            <span class="t">${L("The last run stopped", "Le dernier lancement s'est arrêté")}<small>${L("fix this, then press Run again (the red frame goes away on the next good run)", "corrige ceci puis relance (le cadre rouge part au prochain lancement réussi)")}</small></span>
            <button class="h3-chip" data-a="errclear">✕</button></div>
            <div class="h3-sb">${allErr.slice(0, 8).map((m) => `<div class="h3-warn" style="font-size:11.5px">• ${esc(String(m).replace(/^\[Enzino H3 Studio\]\s*/, ""))}</div>`).join("")}${allErr.length > 8 ? `<span class="h3-note">+${allErr.length - 8}</span>` : ""}
            <div class="h3-row"><button class="h3-btn sm" data-a="errcopy">⧉ ${L("Copy the error", "Copier l'erreur")}</button><button class="h3-btn sm" data-a="resetall">↺ ${L("Reset every setting", "Réinitialiser tous les réglages")}</button></div></div></div>` : "";
        ui.errSig = JSON.stringify(allErr);
        const PT = [
            ["speed", "⚙", L("Speed · models", "Vitesse · modèles"), ["perf", "models"], (/file\(s\) missing|fichier\(s\) manquant/.test(SEC.models || "") ? "⚠ " + L("models missing", "modèles manquants") : L("ready", "prêt"))],
            ["clip", "◷", L("Clip", "Clip"), ["dur", "fmt", "render"], `${secs.toFixed(1)} s · ${cw}×${ch}`],
            ["look", "◈", L("LoRAs · sound", "LoRAs · son"), ["loras", "drive"], (() => { const n = getLoras().filter((x) => x.on !== false && x.name).length; return [n ? `${n} LoRA` : "", val(node, "drive_on") ? "♪" : ""].filter(Boolean).join(" · ") || L("off", "aucun"); })()],
            ["story", "☰", L("Story · motion", "Histoire · mouvement"), ["story", "control"], PRO ? ([val(node, "story_on") ? `${getStory().filter((x) => (x.prompt || "").trim()).length + 1} ${L("shots", "plans")}` : "", val(node, "control_mode") !== "off" ? L("control", "contrôle") : ""].filter(Boolean).join(" · ") || L("off", "aucun")) : "✦ FULL"],
            ["out", "✦", L("Finish · save", "Finition · export"), ["polish", "finish", "save"], `${val(node, "polish_on") && PRO ? "Krea 2 · " : ""}${val(node, "interpolate") !== "off" ? 24 * +String(val(node, "interpolate")).slice(1) : 24} fps · ${val(node, "save_on") ? "MP4" : L("preview", "aperçu")}`],
        ].filter((t) => t[3].some((id) => SEC[id]));
        let pt = P().h3_tab || "speed";
        if (!PT.find((t) => t[0] === pt)) pt = PT[0]?.[0];
        const panel = (PT.find((t) => t[0] === pt)?.[3] || []).map((id) => SEC[id] || "").join("");
        const ptabs = `<div class="h3-ptabs" style="grid-template-columns:repeat(${PT.length},1fr)">${PT.map(([id, ic, t, , sub]) => `<button class="${id === pt ? "on" : ""}" data-ptab="${id}"><span class="ic">${ic}</span><b>${t}</b><small>${sub}</small></button>`).join("")}</div>`;
        const createCol = Object.keys(SEC).filter((id) => ["keys", "refs", "refmods", "prompt"].includes(id)).map((id) => SEC[id]).join("");
        if (SIMPLE) {
            const res = val(node, "resolution"), spd = val(node, "speed");
            const q = res === "custom_mp" ? "mp" : spd === "full" ? "max" : res === "576p" ? "fast" : "hd";
            const missing = /file\(s\) missing|fichier\(s\) manquant/.test(SEC.models || "") || !MODELS;
            const hdS = `<div class="h3-hd compact"><div class="mk">✦</div>
                <div class="tx"><div class="k">Enzino · H3 Simple</div><h1>MiniMax <span>H3</span></h1></div><div class="sp"></div>
                <div class="ctl"><div class="st ${ui.busy ? "busy" : ""}"><i></i>${esc(ui.status || L(`Ready · ${cw}×${ch} · ${secs.toFixed(1)} s`, `Prêt · ${cw}×${ch} · ${secs.toFixed(1)} s`))}</div>
                <div class="by">BY <a href="https://enzinoai.com" target="_blank" rel="noopener">ENZINO</a> · ENZINOAI.COM</div></div></div>`;
            const tabsS = `<div class="h3-tabs" style="grid-template-columns:repeat(2,1fr)">${MODES.filter((m) => m.id === "text" || m.id === "image").map((m) => `<button class="h3-tab ${mode === m.id ? "on" : ""}" data-seg="mode" data-v="${m.id}"><span class="ic">${m.icon}</span><span><b>${T2(m.t)}</b><small>${T2(m.s)}</small></span></button>`).join("")}</div>`;
            const clip = `<div class="h3-sec" data-sec="simple"><div class="h3-sh"><span class="ic">◷</span><span class="t">${L("Your clip", "Ton clip")}<small>${secs.toFixed(1)} s · ${cw} × ${ch} · ${steps} steps</small></span></div><div class="h3-sb">
                <div class="h3-f"><label>${L("Duration", "Durée")}</label>${seg("duration", [[3, "3 s"], [5, "5 s"], [8, "8 s"], [10, "10 s"]])}</div>
                <div class="h3-f"><label>${L("Format", "Format")}</label>${seg("aspect", [["auto", L("Auto", "Auto")], ["16:9", "16:9"], ["9:16", "9:16"], ["1:1", "1:1"]])}</div>
                <div class="h3-f"><label>${L("Quality", "Qualité")}</label><div class="h3-seg">${[["fast", L("⚡ Fast · 0.6 MP", "⚡ Rapide · 0.6 MP")], ["hd", L("✦ HD · 1 MP", "✦ HD · 1 MP")], ["max", L("★ Max · 1 MP Full", "★ Max · 1 MP Full")], ["mp", "✎ " + (q === "mp" ? mpTxt(+val(node, "custom_mp")) : L("Custom MP", "MP perso"))]].map(([k2, l]) => `<button class="${q === k2 ? "on" : ""}" data-simpleq="${k2}">${l}</button>`).join("")}</div>
                  ${q === "mp" ? `${mpSlider()}<div class="h3-f"><label>${L("Engine", "Moteur")}</label>${seg("speed", [["turbo", L("⚡ Turbo · 8 steps", "⚡ Turbo · 8 steps")], ["full", L("✦ Full · 13 steps + cache", "✦ Full · 13 steps + cache")]])}</div>` : `<span class="h3-note">${q === "fast" ? L("Quick tests: smaller picture, 8 Turbo steps.", "Tests rapides : image plus petite, 8 steps Turbo.") : q === "hd" ? L("The sweet spot: H3's native 1 MP canvas, 8 Turbo steps.", "Le bon équilibre : le canevas natif de H3 (1 MP), 8 steps Turbo.") : L("Best picture and sound: no Turbo, 13 steps with step cache. Slower.", "Meilleure image et meilleur son : sans Turbo, 13 steps avec cache. Plus lent.")}</span>`}</div>
                <div class="h3-f"><label>Seed</label><div class="h3-row"><input class="h3-tx" type="number" data-int="seed" value="${val(node, "seed")}"><button class="h3-btn" data-a="dice" title="${L("New seed", "Nouveau seed")}">🎲</button></div></div>
                </div></div>`;
            const leftS = (SEC.keys || "") + (SEC.prompt || "");
            const midS = clip + (SEC.loras || "") + (SEC.models || "");
            inner.innerHTML = hdS + errBox + tabsS + `<div class="h3-grid" style="grid-template-columns:1.1fr 1fr 1fr"><div class="h3-col">${leftS}</div><div class="h3-col">${midS}</div><div class="h3-col res">${out}</div></div>`;
            bindAll();
            return;
        }
        inner.innerHTML = studio
            ? header + errBox + tabs + `<div class="h3-grid studio" style="height:${bodyH()}px;--bh:${bodyH()}px"><div class="h3-col h3-scroll">${createCol}</div><div class="h3-col h3-scroll">${ptabs}${panel}</div><div class="h3-col res h3-scroll">${out}</div></div>` + foot
            : wide
            ? header + errBox + tabs + `<div class="h3-grid wide"><div class="h3-col">${left}</div><div class="h3-col">${right}</div><div class="h3-col res">${out}</div></div>` + foot
            : header + errBox + tabs + `<div class="h3-grid"><div class="h3-col">${left}</div><div class="h3-col">${right}</div></div>` + out + foot;
        bindAll();
    };

    // --------------------------------------------------------------- models card
    const MODEL_ORDER = { false: ["fl", "te", "vvae", "avae", "lfl", "emb"], true: ["ref", "te", "vvae", "avae", "lref", "emb"] };
    const modelsCard = (refs) => {
        if (!MODELS) { loadModels().then(() => ui.refresh()); return sec({ id: "models", icon: "◆", title: L("Models", "Modèles"), sub: "…", body: "" }); }
        const files = MODELS.files || {};
        const groups = [...MODEL_ORDER[refs], ...(val(node, "upscale") !== "off" ? ["ups"] : []), ...(PRO && !refs && val(node, "control_mode") !== "off" ? ["ctl"] : []), ...(PRO && val(node, "interpolate") !== "off" ? ["itp"] : []), ...(PRO && val(node, "polish_on") ? ["kmodel", "kte", "kvae"] : []), "tae"].filter((id) => !SIMPLE || (id !== "tae" && id !== "emb")).map((id) => MODELS.groups.find((g) => g.id === id)).filter(Boolean);
        const has = (g, f) => (files[g.folder] || []).includes(baseName(f));
        let missing = 0, downloading = false;
        const rows = groups.map((g) => {
            const needed = g.required || (g.id === "lfl" || g.id === "lref") && val(node, "speed") === "turbo" || g.id === "ctl" || g.id === "itp";
            if (g.id === "tae") {
                const c = g.choices[0], job = c.job, busy = job && ["downloading", "starting"].includes(job.state);
                if (busy) downloading = true;
                return `<div class="h3-mrow ${c.installed ? "ok" : "opt"}"><span class="d"></span><span class="nm"><b>${esc(T2(g.title))}</b><small>${c.installed ? L("installed · sharp live preview", "installé · aperçu net en direct") : esc(T2(g.for))}</small></span>
                    <span>${busy ? `<span class="h3-note">${job.total ? Math.floor(100 * job.done / job.total) : 0}%</span>` : c.installed ? `<span class="h3-note">✓</span>` : `<button class="h3-btn sm" data-dl="${c.id}">⬇ 23 ${fr() ? "Mo" : "MB"}</button>`}</span></div>`;
            }
            if (g.id === "ups") {
                const cur = val(node, "upscaler");
                const c = g.choices[0], job = c.job;
                if (job && ["downloading", "starting"].includes(job.state)) downloading = true;
                const act = job && ["downloading", "starting"].includes(job.state) ? `<span class="h3-prog"><span>${job.total ? Math.floor(100 * job.done / job.total) : 0}%</span><span class="b"><i style="width:${job.total ? Math.floor(100 * job.done / job.total) : 0}%"></i></span></span>`
                    : c.installed ? `<span class="h3-note">✓</span>` : `<button class="h3-btn sm" data-dl="${c.id}">⬇ ${esc(c.label)} · ${fmtSize(c.size)}</button>`;
                return `<div class="h3-mrow ${cur !== "lanczos" ? "ok" : "opt"}"><span class="d"></span><span class="nm"><b>${esc(T2(g.title))}</b><small>${cur === "rtx_vsr" ? "NVIDIA RTX Video Super Resolution · " + L("no file needed", "aucun fichier") : esc(cur)}${cur === "lanczos" ? " · " + L("works without a model", "marche sans modèle") : ""}</small></span><span>${act}</span></div>`;
            }
            if (g.id === "emb") {
                const n = g.choices.filter((c) => c.installed).length;
                const job = g.choices.find((c) => c.job?.state === "downloading" || c.job?.state === "starting");
                if (job) downloading = true;
                return `<div class="h3-mrow ${n ? "ok" : "opt"}"><span class="d"></span><span class="nm"><b>${esc(T2(g.title))} <span class="h3-note">· ${n}/10</span></b><small>${esc(T2(g.for))}</small></span>
                    <span>${n < 10 ? `<button class="h3-btn sm" data-dlall="emb">⬇ ${L("All", "Tous")} · 10 ${fr() ? "Mo" : "MB"}</button>` : `<span class="h3-note">✓</span>`}</span></div>`;
            }
            const cur = g.widget ? val(node, g.widget) : "";
            const ok = cur && cur !== "none" && has(g, cur);
            if (needed && !ok) missing++;
            const busyC = g.choices.find((c) => ["downloading", "starting"].includes(c.job?.state));
            const choice = busyC || (ok ? g.choices.find((c) => c.file === baseName(cur)) : (g.choices.find((c) => !c.installed && c.star) || g.choices.find((c) => !c.installed))) || g.choices[0];
            const job = choice?.job;
            if (job && (job.state === "downloading" || job.state === "starting")) downloading = true;
            const w = W(node, g.widget);
            const splitAt = MODELS?.split?.[g.widget];
            const opts = (w?.options?.values || []).map((x, xi) => {
                const inst = x === "none" || has(g, x);
                const c = g.choices.find((c) => c.file === baseName(x));
                return `${xi === splitAt ? `<option disabled>── ${L("other files in this folder", "autres fichiers du dossier")} ──</option>` : ""}<option value="${esc(x)}" ${x === cur ? "selected" : ""}>${x === "none" ? L("— none installed / off —", "— aucun / désactivé —") : `${inst ? "" : "⚠ "}${esc(c ? c.label : baseName(x))}`}</option>`;
            }).join("") + (() => {   // every catalog version you don't have yet: pick it to download it (it becomes the choice when done)
                const vals = (w?.options?.values || []).map(baseName);
                const more = g.choices.filter((c) => !c.installed && !vals.includes(c.file) && c.url !== false);
                return more.length ? `<optgroup label="${L("Download another version", "Télécharger une autre version")}">${more.map((c) => `<option value="dl:${esc(c.id)}">⬇ ${esc(c.label)} · ${fmtSize(c.size)}${c.note ? " · " + esc(T2(c.note)) : ""}</option>`).join("")}</optgroup>` : "";
            })();
            let act = "";
            if (job && (job.state === "downloading" || job.state === "starting")) {
                const pct = job.total ? Math.floor(100 * job.done / job.total) : 0;
                act = `<span class="h3-prog"><span>${pct}% · ${fmtSize(job.speed)}/s</span><span class="b"><i style="width:${pct}%"></i></span><button class="h3-btn sm" data-cancel="${choice.id}">✕</button></span>`;
            } else if (!ok && choice && !choice.installed) {
                act = `<button class="h3-btn sm pri" data-dl="${choice.id}" title="${esc(choice.label)}">⬇ ${esc(choice.label.length > 22 ? choice.label.slice(0, 20) + "…" : choice.label)} · ${fmtSize(choice.size)}</button>`;
            } else act = `<span class="h3-note">${ok ? "✓" : "—"}</span>`;
            const err = job?.state === "error" ? `<small class="h3-warn">${esc(job.error || "")}</small>` : "";
            return `<div class="h3-mrow ${ok ? "ok" : needed ? "" : "opt"}"><span class="d"></span><span class="nm"><b>${esc(T2(g.title))}</b><select data-sel="${g.widget}">${opts}</select>${err}</span><span>${act}</span></div>`;
        }).join("");
        if (downloading && !modelsPoll) modelsPoll = setInterval(async () => {
            const before = JSON.stringify((MODELS?.groups || []).map((g) => g.choices.map((c) => c.installed)));
            await loadModels(true);
            const after = JSON.stringify((MODELS?.groups || []).map((g) => g.choices.map((c) => c.installed)));
            const busy = (MODELS?.groups || []).some((g) => g.choices.some((c) => ["downloading", "starting"].includes(c.job?.state)));
            if (before !== after) {
                try { await app.refreshComboInNodes?.(); } catch { }
                for (const n of allNodes()) for (const g of MODELS?.groups || []) {
                    const w = g.widget && W(n, g.widget); if (!w) continue;
                    const vals = w.options?.values || [];
                    const want = n.properties?.h3_want?.[g.widget];
                    const wanted = want && vals.find((v) => baseName(v) === want);
                    if (wanted) { w.value = wanted; w.callback?.(wanted); delete n.properties.h3_want[g.widget]; continue; }
                    if (!vals.includes(w.value) || w.value === "none") {
                        const pick = g.choices.map((c) => vals.find((v) => baseName(v) === c.file)).find(Boolean);
                        if (pick) { w.value = pick; w.callback?.(pick); }
                    }
                }
            }
            refreshAll();
            if (!busy) { clearInterval(modelsPoll); modelsPoll = null; }
        }, 1500);
        const okAll = !missing;
        return sec({ id: "models", icon: "◆", title: L("Models", "Modèles"), sub: okAll ? L("everything is installed", "tout est installé") : `${missing} ${L("file(s) missing", "fichier(s) manquant(s)")}`,
            right: `<button class="h3-chip" data-a="rescan" title="${L("Look again for model files you just added", "Rechercher à nouveau les fichiers ajoutés")}">↻ ${L("Rescan", "Actualiser")}</button>` + (okAll ? `<span class="h3-note" style="color:var(--ok);font-weight:700;margin-left:8px">✓ ${L("Ready", "Prêt")}</span>` : ""),
            body: (adv("models") || !okAll || downloading || SIMPLE) ? `<div style="display:flex;flex-direction:column;gap:5px">${rows}</div>` : `<div class="h3-okline">✓ ${L("All required files are installed", "Tous les fichiers nécessaires sont installés")}</div>`,
            advanced: `${(() => { const more = groups.filter((g) => g.id !== "emb" && g.id !== "tae").flatMap((g) => g.choices.filter((c) => !c.installed).map((c) => ({ g, c })));
                    return more.length ? `<div class="h3-f"><label>${L("Other versions to download", "Autres versions à télécharger")}</label><div style="display:flex;flex-direction:column;gap:4px">${more.map(({ g, c }) => {
                        const j = c.job, busy = j && ["downloading", "starting"].includes(j.state), pct = j?.total ? Math.floor(100 * j.done / j.total) : 0;
                        return `<div class="h3-mrow opt"><span class="d"></span><span class="nm"><b>${esc(c.label)}</b><small>${esc(T2(g.title))} · ${esc(T2(c.note))}</small></span><span>${busy ? `<span class="h3-note">${pct}%</span>` : `<button class="h3-btn sm" data-dl="${c.id}">⬇ ${fmtSize(c.size)}</button>`}</span></div>`; }).join("")}</div></div>` : ""; })()}
                <div class="h3-f"><label>${L("Weight precision", "Précision des poids")}</label>${select("weight_dtype")}</div><div class="h3-note">${L("Downloads go to ComfyUI's model folders and resume if interrupted. Models stay in memory between runs.", "Les téléchargements vont dans les dossiers de modèles de ComfyUI et reprennent s'ils sont coupés. Les modèles restent en mémoire entre deux rendus.")}</div>` });
    };

    // --------------------------------------------------------------- events
    const insert = (txt) => {
        const ta = inner.querySelector('[data-txt="prompt"]');
        const v = val(node, "prompt") || "";
        const focused = ta && document.activeElement === ta;
        const s = focused ? ta.selectionStart : (ui.caret ? Math.min(ui.caret[0], v.length) : v.length), e = focused ? ta.selectionEnd : (ui.caret ? Math.min(ui.caret[1], v.length) : v.length);
        if (/\s$/.test(v.slice(0, s)) || s === 0) txt = txt.replace(/^\s+/, "");
        if (/^\s/.test(v.slice(e))) txt = txt.replace(/\s+$/, "");
        if (/(^|[.!?:]\s*)$/.test(v.slice(0, s).replace(/\s+$/, " ").trimEnd() + " ") && /^[\s]*[a-z]/.test(txt) && !/^\s*(integrated|overall|non_diegetic)/.test(txt)) txt = txt.replace(/[a-z]/, (c) => c.toUpperCase());
        ui.caret = [s + txt.length, s + txt.length];
        const nv = v.slice(0, s) + txt + v.slice(e);
        setVal(node, "prompt", nv);
        ui.refresh();
        const t2 = inner.querySelector('[data-txt="prompt"]');
        if (t2) { t2.focus(); const p = s + txt.length; t2.setSelectionRange(p, p); }
    };
    const ensureField = (field, ph) => {
        const v = val(node, "prompt") || "";
        const re = new RegExp(`^${field}:`, "m");
        if (re.test(v)) {
            const i = v.search(re) + field.length + 2;
            const ta = inner.querySelector('[data-txt="prompt"]');
            if (ta) { ta.focus(); ta.setSelectionRange(i, i); ta.scrollTop = ta.scrollHeight * i / Math.max(1, v.length) - 60; }
            return;
        }
        setVal(node, "prompt", v.replace(/\s*$/, "") + `\n\n${field}: ${ph}`);
        ui.refresh();
    };
    const SNIP = {
        tpl: () => {
            const t = val(node, "mode") === "references" ? TEMPLATE_REF : TEMPLATE_BASE;
            const p = (val(node, "prompt") || "").trim();
            const def = String(W(node, "prompt")?.options?.default ?? node.__h3def ?? "").trim();
            if (!p || p === def || p === TEMPLATE_BASE.trim() || p === TEMPLATE_REF.trim()) { setVal(node, "prompt", t); ui.refresh(); } else insert("\n" + t + "\n");
        },
        shot: () => {
            const n = lastShot(val(node, "prompt")) + 1, d = +val(node, "duration");
            const t = Math.max(0.5, d * (n - 1) / n);
            const mm = String(Math.floor(t / 60)).padStart(2, "0"), ss = (t % 60).toFixed(3).padStart(6, "0");
            insert(` [Shot ${n}] At ${mm}:${ss}, the camera cuts to `);
        },
        talk: () => insert(` the <voice: age, timbre, pace> (S1) says: <d>[${fr() ? "French" : "English"}] ${L("Exact words.", "Texte exact.")}</d> `),
        vo: () => insert(` (S1) says in an off-screen voiceover: <d>[${fr() ? "French" : "English"}] ${L("Exact words.", "Texte exact.")}</d> while his lips remain completely closed. `),
        text: () => insert(` a sign reading "TEXT" `),
        sound: () => ensureField("overall_soundscape", L("ambience and physical sounds…", "ambiance et bruits…")),
        music: () => ensureField("non_diegetic_music", L("instruments, tempo, dynamics… or N/A", "instruments, tempo, dynamique… ou N/A")),
    };

    const setSlot = async (name, file) => {
        try { const v = await upload(file); setVal(node, name, v); } catch (e) { console.warn("[Enzino H3] upload failed", e); }
        ui.refresh();
    };
    const addRefs = async (files) => {
        let names = []; try { names = JSON.parse(val(node, "ref_images") || "[]"); } catch { }
        for (const f of files) { if (names.length >= 9) break; if (!f.type.startsWith("image")) continue; try { names.push(await upload(f)); } catch { } }
        setVal(node, "ref_images", JSON.stringify(names));
        ui.refresh();
    };
    const dropZone = (el, onFiles) => {
        el.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add("over"); });
        el.addEventListener("dragleave", () => el.classList.remove("over"));
        el.addEventListener("drop", (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove("over"); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) onFiles(fs); });
    };

    function bindAll() {
        const q = (s) => inner.querySelectorAll(s);
        q("[data-seg]").forEach((b) => b.onclick = () => {
            const n = b.dataset.seg, w = W(node, n);
            let v = w?.options?.values?.find((x) => String(x) === b.dataset.v) ?? b.dataset.v;
            if (typeof w?.value === "number") v = Number(v);
            setVal(node, n, v); ui.sel = null; ui.refresh();
        });
        q("[data-sw]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); setVal(node, b.dataset.sw, !val(node, b.dataset.sw)); ui.refresh(); });
        q("[data-num]").forEach((el) => {
            const n = el.dataset.num;
            el.oninput = () => {
                const w = W(node, n), v = parseFloat(el.value);
                setVal(node, n, Number.isInteger(w?.value) && !String(el.step).includes(".") ? Math.round(v) : v);
                const f = FMT[n]; if (el.nextElementSibling) el.nextElementSibling.textContent = f ? f(v) : v;
            };
            el.onchange = () => ui.refresh();
        });
        q("[data-sel]").forEach((el) => el.onchange = async () => {
            if (el.value.startsWith("dl:")) {   // download that version, then select it automatically
                const id = el.value.slice(3);
                const g = (MODELS?.groups || []).find((x) => x.choices.some((c) => c.id === id));
                const c = g?.choices.find((x) => x.id === id);
                if (c) { P().h3_want = { ...(P().h3_want || {}), [g.widget]: c.file }; }
                await api.fetchApi("/enzino_h3/models", { method: "POST", body: JSON.stringify({ id }) });
                await loadModels(true); ui.refresh(); return;
            }
            setVal(node, el.dataset.sel, el.value); ui.refresh();
        });
        q("[data-txt]").forEach((el) => {
            el.oninput = () => { setVal(node, el.dataset.txt, el.value); if (el.dataset.txt === "prompt") { clearTimeout(ui.tt); ui.tt = setTimeout(() => ui.refresh(), 700); } };
            el.addEventListener("keydown", (e) => e.stopPropagation());
        });
        q("[data-int]").forEach((el) => { el.onchange = () => { let v = Math.max(0, parseInt(el.value || "0")); if (el.dataset.int.startsWith("custom_")) v = Math.min(4096, Math.max(256, Math.round(v / 32) * 32)); setVal(node, el.dataset.int, v); ui.refresh(); }; el.addEventListener("keydown", (e) => e.stopPropagation()); });
        q("[data-dur]").forEach((b) => b.onclick = () => { setVal(node, "duration", +b.dataset.dur); ui.refresh(); });
        q("[data-adv]").forEach((b) => b.onclick = () => toggleAdv(b.dataset.adv));
        q("[data-snip]").forEach((b) => b.onclick = () => SNIP[b.dataset.snip]?.());
        q("[data-help]").forEach((b) => b.onclick = () => openHelper(b.dataset.help));
        const ta0 = inner.querySelector('[data-txt="prompt"]');
        if (ta0) ["keyup", "click", "select", "blur"].forEach((ev) => ta0.addEventListener(ev, () => { ui.caret = [ta0.selectionStart, ta0.selectionEnd]; }));
        const hfPrev = () => { const el = inner.querySelector("[data-hfprev]"); if (el && ui.hf) el.textContent = helperBuild(ui.hf.id, ui.hf.d, hfCtx()).trim() || "…"; };
        q("[data-hfk]").forEach((b) => b.onclick = () => {
            const k2 = b.dataset.hfk, v = b.dataset.hfv;
            if (b.dataset.hfm) { const a = ui.hf.d[k2] || []; ui.hf.d[k2] = a.includes(v) ? a.filter((x) => x !== v) : [...a, v]; } else ui.hf.d[k2] = v;
            ui.refresh();
        });
        q("[data-hft]").forEach((el) => { el.oninput = () => { ui.hf.d[el.dataset.hft] = el.value; hfPrev(); }; el.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") inner.querySelector("[data-hfins]")?.click(); }); });
        q("[data-hfr]").forEach((el) => { el.oninput = () => { ui.hf.d[el.dataset.hfr] = +el.value; el.nextElementSibling.textContent = (+el.value).toFixed(1) + " s"; hfPrev(); }; });
        q("[data-hfs]").forEach((el) => el.onchange = () => { ui.hf.d[el.dataset.hfs] = el.value; hfPrev(); });
        q("[data-hfb]").forEach((b) => b.onclick = () => { ui.hf.d[b.dataset.hfb] = !ui.hf.d[b.dataset.hfb]; ui.refresh(); });
        q("[data-hfclose]").forEach((b) => b.onclick = () => { ui.hf = null; ui.refresh(); });
        q("[data-hfins]").forEach((b) => b.onclick = () => {
            const { id, d } = ui.hf, txt = helperBuild(id, d, hfCtx());
            if (!txt.trim()) return;
            if (id === "sound") setField("overall_soundscape", txt.trim());
            else if (id === "music") setField("non_diegetic_music", txt.trim());
            else { ui.hf = null; insert(txt); return; }
            ui.hf = null; ui.refresh();
        });
        q("[data-ins]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); insert(b.dataset.ins.replace(/&lt;/g, "<").replace(/&gt;/g, ">")); });


        q("[data-slot]").forEach((el) => {
            const n = el.dataset.slot;
            el.onclick = (e) => { if (e.target.closest("button,audio,video")) return; pickFile(el.dataset.accept, (f) => setSlot(n, f)); };
            dropZone(el, (fs) => setSlot(n, fs[0]));
        });
        q("[data-clear]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); setVal(node, b.dataset.clear, ""); ui.refresh(); });
        q("[data-refadd]").forEach((el) => {
            el.onclick = () => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true; inp.onchange = () => addRefs([...inp.files]); inp.click(); };
            dropZone(el, addRefs);
        });
        q("[data-refdel]").forEach((b) => b.onclick = (e) => {
            e.stopPropagation();
            let names = []; try { names = JSON.parse(val(node, "ref_images") || "[]"); } catch { }
            names.splice(+b.dataset.refdel, 1); setVal(node, "ref_images", JSON.stringify(names)); ui.refresh();
        });
        q("[data-ref]").forEach((el) => dropZone(el, addRefs));

        q("[data-dl]").forEach((b) => b.onclick = async () => { b.disabled = true; await api.fetchApi("/enzino_h3/models", { method: "POST", body: JSON.stringify({ id: b.dataset.dl }) }); await loadModels(true); ui.refresh(); });
        q("[data-dlall]").forEach((b) => b.onclick = async () => {
            b.disabled = true;
            const g = MODELS.groups.find((x) => x.id === b.dataset.dlall);
            for (const c of g.choices) if (!c.installed) await api.fetchApi("/enzino_h3/models", { method: "POST", body: JSON.stringify({ id: c.id }) });
            await loadModels(true); ui.refresh();
        });
        q("[data-cancel]").forEach((b) => b.onclick = async () => { await api.fetchApi("/enzino_h3/models", { method: "POST", body: JSON.stringify({ id: b.dataset.cancel, cancel: true }) }); await loadModels(true); ui.refresh(); });

        q("[data-a]").forEach((b) => b.onclick = async () => {
            const a = b.dataset.a, cur = ui.sel || node.__h3last;
            if (a === "dice") { setVal(node, "seed", Math.floor(Math.random() * 2 ** 48)); ui.refresh(); }
            if (a === "lock") { const c = W(node, "control_after_generate"); if (c) { c.value = c.value === "fixed" ? "randomize" : "fixed"; } ui.refresh(); }
            if (a === "useseed" && cur) { setVal(node, "seed", cur.seed); const c = W(node, "control_after_generate"); if (c) c.value = "fixed"; ui.refresh(); }
            if (a === "restore" && cur?.settings) {
                for (const [k, v] of Object.entries(cur.settings)) if (W(node, k)) setVal(node, k, v);
                const c = W(node, "control_after_generate"); if (c) c.value = "fixed";
                ui.refresh();
            }
            if (a === "chain" && cur) {
                b.disabled = true;
                try {
                    const r = await (await api.fetchApi("/enzino_h3/to_input", { method: "POST", body: JSON.stringify(cur.last) })).json();
                    if (r.name) {
                        setVal(node, "first_image", r.name);
                        if (!["image", "first_last"].includes(val(node, "mode"))) setVal(node, "mode", "image");
                        setVal(node, "aspect", "auto");
                    }
                } catch (e) { console.warn(e); }
                ui.refresh();
            }
            if (a === "errclear") { ui.runError = null; if (app.lastNodeErrors) delete app.lastNodeErrors[String(node.id)]; node.has_errors = false; app.canvas?.setDirty(true, true); ui.refresh(); }
            if (a === "errcopy") { try { await navigator.clipboard.writeText(JSON.parse(ui.errSig || "[]").join("\n")); b.textContent = "✓"; } catch { } }
            if (a === "resetall") {
                for (const w of node.widgets || []) if (w.__h3def !== undefined && !["prompt", "first_image", "last_image", "mid_image", "ref_images", "loras", "refmods", "story"].includes(w.name)) w.value = w.__h3def;
                ui.runError = null; if (app.lastNodeErrors) delete app.lastNodeErrors[String(node.id)]; node.has_errors = false; app.canvas?.setDirty(true, true); ui.refresh();
            }
            if (a === "rescan") { loadModels(true).then(() => ui.refresh()); return; }
            if (a === "bodyh") { const hs = [620, 760, 900, 1060]; P().h3_bodyh = hs[(hs.indexOf(bodyH()) + 1) % hs.length]; ui.refresh(); return; }
            if (a === "layout") { const ls = ["studio", "wide", "tall"]; P().h3_layout = ls[(ls.indexOf(layoutOf()) + 1) % ls.length]; ui.refresh(); requestAnimationFrame(() => { node.setSize([nodeWidth(), node.size[1]]); fit(true); }); }
            if (a === "draft") setDraft(true);
            if (a === "final") setDraft(false);
            if (a === "padd") { presetSaving = true; ui.refresh(); setTimeout(() => inner.querySelector("[data-pname]")?.focus(), 30); }
            if (a === "pcancel") { presetSaving = false; ui.refresh(); }
            if (a === "psave") {
                const name = (inner.querySelector("[data-pname]")?.value || "").trim();
                if (name) {
                    const sv = Object.fromEntries(PRESET_KEYS.filter((k2) => W(node, k2)).map((k2) => [k2, val(node, k2)]));
                    PRESETS.user = (await (await api.fetchApi("/enzino_h3/presets", { method: "POST", body: JSON.stringify({ name, s: sv }) })).json()).user || [];
                    presetSel = "u:" + name;
                }
                presetSaving = false; ui.refresh();
            }
            if (a === "pdel" && presetSel.startsWith("u:")) {
                PRESETS.user = (await (await api.fetchApi("/enzino_h3/presets", { method: "POST", body: JSON.stringify({ name: presetSel.slice(2), delete: true }) })).json()).user || [];
                presetSel = ""; ui.refresh();
            }
            if (a === "ladd") { const st = getLoras(); st.push({ name: "", strength: 1, on: true }); setLoras(st); }
            if (a === "rmadd") { const st = getRefmods(); st.push({ name: "", strength: 1, copies: 1, on: true }); setRefmods(st); }
            if (a === "rmreload") { await loadRefmods(true); ui.refresh(); }
            if (a === "lreload") { await loadLoras(true); ui.refresh(); }
            if (a === "saddshot") { const st = getStory(); st.push({ prompt: "", duration: 5 }); setVal(node, "story_on", true); setStory(st); }
            if (a === "finalseed" && cur) {
                setVal(node, "seed", cur.seed); const c = W(node, "control_after_generate"); if (c) c.value = "fixed";
                setDraft(false);
                try { await app.queuePrompt(0, 1); } catch (e) { console.warn(e); }
            }
            if (a === "retouch" && cur) {
                try {
                    const r = await (await api.fetchApi("/enzino_h3/to_input", { method: "POST", body: JSON.stringify(cur.video) })).json();
                    if (r.name) { setVal(node, "retouch_source", r.name); setVal(node, "control_mode", "retouch"); setVal(node, "retouch_start", 0); setVal(node, "retouch_end", cur.seconds || 15); if (val(node, "mode") === "references") setVal(node, "mode", "text"); }
                } catch (e) { console.warn(e); }
                ui.refresh();
            }
            if (a === "swap") { const w = val(node, "custom_width"); setVal(node, "custom_width", val(node, "custom_height")); setVal(node, "custom_height", w); ui.refresh(); }
            if (a === "free") { await api.fetchApi("/enzino_h3/free", { method: "POST" }); ui.status = L("Memory freed", "Mémoire libérée"); ui.refresh(); }
            if (a === "clearhist") { HISTORY = await (await api.fetchApi("/enzino_h3/history", { method: "POST", body: JSON.stringify({ clear: true }) })).json(); ui.sel = null; refreshAll(); }
        });
        q("[data-wh]").forEach((b) => b.onclick = () => { const [w, h] = b.dataset.wh.split("x").map(Number); setVal(node, "custom_width", w); setVal(node, "custom_height", h); ui.refresh(); });
        const psel = inner.querySelector("[data-preset]");
        if (psel) psel.onchange = () => {
            presetSel = psel.value;
            const pr = (psel.value[0] === "b" ? PRESETS.builtin : PRESETS.user).find((x) => x.name === psel.value.slice(2));
            if (pr) for (const [k2, v] of Object.entries(pr.s || {})) if (W(node, k2)) setVal(node, k2, v);
            ui.refresh();
        };
        const pn = inner.querySelector("[data-pname]");
        if (pn) pn.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") inner.querySelector('[data-a="psave"]')?.click(); if (e.key === "Escape") inner.querySelector('[data-a="pcancel"]')?.click(); };
        q("[data-story]").forEach((el) => {
            el.oninput = () => { const st = getStory(); const i = +el.dataset.story; if (st[i]) { st[i].prompt = el.value; setStory(st, false); } };
            el.addEventListener("keydown", (e) => e.stopPropagation());
        });
        q("[data-lname]").forEach((el) => el.onchange = () => { const st = getLoras(); st[+el.dataset.lname].name = el.value; setLoras(st); });
        q("[data-lon]").forEach((b) => b.onclick = () => { const st = getLoras(); const x = st[+b.dataset.lon]; x.on = x.on === false; setLoras(st); });
        q("[data-ldel]").forEach((b) => b.onclick = () => { const st = getLoras(); st.splice(+b.dataset.ldel, 1); setLoras(st); });
        q("[data-lstr]").forEach((el) => {
            el.oninput = () => { const st = getLoras(); st[+el.dataset.lstr].strength = Math.round(parseFloat(el.value) * 100) / 100; setLoras(st, false); el.nextElementSibling.textContent = (+el.value).toFixed(2); };
            el.onchange = () => ui.refresh();
        });
        q("[data-rmname]").forEach((el) => el.onchange = () => { const st = getRefmods(); st[+el.dataset.rmname].name = el.value; setRefmods(st); });
        q("[data-rmon]").forEach((b) => b.onclick = () => { const st = getRefmods(); const x = st[+b.dataset.rmon]; x.on = x.on === false; setRefmods(st); });
        q("[data-rmdel]").forEach((b) => b.onclick = () => { const st = getRefmods(); st.splice(+b.dataset.rmdel, 1); setRefmods(st); });
        q("[data-rmcop]").forEach((b) => b.onclick = () => { const [i, c] = b.dataset.rmcop.split(":").map(Number); const st = getRefmods(); st[i].copies = c; setRefmods(st); });
        q("[data-rmstr]").forEach((el) => {
            el.oninput = () => { const st = getRefmods(); st[+el.dataset.rmstr].strength = Math.round(parseFloat(el.value) * 100) / 100; setRefmods(st, false); el.nextElementSibling.textContent = (+el.value).toFixed(2); };
            el.onchange = () => ui.refresh();
        });
        q("[data-prof]").forEach((b) => b.onclick = () => {
            const pf = b.dataset.prof; P().h3_profile = pf;
            setVal(node, "attention", "auto"); setVal(node, "prompt_cache", true);
            if (pf === "quality") { setVal(node, "sparse_attention", false); setVal(node, "preview_every", 1); setVal(node, "step_cache", "off"); }
            if (pf === "balanced") { setVal(node, "sparse_attention", true); setVal(node, "sparse_tau", 1.3); setVal(node, "preview_every", 1); setVal(node, "step_cache", "auto"); }
            if (pf === "max") {
                setVal(node, "step_cache", "strong"); setVal(node, "sparse_attention", true); setVal(node, "sparse_tau", 1.8); setVal(node, "preview_every", 2); setVal(node, "speed", "turbo");
                for (const wn of ["turbo_keyframes", "turbo_references"]) { const w = W(node, wn); const four = (w?.options?.values || []).find((v) => /4[\W_]?step/i.test(v)); if (four) setVal(node, wn, four); }
            }
            ui.refresh();
        });
        q("[data-sdur]").forEach((b) => b.onclick = () => { const [i, d] = b.dataset.sdur.split(":").map(Number); const st = getStory(); if (st[i]) { st[i].duration = d; setStory(st); } });
        q("[data-sdel]").forEach((b) => b.onclick = () => { const st = getStory(); st.splice(+b.dataset.sdel, 1); setStory(st); });
        q("[data-smove]").forEach((b) => b.onclick = () => { const [i, d] = b.dataset.smove.split(":").map(Number); const st = getStory(); const j = i + d; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; setStory(st); });
        q("[data-soc]").forEach((b) => b.onclick = () => { const f = b.dataset.soc; let a = getSocial(); a = a.includes(f) ? a.filter((x) => x !== f) : [...a, f]; setVal(node, "social", JSON.stringify(a)); ui.refresh(); });
        q("[data-var]").forEach((b) => b.onclick = () => { ui.sel = node.__h3batch[+b.dataset.var]; ui.refresh(); });
        // retouch box: drag to move, corner to resize (normalized coordinates)
        const rt = inner.querySelector("[data-rt]"), box = inner.querySelector("[data-rtbox]"), rv = inner.querySelector("[data-rtv]");
        if (rv) rv.onloadedmetadata = () => {
            const d = rv.duration || 15;
            try { rv.currentTime = Math.min(d - 0.05, Math.max(0, +val(node, "retouch_start") + 0.05)); } catch { }
            if (Math.abs((ui.rtDur || 0) - d) > 0.05) { ui.rtDur = d; if (+val(node, "retouch_end") > d) setVal(node, "retouch_end", Math.round(d * 10) / 10); ui.refresh(); }
        };
        if (rt && box) {
            box.onpointerdown = (e) => {
                e.preventDefault(); e.stopPropagation();
                const resize = e.target.dataset.rtres !== undefined;
                const R = rt.getBoundingClientRect();
                let b0 = { x: 0.3, y: 0.2, w: 0.4, h: 0.5 }; try { b0 = { ...b0, ...JSON.parse(val(node, "retouch_box") || "{}") }; } catch { }
                const sx = e.clientX, sy = e.clientY;
                const move = (ev) => {
                    const dx = (ev.clientX - sx) / R.width, dy = (ev.clientY - sy) / R.height;
                    const b = { ...b0 };
                    if (resize) { b.w = Math.min(1 - b.x, Math.max(0.05, b0.w + dx)); b.h = Math.min(1 - b.y, Math.max(0.05, b0.h + dy)); }
                    else { b.x = Math.min(1 - b.w, Math.max(0, b0.x + dx)); b.y = Math.min(1 - b.h, Math.max(0, b0.y + dy)); }
                    box.style.left = b.x * 100 + "%"; box.style.top = b.y * 100 + "%"; box.style.width = b.w * 100 + "%"; box.style.height = b.h * 100 + "%";
                    box.__b = b;
                };
                const up = () => {
                    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
                    if (box.__b) { const r4 = (v) => Math.round(v * 1000) / 1000; setVal(node, "retouch_box", JSON.stringify({ x: r4(box.__b.x), y: r4(box.__b.y), w: r4(box.__b.w), h: r4(box.__b.h) })); }
                };
                window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
            };
        }
        q("[data-simpleq]").forEach((b) => b.onclick = () => {
            const k2 = b.dataset.simpleq;
            if (k2 === "mp") { setVal(node, "resolution", "custom_mp"); ui.refresh(); return; }
            setVal(node, "resolution", k2 === "fast" ? "576p" : "768p"); setVal(node, "speed", k2 === "max" ? "full" : "turbo");
            setVal(node, "steps", 0); setVal(node, "step_cache", "auto"); setVal(node, "upscale", "off"); ui.refresh();
        });
        q("[data-ptab]").forEach((b) => b.onclick = () => { P().h3_tab = b.dataset.ptab; ui.refresh(); const c = b.closest(".h3-col"); if (c) c.scrollTop = 0; });
        q("[data-hist]").forEach((b) => b.onclick = () => { ui.sel = HISTORY[+b.dataset.hist]; ui.refresh(); });
    }

    // --------------------------------------------------------------- sizing
    const nodeWidth = () => (layoutOf() === "simple" ? 1600 : layoutOf() === "tall" ? 1180 : 1760);
    const fit = (force) => {
        const h = Math.max(600, Math.ceil(inner.scrollHeight) + 12);
        if (force || Math.abs(h - ui.h) > 2) {
            ui.h = h;
            const sz = node.computeSize?.();
            if (sz) node.setSize([force ? nodeWidth() : Math.max(node.size[0], nodeWidth()), sz[1]]);
            node.setDirtyCanvas?.(true, true);
        }
    };
    for (const w of node.widgets || []) {
        if (w.name && !w.__h3hidden) { w.__h3hidden = true; w.hidden = true; w.computeSize = () => [0, -4]; }
    }
    const dw = node.addDOMWidget("h3ui", "h3", root, { serialize: false, hideOnZoom: false, getMinHeight: () => ui.h, getHeight: () => ui.h });
    if (dw) dw.serialize = false;
    node.color = "#1b1d22";
    node.bgcolor = "#17191e";
    node.setSize([Math.max(node.size[0], nodeWidth()), node.size[1]]);
    ui.fit = fit;
    ui.setLive = (d) => {
        const first = !ui.live;
        ui.live = { frames: d.frames, step: d.step, total: d.total, fps: d.fps || 6, i: ui.live?.i || 0 };
        ui.busy = true;
        const img = inner.querySelector("[data-live]");
        if (!img || first) { ui.refresh(); } else {
            const b = inner.querySelector(".h3-livebadge"); if (b) b.textContent = `● LIVE · step ${d.step}/${d.total}`;
            const bar = inner.querySelector(".h3-livebar"); if (bar) bar.style.width = Math.round(100 * d.step / d.total) + "%";
        }
        if (!ui.anim) ui.anim = setInterval(() => {
            const im = inner.querySelector("[data-live]");
            if (!ui.live || !im) return;
            ui.live.i = (ui.live.i + 1) % ui.live.frames.length;
            im.src = "data:image/jpeg;base64," + ui.live.frames[ui.live.i];
        }, Math.round(1000 / (ui.live.fps || 6)));
    };
    ui.stopLive = () => { clearInterval(ui.anim); ui.anim = null; ui.live = null; };
    requestAnimationFrame(() => ui.refresh());
    loadHistory().then(() => ui.refresh());
    return ui;
}


// ------------------------------------------------------------------ settings survive updates (restore by name, rescue old workflows)
const W_V22 = ["mode", "prompt", "auto_header", "style", "first_image", "last_image", "mid_on", "mid_image", "mid_position", "ref_images", "ref_video", "ref_video_sound", "ref_audio", "ref_image_size", "refmods", "refmod_retention", "refmod_hint", "drive_on", "drive_audio", "drive_start", "duration", "aspect", "resolution", "custom_width", "custom_height", "upscale", "upscaler", "speed", "loras", "steps", "seed", "control_after_generate", "sampler_name", "scheduler", "shift_on", "shift_video", "shift_audio", "variations", "story_on", "story", "control_mode", "control_video", "control_type", "control_strength", "control_end", "control_patch", "retouch_source", "retouch_box", "retouch_start", "retouch_end", "retouch_keep_sound", "interpolate", "interp_model", "sign_on", "sign_text", "sign_pos", "sign_size", "sign_opacity", "social", "social_focus", "model_keyframes", "model_references", "text_encoder", "video_vae", "audio_vae", "turbo_keyframes", "turbo_references", "weight_dtype", "prompt_cache", "keep_loaded", "free_text_encoder", "attention", "sparse_attention", "sparse_tau", "tiled_decode", "save_on", "folder", "filename"];
const without = (a, rm) => a.filter((x) => !rm.includes(x));
const W_V20 = without(W_V22, ["refmods", "refmod_retention", "refmod_hint", "loras"]);
const W_V12 = without(W_V20, ["variations", "story_on", "story", "control_mode", "control_video", "control_type", "control_strength", "control_end", "control_patch", "retouch_source", "retouch_box", "retouch_start", "retouch_end", "retouch_keep_sound", "interpolate", "interp_model", "sign_on", "sign_text", "sign_pos", "sign_size", "sign_opacity", "social", "social_focus"]);
const W_V11 = without(W_V12, ["custom_width", "custom_height"]);
const W_V10 = (() => { const a = without(W_V11, ["upscale", "upscaler", "prompt_cache", "keep_loaded", "free_text_encoder", "attention", "sparse_attention", "sparse_tau", "tiled_decode"]); a[a.indexOf("resolution")] = "quality"; return a; })();
const W_V23 = (() => { const a = W_V22.slice(); a.splice(a.indexOf("attention") + 1, 0, "torch_compile", "preview_every"); return a; })();
const W_V25 = (() => { const a = W_V23.slice(); a.splice(a.indexOf("tiled_decode") + 1, 0, "step_cache", "low_vram"); return a; })();
const W_V26 = (() => { const a = W_V25.slice(); a.splice(a.indexOf("low_vram") + 1, 0, "polish_on", "polish_model", "polish_te", "polish_vae", "polish_denoise", "polish_steps", "polish_mode", "polish_stable", "polish_prompt"); return a; })();
const W_V27 = (() => { const a = W_V26.slice(); a.splice(a.indexOf("polish_prompt") + 1, 0, "dlss_on", "dlss_style", "dlss_intensity", "dlss_structure", "dlss_tone"); return a; })();
const W_V28 = (() => { const a = W_V27.slice(); a.splice(a.indexOf("custom_height") + 1, 0, "custom_mp"); return a; })();
const W_V29 = W_V28.filter((n) => !n.startsWith("dlss_"));
const LAYOUTS = [W_V29, W_V28, W_V27, W_V26, W_V25, W_V23, W_V22, W_V20, W_V12, W_V11, W_V10];
function validFor(w, v) {
    if (!w || v === undefined || v === null) return false;
    const vals = w.options?.values;
    if (Array.isArray(vals)) return vals.includes(v);
    const d = w.__h3def;
    if (typeof d === "boolean") return typeof v === "boolean";
    if (typeof d === "number") { if (typeof v !== "number") return false; const o = w.options || {}; return (o.min == null || v >= o.min) && (o.max == null || v <= o.max); }
    if (typeof d === "string") {
        if (typeof v !== "string") return false;
        if (["ref_images", "refmods", "loras", "story", "social"].includes(w.name)) return /^\s*\[/.test(v);
        if (w.name === "retouch_box") return /^\s*\{/.test(v);
        return true;
    }
    return true;
}
function restoreWidgets(node, info) {
    const named = info?.properties?.h3_values;
    const byName = {};
    for (const w of node.widgets || []) byName[w.name] = w;
    let applied = 0, rescued = false;
    if (named && typeof named === "object") {
        for (const [k, v] of Object.entries(named)) { const w = byName[k]; if (w && validFor(w, v)) { w.value = v; applied++; } else if (w) w.value = w.__h3def; }
    } else if (Array.isArray(info?.widgets_values)) {
        const arr = info.widgets_values;
        let best = null, bestScore = -1;
        for (const lay of LAYOUTS) {
            let sc = 0;
            lay.forEach((name, i) => { if (i < arr.length && byName[name] && validFor(byName[name], arr[i])) sc++; });
            if (sc > bestScore) { bestScore = sc; best = lay; }
        }
        if (best && best !== W_V29) rescued = true;
        for (const w of node.widgets || []) if (w.__h3def !== undefined) w.value = w.__h3def;   // start from defaults
        best.forEach((name, i) => {
            const w = byName[name]; if (!w || i >= arr.length) return;
            let v = arr[i];
            if (name === "quality") return;
            if (validFor(w, v)) { w.value = v; applied++; }
        });
        if (best === W_V10) { const q = arr[W_V10.indexOf("quality")]; if (typeof q === "number" && byName.resolution) byName.resolution.value = q >= 0.99 ? "768p" : q >= 0.9 ? "720p" : q >= 0.8 ? "640p" : q >= 0.7 ? "576p" : "480p"; }
    }
    if (rescued) console.info("[Enzino H3 Studio] settings of an older version restored by name");
    return applied;
}


// ------------------------------------------------------------------ Free edition: Studio & Simple are Full
function lockedCard(nodeType, nodeData) {
    const simple = nodeData.name === "EnzinoH3Simple";
    const oc = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
        const r = oc?.apply(this, arguments);
        const el = document.createElement("div");
        const paint = () => {
            el.innerHTML = `<div style="box-sizing:border-box;height:100%;padding:18px 20px;border-radius:14px;background:linear-gradient(135deg,#1d2026,#15171b);border:1px solid #2a2e36;color:#ecebe7;font:13px/1.5 Inter,system-ui,sans-serif;display:flex;flex-direction:column;gap:10px">
                <div style="font-size:11px;font-weight:800;letter-spacing:.1em;color:#f2a65a">🔒 ${L("FULL EDITION", "ÉDITION FULL")}</div>
                <div style="font-size:19px;font-weight:800">✦ Enzino H3 ${simple ? "Simple" : "Studio"}</div>
                <div style="color:#a5abb6">${simple ? L("MiniMax H3 in one simple card: picture, prompt, duration, format, quality.", "MiniMax H3 en une seule carte : image, prompt, durée, format, qualité.")
                    : L("Every mode and every setting in one node: end frame, mid keyframe, your own sound, story mode, motion control, retouch, variations.", "Tous les modes et tous les réglages dans un node : image de fin, image du milieu, ton propre son, mode histoire, contrôle du mouvement, retouche, variations.")}</div>
                <div style="color:#a5abb6">${L("Your Free edition includes the <b style='color:#ecebe7'>✦ Enzino H3 WF</b> nodes: open <code>workflows/enzino_h3_wf.json</code>.", "Ton édition Free contient les nodes <b style='color:#ecebe7'>✦ Enzino H3 WF</b> : ouvre <code>workflows/enzino_h3_wf.json</code>.")}</div>
                <a href="${FULL_URL}" target="_blank" rel="noopener" style="margin-top:auto;align-self:flex-start;background:#f2a65a;color:#17191e;font-weight:800;text-decoration:none;padding:9px 16px;border-radius:10px">✦ ${L("Get the Full edition", "Obtenir l'édition Full")} · ${FULL_PRICE}</a></div>`;
        };
        paint();
        this.__h3paint = paint;
        this.addDOMWidget("h3locked", "h3", el, { serialize: false, hideOnZoom: false, getMinHeight: () => 250, getHeight: () => 250 });
        this.size = [440, 300];
        return r;
    };
    const ocf = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
        const r = ocf?.apply(this, arguments);
        try { for (let i = (this.outputs || []).length - 1; i >= 0; i--) this.removeOutput(i); for (let i = (this.inputs || []).length - 1; i >= 0; i--) this.removeInput(i); } catch { }
        this.size = [440, 300]; return r;
    };   // a Full workflow's big node → the small card
}

// ------------------------------------------------------------------ registration
app.registerExtension({
    name: "Enzino.H3Studio",
    settings: [{ id: "EnzinoH3.Language", name: "Enzino H3 Studio — language / langue", type: "combo", options: ["English", "Français"], defaultValue: "English",
        category: ["Enzino", "H3 Studio", "Language"], onChange: () => refreshAll() }],
    setup() {
        api.addEventListener("enzino_h3.status", ({ detail }) => {
            const n = allNodes().find((x) => String(x.id) === String(detail?.node));
            if (n?.__h3) { n.__h3.status = detail.text; n.__h3.busy = !/^Done/.test(detail.text); n.__h3.refresh(); }
        });
        api.addEventListener("enzino_h3.preview", ({ detail }) => {
            const n = allNodes().find((x) => String(x.id) === String(detail?.node));
            n?.__h3?.setLive(detail);
        });
        api.addEventListener("execution_start", () => allNodes().forEach((n) => { if (n.__h3) { n.__h3.runError = null; n.__h3.refresh(); } }));
        api.addEventListener("execution_error", ({ detail }) => {
            const n = allNodes().find((x) => String(x.id) === String(detail?.node_id));
            if (n?.__h3) { n.__h3.runError = `${detail.exception_type || "Error"}: ${detail.exception_message || ""}`.trim(); n.__h3.refresh(); }
        });
        // validation errors are stored by the frontend after Run: show them in the node as soon as they change
        setInterval(() => { for (const n of allNodes()) { const e = JSON.stringify(app.lastNodeErrors?.[String(n.id)]?.errors || []); if (n.__h3 && n.__h3.__lastErr !== e) { n.__h3.__lastErr = e; n.__h3.refresh(); } } }, 800);
        api.addEventListener("execution_error", () => allNodes().forEach((n) => { if (n.__h3?.busy) { n.__h3.busy = false; n.__h3.status = L("Stopped: see the error message", "Arrêté : voir le message d'erreur"); n.__h3.stopLive(); n.__h3.refresh(); } }));
        api.addEventListener("execution_success", () => loadSys().then(() => allNodes().forEach((n) => n.__h3?.refresh())));
        api.addEventListener("execution_interrupted", () => allNodes().forEach((n) => { if (n.__h3?.busy) { n.__h3.busy = false; n.__h3.status = L("Cancelled", "Annulé"); n.__h3.stopLive(); n.__h3.refresh(); } }));
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!H3TYPES.includes(nodeData.name)) return;
        if (!PRO) { lockedCard(nodeType, nodeData); return; }
        const oc = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = oc?.apply(this, arguments);
            for (const w of this.widgets || []) if (w.name && w.__h3def === undefined) w.__h3def = w.value;
            this.__h3 = buildUI(this);
            return r;
        };
        const ocf = nodeType.prototype.onConfigure;
        const osz = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function (o) {
            osz?.apply(this, arguments);
            o.properties = o.properties || {};
            o.properties.h3_values = Object.fromEntries((this.widgets || []).filter((w) => w.name && w.type !== "h3").map((w) => [w.name, w.value]));
        };
        nodeType.prototype.onConfigure = function (info) {
            const r = ocf?.apply(this, arguments);
            try { restoreWidgets(this, info); } catch (e) { console.warn("[Enzino H3 Studio] restore", e); }
            for (const w of this.widgets || []) if (w.name && w.type !== "h3") { w.hidden = true; w.computeSize = () => [0, -4]; }
            if (this.properties?.h3_last && !this.__h3last) this.__h3last = this.properties.h3_last;
            requestAnimationFrame(() => this.__h3?.refresh());
            return r;
        };
        const oe = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (msg) {
            const r = oe?.apply(this, arguments);
            const d = msg?.enzino_h3?.[0];
            if (d) {
                this.__h3last = d;
                this.__h3batch = msg.enzino_h3;
                this.properties = this.properties || {};
                this.properties.h3_last = { ...d, settings: undefined };
                if (this.__h3) { this.__h3.sel = null; this.__h3.busy = false; this.__h3.stopLive(); }
                loadHistory().then(() => {
                    const h = HISTORY.find((x) => x.video?.filename === d.video?.filename && x.video?.subfolder === d.video?.subfolder);
                    if (h) this.__h3last = h;
                    this.__h3?.refresh();
                });
            }
            return r;
        };
    },
});
