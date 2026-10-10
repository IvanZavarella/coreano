// conversazione.js - Conversazione vocale in diretta con Gemini (Live API),
// direttamente dal browser del telefono.
//
// Come funziona (stessa logica del programma di francese):
//   - Il microfono viene letto da un AudioWorklet, ricampionato a 16 kHz
//     (PCM 16 bit, mono) e inviato a Gemini a blocchi di 100 ms su una
//     connessione WebSocket.
//   - Gemini risponde con audio PCM 16 bit a 24 kHz, che viene messo in coda
//     e riprodotto man mano che arriva.
//   - Due modalità di turno:
//       * "Tocco quando ho finito": il rilevamento automatico della voce è
//         disattivato. Quando Gemini finisce di parlare inviamo
//         activityStart (tocca a te), e quando premi il bottone inviamo
//         activityEnd: puoi fare tutte le pause che vuoi per pensare.
//       * "Automatica": Gemini capisce da solo quando hai finito di parlare
//         (dopo un silenzio); se parli mentre risponde si interrompe.
//   - Le trascrizioni vengono mostrate a schermo e salvate nel telefono.

import { DESCRIZIONE_LIVELLI, impostazioni, leggi, scrivi } from "./archivio.js";
import { chiaveGemini, chiediGemini, descriviErrore } from "./gemini.js";
import { avviso, el, riempi } from "./utili.js";

const URL_LIVE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const FREQUENZA_MICROFONO = 16000; // Hz, richiesto dalla Live API in ingresso
const FREQUENZA_ALTOPARLANTI = 24000; // Hz, formato dell'audio di Gemini in uscita
const CAMPIONI_PER_BLOCCO = FREQUENZA_MICROFONO / 10; // 100 ms di audio

// Modalità automatica: silenzio (ms) dopo il quale il tuo turno è finito
const SILENZIO_FINE_TURNO_MS = 2000;
// Quante conversazioni tenere in memoria
const CONVERSAZIONI_SALVATE = 30;

// Gira nel thread audio: media i campioni del microfono (filtro semplice
// contro i fischi da ricampionamento) fino a ottenere 16 kHz, li converte
// in interi a 16 bit e manda blocchi da 100 ms alla pagina.
const CODICE_WORKLET = `
class Cattura extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rapporto = sampleRate / ${FREQUENZA_MICROFONO};
    this.posizione = 0;
    this.somma = 0;
    this.conta = 0;
    this.blocco = new Int16Array(${CAMPIONI_PER_BLOCCO});
    this.n = 0;
  }
  process(ingressi) {
    const canale = ingressi[0] && ingressi[0][0];
    if (!canale) return true;
    for (let i = 0; i < canale.length; i++) {
      this.somma += canale[i];
      this.conta++;
      this.posizione++;
      if (this.posizione >= this.rapporto) {
        this.posizione -= this.rapporto;
        const s = Math.max(-1, Math.min(1, this.somma / this.conta));
        this.blocco[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        this.somma = 0;
        this.conta = 0;
        if (this.n === this.blocco.length) {
          this.port.postMessage(this.blocco.buffer.slice(0));
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("cattura", Cattura);
`;

let contenitore;
let sessioneAttiva = null;

export function mostra(dove) {
  contenitore = dove;
  mostraPreparazione();
}

// Chiamata quando si cambia sezione: chiude microfono e connessione
export function esci() {
  sessioneAttiva?.termina("uscita");
}

// --- Istruzioni per l'insegnante ----------------------------------------

function istruzioniInsegnante(livello, argomento) {
  const principiante = livello === "A1" || livello === "A2";
  let istruzioni = `Sei un insegnante di coreano paziente e simpatico. La tua studentessa è italiana, livello ${livello} (${DESCRIZIONE_LIVELLI[livello]}) del QCER.\n`;
  if (principiante) {
    istruzioni += "- È quasi principiante: spiega in italiano, ma falle sentire e dire tanto coreano. Proponi una frase coreana breve e semplice alla volta: dilla lentamente e chiaramente, poi traducila in italiano, poi chiedile di ripeterla o di rispondere con una frase simile.\n"
      + "- Usa sempre il registro cortese (-요) e parole di uso quotidiano.\n"
      + "- Correggi gentilmente la pronuncia quando sbaglia, ripetendo tu la parola giusta lentamente.\n"
      + "- Ogni tanto fai un piccolo ripasso delle frasi viste prima.\n";
  } else {
    istruzioni += "- Parla soprattutto in coreano, con il registro cortese (-요), un vocabolario e una velocità adatti al suo livello.\n"
      + "- Quando fa un errore importante, riformula brevemente la frase corretta in modo naturale, poi continua la conversazione. Non correggere ogni piccolo errore.\n"
      + "- Se non capisce, riformula più semplicemente. Usa l'italiano solo se è davvero bloccata.\n";
  }
  istruzioni += "- Usa solo il coreano e l'italiano, mai altre lingue. Se non capisci cosa ha detto, chiedile in italiano di ripetere.\n"
    + "- Fai risposte brevi (2-3 frasi al massimo) e finisci spesso con una domanda, così è lei a parlare di più.\n"
    + "- Inizia salutandola e proponendo la prima frase o domanda.";
  if (argomento) istruzioni += `\nArgomento della conversazione: ${argomento}.`;
  return istruzioni;
}

