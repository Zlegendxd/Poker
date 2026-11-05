/* =========================================
   CLASSE GIOCATORE
========================================= */

class Giocatore {
  constructor(dati) {
    this.nome = dati.name;
    this.fiches = dati.chips;
    this.haPassato = dati.folded;
    this.tuttoDentro = dati.allIn;
    this.inGioco = dati.inHand;
    this.puntataTurno = dati.roundBet;
    this.ultimaAzione = dati.lastAction;
    this.nomeMano = dati.handName;
    this.seiTu = dati.isYou;
    this.cartePrivate = dati.hole || [];
  }

  stato() {
    if (this.haPassato) return 'Fold';
    if (this.tuttoDentro) return 'All-in';
    if (this.ultimaAzione) return this.ultimaAzione;
    if (this.inGioco) return 'In gioco';

    return 'In attesa';
  }

  puoGiocare() {
    return this.inGioco && !this.haPassato && !this.tuttoDentro;
  }
}


/* =========================================
   CLASSE SESSIONE
========================================= */

class Sessione {
  constructor(dati) {
    this.codiceStanza = dati.roomId;
    this.token = dati.token;
    this.giocatore = dati.player;
    this.spettatore = Boolean(dati.spectator);
  }

  eSpettatore() {
    return this.spettatore;
  }

  datiRichiesta() {
    return {
      roomId: this.codiceStanza,
      token: this.token
    };
  }
}


/* =========================================
   CLASSE PARTITA
========================================= */

class Partita {
  constructor(dati) {
    this.id = dati.id;
    this.idPartitaApi = dati.apiGameId;
    this.ospite = dati.host;
    this.fase = dati.phase;
    this.numeroMano = dati.handNo;
    this.tavolo = dati.board || [];
    this.piatto = dati.pot;
    this.puntataCorrente = dati.currentBet;
    this.rilancioMinimo = dati.minRaise;
    this.piccoloBuio = dati.smallBlind;
    this.grandeBuio = dati.bigBlind;
    this.mazziere = dati.dealer;
    this.giocatoreDiTurno = dati.acting;
    this.giocatoriInAttesa = dati.pending || [];
    this.messaggio = dati.message;
    this.tuoNome = dati.you;
    this.spettatore = Boolean(dati.spectator);
    this.puoIniziare = dati.canStart;
    this.avvisoApi = dati.apiWarning || '';

    this.giocatori = (dati.players || []).map(
      giocatore => new Giocatore(giocatore)
    );
  }

  trovaMioGiocatore() {
    return this.giocatori.find(
      giocatore => giocatore.seiTu
    ) || null;
  }

  possoGiocare() {
    const mioGiocatore = this.trovaMioGiocatore();

    if (this.spettatore || !mioGiocatore) return false;
    if (this.giocatoreDiTurno !== this.tuoNome) return false;
    if (!mioGiocatore.puoGiocare()) return false;

    return [
      'preflop',
      'flop',
      'turn',
      'river'
    ].includes(this.fase);
  }

  devoChiamare() {
    const mioGiocatore = this.trovaMioGiocatore();

    return mioGiocatore &&
      this.puntataCorrente > mioGiocatore.puntataTurno;
  }
}


/* =========================================
   CLASSE SERVER API
========================================= */

class ServerAPI {

  async chiedi(indirizzo, metodo, dati) {
    const opzioni = {
      method: metodo,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (dati) {
      opzioni.body = JSON.stringify(dati);
    }

    const risposta = await fetch(indirizzo, opzioni);
    const risultato = await risposta.json();

    if (!risposta.ok) {
      throw new Error(
        risultato.error || 'Si è verificato un errore'
      );
    }

    return risultato;
  }

  crea(dati) {
    return this.chiedi('/api/create', 'POST', dati);
  }

  entra(dati) {
    return this.chiedi('/api/join', 'POST', dati);
  }

  osserva(dati) {
    return this.chiedi('/api/watch', 'POST', dati);
  }

  stato(sessione) {
    const indirizzo =
      '/api/state?roomId=' +
      encodeURIComponent(sessione.codiceStanza) +
      '&token=' +
      encodeURIComponent(sessione.token);

    return this.chiedi(indirizzo, 'GET');
  }

  azione(dati) {
    return this.chiedi('/api/action', 'POST', dati);
  }

  inizia(dati) {
    return this.chiedi('/api/start', 'POST', dati);
  }

  listaPartite() {
    return this.chiedi('/api/rooms', 'GET');
  }
}


/* =========================================
   CLASSE INTERFACCIA GIOCO
========================================= */

class InterfacciaGioco {

