# Guida semplice al progetto

Il progetto usa HTML, CSS e JavaScript. Il file `server.js` usa JavaScript con Node.js perché deve tenere insieme i giocatori e controllare le regole. Non serve installare librerie aggiuntive.

## I file principali

- `public/index.html`: contiene gli elementi della pagina, come i pulsanti e il tavolo.
- `public/style.css`: decide colori, dimensioni e posizione degli elementi.
- `public/app.js`: aggiorna la pagina e legge i click sui pulsanti.
- `public/animazioni.js`: disegna le carte e fa partire alcune animazioni.
- `public/animazioni.css`: contiene i movimenti e gli effetti grafici.
- `server.js`: crea la partita, tiene le fiches, distribuisce le carte, controlla i turni e comunica con la API del professore.

## Le funzioni più importanti in `app.js`

- `chiediAlServer`: manda una richiesta al server e riceve una risposta.
- `creaPartita`: crea una nuova partita.
- `entraInPartita`: fa entrare un giocatore in una partita esistente.
- `entraComeFantasma`: fa entrare uno spettatore.
- `entraNellaPartita`: apre la schermata del tavolo.
- `aggiornaPartita`: chiede al server lo stato aggiornato della partita.
- `disegnaCarte`: mostra le carte nella pagina.
- `disegnaGiocatori`: mostra i giocatori, le fiches e la loro ultima azione.
- `disegnaPartita`: aggiorna tutte le informazioni visibili sul tavolo.
- `faiMossa`: invia al server una mossa come fold, call, check o all-in.

## Perché `server.js` è più lungo

Il server deve controllare che un giocatore agisca solo nel proprio turno, calcolare le puntate, distribuire le carte comuni e decidere chi vince. Se togliessimo queste parti, il gioco non sarebbe più un Texas Hold'em completo. Per questo `server.js` è più tecnico di `app.js`, anche se il sito e i nomi delle funzioni sono stati resi più leggibili.

## Avvio

1. Installa Node.js.
2. Apri questa cartella in Visual Studio Code.
3. Nel terminale scrivi `node server.js`.
4. Apri `http://localhost:3000` nel browser.

Per usare la API del professore, copia `.env.example` in `.env` e inserisci le credenziali ricevute dal professore. Non condividere il file `.env`.

Le partite sono salvate nella memoria del server: se lo fermi e lo riavvii, le partite in corso si perdono.
