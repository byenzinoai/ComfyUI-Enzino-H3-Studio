/* ✦ Enzino H3 — prompt helper forms (shared): small forms that write correct MiniMax H3 sentences. by Enzino */
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
export const lastShot = (t) => { const m = [...String(t || "").matchAll(/\[\s*Shot\s+(\d+)\s*\]/gi)].map((x) => +x[1]); return m.length ? Math.max(...m) : 1; };
export { LANGS, CAM_MOVES, FRAMES, TRANS, AGES, GENDERS, VOICES, PACES, EMOTIONS, TEXT_KINDS, SOUNDS, MUSIC, TEMPOS, DYNAMICS, mmss, speakersIn, cap, joinAnd, helperBuild };