  constructor() {
    this.api = new ServerAPI();

    this.sessione = null;
    this.partita = null;
    this.aggiornamentoAutomatico = null;

    this.ultimeCarteTavolo = '';
    this.ultimoValorePiatto = -1;
    this.ultimoMessaggio = '';
    this.ultimeMieCarte = '';
    this.ultimiGiocatori = '';

    this.collegaEventi();

    this.aggiornaElencoPartite();

    this.aggiornamentoLobby = setInterval(() => {
      if (!this.sessione) {
        this.aggiornaElencoPartite();
      }
    }, 5000);

    this.riprendiSessione();
  }

  async riprendiSessione() {
    const salvata = localStorage.getItem('pokerSessione');
    if (!salvata) return;

    try {
      const dati = JSON.parse(salvata);
      const sessioneSalvata = new Sessione(dati);

      await this.api.stato(sessioneSalvata);
      this.entraNellaPartita(dati);
    } catch (errore) {
      localStorage.removeItem('pokerSessione');
    }
  }

  mostraErrore(testo) {
    document.getElementById('error').textContent = testo;
  }

  mostraStato(testo) {
    document.getElementById('status').textContent = testo;
  }

  async aggiornaElencoPartite() {
    const elenco = document.getElementById('roomsList');
    const conteggio = document.getElementById('roomsCount');

    if (!elenco || !conteggio) return;

    try {
      const partite = await this.api.listaPartite();

      elenco.innerHTML = '';
      conteggio.textContent = partite.length;

      if (partite.length === 0) {
        elenco.textContent = 'Non ci sono partite disponibili al momento.';
        return;
      }

      for (let numero = 0; numero < partite.length; numero++) {
        const partita = partite[numero];

        const riga = document.createElement('div');
        riga.className = 'public-room';

        const informazioni = document.createElement('div');
        informazioni.className = 'public-room-info';

        const nome = document.createElement('strong');
        nome.textContent = 'Stanza ' + partita.id;

        const dettagli = document.createElement('span');
        dettagli.textContent =
          'Creatore: ' + partita.host +
          ' · Giocatori: ' + partita.players + '/' + partita.maxPlayers +
          ' · Buio: ' + partita.blinds;

        const entra = document.createElement('button');
        entra.type = 'button';
        entra.textContent = 'Entra';

        entra.addEventListener('click', () => {
          document.getElementById('joinCode').value = partita.id;
          document.getElementById('joinName').focus();
          document.getElementById('joinForm').scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        });

        informazioni.appendChild(nome);
        informazioni.appendChild(dettagli);
        riga.appendChild(informazioni);
        riga.appendChild(entra);
        elenco.appendChild(riga);
      }

    } catch (errore) {
      conteggio.textContent = '—';
      elenco.textContent = 'Impossibile caricare le partite disponibili.';
    }
  }

  async creaPartita(evento) {
    evento.preventDefault();

    try {
      const dati = {
        name: document.getElementById('createName').value,
        smallBlind: Number(
          document.getElementById('smallBlind').value
        ),
        bigBlind: Number(
          document.getElementById('bigBlind').value
        )
      };

      const risultato = await this.api.crea(dati);

      this.entraNellaPartita(risultato);
      this.aggiornaElencoPartite();

    } catch (errore) {
      this.mostraErrore(errore.message);
    }
  }

  async entraInPartita(evento) {
    evento.preventDefault();

    try {
      const dati = {
        roomId: document.getElementById('joinCode').value,
        name: document.getElementById('joinName').value
      };

      const risultato = await this.api.entra(dati);

      this.entraNellaPartita(risultato);

    } catch (errore) {
      this.mostraErrore(errore.message);
    }
  }

  async entraComeSpettatore(evento) {
    evento.preventDefault();

    try {
      const dati = {
        roomId: document.getElementById('watchCode').value,
        name: document.getElementById('watchName').value
      };

      const risultato = await this.api.osserva(dati);

      this.entraNellaPartita(risultato);

    } catch (errore) {
      this.mostraErrore(errore.message);
    }
  }

  entraNellaPartita(dati) {
    this.sessione = new Sessione(dati);
    localStorage.setItem('pokerSessione', JSON.stringify(dati));

    this.ultimeCarteTavolo = '';
    this.ultimoValorePiatto = -1;
    this.ultimoMessaggio = '';

    document.getElementById('lobby').hidden = true;
    document.getElementById('game').hidden = false;

    document.body.classList.toggle(
      'ghost-view',
      this.sessione.eSpettatore()
    );

    document.getElementById('room').textContent =
      dati.roomId;

    if (this.aggiornamentoAutomatico) {
      clearInterval(this.aggiornamentoAutomatico);
    }

    this.aggiornaPartita();

    this.aggiornamentoAutomatico = setInterval(
      () => this.aggiornaPartita(),
      1500
    );
  }

