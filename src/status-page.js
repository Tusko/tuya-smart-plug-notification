import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import "dayjs/locale/uk.js";
import humanizeDuration from "humanize-duration";

dayjs.extend(utc);
dayjs.extend(timezone);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const STATES = {
  online: { title: "Світло є", verb: "увімкнули", icon: "💡", bg: ["#FFD93B", "#17140A"] },
  offline: { title: "Світла немає", verb: "вимкнули", icon: "🕯️", bg: ["#E4E8F7", "#1E2447"] },
  unknown: { title: "Невідомо", verb: "", icon: "🔌", bg: ["#D9DCE3", "#1C1E24"] },
};

const CSS = `
:root{--bg:#D9DCE3;--ink:#1F1B4D;--muted:#4A4F63;--line:rgba(31,27,77,.25)}
[data-state=online]{--bg:#FFD93B;--muted:#5C4D00}
[data-state=offline]{--bg:#E4E8F7;--ink:#1E2447;--muted:#4F5880}
@media (prefers-color-scheme:dark){
:root{--bg:#1C1E24;--ink:#D9DCE3;--muted:#9095A3;--line:rgba(217,220,227,.2)}
[data-state=online]{--bg:#17140A;--ink:#FFD93B;--muted:#B8A65A}
[data-state=online] h1{text-shadow:0 0 .35em rgba(255,217,59,.35)}
[data-state=online] .mark span{filter:drop-shadow(0 0 .35em rgba(255,217,59,.8))}
[data-state=offline]{--bg:#1E2447;--ink:#E4E8F7;--muted:#9AA3C7}
}
:root{color-scheme:light dark}
*{margin:0;padding:0;box-sizing:border-box}
html{background:var(--bg);color:var(--ink);font:400 1.0625rem/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{max-width:40rem;margin:0 auto;padding:1.5rem 1.25rem 4rem}
a{color:inherit;text-underline-offset:.2em}
a:focus-visible,summary:focus-visible{outline:3px solid currentColor;outline-offset:3px;border-radius:2px}
header{display:flex;justify-content:space-between;gap:1rem;color:var(--muted);font-size:.9375rem}
header b{color:var(--ink)}
.hero{padding-bottom:3rem}
.mark{position:relative;width:max-content;padding-top:12vh;margin:0 auto 1.25rem;font-size:clamp(3.5rem,14vw,5rem);line-height:1;transform-origin:50% 0}
.mark span{display:block}
[data-state=online] .mark::before{content:"";position:absolute;top:-3rem;left:50%;width:2px;height:calc(12vh + 3rem + .12em);margin-left:-1px;background:var(--ink);opacity:.45}
[data-state=online] .mark{animation:swing 2.6s cubic-bezier(.3,.7,.4,1) both;transform-origin:50% -3rem;cursor:pointer;-webkit-tap-highlight-color:transparent}
[data-state=online] .mark span{transform:rotate(180deg);filter:drop-shadow(0 0 .25em rgba(255,255,255,.7))}
@keyframes swing{0%{transform:rotate(14deg)}25%{transform:rotate(-9deg)}50%{transform:rotate(5deg)}75%{transform:rotate(-2deg)}100%{transform:rotate(0)}}
[data-state=offline] .mark span{transform-origin:50% 100%;animation:flame 3.2s ease-in-out infinite}
@keyframes flame{0%,100%{transform:scale(1) skewX(0);filter:drop-shadow(0 -.1em .3em rgba(255,170,60,.45))}30%{transform:scale(1.02,1.04) skewX(-1.5deg);filter:drop-shadow(0 -.1em .45em rgba(255,170,60,.6))}60%{transform:scale(.99,1.01) skewX(1deg);filter:drop-shadow(0 -.1em .25em rgba(255,170,60,.35))}}
h1{font-size:clamp(3.75rem,17vw,7.5rem);font-weight:800;line-height:.88;letter-spacing:-.045em;text-wrap:balance}
[data-state=online] h1{animation:flicker .7s steps(1) both}
@keyframes flicker{0%{opacity:.15}20%{opacity:1}30%{opacity:.3}45%{opacity:1}55%{opacity:.6}70%{opacity:1}}
@media (prefers-reduced-motion:reduce){h1,.mark,.mark span{animation:none!important}}
.since{margin-top:1.25rem;font-size:clamp(1.25rem,4.5vw,1.75rem);font-weight:600;letter-spacing:-.01em}
.when{margin-top:.25rem;color:var(--muted)}
section{border-top:1px solid var(--line);padding-top:1.25rem;margin-top:2rem}
h2{font-size:1rem;font-weight:700;margin-bottom:.75rem}
section img{display:block;width:100%;height:auto;border-radius:10px;background:#fff}
.cal{display:inline-block;margin-top:1rem;font-weight:600}
details{color:var(--muted);font-size:.875rem}
summary{cursor:pointer}
pre{margin-top:.75rem;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:.8125rem}
`;

