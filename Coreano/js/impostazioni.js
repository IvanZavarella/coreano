// impostazioni.js - Livello, chiavi API, modelli di Gemini e backup.

import { DESCRIZIONE_LIVELLI, LIVELLI, esportaBackup, importaBackup, impostazioni, salvaImpostazioni } from "./archivio.js";
import { avviso, el, riempi } from "./utili.js";

let contenitore;

export function mostra(dove) {
  contenitore = dove;
  mostraModulo();
}

function campo(id, etichetta, valore, { tipo = "text", nota = null, segreto = false } = {}) {
  const input = el("input", { type: segreto ? "password" : tipo, id, value: valore, autocomplete: "off", spellcheck: "false" });
  return el("div.campo", {},
    el("label", { for: id }, etichetta),
    segreto
      ? el("div.con-bottone", {}, input, el("button", {
          type: "button",
          onclick: (e) => {
            input.type = input.type === "password" ? "text" : "password";
            e.currentTarget.textContent = input.type === "password" ? "Mostra" : "Nascondi";
          },
        }, "Mostra"))
      : input,
    nota && el("p.nota", {}, nota),
  );
}

function mostraModulo(messaggio = null) {
  const imp = impostazioni();
  const valore = (id) => contenitore.querySelector(`#${id}`).value.trim();

  const modulo = el("form", {
    onsubmit: (e) => {
      e.preventDefault();
      const ok = salvaImpostazioni({
        ...impostazioni(),
        livello: valore("livello"),
        chiaveGemini: valore("chiave-gemini"),
        chiaveYoutube: valore("chiave-youtube"),
        modelloTesto: valore("modello-testo") || imp.modelloTesto,
        modelloLive: valore("modello-live") || imp.modelloLive,
        voce: valore("voce") || imp.voce,
      });
      mostraModulo(ok ? avviso("Impostazioni salvate.") : avviso("Il browser non mi permette di salvare (navigazione privata?).", "errore"));
    },
  },
    el("section.scheda", {},
      el("h2", {}, "Il tuo livello"),
      el("div.campo", {},
        el("label", { for: "livello" }, "Livello di coreano"),
        el("select", { id: "livello" }, LIVELLI.map((l) =>
          el("option", { value: l, selected: l === imp.livello }, `${l} - ${DESCRIZIONE_LIVELLI[l]}`))),
        el("p.nota", {}, "Serve all'insegnante e ai video consigliati. Se parti da zero lascia A1."))),

    el("section.scheda", {},
      el("h2", {}, "Chiave di Gemini"),
      el("p", {}, "Serve per Ascolto e Parla. È gratuita: ",
        el("a", { href: "https://aistudio.google.com/apikey", target: "_blank", rel: "noopener" }, "creala qui"),
        " con un account Google (\"Create API key\"), poi copiala e incollala sotto."),
      campo("chiave-gemini", "Chiave API di Gemini", imp.chiaveGemini, { segreto: true, nota: "Resta salvata solo su questo telefono. Non condividerla." })),

    el("section.scheda", {},
      el("h2", {}, "Chiave di YouTube (facoltativa)"),
      el("p", {}, "Con questa chiave Ascolto trova direttamente i video e non te li ripropone mai. Senza, ti propone delle ricerche da aprire su YouTube."),
      el("details", {},
        el("summary", {}, "Come ottenerla (5 minuti, gratis)"),
        el("ol.passi", {},
          el("li", {}, "Apri ", el("a", { href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com", target: "_blank", rel: "noopener" }, "YouTube Data API v3"), " con lo stesso account Google e scegli il progetto (va bene quello creato da AI Studio)."),
          el("li", {}, "Tocca \"Abilita\"."),
          el("li", {}, "Vai su ", el("a", { href: "https://console.cloud.google.com/apis/credentials", target: "_blank", rel: "noopener" }, "Credenziali"), ", \"Crea credenziali\" > \"Chiave API\", e copiala qui."))),
      campo("chiave-youtube", "Chiave API di YouTube", imp.chiaveYoutube, { segreto: true })),

    el("details.scheda", {},
      el("summary", {}, "Impostazioni avanzate"),
      el("p.nota", {}, "Se Google rinomina un modello e qualcosa smette di funzionare, aggiorna il nome qui."),
      campo("modello-testo", "Modello per video e riepiloghi", imp.modelloTesto),
      campo("modello-live", "Modello per la conversazione", imp.modelloLive),
      campo("voce", "Voce dell'insegnante", imp.voce, { nota: "Per esempio Kore, Puck, Charon, Aoede." })),

    el("button.primario.grande", { type: "submit" }, "Salva"),
  );

  const inputBackup = el("input", { type: "file", id: "file-backup", accept: ".json,application/json", hidden: true, onchange: caricaBackup });

  riempi(contenitore, 
    el("header.testata", {}, el("h1", {}, "Impostazioni")),
    messaggio,
    modulo,
    el("section.scheda", {},
      el("h2", {}, "Backup"),
      el("p", {}, "Tutto (mazzi importati, video visti, conversazioni) è salvato solo in questo browser. Per passare a un altro dispositivo scarica il backup e caricalo lì. Le chiavi non sono incluse."),
      el("div.azioni", {},
        el("button", { type: "button", onclick: scaricaBackup }, "Scarica il backup"),
        inputBackup,
        el("label.bottone", { for: "file-backup" }, "Carica un backup"))),
  );
}

function scaricaBackup() {
  const blob = new Blob([JSON.stringify(esportaBackup(), null, 2)], { type: "application/json" });
  const link = el("a", { href: URL.createObjectURL(blob), download: `coreano-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function caricaBackup(evento) {
  const file = evento.target.files?.[0];
  if (!file) return;
  try {
    importaBackup(JSON.parse(await file.text()));
    mostraModulo(avviso("Backup caricato."));
  } catch (errore) {
    mostraModulo(avviso(`Impossibile caricare il backup: ${errore.message}`, "errore"));
  }
}