  async aggiornaPartita() {
    if (!this.sessione) return;

    try {
      const dati = await this.api.stato(this.sessione);

      this.partita = new Partita(dati);

      this.disegnaPartita();

    } catch (errore) {
      this.mostraStato(errore.message);
    }
  }

  disegnaCarte(contenitore, carte) {
    contenitore.innerHTML = '';

    if (!carte || carte.length === 0) {
      contenitore.textContent =
        'Le carte appariranno quando inizia la mano';

      return;
    }

    for (let numero = 0; numero < carte.length; numero++) {
      const carta = creaCarta(
        carte[numero],
        false,
        numero
      );

      contenitore.appendChild(carta);
    }
  }

  calcolaPosizioneGiocatore(numero, totale) {
    if (totale === 1) {
      return {
        left: '50%',
        top: '77%',
        transform: 'translate(-50%,-50%)'
      };
    }

    const angolo =
      (-90 + (360 / totale) * numero) * Math.PI / 180;

    let distanzaX = 41;
    let distanzaY = 38;

    if (window.innerWidth < 580) {
      distanzaX = 37;
      distanzaY = 37;
    }

    const posizioneX = 50 + Math.cos(angolo) * distanzaX;
    const posizioneY = 50 + Math.sin(angolo) * distanzaY;

    return {
      left: posizioneX + '%',
      top: posizioneY + '%',
      transform: 'translate(-50%,-50%)'
    };
  }

  disegnaGiocatori() {
    const contenitore = document.getElementById('players');

    contenitore.innerHTML = '';

    const giocatori = this.partita.giocatori;

    for (let numero = 0; numero < giocatori.length; numero++) {
      const giocatore = giocatori[numero];

      const posto = document.createElement('div');

      posto.className = 'seat';

      if (this.partita.giocatoreDiTurno === giocatore.nome) {
        posto.classList.add('active');
      }

      if (giocatore.nome === this.partita.mazziere) {
        posto.classList.add('dealer');
      }

      Object.assign(
        posto.style,
        this.calcolaPosizioneGiocatore(
          numero,
          giocatori.length
        )
      );

      const nome = document.createElement('div');

      nome.className = 'seat-name';
      nome.textContent = giocatore.nome;

      if (giocatore.seiTu) {
        nome.textContent += ' (tu)';
      }

      const fiches = document.createElement('div');

      fiches.className = 'seat-chips';
      fiches.textContent = '● ' + giocatore.fiches + ' fiches';

      const azione = document.createElement('div');

      azione.className = 'seat-action';
      azione.textContent = giocatore.stato();

      posto.appendChild(nome);
      posto.appendChild(fiches);
      posto.appendChild(azione);

      if (
        giocatore.inGioco &&
        !giocatore.haPassato &&
        !['waiting', 'finished'].includes(this.partita.fase)
      ) {
        const carteCoperte = document.createElement('div');

        carteCoperte.className = 'mini-cards';

        carteCoperte.appendChild(creaCarta(null, true, 0));
        carteCoperte.appendChild(creaCarta(null, true, 1));

        posto.appendChild(carteCoperte);
      }

      contenitore.appendChild(posto);
    }
  }

