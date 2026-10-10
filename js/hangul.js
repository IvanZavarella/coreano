// hangul.js - Imparare l'alfabeto: tabella delle lettere (tocca per
// sentirle), come si formano le sillabe, e due quiz a scelta multipla
// (lettera -> suono, parola -> lettura), così non serve la tastiera coreana.

import { CONSONANTI, CONSONANTI_DOPPIE, PAROLE_DA_LEGGERE, VOCALI, VOCALI_COMPOSTE } from "./dati.js";
import { avviso, bottoneAscolta, el, riempi, mescola, pronuncia, puoPronunciare } from "./utili.js";

const SCHEDE = [
  ["lettere", "Lettere"],
  ["sillabe", "Sillabe"],
  ["quiz", "Quiz"],
  ["leggi", "Leggi"],
];

let schedaAttiva = "lettere";

export function mostra(contenitore) {
  const corpo = el("div.corpo-scheda");
  const barra = el(
    "div.segmenti",
    { role: "tablist" },
    SCHEDE.map(([id, nome]) =>
      el("button", {
        type: "button",
        role: "tab",
        "aria-selected": String(id === schedaAttiva),
        onclick: () => { schedaAttiva = id; mostra(contenitore); },
      }, nome),
    ),
  );
  riempi(contenitore, 
    el("header.testata", {}, el("h1", {}, "Hangul"), el("p.sottotitolo", {}, "L'alfabeto coreano: 14 consonanti e 10 vocali di base.")),
    barra,
    corpo,
  );
  if (!puoPronunciare()) {
    corpo.append(avviso("Questo browser non sa leggere ad alta voce: l'audio delle lettere non è disponibile."));
  }
  ({ lettere: mostraLettere, sillabe: mostraSillabe, quiz: mostraQuizLettere, leggi: mostraQuizParole })[schedaAttiva](corpo);
}

// --- Tabella delle lettere ---------------------------------------------

function mostraLettere(corpo) {
  const dettaglio = el("div.dettaglio-lettera", { "aria-live": "polite" },
    el("p.suggerimento", {}, "Tocca una lettera per sentirla e leggere come si pronuncia."));

  const griglia = (titolo, lettere, nota) => el("section.gruppo-lettere", {},
    el("h2", {}, titolo),
    nota && el("p.nota", {}, nota),
    el("div.griglia-lettere", {}, lettere.map((l) =>
      el("button.tessera-lettera", {
        type: "button",
        onclick: () => {
          pronuncia(l.esempio);
          dettaglio.replaceChildren(
            el("div.dettaglio-grande", { lang: "ko" }, l.lettera),
            el("div", {},
              el("p.dettaglio-rom", {}, l.rom),
              el("p", {}, l.nota),
              el("p.nota", {}, "Esempio: ", el("span", { lang: "ko" }, l.esempio)),
              bottoneAscolta(l.esempio)),
          );
        },
      }, el("span.glifo", { lang: "ko" }, l.lettera), el("span.rom", {}, l.rom)),
    )),
  );

  corpo.append(
    dettaglio,
    griglia("Vocali", VOCALI, "Si leggono sempre con ㅇ davanti (muta): 아, 오, 이..."),
    griglia("Consonanti", CONSONANTI),
    griglia("Consonanti doppie", CONSONANTI_DOPPIE, "Come le semplici, ma più tese e senza soffio d'aria."),
    griglia("Vocali composte", VOCALI_COMPOSTE, "Unione di due vocali di base."),
  );
}

// --- Come si formano le sillabe ------------------------------------------

function mostraSillabe(corpo) {
  const esempio = (sillaba, pezzi, rom) => el("div.esempio-sillaba", {},
    el("span.sillaba", { lang: "ko" }, sillaba),
    el("span.uguale", {}, "="),
    el("span.pezzi", { lang: "ko" }, pezzi.join(" + ")),
    el("span.rom", {}, rom),
    bottoneAscolta(sillaba),
  );

  corpo.append(
    el("article.testo", {},
      el("h2", {}, "Le lettere si raggruppano in blocchi"),
      el("p", {}, "In coreano non si scrive una lettera dopo l'altra come in italiano: le lettere di ogni sillaba vengono disegnate insieme dentro un quadratino. Ogni blocco è una sillaba e inizia sempre con una consonante."),
      el("h3", {}, "1. Consonante + vocale verticale"),
      el("p", {}, "Le vocali \"in piedi\" (ㅏ ㅑ ㅓ ㅕ ㅣ) vanno a destra della consonante."),
      esempio("가", ["ㄱ", "ㅏ"], "ga"),
      esempio("나", ["ㄴ", "ㅏ"], "na"),
      esempio("미", ["ㅁ", "ㅣ"], "mi"),
      el("h3", {}, "2. Consonante + vocale orizzontale"),
      el("p", {}, "Le vocali \"sdraiate\" (ㅗ ㅛ ㅜ ㅠ ㅡ) vanno sotto la consonante."),
      esempio("고", ["ㄱ", "ㅗ"], "go"),
      esempio("두", ["ㄷ", "ㅜ"], "du"),
      esempio("스", ["ㅅ", "ㅡ"], "seu"),
      el("h3", {}, "3. Sillaba che inizia con una vocale"),
      el("p", {}, "Se la sillaba inizia con un suono vocale si mette la ㅇ muta al posto della consonante."),
      esempio("아", ["ㅇ", "ㅏ"], "a"),
      esempio("우", ["ㅇ", "ㅜ"], "u"),
      el("h3", {}, "4. Consonante finale (batchim)"),
      el("p", {}, "Una consonante in fondo alla sillaba va sotto a tutto. Si chiama 받침 (batchim)."),
      esempio("한", ["ㅎ", "ㅏ", "ㄴ"], "han"),
      esempio("국", ["ㄱ", "ㅜ", "ㄱ"], "guk"),
      esempio("방", ["ㅂ", "ㅏ", "ㅇ"], "bang"),
      el("p", {}, "Così 한국 (Corea) = 한 + 국 = han + guk."),
      el("h3", {}, "Consiglio per il quaderno"),
      el("p", {}, "Scrivi ogni lettera dall'alto in basso e da sinistra a destra, e prova a comporre da sola le sillabe di questa pagina prima di toccare \"Ascolta\"."),
    ),
  );
}

