// ascolto.js - Consiglia video YouTube in coreano adatti al tuo livello,
// senza mai riproporre un video già consigliato.
//
// Come funziona (uguale al programma di francese, ma senza yt-dlp, che
// in un sito non può girare):
//   1. Gemini propone alcune ricerche YouTube adatte al livello.
//   2. Con la chiave di YouTube (facoltativa) le ricerche vengono fatte con
//      la YouTube Data API, che restituisce video REALI; si scartano quelli
//      già consigliati e Gemini sceglie i migliori spiegando perché.
//   3. Senza la chiave di YouTube l'app mostra le ricerche proposte come
//      link a YouTube: niente video inventati, ma lo storico non c'è.

import { DESCRIZIONE_LIVELLI, impostazioni, leggi, scrivi } from "./archivio.js";
import { chiediGemini, descriviErrore } from "./gemini.js";
import { avviso, el, riempi } from "./utili.js";

const NUMERO_RICERCHE = 4;
const RISULTATI_PER_RICERCA = 8;
const VIDEO_DA_CONSIGLIARE = 3;
const TENTATIVI_MASSIMI = 3;

let contenitore;

export function mostra(dove) {
  contenitore = dove;
  mostraModulo();
}

function mostraModulo(risultato = null) {
  const imp = impostazioni();
  const visti = leggi("videoVisti", []);
  const argomento = el("input", { type: "text", id: "argomento-ascolto", placeholder: "es. cucina, viaggi, K-drama", autocomplete: "off" });

  const modulo = el("form.scheda", {
    onsubmit: (e) => { e.preventDefault(); cerca(argomento.value.trim(), modulo); },
  },
    el("label", { for: "argomento-ascolto" }, "Argomento preferito (facoltativo)"),
    argomento,
    el("button.primario", { type: "submit" }, imp.chiaveYoutube ? "Trova video nuovi" : "Proponimi delle ricerche"),
  );

  riempi(contenitore, 
    el("header.testata", {}, el("h1", {}, "Ascolto"), el("p.sottotitolo", {}, `Video in coreano per il livello ${imp.livello}.`)),
    !imp.chiaveGemini && avviso("Per questa sezione serve la chiave di Gemini: inseriscila in Impostazioni.", "errore"),
    !imp.chiaveYoutube && imp.chiaveGemini && avviso("Senza la chiave di YouTube ti propongo delle ricerche da aprire su YouTube. Con la chiave (Impostazioni) trovo direttamente i video e non te li ripropongo mai."),
    modulo,
    el("div.risultati", { "aria-live": "polite" }, risultato),
    visti.length > 0 && storico(visti),
  );
}

function storico(visti) {
  return el("details.scheda.storico", {},
    el("summary", {}, `Video già consigliati (${visti.length})`),
    el("ul.lista-video.compatta", {}, [...visti].reverse().map((v) =>
      el("li", {}, el("a", { href: v.url, target: "_blank", rel: "noopener" }, v.titolo), el("span.nota", {}, ` · ${v.data}`)))),
  );
}

async function cerca(argomento, modulo) {
  const bottone = modulo.querySelector("button");
  bottone.disabled = true;
  const stato = el("p.caricamento", {}, "Chiedo a Gemini cosa cercare...");
  contenitore.querySelector(".risultati").replaceChildren(stato);
  try {
    const imp = impostazioni();
    const risultato = imp.chiaveYoutube
      ? await trovaVideoNuovi(imp, argomento, (testo) => { stato.textContent = testo; })
      : await soloRicerche(imp, argomento);
    mostraModulo(risultato);
  } catch (errore) {
    mostraModulo(avviso(`Errore durante la ricerca: ${descriviErrore(errore)}`, "errore"));
  }
}

// --- Prompt a Gemini --------------------------------------------------

function descrizioneStudente(livello) {
  return `Sono un'italiana che studia il coreano, livello ${livello} (${DESCRIZIONE_LIVELLI[livello]}) del QCER.`;
}

function indicazioniLivello(livello) {
  return livello === "A1" || livello === "A2"
    ? "Per il mio livello vanno bene video pensati per chi impara: coreano parlato lento, sottotitoli, dialoghi semplici; vanno bene anche lezioni per principianti spiegate in italiano o in inglese, purché facciano sentire molto coreano."
    : "Per il mio livello vanno bene anche contenuti autentici per madrelingua (vlog, interviste, varietà, podcast, YouTuber coreani).";
}