  disegnaPartita() {
    const partita = this.partita;

    document.getElementById('room').textContent = partita.id;

    const testoRuolo = document.getElementById('role');

    if (partita.spettatore) {
      testoRuolo.textContent =
        '👻 Modalità spettatore: puoi guardare, ma non puoi fare mosse e non vedi le carte private.';
    } else {
      testoRuolo.textContent =
        'Stai giocando come ' + partita.tuoNome +
        '. Condividi questo codice con gli amici: ' +
        partita.id;
    }

    testoRuolo.classList.toggle(
      'ghost-role',
      partita.spettatore
    );

    document.getElementById('phase').textContent =
      partita.fase;

    document.getElementById('handNo').textContent =
      partita.numeroMano;

    document.getElementById('turn').textContent =
      partita.giocatoreDiTurno || 'nessuno';

    document.getElementById('pot').textContent =
      partita.piatto;

    document.getElementById('centerPot').textContent =
      partita.piatto;

    document.getElementById('message').textContent =
      partita.messaggio;

    if (partita.piatto !== this.ultimoValorePiatto) {
      animaPiatto();

      this.ultimoValorePiatto = partita.piatto;
    }

    if (partita.messaggio !== this.ultimoMessaggio) {
      animaMessaggio();

      this.ultimoMessaggio = partita.messaggio;
    }

    const carteTavolo = JSON.stringify(partita.tavolo);

    if (carteTavolo !== this.ultimeCarteTavolo) {
      this.disegnaCarte(
        document.getElementById('board'),
        partita.tavolo
      );

      this.ultimeCarteTavolo = carteTavolo;
    }

    this.disegnaGiocatori();

    const mioGiocatore = partita.trovaMioGiocatore();

    const mieCarte = document.getElementById('myCards');

    mieCarte.innerHTML = '';

    if (partita.spettatore) {
      const messaggioSpettatore = document.createElement('div');

      messaggioSpettatore.className = 'ghost-private';

      messaggioSpettatore.innerHTML =
        '<span>👻</span><strong>Vista spettatore</strong>' +
        '<small>Le carte private non sono visibili agli spettatori.</small>';

      mieCarte.appendChild(messaggioSpettatore);

    } else if (
      mioGiocatore &&
      mioGiocatore.cartePrivate &&
      mioGiocatore.cartePrivate.length > 0
    ) {
      this.disegnaCarte(mieCarte, mioGiocatore.cartePrivate);

    } else {
      mieCarte.textContent =
        'Le tue carte appariranno quando inizia la mano';
    }

    const possoGiocare = partita.possoGiocare();

    document.getElementById('fold').disabled = !possoGiocare;
    document.getElementById('checkCall').disabled = !possoGiocare;
    document.getElementById('betRaise').disabled = !possoGiocare;
    document.getElementById('allin').disabled = !possoGiocare;
    document.getElementById('amount').disabled = !possoGiocare;

    document.getElementById('start').hidden =
      !partita.puoIniziare || partita.spettatore;

    document.getElementById('status').textContent =
      'Giocatori: ' + partita.giocatori.length +
      '/7. Codice da condividere: ' + partita.id;

    document.getElementById('apiWarning').textContent =
      partita.avvisoApi;
  }

  async faiMossa(azione, importo = 0) {
    if (!this.sessione || this.sessione.eSpettatore()) {
      return;
    }

    try {
      const dati = {
        ...this.sessione.datiRichiesta(),
        action: azione,
        amount: Number(importo || 0)
      };

      await this.api.azione(dati);

      await this.aggiornaPartita();

    } catch (errore) {
      this.mostraStato(errore.message);
    }
  }

  async iniziaPartita() {
    if (!this.sessione) return;

    try {
      await this.api.inizia(
        this.sessione.datiRichiesta()
      );

      await this.aggiornaPartita();

    } catch (errore) {
      this.mostraStato(errore.message);
    }
  }

  esciDallaPartita() {
    localStorage.removeItem('pokerSessione');

    if (this.aggiornamentoAutomatico) {
      clearInterval(this.aggiornamentoAutomatico);
    }

    this.aggiornamentoAutomatico = null;
    this.sessione = null;
    this.partita = null;

    document.body.classList.remove('ghost-view');

    document.getElementById('game').hidden = true;
    document.getElementById('lobby').hidden = false;

    this.aggiornaElencoPartite();
  }

  collegaEventi() {
    document.getElementById('createForm')
      .addEventListener('submit', evento => this.creaPartita(evento));

    document.getElementById('joinForm')
      .addEventListener('submit', evento => this.entraInPartita(evento));

    document.getElementById('watchForm')
      .addEventListener('submit', evento => this.entraComeSpettatore(evento));

    document.getElementById('fold')
      .addEventListener('click', () => {
        this.faiMossa('fold', 0);
      });

    document.getElementById('checkCall')
      .addEventListener('click', () => {
        if (!this.partita) return;

        const azione = this.partita.devoChiamare()
          ? 'call'
          : 'check';

        this.faiMossa(azione, 0);
      });

    document.getElementById('betRaise')
      .addEventListener('click', () => {
        if (!this.partita) return;

        const importo =
          document.getElementById('amount').value;

        const azione = this.partita.puntataCorrente > 0
          ? 'raise'
          : 'bet';

        this.faiMossa(azione, importo);
      });

    document.getElementById('allin')
      .addEventListener('click', () => {
        this.faiMossa('allin', 0);
      });

    document.getElementById('start')
      .addEventListener('click', () => {
        this.iniziaPartita();
      });

    document.getElementById('leave')
      .addEventListener('click', () => {
        this.esciDallaPartita();
      });
  }
}


/* =========================================
   AVVIO DEL PROGRAMMA
========================================= */

const gioco = new InterfacciaGioco();