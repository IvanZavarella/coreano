// archivio.js - Tutto quello che l'app ricorda (impostazioni, chiavi API,
// video già consigliati, mazzi importati, conversazioni) sta nel
// localStorage del browser: resta solo su questo telefono. Da Impostazioni
// si può esportare un backup e reimportarlo su un altro dispositivo.

const PREFISSO = "coreano.";

export const LIVELLI = ["A1", "A2", "B1", "B2", "C1", "C2"];

export const DESCRIZIONE_LIVELLI = {
  A1: "principiante",
  A2: "elementare",
  B1: "intermedio",
  B2: "intermedio superiore",
  C1: "avanzato",
  C2: "padronanza",
};

// Valori predefiniti: si possono cambiare da Impostazioni
const PREDEFINITE = {
  livello: "A1",
  chiaveGemini: "",
  chiaveYoutube: "",
  // Modello testuale (veloce ed economico) per i video e i riepiloghi
  modelloTesto: "gemini-3.5-flash-lite",
  // Modello per la conversazione vocale in tempo reale (Live API)
  modelloLive: "gemini-3.8-live",
  // Voce di Gemini nella conversazione
  voce: "Kore",
  // Mostrare la romanizzazione sotto l'hangul
  romanizzazione: true,
};

export function leggi(chiave, predefinito) {
  try {
    const valore = localStorage.getItem(PREFISSO + chiave);
    return valore === null ? predefinito : JSON.parse(valore);
  } catch {
    return predefinito;
  }
}

export function scrivi(chiave, valore) {
  try {
    localStorage.setItem(PREFISSO + chiave, JSON.stringify(valore));
    return true;
  } catch {
    return false;
  }
}

export function impostazioni() {
  return { ...PREDEFINITE, ...leggi("impostazioni", {}) };
}

export function salvaImpostazioni(nuove) {
  return scrivi("impostazioni", nuove);
}

// Il backup include tutto tranne le chiavi API, che sono personali
export function esportaBackup() {
  const dati = {};
  for (let i = 0; i < localStorage.length; i++) {
    const chiave = localStorage.key(i);
    if (chiave.startsWith(PREFISSO)) dati[chiave.slice(PREFISSO.length)] = leggi(chiave.slice(PREFISSO.length));
  }
  if (dati.impostazioni) {
    dati.impostazioni = { ...dati.impostazioni, chiaveGemini: "", chiaveYoutube: "" };
  }
  return { app: "coreano", versione: 1, data: new Date().toISOString(), dati };
}

export function importaBackup(backup) {
  if (backup?.app !== "coreano" || typeof backup.dati !== "object") {
    throw new Error("questo file non è un backup dell'app.");
  }
  const chiaviAttuali = impostazioni();
  for (const [chiave, valore] of Object.entries(backup.dati)) scrivi(chiave, valore);
  // Le chiavi API non sono nel backup: teniamo quelle già inserite qui
  const imp = impostazioni();
  imp.chiaveGemini ||= chiaviAttuali.chiaveGemini;
  imp.chiaveYoutube ||= chiaviAttuali.chiaveYoutube;
  salvaImpostazioni(imp);
}
