// flashcard.js - Vocabolario con flashcard "da quaderno": l'app mostra la
// parola, tu scrivi la traduzione sul quaderno, poi scopri la risposta e
// segni se l'avevi giusta. Niente tastiera coreana.
//
// Come nel programma di francese: le carte sono divise in blocchi; alla
// fine di ogni blocco puoi ripassare subito le sbagliate (finché non le
// indovini tutte o smetti), e alla fine vedi un riepilogo.
//
// Oltre ai mazzi già pronti puoi importare un CSV con due o tre colonne
// (coreano, italiano, romanizzazione facoltativa), separate da , o ;

import { impostazioni, leggi, salvaImpostazioni, scrivi } from "./archivio.js";
import { MAZZI } from "./dati.js";
import { avviso, bottoneAscolta, el, riempi, haHangul, mescola, pronuncia } from "./utili.js";

const DIREZIONI = [
  ["ko-it", "Coreano → italiano"],
  ["it-ko", "Italiano → coreano"],
  ["casuale", "A caso"],
];
const NUMERI_BLOCCO = [5, 10, 20, 0]; // 0 = tutte

let contenitore;
let opzioni = leggi("opzioniFlashcard", { direzione: "ko-it", numero: 10, mescola: true });

function tuttiIMazzi() {
  return [...MAZZI, ...leggi("mazziImportati", [])];
}

export function mostra(dove) {
  contenitore = dove;
  mostraScelta();
}

// --- Scelta del mazzo ---------------------------------------------------

function mostraScelta(messaggio = null) {
  const mazzi = tuttiIMazzi();
  const importati = new Set(leggi("mazziImportati", []).map((m) => m.id));
  const imp = impostazioni();

  const segmento = (valori, chiave, etichetta) => el("fieldset.opzione-riga", {},
    el("legend", {}, etichetta),
    el("div.segmenti.piccoli", {}, valori.map(([valore, nome]) =>
      el("button", {
        type: "button",
        "aria-pressed": String(opzioni[chiave] === valore),
        onclick: (e) => {
          opzioni[chiave] = valore;
          scrivi("opzioniFlashcard", opzioni);
          for (const b of e.currentTarget.parentNode.children) b.setAttribute("aria-pressed", String(b === e.currentTarget));
        },
      }, nome))),
  );

  const inputCsv = el("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain", id: "file-csv", hidden: true, onchange: importaCsv });

  riempi(contenitore, 
    el("header.testata", {}, el("h1", {}, "Parole"), el("p.sottotitolo", {}, "Guarda la parola, scrivi la traduzione sul quaderno, poi scopri la risposta.")),
    messaggio,
    el("section.scheda.impostazioni-sessione", {},
      segmento(DIREZIONI, "direzione", "Direzione"),
      segmento(NUMERI_BLOCCO.map((n) => [n, n ? String(n) : "Tutte"]), "numero", "Carte per blocco"),
      segmento([[true, "Mescolate"], [false, "In ordine"]], "mescola", "Ordine"),
      el("label.interruttore", {},
        el("input", {
          type: "checkbox", id: "mostra-rom", checked: imp.romanizzazione,
          onchange: (e) => salvaImpostazioni({ ...impostazioni(), romanizzazione: e.target.checked }),
        }),
        el("span", {}, "Mostra la romanizzazione (es. annyeonghaseyo)")),
    ),
    el("h2.titolo-sezione", {}, "Scegli un mazzo"),
    el("ul.lista-mazzi", {}, mazzi.map((mazzo) => el("li", {},
      el("button.mazzo", { type: "button", onclick: () => avviaMazzo(mazzo) },
        el("span.nome-mazzo", {}, mazzo.nome),
        el("span.anteprima", { lang: "ko" }, mazzo.carte.slice(0, 3).map((c) => c[0]).join(" · ")),
        el("span.conta", {}, `${mazzo.carte.length} carte`)),
      importati.has(mazzo.id) && el("button.elimina", {
        type: "button",
        "aria-label": `Elimina il mazzo ${mazzo.nome}`,
        onclick: (e) => confermaEliminazione(e.currentTarget, mazzo),
      }, "Elimina"),
    ))),
    el("section.scheda.importa", {},
      el("h2", {}, "Aggiungi un mazzo"),
      el("p.nota", {}, "Un file CSV con una riga per parola: coreano, italiano e, se vuoi, la romanizzazione. Esempio: 학생,studente,haksaeng"),
      inputCsv,
      el("label.bottone", { for: "file-csv" }, "Importa un file CSV"),
    ),
  );
}

function confermaEliminazione(bottone, mazzo) {
  if (bottone.dataset.conferma) {
    scrivi("mazziImportati", leggi("mazziImportati", []).filter((m) => m.id !== mazzo.id));
    mostraScelta(avviso(`Mazzo "${mazzo.nome}" eliminato.`));
    return;
  }
  bottone.dataset.conferma = "1";
  bottone.textContent = "Tocca di nuovo per eliminare";
}

