// utili.js - Piccoli aiuti condivisi: creazione di elementi HTML,
// pronuncia con la sintesi vocale del telefono, mescolamento.

// el("button.primario", {onclick}, "Testo", altroElemento)
export function el(descrizione, attributi = {}, ...figli) {
  const [tag, ...classi] = descrizione.split(".");
  const nodo = document.createElement(tag || "div");
  if (classi.length) nodo.className = classi.join(" ");
  for (const [nome, valore] of Object.entries(attributi || {})) {
    if (valore === undefined || valore === null || valore === false) continue;
    if (nome.startsWith("on")) nodo.addEventListener(nome.slice(2), valore);
    else if (nome === "dataset") Object.assign(nodo.dataset, valore);
    else if (nome in nodo && typeof valore !== "string") nodo[nome] = valore;
    else nodo.setAttribute(nome, valore === true ? "" : valore);
  }
  for (const figlio of figli.flat()) {
    if (figlio === null || figlio === undefined || figlio === false) continue;
    nodo.append(figlio instanceof Node ? figlio : document.createTextNode(String(figlio)));
  }
  return nodo;
}

// Come nodo.replaceChildren, ma salta i figli null/false (es. un avviso
// che non c'è)
export function riempi(nodo, ...figli) {
  nodo.replaceChildren(...figli.flat().filter((f) => f !== null && f !== undefined && f !== false));
}

export function mescola(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export function haHangul(testo) {
  return /[ᄀ-ᇿ㄰-㆏가-힣]/.test(testo);
}

// --- Pronuncia --------------------------------------------------------

let voceCoreana = null;

function cercaVoce() {
  if (!("speechSynthesis" in window)) return;
  const voci = speechSynthesis.getVoices();
  voceCoreana = voci.find((v) => v.lang === "ko-KR") || voci.find((v) => v.lang?.startsWith("ko")) || null;
}

if ("speechSynthesis" in window) {
  cercaVoce();
  speechSynthesis.addEventListener?.("voiceschanged", cercaVoce);
}

export function puoPronunciare() {
  return "speechSynthesis" in window;
}

export function pronuncia(testo, lento = false) {
  if (!puoPronunciare()) return;
  speechSynthesis.cancel();
  const frase = new SpeechSynthesisUtterance(testo);
  frase.lang = "ko-KR";
  if (voceCoreana) frase.voice = voceCoreana;
  frase.rate = lento ? 0.6 : 0.85;
  speechSynthesis.speak(frase);
}

export function bottoneAscolta(testo, etichetta = "Ascolta") {
  if (!puoPronunciare()) return null;
  return el(
    "button.ascolta",
    { type: "button", "aria-label": `${etichetta}: ${testo}`, onclick: (e) => { e.stopPropagation(); pronuncia(testo); } },
    iconaAltoparlante(),
    el("span", {}, etichetta),
  );
}

export function iconaAltoparlante() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  return svg;
}

// Messaggio d'avviso/errore riutilizzabile
export function avviso(testo, tipo = "info") {
  return el(`p.avviso.${tipo}`, { role: tipo === "errore" ? "alert" : "status" }, testo);
}
