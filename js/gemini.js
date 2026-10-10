// gemini.js - Chiamate testuali a Gemini (REST) e messaggi d'errore leggibili.
// La chiave è quella inserita in Impostazioni: il codice del sito non ne
// contiene nessuna.

import { impostazioni } from "./archivio.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export class ChiaveMancante extends Error {
  constructor() {
    super("manca la chiave di Gemini: inseriscila in Impostazioni.");
  }
}

export function chiaveGemini() {
  const chiave = impostazioni().chiaveGemini.trim();
  if (!chiave) throw new ChiaveMancante();
  return chiave;
}

// Chiede a Gemini un testo, oppure un JSON che rispetta lo schema dato
export async function chiediGemini(prompt, schema = null) {
  const chiave = chiaveGemini();
  const corpo = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
  if (schema) {
    corpo.generationConfig = { responseMimeType: "application/json", responseJsonSchema: schema };
  }
  const modello = encodeURIComponent(impostazioni().modelloTesto);
  const risposta = await fetch(`${BASE}/models/${modello}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": chiave },
    body: JSON.stringify(corpo),
  });
  const dati = await risposta.json().catch(() => ({}));
  if (!risposta.ok) {
    throw new Error(`${dati.error?.status || risposta.status}: ${dati.error?.message || "errore sconosciuto"}`);
  }
  const testo = (dati.candidates?.[0]?.content?.parts || [])
    .filter((parte) => !parte.thought)
    .map((parte) => parte.text || "")
    .join("");
  return schema ? JSON.parse(testo) : testo;
}

// Rende leggibili gli errori di Gemini, in particolare i limiti superati
export function descriviErrore(errore) {
  const testo = String(errore?.message || errore);
  if (errore instanceof ChiaveMancante) return testo;
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(testo)) {
    return "hai raggiunto il limite di utilizzo gratuito di Gemini (troppe richieste al minuto o al giorno). Riprova più tardi: con il piano gratuito non ti viene addebitato nulla.";
  }
  if (/API_KEY_INVALID|API key not valid/i.test(testo)) {
    return "la chiave di Gemini non è valida: controllala in Impostazioni.";
  }
  if (/not found|NOT_FOUND/i.test(testo) && /model/i.test(testo)) {
    return `il modello non esiste più (forse Google l'ha rinominato): aggiorna il nome in Impostazioni. Dettagli: ${testo}`;
  }
  if (errore instanceof TypeError) {
    return "connessione non riuscita: controlla di essere online.";
  }
  return testo;
}
