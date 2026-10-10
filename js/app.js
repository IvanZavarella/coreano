// app.js - Menu principale: una sezione per ogni scheda della barra in
// basso. La sezione aperta è nell'indirizzo (#hangul, #parole, ...), così
// il tasto "indietro" del telefono funziona.

import * as ascolto from "./ascolto.js";
import * as conversazione from "./conversazione.js";
import * as flashcard from "./flashcard.js";
import * as hangul from "./hangul.js";
import * as impostazioni from "./impostazioni.js";

const SEZIONI = {
  hangul,
  parole: flashcard,
  ascolto,
  parla: conversazione,
  impostazioni,
};

const vista = document.getElementById("vista");
let attuale = null;

function apri() {
  const nome = location.hash.slice(1) in SEZIONI ? location.hash.slice(1) : "hangul";
  attuale?.esci?.();
  attuale = SEZIONI[nome];
  for (const link of document.querySelectorAll(".navigazione a")) {
    if (link.getAttribute("href") === `#${nome}`) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
  attuale.mostra(vista);
}

window.addEventListener("hashchange", apri);
// Toccare la scheda già aperta la riporta all'inizio (es. esce da un mazzo)
for (const link of document.querySelectorAll(".navigazione a")) {
  link.addEventListener("click", () => { if (link.getAttribute("href") === location.hash) apri(); });
}
apri();