async function importaCsv(evento) {
  const file = evento.target.files?.[0];
  if (!file) return;
  try {
    const carte = leggiCsv(await file.text());
    if (!carte.length) throw new Error("non ho trovato righe con una parola coreana e la sua traduzione.");
    const nome = file.name.replace(/\.(csv|txt)$/i, "").replace(/[_-]+/g, " ").trim() || "Mazzo importato";
    const mazzi = leggi("mazziImportati", []);
    mazzi.push({ id: `importato-${Date.now()}`, nome, carte });
    if (!scrivi("mazziImportati", mazzi)) throw new Error("il browser non mi permette di salvare il mazzo.");
    mostraScelta(avviso(`Importate ${carte.length} carte nel mazzo "${nome}".`));
  } catch (errore) {
    mostraScelta(avviso(`Impossibile importare il file: ${errore.message}`, "errore"));
  }
}

// Accetta , o ; come separatore, con o senza intestazione, e capisce da sola
// quale colonna è in coreano (quella con l'hangul).
function leggiCsv(testo) {
  const righe = testo.replace(/^﻿/, "").split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const separatore = (righe[0] || "").includes(";") ? ";" : ",";
  const carte = [];
  for (const riga of righe) {
    const colonne = dividiRiga(riga, separatore);
    const iCoreano = colonne.findIndex(haHangul);
    if (iCoreano === -1) continue; // intestazione o riga senza coreano
    const altre = colonne.filter((_, i) => i !== iCoreano);
    if (!altre[0]) continue;
    // Le altre colonne, nell'ordine: italiano, romanizzazione (facoltativa)
    carte.push([colonne[iCoreano], altre[1] || "", altre[0]]);
  }
  return carte;
}

function dividiRiga(riga, separatore) {
  const colonne = [];
  let attuale = "";
  let traVirgolette = false;
  for (const c of riga) {
    if (c === '"') traVirgolette = !traVirgolette;
    else if (c === separatore && !traVirgolette) { colonne.push(attuale.trim()); attuale = ""; }
    else attuale += c;
  }
  colonne.push(attuale.trim());
  return colonne;
}

// --- Sessione -----------------------------------------------------------

function avviaMazzo(mazzo) {
  const ordinate = opzioni.mescola ? mescola(mazzo.carte) : [...mazzo.carte];
  const carte = ordinate.map(([ko, rom, it]) => ({ ko, rom, it }));
  const dimensione = opzioni.numero || carte.length;
  const blocchi = [];
  for (let i = 0; i < carte.length; i += dimensione) blocchi.push(carte.slice(i, i + dimensione));

  const sessione = { mazzo, blocchi, indiceBlocco: 0, giusteAlPrimo: 0, totale: carte.length, sbagliate: new Map() };
  eseguiBlocco(sessione);
}

function eseguiBlocco(sessione) {
  const blocco = sessione.blocchi[sessione.indiceBlocco];
  const etichetta = sessione.blocchi.length > 1 ? `Blocco ${sessione.indiceBlocco + 1} di ${sessione.blocchi.length}` : sessione.mazzo.nome;
  giro(blocco, etichetta, (sbagliate) => {
    sessione.giusteAlPrimo += blocco.length - sbagliate.length;
    for (const carta of sbagliate) sessione.sbagliate.set(carta.ko, carta);
    fineBlocco(sessione, blocco.length, sbagliate);
  });
}

function fineBlocco(sessione, quante, sbagliate) {
  const altri = sessione.indiceBlocco < sessione.blocchi.length - 1;
  const avanti = () => {
    if (altri) { sessione.indiceBlocco++; eseguiBlocco(sessione); }
    else riepilogo(sessione);
  };
  const ripassa = (daRipassare) => giro(daRipassare, "Ripasso", (ancora) => {
    if (!ancora.length) {
      mostraEsito("Ripasso completato: le hai indovinate tutte!", [], [
        el("button.primario", { type: "button", onclick: avanti }, altri ? "Blocco successivo" : "Vedi il riepilogo"),
      ]);
    } else {
      mostraEsito(`Ne mancano ancora ${ancora.length}.`, ancora, [
        el("button.primario", { type: "button", onclick: () => ripassa(ancora) }, "Ripassale ancora"),
        el("button", { type: "button", onclick: avanti }, altri ? "Passa al blocco successivo" : "Vedi il riepilogo"),
      ]);
    }
  });

  if (!sbagliate.length) {
    mostraEsito(`Perfetto: ${quante} su ${quante}!`, [], [
      el("button.primario", { type: "button", onclick: avanti }, altri ? "Blocco successivo" : "Vedi il riepilogo"),
      altri && el("button", { type: "button", onclick: () => riepilogo(sessione) }, "Basta così"),
    ]);
    return;
  }
  mostraEsito(`${quante - sbagliate.length} giuste su ${quante}.`, sbagliate, [
    el("button.primario", { type: "button", onclick: () => ripassa(sbagliate) }, `Ripassa le ${sbagliate.length} sbagliate`),
    el("button", { type: "button", onclick: avanti }, altri ? "Blocco successivo" : "Vedi il riepilogo"),
    altri && el("button", { type: "button", onclick: () => riepilogo(sessione) }, "Basta così"),
  ]);
}

