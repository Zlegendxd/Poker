
/* =========================================
   CLASSE GIOCATORE
========================================= */

class Giocatore {
  constructor(dati) {
    this.name = dati.name;
    this.chips = dati.chips;
    this.folded = dati.folded;
    this.allIn = dati.allIn;
    this.inHand = dati.inHand;
    this.roundBet = dati.roundBet;
    this.lastAction = dati.lastAction;
    this.handName = dati.handName;
    this.isYou = dati.isYou;
    this.hole = dati.hole || [];
  }

  stato() {
    if (this.folded) return 'Fold';
    if (this.allIn) return 'All-in';
    if (this.lastAction) return this.lastAction;
    if (this.inHand) return 'In gioco';
    return 'In attesa';
  }

  puoGiocare() {
    return this.inHand && !this.folded && !this.allIn;
  }
}


/* =========================================
   CLASSE SESSIONE
========================================= */

class Sessione {
  constructor(dati) {
    this.roomId = dati.roomId;
    this.token = dati.token;
    this.player = dati.player;
    this.spectator = Boolean(dati.spectator);
  }

  isSpectator() {
    return this.spectator;
  }

  datiRichiesta() {
    return {
      roomId: this.roomId,
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
    this.apiGameId = dati.apiGameId;
    this.host = dati.host;
    this.phase = dati.phase;
    this.handNo = dati.handNo;
    this.board = dati.board || [];
    this.pot = dati.pot;
    this.currentBet = dati.currentBet;
    this.minRaise = dati.minRaise;
    this.smallBlind = dati.smallBlind;
    this.bigBlind = dati.bigBlind;
    this.dealer = dati.dealer;
    this.acting = dati.acting;
    this.pending = dati.pending || [];
    this.message = dati.message;
    this.you = dati.you;
    this.spectator = Boolean(dati.spectator);
    this.canStart = dati.canStart;
    this.apiWarning = dati.apiWarning || '';

    this.players = (dati.players || []).map(
      giocatore => new Giocatore(giocatore)
    );
  }

  trovaMioGiocatore() {
    return this.players.find(giocatore => giocatore.isYou) || null;
  }

  possoGiocare() {
    const mioGiocatore = this.trovaMioGiocatore();

    if (this.spectator || !mioGiocatore) return false;
    if (this.acting !== this.you) return false;
    if (!mioGiocatore.puoGiocare()) return false;

    return ['preflop', 'flop', 'turn', 'river'].includes(this.phase);
  }

  devoChiamare() {
    const mioGiocatore = this.trovaMioGiocatore();

    return mioGiocatore &&
      this.currentBet > mioGiocatore.roundBet;
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

  guarda(dati) {
    return this.chiedi('/api/watch', 'POST', dati);
  }

  stato(sessione) {
    const indirizzo =
      '/api/state?roomId=' +
      encodeURIComponent(sessione.roomId) +
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

    this.ultimeCarteComuni = '';
    this.ultimoValorePiatto = -1;
    this.ultimoTesto = '';

    this.collegaEventi();
  }

  mostraErrore(testo) {
    document.getElementById('error').textContent = testo;
  }

  mostraStatus(testo) {
    document.getElementById('status').textContent = testo;
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

  async entraComeFantasma(evento) {
    evento.preventDefault();

    try {
      const dati = {
        roomId: document.getElementById('watchCode').value,
        name: document.getElementById('watchName').value
      };

      const risultato = await this.api.guarda(dati);
      this.entraNellaPartita(risultato);

    } catch (errore) {
      this.mostraErrore(errore.message);
    }
  }

  entraNellaPartita(dati) {
    this.sessione = new Sessione(dati);

    this.ultimeCarteComuni = '';
    this.ultimoValorePiatto = -1;
    this.ultimoTesto = '';

    document.getElementById('lobby').hidden = true;
    document.getElementById('game').hidden = false;

    document.body.classList.toggle(
      'ghost-view',
      this.sessione.isSpectator()
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
      this.mostraStatus(errore.message);
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
      const cartaDisegnata = creaCarta(
        carte[numero],
        false,
        numero
      );

      contenitore.appendChild(cartaDisegnata);
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

    const x = 50 + Math.cos(angolo) * distanzaX;
    const y = 50 + Math.sin(angolo) * distanzaY;

    return {
      left: x + '%',
      top: y + '%',
      transform: 'translate(-50%,-50%)'
    };
  }

  disegnaGiocatori() {
    const contenitore = document.getElementById('players');
    contenitore.innerHTML = '';

    const giocatori = this.partita.players;

    for (let numero = 0; numero < giocatori.length; numero++) {
      const giocatore = giocatori[numero];

      const posto = document.createElement('div');

      posto.className = 'seat';

      if (this.partita.acting === giocatore.name) {
        posto.classList.add('active');
      }

      if (giocatore.name === this.partita.dealer) {
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

      nome.textContent = giocatore.name;

      if (giocatore.isYou) {
        nome.textContent += ' (tu)';
      }

      const fiches = document.createElement('div');
      fiches.className = 'seat-chips';
      fiches.textContent = '● ' + giocatore.chips + ' fiches';

      const azione = document.createElement('div');
      azione.className = 'seat-action';
      azione.textContent = giocatore.stato();

      posto.appendChild(nome);
      posto.appendChild(fiches);
      posto.appendChild(azione);

      if (
        giocatore.inHand &&
        !giocatore.folded &&
        !['waiting', 'finished'].includes(this.partita.phase)
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

    if (partita.spectator) {
      testoRuolo.textContent =
        '👻 Modalità spectator: puoi guardare, ma non puoi fare mosse e non vedi le carte private.';
    } else {
      testoRuolo.textContent =
        'Stai giocando come ' + partita.you +
        '. Condividi questo codice con gli amici: ' +
        partita.id;
    }

    testoRuolo.classList.toggle(
      'ghost-role',
      partita.spectator
    );

    document.getElementById('phase').textContent =
      partita.phase;

    document.getElementById('handNo').textContent =
      partita.handNo;

    document.getElementById('turn').textContent =
      partita.acting || 'nessuno';

    document.getElementById('pot').textContent =
      partita.pot;

    document.getElementById('centerPot').textContent =
      partita.pot;

    document.getElementById('message').textContent =
      partita.message;

    if (partita.pot !== this.ultimoValorePiatto) {
      animaPiatto();
      this.ultimoValorePiatto = partita.pot;
    }

    if (partita.message !== this.ultimoTesto) {
      animaMessaggio();
      this.ultimoTesto = partita.message;
    }

    const carteComuni = JSON.stringify(partita.board);

    if (carteComuni !== this.ultimeCarteComuni) {
      this.disegnaCarte(
        document.getElementById('board'),
        partita.board
      );

      this.ultimeCarteComuni = carteComuni;
    }

    this.disegnaGiocatori();

    const mioGiocatore = partita.trovaMioGiocatore();

    const mieCarte = document.getElementById('myCards');
    mieCarte.innerHTML = '';

    if (partita.spectator) {
      const messaggioFantasma = document.createElement('div');

      messaggioFantasma.className = 'ghost-private';

      messaggioFantasma.innerHTML =
        '<span>👻</span><strong>Vista spectator</strong>' +
        '<small>Le carte private non sono visibili agli spettatori.</small>';

      mieCarte.appendChild(messaggioFantasma);

    } else if (
      mioGiocatore &&
      mioGiocatore.hole &&
      mioGiocatore.hole.length > 0
    ) {
      this.disegnaCarte(mieCarte, mioGiocatore.hole);

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
      !partita.canStart || partita.spectator;

    document.getElementById('status').textContent =
      'Giocatori: ' + partita.players.length +
      '/10. Codice da condividere: ' + partita.id;

    document.getElementById('apiWarning').textContent =
      partita.apiWarning;
  }

  async faiMossa(azione, importo = 0) {
    if (!this.sessione || this.sessione.isSpectator()) {
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
      this.mostraStatus(errore.message);
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
      this.mostraStatus(errore.message);
    }
  }

  esciDallaPartita() {
    if (this.aggiornamentoAutomatico) {
      clearInterval(this.aggiornamentoAutomatico);
    }

    this.aggiornamentoAutomatico = null;
    this.sessione = null;
    this.partita = null;

    document.body.classList.remove('ghost-view');

    document.getElementById('game').hidden = true;
    document.getElementById('lobby').hidden = false;
  }

  collegaEventi() {
    document.getElementById('createForm')
      .addEventListener('submit', e => this.creaPartita(e));

    document.getElementById('joinForm')
      .addEventListener('submit', e => this.entraInPartita(e));

    document.getElementById('watchForm')
      .addEventListener('submit', e => this.entraComeFantasma(e));

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

        const azione = this.partita.currentBet > 0
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