// --- Schermata iniziale ---------------------------------------------------

function mostraPreparazione(messaggio = null) {
  const imp = impostazioni();
  const passate = leggi("conversazioni", []);
  const supportato = !!(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode && window.WebSocket);

  const argomento = el("input", { type: "text", id: "argomento-conversazione", placeholder: "es. presentarsi, al ristorante, il weekend", autocomplete: "off" });
  const scelta = (nome, valore, testo, spiegazione, selezionata) => el("label.scelta", {},
    el("input", { type: "radio", name: nome, value: valore, checked: selezionata }),
    el("span", {}, el("strong", {}, testo), el("small", {}, spiegazione)));

  const modulo = el("form.scheda", {
    onsubmit: (e) => {
      e.preventDefault();
      const dati = new FormData(modulo);
      avvia({
        argomento: argomento.value.trim(),
        manuale: dati.get("turni") !== "auto",
        cuffie: dati.get("cuffie") === "si",
      });
    },
  },
    el("label", { for: "argomento-conversazione" }, "Di cosa vuoi parlare? (facoltativo)"),
    argomento,
    el("fieldset", {},
      el("legend", {}, "Come gestire i turni"),
      scelta("turni", "manuale", "Tocco un bottone quando ho finito", "Consigliato: puoi fare tutte le pause che vuoi per pensare.", true),
      scelta("turni", "auto", "Automatico", `Gemini risponde dopo ${SILENZIO_FINE_TURNO_MS / 1000} secondi di silenzio.`, false)),
    el("fieldset", {},
      el("legend", {}, "Stai usando le cuffie?"),
      scelta("cuffie", "si", "Sì", "Puoi interrompere Gemini mentre parla.", false),
      scelta("cuffie", "no", "No", "Il microfono si spegne mentre Gemini parla, altrimenti sentirebbe la propria voce.", true)),
    el("button.primario.grande", { type: "submit", disabled: !supportato || !imp.chiaveGemini }, "Inizia a parlare"),
    el("p.nota", {}, "Su iPhone togli la modalità silenziosa, altrimenti non senti l'insegnante. La prima volta il browser ti chiede il permesso per il microfono."),
  );

  riempi(contenitore, 
    el("header.testata", {}, el("h1", {}, "Parla"), el("p.sottotitolo", {}, `Conversazione a voce con un insegnante di coreano (livello ${imp.livello}).`)),
    messaggio,
    !supportato && avviso("Questo browser non supporta il microfono in diretta. Prova con Chrome o Safari aggiornati.", "errore"),
    !imp.chiaveGemini && avviso("Per parlare con Gemini serve la chiave: inseriscila in Impostazioni.", "errore"),
    modulo,
    passate.length > 0 && el("section", {},
      el("h2.titolo-sezione", {}, "Conversazioni passate"),
      el("ul.lista-conversazioni", {}, [...passate].reverse().map((c) => el("li", {},
        el("button.mazzo", { type: "button", onclick: () => mostraConversazione(c) },
          el("span.nome-mazzo", {}, c.argomento || "Tema libero"),
          el("span.conta", {}, `${formattaData(c.data)} · livello ${c.livello} · ${c.righe.length} battute`)))))),
  );
}

