# Texas Hold'em - progetto scolastico

Progetto con tavolo grafico, carte animate, giocatori, spettatori fantasma e regole principali del Texas Hold'em.

## Funzioni
- Da 2 a 10 giocatori per tavolo.
- Creazione della partita e ingresso con codice.
- Modalità fantasma: lo spettatore guarda ma non gioca e non riceve carte private.
- Carte private e carte comuni: flop, turn e river.
- Fiches, small blind, big blind, check, call, bet, raise, fold e all-in.
- Controllo dei turni e delle combinazioni di poker.
- Collegamento alla API del professore per creare partite, aggiungere giocatori e registrare le mosse, quando le credenziali sono configurate.

## Avvio
1. Installa Node.js da https://nodejs.org/.
2. Apri questa cartella in Visual Studio Code.
3. Nel terminale scrivi `node server.js`.
4. Apri http://localhost:3000 nel browser.

Non servono pacchetti aggiuntivi.

## API del professore
Copia `.env.example` in un file chiamato `.env` e inserisci le credenziali ricevute dal professore. Non condividere `.env`.

La API del professore registra la partita e le mosse. Le carte, le puntate e i turni sono controllati dal server di questo progetto.

## File del progetto
- `server.js`: regole del gioco, giocatori e comunicazione con la API.
- `public/index.html`: elementi della pagina.
- `public/style.css`: aspetto grafico.
- `public/app.js`: aggiornamento del tavolo e pulsanti, scritto con nomi più leggibili.
- `public/animazioni.js`: disegno delle carte ed effetti animati.
- `public/animazioni.css`: movimenti e animazioni.
- `GUIDA_SEMPLICE.md`: spiegazione dei file e delle funzioni principali.

Il server deve contenere più codice perché deve controllare le regole e impedire mosse fuori turno. È un progetto didattico, non un servizio professionale certificato. Le partite si perdono quando il server viene riavviato.

`localhost` funziona sul computer dove viene avviato il server. Per collegare amici da altri computer, il server deve essere pubblicato online.