// --- Quiz a scelta multipla ---------------------------------------------

const INSIEMI_LETTERE = {
  vocali: { nome: "Vocali", lettere: VOCALI },
  consonanti: { nome: "Consonanti", lettere: CONSONANTI },
  doppie: { nome: "Doppie e composte", lettere: [...CONSONANTI_DOPPIE, ...VOCALI_COMPOSTE] },
  tutte: { nome: "Tutte", lettere: [...VOCALI, ...CONSONANTI, ...CONSONANTI_DOPPIE, ...VOCALI_COMPOSTE] },
};

let insiemeQuiz = "vocali";

function mostraQuizLettere(corpo) {
  const scelta = el("div.chip-gruppo", { role: "radiogroup", "aria-label": "Lettere del quiz" },
    Object.entries(INSIEMI_LETTERE).map(([id, insieme]) =>
      el("button.chip", {
        type: "button",
        role: "radio",
        "aria-checked": String(id === insiemeQuiz),
        onclick: () => { insiemeQuiz = id; corpo.replaceChildren(); mostraQuizLettere(corpo); },
      }, insieme.nome)),
  );
  const lettere = INSIEMI_LETTERE[insiemeQuiz].lettere;
  corpo.append(scelta, quiz({
    elementi: lettere,
    domanda: (l) => el("div.domanda-grande", { lang: "ko" }, l.lettera),
    risposta: (l) => l.rom,
    // Tra le risposte possibili mettiamo solo lettere dello stesso tipo
    candidati: lettere,
    dopo: (l) => { pronuncia(l.esempio); return el("p.nota", {}, l.nota); },
  }));
}

function mostraQuizParole(corpo) {
  corpo.append(
    el("p.nota", {}, "Leggi la parola in hangul e scegli come si pronuncia. Molte vengono dall'inglese: se la riconosci, l'hai letta bene!"),
    quiz({
      elementi: PAROLE_DA_LEGGERE,
      domanda: (p) => el("div.domanda-grande.parola", { lang: "ko" }, p.ko),
      risposta: (p) => p.rom,
      candidati: PAROLE_DA_LEGGERE,
      dopo: (p) => { pronuncia(p.ko); return el("p.traduzione", {}, `= ${p.it}`); },
    }),
  );
}

// Quiz generico: mostra un elemento alla volta con 4 risposte possibili
function quiz({ elementi, domanda, risposta, candidati, dopo }) {
  const riquadro = el("section.scheda.quiz", { "aria-live": "polite" });
  let coda = mescola(elementi);
  let giuste = 0;
  let fatte = 0;

  function prossima() {
    if (!coda.length) coda = mescola(elementi);
    const elemento = coda.pop();
    const corretta = risposta(elemento);
    const altre = mescola([...new Set(candidati.map(risposta).filter((r) => r !== corretta))]).slice(0, 3);
    const opzioni = mescola([corretta, ...altre]);
    const esito = el("div.esito");
    const bottoni = opzioni.map((opzione) =>
      el("button.opzione", {
        type: "button",
        onclick: () => {
          fatte++;
          if (opzione === corretta) giuste++;
          for (const b of bottoni) {
            b.disabled = true;
            if (b.textContent === corretta) b.classList.add("giusta");
            else if (b.textContent === opzione) b.classList.add("sbagliata");
          }
          esito.replaceChildren(
            el("p", { class: opzione === corretta ? "bene" : "male" }, opzione === corretta ? "Giusto!" : `No: è "${corretta}".`),
            dopo(elemento),
            el("button.primario", { type: "button", onclick: prossima }, "Avanti"),
          );
          punteggio.textContent = `${giuste} giuste su ${fatte}`;
          esito.querySelector("button.primario").focus();
        },
      }, opzione),
    );
    riquadro.replaceChildren(punteggio, domanda(elemento), el("div.opzioni", {}, bottoni), esito);
  }

  const punteggio = el("p.punteggio", {}, "Scegli la pronuncia giusta");
  prossima();
  return riquadro;
}