async function proponiRicerche(imp, argomento, titoliRecenti, ricercheUsate) {
  let prompt = `${descrizioneStudente(imp.livello)} Voglio esercitare la comprensione orale con video YouTube.\n`
    + `Proponi ${NUMERO_RICERCHE} ricerche YouTube diverse tra loro (scritte come le scriverei nella barra di ricerca, in coreano, inglese o italiano a seconda di cosa trova i video migliori) per trovare video adatti al mio livello. `
    + `${indicazioniLivello(imp.livello)}\n`
    + "Per ogni ricerca scrivi in italiano una breve motivazione (una frase).\n";
  if (argomento) prompt += `Argomento richiesto: ${argomento}.\n`;
  if (titoliRecenti.length) prompt += `Per variare, evita di ripetere i temi di questi video che ho già visto:\n- ${titoliRecenti.join("\n- ")}\n`;
  if (ricercheUsate.length) prompt += `Non riproporre queste ricerche, già fatte senza trovare video nuovi:\n- ${ricercheUsate.join("\n- ")}\n`;

  const dati = await chiediGemini(prompt, {
    type: "object",
    properties: {
      ricerche: {
        type: "array",
        items: { type: "object", properties: { testo: { type: "string" }, motivo: { type: "string" } }, required: ["testo", "motivo"] },
      },
    },
    required: ["ricerche"],
  });
  return (dati.ricerche || []).filter((r) => r.testo?.trim()).slice(0, NUMERO_RICERCHE);
}

async function scegliMigliori(imp, argomento, candidati) {
  const elenco = candidati.map((v, i) =>
    `${i}. "${v.titolo}" - canale: ${v.canale} - durata: ${formattaDurata(v.durata)} - visualizzazioni: ${v.visualizzazioni ?? "?"}`).join("\n");
  const prompt = `${descrizioneStudente(imp.livello)} Tra questi video YouTube scegli i ${VIDEO_DA_CONSIGLIARE} più adatti per esercitare la comprensione orale del coreano al mio livello `
    + `(${indicazioniLivello(imp.livello)} Possibilmente di argomenti diversi tra loro${argomento ? `; argomento richiesto: ${argomento}` : ""}).\n`
    + `Per ognuno scrivi in italiano una breve motivazione (una frase).\n\n${elenco}`;

  const dati = await chiediGemini(prompt, {
    type: "object",
    properties: {
      scelti: {
        type: "array",
        items: { type: "object", properties: { indice: { type: "integer" }, motivo: { type: "string" } }, required: ["indice", "motivo"] },
      },
    },
    required: ["scelti"],
  });

  const scelti = [];
  const indiciUsati = new Set();
  for (const voce of dati.scelti || []) {
    // Accettiamo solo indici validi: così non può "inventarsi" video
    if (Number.isInteger(voce.indice) && voce.indice >= 0 && voce.indice < candidati.length && !indiciUsati.has(voce.indice)) {
      indiciUsati.add(voce.indice);
      scelti.push({ ...candidati[voce.indice], motivo: voce.motivo || "" });
    }
  }
  return scelti.slice(0, VIDEO_DA_CONSIGLIARE);
}

// --- Senza chiave di YouTube: solo link alle ricerche -----------------

async function soloRicerche(imp, argomento) {
  const usate = leggi("ricercheProposte", []);
  const ricerche = await proponiRicerche(imp, argomento, [], usate.slice(-20));
  if (!ricerche.length) return avviso("Gemini non ha proposto nessuna ricerca, riprova.", "errore");
  scrivi("ricercheProposte", [...usate, ...ricerche.map((r) => r.testo)].slice(-60));
  return el("section", {},
    el("h2.titolo-sezione", {}, "Cerca questi video su YouTube"),
    el("ul.lista-video", {}, ricerche.map((r) => el("li.scheda", {},
      el("a.titolo-video", { href: `https://www.youtube.com/results?search_query=${encodeURIComponent(r.testo)}`, target: "_blank", rel: "noopener" }, r.testo),
      el("p.nota", {}, r.motivo)))),
  );
}

// --- Con chiave di YouTube: video reali -------------------------------