function formattaData(iso) {
  return new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// --- Conversazione in corso ---------------------------------------------

async function avvia({ argomento, manuale, cuffie }) {
  const imp = impostazioni();
  let chiave;
  try {
    chiave = chiaveGemini();
  } catch (errore) {
    mostraPreparazione(avviso(descriviErrore(errore), "errore"));
    return;
  }

  const stato = el("p.stato-conversazione", { role: "status" }, "Connessione in corso...");
  const trascrizioneVista = el("ol.trascrizione", { "aria-live": "polite" });
  const bottoneTurno = el("button.primario.grande.turno", { type: "button", hidden: !manuale, disabled: true }, "Ho finito di parlare");
  const bottoneFine = el("button.termina", { type: "button" }, "Termina");

  riempi(contenitore, 
    el("header.testata.compatta", {}, el("h1", {}, argomento || "Conversazione"), stato),
    trascrizioneVista,
    el("div.comandi-conversazione", {}, bottoneTurno, bottoneFine),
  );

  const righe = []; // [{ruolo: "Tu" | "Gemini", testo}]
  let rigaTu = null;
  let rigaGemini = null;

  const aggiungiRiga = (ruolo) => {
    const nodo = el(`li.${ruolo === "Tu" ? "tu" : "gemini"}`, {}, el("span.chi", {}, ruolo === "Tu" ? "Tu" : "Insegnante"), el("p", {}));
    trascrizioneVista.append(nodo);
    return { ruolo, testo: "", nodo };
  };
  const scriviRiga = (riga, testo) => {
    riga.testo += testo;
    riga.nodo.querySelector("p").textContent = riga.testo.trim();
    riga.nodo.scrollIntoView({ block: "end", behavior: "smooth" });
  };
  const chiudiTurno = (nota = "") => {
    for (const riga of [rigaTu, rigaGemini]) {
      if (!riga) continue;
      if (riga.testo.trim()) righe.push({ ruolo: riga.ruolo, testo: riga.testo.trim() + (riga.ruolo === "Gemini" ? nota : "") });
      else riga.nodo.remove();
    }
    rigaTu = rigaGemini = null;
  };

  // Audio: un solo AudioContext, creato qui dentro il tocco del bottone
  // (su iPhone l'audio parte solo così).
  let contesto;
  let microfono;
  let ws;
  let wakeLock = null;
  const sorgenti = new Set();
  let fineRiproduzione = 0;
  const stati = { turnoUtente: false, finita: false, setupFatto: false };

  const staParlando = () => contesto && contesto.currentTime < fineRiproduzione;

  const riproduci = (base64) => {
    const byte = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(byte.buffer, 0, byte.byteLength >> 1);
    if (!pcm.length) return;
    const buffer = contesto.createBuffer(1, pcm.length, FREQUENZA_ALTOPARLANTI);
    const dati = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) dati[i] = pcm[i] / 0x8000;
    const sorgente = contesto.createBufferSource();
    sorgente.buffer = buffer;
    sorgente.connect(contesto.destination);
    const inizio = Math.max(contesto.currentTime + 0.05, fineRiproduzione);
    sorgente.start(inizio);
    fineRiproduzione = inizio + buffer.duration;
    sorgenti.add(sorgente);
    sorgente.onended = () => sorgenti.delete(sorgente);
  };

  const svuotaAudio = () => {
    for (const s of sorgenti) { try { s.stop(); } catch { /* già finita */ } }
    sorgenti.clear();
    fineRiproduzione = 0;
  };

  const invia = (messaggio) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(messaggio)); };

  const inizioTurnoUtente = async () => {
    // Aspettiamo che Gemini abbia finito di parlare dagli altoparlanti
    while (staParlando() && !stati.finita) await new Promise((r) => setTimeout(r, 50));
    if (stati.finita) return;
    invia({ realtimeInput: { activityStart: {} } });
    stati.turnoUtente = true;
    bottoneTurno.disabled = false;
    stato.textContent = "Tocca a te: parla con calma, poi tocca \"Ho finito di parlare\".";
    stato.className = "stato-conversazione tuo-turno";
  };

  bottoneTurno.addEventListener("click", () => {
    if (!stati.turnoUtente) return;
    stati.turnoUtente = false;
    bottoneTurno.disabled = true;
    invia({ realtimeInput: { activityEnd: {} } });
    stato.textContent = "L'insegnante sta pensando...";
    stato.className = "stato-conversazione";
  });

  const termina = async (motivo, dettaglio = "") => {
    if (stati.finita) return;
    stati.finita = true;
    sessioneAttiva = null;
    chiudiTurno();
    try { ws?.close(); } catch { /* già chiuso */ }
    microfono?.getTracks().forEach((t) => t.stop());
    svuotaAudio();
    try { await contesto?.close(); } catch { /* già chiuso */ }
    try { await wakeLock?.release(); } catch { /* già rilasciato */ }
    if (motivo === "uscita") { salva(righe, imp.livello, argomento); return; }
    fineConversazione(righe, imp.livello, argomento, motivo === "errore" ? dettaglio : "");
  };
  sessioneAttiva = { termina };
  bottoneFine.addEventListener("click", () => termina("fine"));

  try {
    contesto = new (window.AudioContext || window.webkitAudioContext)();
    await contesto.resume();
    microfono = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const urlWorklet = URL.createObjectURL(new Blob([CODICE_WORKLET], { type: "application/javascript" }));
    await contesto.audioWorklet.addModule(urlWorklet);
    URL.revokeObjectURL(urlWorklet);
    const cattura = new AudioWorkletNode(contesto, "cattura");
    contesto.createMediaStreamSource(microfono).connect(cattura);
    // Il nodo va collegato all'uscita (a volume zero) perché il browser lo faccia lavorare
    const muto = contesto.createGain();
    muto.gain.value = 0;
    cattura.connect(muto).connect(contesto.destination);

    cattura.port.onmessage = ({ data }) => {
      if (!stati.setupFatto || stati.finita) return;
      if (manuale && !stati.turnoUtente) return;
      let blocco = new Uint8Array(data);
      // Senza cuffie il microfono sentirebbe la voce di Gemini: mentre parla inviamo silenzio
      if (!cuffie && staParlando()) blocco = new Uint8Array(blocco.length);
      let binario = "";
      for (let i = 0; i < blocco.length; i++) binario += String.fromCharCode(blocco[i]);
      invia({ realtimeInput: { audio: { data: btoa(binario), mimeType: `audio/pcm;rate=${FREQUENZA_MICROFONO}` } } });
    };
  } catch (errore) {
    const testo = errore?.name === "NotAllowedError"
      ? "il permesso per il microfono è stato negato. Consentilo dalle impostazioni del browser per questo sito e riprova."
      : `impossibile usare il microfono (${errore?.message || errore}).`;
    await termina("errore", testo);
    return;
  }

  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* lo schermo può spegnersi, pazienza */ }

  ws = new WebSocket(`${URL_LIVE}?key=${encodeURIComponent(chiave)}`);

  ws.onopen = () => {
    invia({
      setup: {
        model: `models/${imp.modelloLive}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: imp.voce } } },
        },
        systemInstruction: { parts: [{ text: istruzioniInsegnante(imp.livello, argomento) }] },
        realtimeInputConfig: {
          // In modalità manuale siamo noi a segnalare inizio e fine del tuo turno
          automaticActivityDetection: manuale
            ? { disabled: true }
            : { endOfSpeechSensitivity: "END_SENSITIVITY_LOW", silenceDurationMs: SILENZIO_FINE_TURNO_MS },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // Comprime il contesto quando si allunga, per sessioni più lunghe
        contextWindowCompression: { slidingWindow: {} },
      },
    });
  };

  ws.onmessage = async (evento) => {
    const testo = typeof evento.data === "string" ? evento.data : await evento.data.text();
    let messaggio;
    try { messaggio = JSON.parse(testo); } catch { return; }

    if (messaggio.setupComplete) {
      stati.setupFatto = true;
      stato.textContent = manuale ? "Connesso! L'insegnante inizia a parlare..." : "Connesso! Parla pure quando vuoi.";
      // Facciamo iniziare Gemini, come indicato nelle istruzioni
      invia({ clientContent: { turns: [{ role: "user", parts: [{ text: "안녕하세요!" }] }], turnComplete: true } });
      return;
    }
    if (messaggio.goAway) {
      stato.textContent = "La sessione sta per chiudersi (limite di durata raggiunto).";
    }
    const contenuto = messaggio.serverContent;
    if (!contenuto) return;

    for (const parte of contenuto.modelTurn?.parts || []) {
      if (parte.inlineData?.data) riproduci(parte.inlineData.data);
    }
    if (contenuto.inputTranscription?.text) {
      rigaTu ||= aggiungiRiga("Tu");
      scriviRiga(rigaTu, contenuto.inputTranscription.text);
    }
    if (contenuto.outputTranscription?.text) {
      rigaGemini ||= aggiungiRiga("Gemini");
      scriviRiga(rigaGemini, contenuto.outputTranscription.text);
    }
    if (contenuto.interrupted) {
      svuotaAudio();
      chiudiTurno(" [interrotto]");
    }
    if (contenuto.turnComplete) {
      chiudiTurno();
      if (manuale) inizioTurnoUtente();
      else stato.textContent = "Parla pure quando vuoi.";
    }
  };

  ws.onerror = () => { /* i dettagli arrivano in onclose */ };

  ws.onclose = (evento) => {
    if (stati.finita) return;
    if (evento.code === 1000 && !evento.reason) { termina("fine"); return; }
    termina("errore", descriviErrore(new Error(evento.reason || `connessione chiusa (codice ${evento.code})`)));
  };
}

// --- Fine, salvataggio e riepilogo -----------------------------------------

function salva(righe, livello, argomento) {
  if (!righe.length) return null;
  const conversazione = { data: new Date().toISOString(), livello, argomento, righe, riepilogo: "" };
  const tutte = leggi("conversazioni", []);
  tutte.push(conversazione);
  scrivi("conversazioni", tutte.slice(-CONVERSAZIONI_SALVATE));
  return conversazione;
}

function fineConversazione(righe, livello, argomento, errore) {
  const conversazione = salva(righe, livello, argomento);
  const messaggio = errore
    ? avviso(`Conversazione interrotta da un errore: ${errore}`, "errore")
    : avviso("La conversazione è terminata.");
  if (!conversazione) { mostraPreparazione(messaggio); return; }
  mostraConversazione(conversazione, messaggio);
}

function mostraConversazione(conversazione, messaggio = null) {
  const zonaRiepilogo = el("div.riepilogo", { "aria-live": "polite" },
    conversazione.riepilogo && testoRiepilogo(conversazione.riepilogo));

  const bottoneRiepilogo = !conversazione.riepilogo && el("button.primario", {
    type: "button",
    onclick: async (e) => {
      const bottone = e.currentTarget;
      bottone.disabled = true;
      zonaRiepilogo.replaceChildren(el("p.caricamento", {}, "Gemini sta preparando il riepilogo..."));
      try {
        conversazione.riepilogo = await riepilogoErrori(conversazione);
        // Aggiorniamo la conversazione salvata con il riepilogo
        const tutte = leggi("conversazioni", []);
        const salvata = tutte.find((c) => c.data === conversazione.data);
        if (salvata) { salvata.riepilogo = conversazione.riepilogo; scrivi("conversazioni", tutte); }
        bottone.remove();
        zonaRiepilogo.replaceChildren(testoRiepilogo(conversazione.riepilogo));
      } catch (errore) {
        bottone.disabled = false;
        zonaRiepilogo.replaceChildren(avviso(`Errore durante il riepilogo: ${descriviErrore(errore)}`, "errore"));
      }
    },
  }, "Riepilogo dei miei errori");

  riempi(contenitore, 
    el("div.barra-carta", {},
      el("span.posizione", {}, `${formattaData(conversazione.data)} · livello ${conversazione.livello}`),
      el("button.testo-link", { type: "button", onclick: () => mostraPreparazione() }, "Indietro")),
    messaggio,
    el("h1.titolo-conversazione", {}, conversazione.argomento || "Tema libero"),
    bottoneRiepilogo,
    zonaRiepilogo,
    el("ol.trascrizione", {}, conversazione.righe.map((r) =>
      el(`li.${r.ruolo === "Tu" ? "tu" : "gemini"}`, {}, el("span.chi", {}, r.ruolo === "Tu" ? "Tu" : "Insegnante"), el("p", {}, r.testo)))),
  );
}

function testoRiepilogo(testo) {
  return el("section.scheda.testo-riepilogo", {}, el("h2", {}, "Riepilogo"),
    testo.split(/\n{2,}/).map((paragrafo) => el("p", {}, paragrafo.replace(/\*\*/g, ""))));
}

async function riepilogoErrori(conversazione) {
  const testo = conversazione.righe.map((r) => `${r.ruolo}: ${r.testo}`).join("\n");
  const prompt = `Questa è la trascrizione automatica di una lezione di coreano tra una studentessa italiana (livello ${conversazione.livello}, 'Tu') e il suo insegnante ('Gemini'). `
    + "La trascrizione della studentessa può contenere errori di riconoscimento vocale: ignora quelli evidentemente dovuti a questo.\n"
    + "Scrivi in italiano, in modo conciso, senza markdown, separando i punti con una riga vuota:\n"
    + "1. Gli errori principali della studentessa, con la forma corretta e una breve spiegazione.\n"
    + "2. Fino a 5 parole o espressioni utili emerse nella lezione (formato: coreano (romanizzazione) = italiano), da copiare sul quaderno.\n"
    + `3. Un consiglio per la prossima volta.\n\n${testo}`;
  return chiediGemini(prompt);
}
