# Allenamento di coreano

App web per esercitarsi col coreano partendo da zero, pensata per il
telefono. Si apre da un link nel browser: non serve installare niente.

1. **Hangul**: l'alfabeto, lettera per lettera (tocchi e la senti), come si
   formano le sillabe, e due quiz a scelta multipla.
2. **Parole**: flashcard "da quaderno". L'app mostra la parola, tu scrivi la
   traduzione sul quaderno, poi scopri la risposta e segni se era giusta.
3. **Ascolto**: video YouTube in coreano consigliati per il tuo livello.
4. **Parla**: conversazione a voce in diretta con un insegnante (Gemini).

Tutto il codice è in HTML, CSS e JavaScript, senza librerie né
compilazione: i file si pubblicano così come sono.

## Metterla online con GitHub Pages (una volta sola)

1. Crea un account gratuito su <https://github.com> (se non ce l'hai).
2. In alto a destra **+** > **New repository**. Nome, ad esempio, `coreano`.
   Lascialo **Public** (GitHub Pages gratuito richiede un repository
   pubblico: il codice non contiene chiavi né dati personali). Tocca
   **Create repository**.
3. Nella pagina del repository vuoto tocca **uploading an existing file**,
   trascina **il contenuto** di questa cartella (`index.html`, `stile.css`,
   `manifest.webmanifest`, le icone e la cartella `js`), poi
   **Commit changes**.
4. **Settings** > **Pages**. In "Branch" scegli `main` e cartella `/ (root)`,
   poi **Save**.
5. Dopo un minuto la pagina mostra l'indirizzo, del tipo
   `https://TUO-NOME.github.io/coreano/`. È il link da mandarle.

Per aggiornare l'app in futuro: **Add file** > **Upload files** e ricarichi i
file modificati (GitHub sostituisce quelli con lo stesso nome).

## Primo avvio sul telefono

1. Apri il link in Chrome (Android) o Safari (iPhone).
2. Aggiungila alla schermata Home così si apre come un'app:
   - Android/Chrome: menu ⋮ > **Aggiungi a schermata Home**.
   - iPhone/Safari: tasto Condividi > **Aggiungi alla schermata Home**.
3. Per **Ascolto** e **Parla** serve una chiave di Gemini, gratuita: si crea
   su <https://aistudio.google.com/apikey> con un account Google e si incolla
   in **Impostazioni**. Resta salvata solo su quel telefono.
4. La prima volta che usa **Parla** il browser chiede il permesso per il
   microfono: va consentito. Su iPhone bisogna togliere la modalità
   silenziosa, altrimenti l'audio non si sente.

Hangul e Parole funzionano anche senza chiave.

## Ascolto

1. Gemini propone alcune ricerche YouTube adatte al livello (ed
   eventualmente all'argomento scelto).
2. **Con la chiave di YouTube** (facoltativa, istruzioni in Impostazioni) le
   ricerche vengono fatte con la YouTube Data API, che restituisce video
   reali; i video già consigliati vengono scartati e Gemini sceglie i 3
   migliori spiegando perché. Ogni video consigliato non viene più
   riproposto. Il limite gratuito di YouTube basta per circa 25 ricerche al
   giorno (ogni richiesta ne fa fino a 4).
3. **Senza la chiave di YouTube** l'app mostra le ricerche proposte come link
   a YouTube. I link sono sempre veri, ma non c'è lo storico dei video visti.

Nel programma di francese questo lo faceva yt-dlp, che in un sito non può
girare.

## Parla

Usa la [Gemini Live API](https://ai.google.dev/gemini-api/docs/live) dal
browser: il microfono viene inviato a Gemini in tempo reale e la risposta
vocale viene riprodotta man mano che arriva. Per i livelli A1-A2
l'insegnante spiega in italiano e propone una frase coreana alla volta da
ripetere; dal B1 parla soprattutto in coreano.

- **Tocco un bottone quando ho finito** (consigliato): quando l'insegnante
  finisce tocca a te, e puoi fare tutte le pause che vuoi. Risponde quando
  tocchi **Ho finito di parlare**.
- **Automatico**: risponde dopo 2 secondi di silenzio
  (`SILENZIO_FINE_TURNO_MS` in `js/conversazione.js`).
- Alla fine la trascrizione resta salvata (ultime 30 conversazioni) e puoi
  chiedere un riepilogo dei tuoi errori, con le parole utili da copiare sul
  quaderno.

## Dove sono i dati

Impostazioni, chiavi, mazzi importati, video visti e conversazioni sono nel
`localStorage` del browser: restano solo su quel telefono, e si perdono se
si cancellano i dati di navigazione. Da **Impostazioni** > **Backup** si
scarica un file da ricaricare su un altro dispositivo (per esempio sul PC
nuovo). Le chiavi non sono incluse nel backup.

## Aggiungere parole

Da **Parole** > **Importa un file CSV**. Una riga per parola, separatore `,`
o `;`, intestazione facoltativa:

```
coreano,italiano,romanizzazione
학생,studente,haksaeng
학교,scuola,hakgyo
```

La romanizzazione si può omettere. I mazzi già pronti sono in `js/dati.js`.

## Impostazioni avanzate

In **Impostazioni** > **Impostazioni avanzate** ci sono i nomi dei modelli
(`gemini-3.5-flash-lite` per testo, `gemini-3.8-live` per la
conversazione) e la voce. Se Google rinomina un modello, basta aggiornare il
nome lì.

## Provarla sul PC

I moduli JavaScript non funzionano aprendo `index.html` con doppio clic:
serve un piccolo server. Dalla cartella:

```
py -m http.server 8000
```

poi apri <http://localhost:8000>. Il microfono funziona su `localhost` e su
GitHub Pages (https), non su indirizzi http di rete.

## Organizzazione della cartella

```
Coreano/
├── index.html            ← la pagina (barra delle sezioni)
├── stile.css
├── manifest.webmanifest  ← per "Aggiungi a schermata Home"
├── icona.svg, icona-*.png
└── js/
    ├── app.js            ← apre la sezione giusta
    ├── dati.js           ← alfabeto e mazzi di parole
    ├── hangul.js         ← sezione Hangul
    ├── flashcard.js      ← sezione Parole
    ├── ascolto.js        ← video consigliati
    ├── conversazione.js  ← conversazione con Gemini Live
    ├── impostazioni.js   ← livello, chiavi, backup
    ├── gemini.js         ← chiamate testuali a Gemini
    ├── archivio.js       ← salvataggio nel browser
    └── utili.js          ← funzioni condivise, pronuncia
```