async function trovaVideoNuovi(imp, argomento, aggiorna) {
  const visti = leggi("videoVisti", []);
  const idVisti = new Set(visti.map((v) => v.id));
  const titoliRecenti = visti.slice(-15).map((v) => v.titolo);
  const ricercheUsate = [];

  for (let tentativo = 0; tentativo < TENTATIVI_MASSIMI; tentativo++) {
    aggiorna("Chiedo a Gemini cosa cercare...");
    const ricerche = (await proponiRicerche(imp, argomento, titoliRecenti, ricercheUsate)).map((r) => r.testo);
    ricercheUsate.push(...ricerche);

    const candidati = [];
    const idCandidati = new Set();
    for (const ricerca of ricerche) {
      aggiorna(`Cerco su YouTube: ${ricerca}`);
      for (const id of await cercaSuYoutube(imp.chiaveYoutube, ricerca)) {
        if (!idVisti.has(id) && !idCandidati.has(id)) { idCandidati.add(id); candidati.push(id); }
      }
    }

    const video = await dettagliVideo(imp.chiaveYoutube, candidati);
    if (video.length) {
      aggiorna(`Trovati ${video.length} video nuovi, Gemini sceglie i migliori...`);
      const scelti = await scegliMigliori(imp, argomento, video);
      if (scelti.length) {
        // I video consigliati vengono segnati subito come "visti": non
        // verranno mai riproposti, anche se non li apri.
        const oggi = new Date().toISOString().slice(0, 10);
        scrivi("videoVisti", [...visti, ...scelti.map((v) => ({ id: v.id, titolo: v.titolo, url: v.url, data: oggi, livello: imp.livello }))]);
        return elencoVideo(scelti, imp.livello);
      }
    }
  }
  return avviso("Non sono riuscito a trovare video nuovi, riprova con un altro argomento.", "errore");
}

async function chiamaYoutube(percorso, parametri, chiave) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${percorso}`);
  for (const [k, v] of Object.entries({ ...parametri, key: chiave })) url.searchParams.set(k, v);
  const risposta = await fetch(url);
  const dati = await risposta.json().catch(() => ({}));
  if (!risposta.ok) {
    const motivo = dati.error?.errors?.[0]?.reason || dati.error?.status || risposta.status;
    if (motivo === "quotaExceeded") throw new Error("hai superato il limite giornaliero gratuito di YouTube: riprova domani.");
    if (/keyInvalid|API_KEY_INVALID|badRequest/.test(motivo) || /API key/.test(dati.error?.message || "")) {
      throw new Error("la chiave di YouTube non è valida (o la YouTube Data API non è attiva): controllala in Impostazioni.");
    }
    throw new Error(`YouTube: ${dati.error?.message || motivo}`);
  }
  return dati;
}

async function cercaSuYoutube(chiave, ricerca) {
  const dati = await chiamaYoutube("search", {
    part: "id", type: "video", q: ricerca, maxResults: RISULTATI_PER_RICERCA, relevanceLanguage: "ko", safeSearch: "moderate",
  }, chiave);
  return (dati.items || []).map((v) => v.id?.videoId).filter(Boolean);
}

async function dettagliVideo(chiave, ids) {
  const video = [];
  // videos.list accetta al massimo 50 id per chiamata
  for (let i = 0; i < ids.length; i += 50) {
    const dati = await chiamaYoutube("videos", { part: "snippet,contentDetails,statistics", id: ids.slice(i, i + 50).join(",") }, chiave);
    for (const v of dati.items || []) {
      const durata = secondiDaIso(v.contentDetails?.duration);
      if (!durata || v.snippet?.liveBroadcastContent !== "none") continue; // scarta dirette
      video.push({
        id: v.id,
        titolo: v.snippet.title,
        canale: v.snippet.channelTitle,
        durata,
        visualizzazioni: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
        url: `https://www.youtube.com/watch?v=${v.id}`,
      });
    }
  }
  return video;
}

function secondiDaIso(durata) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(durata || "");
  return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
}

function formattaDurata(secondi) {
  if (!secondi) return "?";
  const ore = Math.floor(secondi / 3600);
  const minuti = Math.floor((secondi % 3600) / 60);
  const sec = String(secondi % 60).padStart(2, "0");
  return ore ? `${ore}:${String(minuti).padStart(2, "0")}:${sec}` : `${minuti}:${sec}`;
}

function elencoVideo(scelti, livello) {
  return el("section", {},
    el("h2.titolo-sezione", {}, `Video consigliati (livello ${livello})`),
    el("ul.lista-video", {}, scelti.map((v) => el("li.scheda", {},
      el("a.titolo-video", { href: v.url, target: "_blank", rel: "noopener" }, v.titolo),
      el("p.meta", {}, `${v.canale} · ${formattaDurata(v.durata)}`),
      v.motivo && el("p.nota", {}, v.motivo)))),
  );
}