/** Unix seconds from a Firestore status, or null (fallback statuses carry a plain string). */
// Bulb hangs by gravity: tilt the phone and it sways back to world-vertical
// (spring-damped). Tap pushes it; on iOS the tap also asks for motion access.
// Uses the `rotate` property so it composes with the CSS load-swing transform.
// ponytail: gamma only, assumes portrait; landscape tilt maps to the wrong axis.
const BULB_JS = `(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const m = document.querySelector(".mark");
  let a = 0, v = 0, t = 0, raf = 0;
  const step = () => {
    v = (v + (t - a) * 0.03) * 0.94;
    a += v;
    m.style.rotate = a.toFixed(2) + "deg";
    raf = Math.abs(v) > 0.01 || Math.abs(t - a) > 0.05 ? requestAnimationFrame(step) : 0;
  };
  const go = () => { raf ||= requestAnimationFrame(step); };
  addEventListener("deviceorientation", (e) => {
    if (e.gamma == null) return;
    t = Math.max(-40, Math.min(40, -e.gamma));
    go();
  });
  m.addEventListener("click", () => {
    window.DeviceOrientationEvent?.requestPermission?.().catch(() => {});
    v += 4;
    go();
  });
})();`;

const statusSeconds = (s) => s?.datetime?.seconds ?? null;

export function renderStatusPage({ latestStatus, notify, lastGraphics, allStatuses = [], group, error, now = dayjs() }) {
  const key = STATES[latestStatus?.status] ? latestStatus.status : "unknown";
  const st = STATES[key];
  const seconds = statusSeconds(latestStatus);
  const since = seconds && dayjs(seconds * 1000);

  let sinceLine = "";
  let whenLine = "";
  if (error) {
    sinceLine = "Не вдалося отримати статус розетки.";
    whenLine = `${esc(error)}. Оновіть сторінку за кілька хвилин.`;
  } else if (since && key !== "unknown") {
    sinceLine = "вже " + humanizeDuration(now.diff(since), {
      language: "uk", largest: 2, round: true, units: ["d", "h", "m"], conjunction: " і ",
    });
    whenLine = `${st.verb} ${since.tz("Europe/Kyiv").locale("uk").format("D MMMM о HH:mm")}`;
  }

  const tech = [notify, latestStatus && JSON.stringify(latestStatus, null, 2), allStatuses.length && JSON.stringify(allStatuses, null, 2)]
    .filter(Boolean).map(esc).join("\n\n");

  return `<!doctype html>
<html lang="uk" data-state="${key}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="${st.bg[0]}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${st.bg[1]}" media="(prefers-color-scheme: dark)">
<title>${st.title} · СвітлоЄ</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${st.icon}</text></svg>">
<style>${CSS}</style>
</head>
<body>
<header><b>СвітлоЄ</b>${group ? `<span>група ${esc(group)}</span>` : ""}</header>
<main>
<div class="hero">
<div class="mark" aria-hidden="true"><span>${st.icon}</span></div>
<h1>${st.title}</h1>
${sinceLine ? `<p class="since">${sinceLine}</p>` : ""}
${whenLine ? `<p class="when">${whenLine}</p>` : ""}
</div>
${lastGraphics || group ? `<section>
<h2>Графік відключень</h2>
${lastGraphics ? `<img src="${esc(lastGraphics)}" alt="Графік погодинних відключень ЛОЕ">` : ""}
${group ? `<a class="cal" href="/calendar/${esc(group)}.ics">📅 Додати графік групи ${esc(group)} у календар</a>` : ""}
</section>` : ""}
${tech ? `<section><details><summary>Технічні дані</summary><pre>${tech}</pre></details></section>` : ""}
</main>
${key === "online" ? `<script>${BULB_JS}</script>` : ""}
</body>
</html>`;
}