function riepilogo(sessione) {
  const sbagliate = [...sessione.sbagliate.values()];
  const viste = sessione.blocchi.slice(0, sessione.indiceBlocco + 1).flat().length;
  mostraEsito(
    `Riepilogo: ${sessione.giusteAlPrimo} giuste al primo colpo su ${viste}.`,
    sbagliate,
    [
      sbagliate.length > 0 && el("button.primario", {
        type: "button",
        onclick: () => giro(mescola(sbagliate), "Ripasso delle sbagliate", (ancora) =>
          riepilogo({ ...sessione, sbagliate: new Map(ancora.map((c) => [c.ko, c])) })),
      }, `Ripassa tutte le ${sbagliate.length} sbagliate`),
      el("button", { type: "button", onclick: () => avviaMazzo(sessione.mazzo) }, "Rifai il mazzo da capo"),
      el("button", { type: "button", onclick: () => mostraScelta() }, "Torna ai mazzi"),
    ],
    sbagliate.length ? "Da ripassare sul quaderno:" : null,
  );
}

function mostraEsito(titolo, carte, bottoni, intestazioneLista = "Sbagliate:") {
  riempi(contenitore, 
    el("section.scheda.esito-blocco", {},
      el("h2", {}, titolo),
      carte.length > 0 && intestazioneLista && el("p.nota", {}, intestazioneLista),
      carte.length > 0 && el("ul.lista-sbagliate", {}, carte.map((c) => el("li", {},
        el("span.ko", { lang: "ko" }, c.ko),
        c.rom && el("span.rom", {}, c.rom),
        el("span.it", {}, c.it)))),
      el("div.azioni", {}, bottoni),
    ),
  );
  contenitore.querySelector(".azioni button")?.focus();
}

// Un "giro" mostra le carte una per una e alla fine passa a alFine la lista
// di quelle sbagliate.
function giro(carte, etichetta, alFine) {
  const sbagliate = [];
  let indice = 0;

  const prossima = () => {
    if (indice >= carte.length) { alFine(sbagliate); return; }
    const carta = carte[indice];
    const verso = opzioni.direzione === "casuale" ? (Math.random() < 0.5 ? "ko-it" : "it-ko") : opzioni.direzione;
    mostraCarta(carta, verso, `${etichetta} · ${indice + 1}/${carte.length}`, (giusta) => {
      if (!giusta) sbagliate.push(carta);
      indice++;
      prossima();
    });
  };
  prossima();
}

function mostraCarta(carta, verso, posizione, risposto) {
  const conRom = impostazioni().romanizzazione && carta.rom;
  const lato = (lingua) => lingua === "ko"
    ? el("div.lato.coreano", {},
        el("p.parola", { lang: "ko" }, carta.ko),
        conRom && el("p.rom", {}, carta.rom),
        bottoneAscolta(carta.ko))
    : el("div.lato", {}, el("p.parola.italiano", {}, carta.it));

  const domanda = verso === "ko-it" ? lato("ko") : lato("it");
  const risposta = verso === "ko-it" ? lato("it") : lato("ko");
  const consegna = verso === "ko-it" ? "Scrivi sul quaderno cosa vuol dire" : "Scrivi sul quaderno in coreano";

  const azioni = el("div.azioni.carta-azioni", {});
  const retro = el("div.risposta", { hidden: true }, risposta);

  const scopri = () => {
    retro.hidden = false;
    if (verso === "it-ko") pronuncia(carta.ko);
    azioni.replaceChildren(
      el("button.no", { type: "button", onclick: () => risposto(false) }, "Sbagliata"),
      el("button.si", { type: "button", onclick: () => risposto(true) }, "Giusta"),
    );
    azioni.querySelector("button.si").focus();
  };

  azioni.append(el("button.primario", { type: "button", onclick: scopri }, "Mostra la risposta"));

  riempi(contenitore, 
    el("div.barra-carta", {},
      el("span.posizione", {}, posizione),
      el("button.testo-link", { type: "button", onclick: () => mostraScelta() }, "Esci")),
    el("section.flashcard", { "aria-live": "polite" },
      el("p.consegna", {}, consegna),
      domanda,
      retro),
    azioni,
  );
  azioni.querySelector("button").focus();
}
