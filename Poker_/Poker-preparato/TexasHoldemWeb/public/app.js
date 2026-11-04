let sessione = null;
let partita = null;
let aggiornamentoAutomatico = null;
let ultimeCarteComuni = '';
let ultimoValorePiatto = -1;
let ultimoTesto = '';

async function chiediAlServer(indirizzo, metodo, dati) {
  let opzioni = {
    method: metodo,
    headers: { 'Content-Type': 'application/json' }
  };

  if (dati) {
    opzioni.body = JSON.stringify(dati);
  }

  let risposta = await fetch(indirizzo, opzioni);
  let risultato = await risposta.json();

  if (!risposta.ok) {
    throw new Error(risultato.error || 'Si è verificato un errore');
  }

  return risultato;
}

function mostraErrore(testo) {
  document.getElementById('error').textContent = testo;
}

async function creaPartita(evento) {
  evento.preventDefault();

  try {
    let datiPartita = {
      name: document.getElementById('createName').value,
      smallBlind: Number(document.getElementById('smallBlind').value),
      bigBlind: Number(document.getElementById('bigBlind').value)
    };

    let risultato = await chiediAlServer('/api/create', 'POST', datiPartita);
    entraNellaPartita(risultato);
  } catch (errore) {
    mostraErrore(errore.message);
  }
}

async function entraInPartita(evento) {
  evento.preventDefault();

  try {
    let datiPartita = {
      roomId: document.getElementById('joinCode').value,
      name: document.getElementById('joinName').value
    };

    let risultato = await chiediAlServer('/api/join', 'POST', datiPartita);
    entraNellaPartita(risultato);
  } catch (errore) {
    mostraErrore(errore.message);
  }
}

async function entraComeFantasma(evento) {
  evento.preventDefault();

  try {
    let datiPartita = {
      roomId: document.getElementById('watchCode').value,
      name: document.getElementById('watchName').value
    };

    let risultato = await chiediAlServer('/api/watch', 'POST', datiPartita);
    entraNellaPartita(risultato);
  } catch (errore) {
    mostraErrore(errore.message);
  }
}

function entraNellaPartita(dati) {
  sessione = dati;
  ultimeCarteComuni = '';
  ultimoValorePiatto = -1;
  ultimoTesto = '';

  document.getElementById('lobby').hidden = true;
  document.getElementById('game').hidden = false;
  document.body.classList.toggle('ghost-view', Boolean(dati.spectator));
  document.getElementById('room').textContent = dati.roomId;

  if (aggiornamentoAutomatico) {
    clearInterval(aggiornamentoAutomatico);
  }

  aggiornaPartita();
  aggiornamentoAutomatico = setInterval(aggiornaPartita, 1500);
}

async function aggiornaPartita() {
  if (!sessione) {
    return;
  }

  try {
    let indirizzo = '/api/state?roomId=' + sessione.roomId + '&token=' + sessione.token;
    partita = await chiediAlServer(indirizzo, 'GET');
    disegnaPartita();
  } catch (errore) {
    document.getElementById('status').textContent = errore.message;
  }
}

function disegnaCarte(contenitore, carte) {
  contenitore.innerHTML = '';

  if (!carte || carte.length === 0) {
    contenitore.textContent = 'Le carte appariranno quando inizia la mano';
    return;
  }

  for (let numero = 0; numero < carte.length; numero++) {
    let cartaDisegnata = creaCarta(carte[numero], false, numero);
    contenitore.appendChild(cartaDisegnata);
  }
}

function calcolaPosizioneGiocatore(numeroGiocatore, numeroGiocatori) {
  if (numeroGiocatori === 1) {
    return { left: '50%', top: '77%', transform: 'translate(-50%,-50%)' };
  }

  let angolo = (-90 + (360 / numeroGiocatori) * numeroGiocatore) * Math.PI / 180;
  let distanzaX = 41;
  let distanzaY = 38;

  if (window.innerWidth < 580) {
    distanzaX = 37;
    distanzaY = 37;
  }

  let posizioneX = 50 + Math.cos(angolo) * distanzaX;
  let posizioneY = 50 + Math.sin(angolo) * distanzaY;

  return {
    left: posizioneX + '%',
    top: posizioneY + '%',
    transform: 'translate(-50%,-50%)'
  };
}

function disegnaGiocatori() {
  let contenitore = document.getElementById('players');
  contenitore.innerHTML = '';

  let giocatori = partita.players;

  for (let numero = 0; numero < giocatori.length; numero++) {
    let giocatore = giocatori[numero];
    let posto = document.createElement('div');

    posto.className = 'seat';

    if (partita.acting === giocatore.name) {
      posto.className = posto.className + ' active';
    }

    if (giocatore.name === partita.dealer) {
      posto.className = posto.className + ' dealer';
    }

    Object.assign(posto.style, calcolaPosizioneGiocatore(numero, giocatori.length));

    let nome = document.createElement('div');
    nome.className = 'seat-name';
    nome.textContent = giocatore.name;

    if (giocatore.isYou) {
      nome.textContent = nome.textContent + ' (tu)';
    }

    let fiches = document.createElement('div');
    fiches.className = 'seat-chips';
    fiches.textContent = '● ' + giocatore.chips + ' fiches';

    let azione = document.createElement('div');
    azione.className = 'seat-action';

    if (giocatore.folded) {
      azione.textContent = 'Fold';
    } else if (giocatore.allIn) {
      azione.textContent = 'All-in';
    } else if (giocatore.lastAction) {
      azione.textContent = giocatore.lastAction;
    } else if (giocatore.inHand) {
      azione.textContent = 'In gioco';
    } else {
      azione.textContent = 'In attesa';
    }

    posto.appendChild(nome);
    posto.appendChild(fiches);
    posto.appendChild(azione);

    if (giocatore.inHand && !giocatore.folded && partita.phase !== 'waiting' && partita.phase !== 'finished') {
      let carteCoperte = document.createElement('div');
      carteCoperte.className = 'mini-cards';
      carteCoperte.appendChild(creaCarta(null, true, 0));
      carteCoperte.appendChild(creaCarta(null, true, 1));
      posto.appendChild(carteCoperte);
    }

    contenitore.appendChild(posto);
  }
}

function disegnaPartita() {
  document.getElementById('room').textContent = partita.id;

  let testoRuolo = document.getElementById('role');

  if (partita.spectator) {
    testoRuolo.textContent = '👻 Modalità fantasma: puoi guardare, ma non puoi fare mosse e non vedi le carte private.';
  } else {
    testoRuolo.textContent = 'Stai giocando come ' + partita.you + '. Condividi questo codice con gli amici: ' + partita.id;
  }

  testoRuolo.classList.toggle('ghost-role', Boolean(partita.spectator));
  document.getElementById('phase').textContent = partita.phase;
  document.getElementById('handNo').textContent = partita.handNo;
  document.getElementById('turn').textContent = partita.acting || 'nessuno';
  document.getElementById('pot').textContent = partita.pot;
  document.getElementById('centerPot').textContent = partita.pot;
  document.getElementById('message').textContent = partita.message;

  if (partita.pot !== ultimoValorePiatto) {
    animaPiatto();
    ultimoValorePiatto = partita.pot;
  }

  if (partita.message !== ultimoTesto) {
    animaMessaggio();
    ultimoTesto = partita.message;
  }

  let carteComuni = JSON.stringify(partita.board);

  if (carteComuni !== ultimeCarteComuni) {
    disegnaCarte(document.getElementById('board'), partita.board);
    ultimeCarteComuni = carteComuni;
  }

  disegnaGiocatori();

  let mioGiocatore = null;
  for (let i = 0; i < partita.players.length; i++) {
    if (partita.players[i].isYou) {
      mioGiocatore = partita.players[i];
    }
  }

  let mieCarte = document.getElementById('myCards');
  mieCarte.innerHTML = '';

  if (partita.spectator) {
    let messaggioFantasma = document.createElement('div');
    messaggioFantasma.className = 'ghost-private';
    messaggioFantasma.innerHTML = '<span>👻</span><strong>Vista fantasma</strong><small>Le carte private non sono visibili agli spettatori.</small>';
    mieCarte.appendChild(messaggioFantasma);
  } else if (mioGiocatore && mioGiocatore.hole && mioGiocatore.hole.length > 0) {
    disegnaCarte(mieCarte, mioGiocatore.hole);
  } else {
    mieCarte.textContent = 'Le tue carte appariranno quando inizia la mano';
  }

  let possoGiocare = false;

  if (!partita.spectator && partita.acting === partita.you && mioGiocatore && !mioGiocatore.folded && !mioGiocatore.allIn) {
    if (partita.phase === 'preflop' || partita.phase === 'flop' || partita.phase === 'turn' || partita.phase === 'river') {
      possoGiocare = true;
    }
  }

  document.getElementById('fold').disabled = !possoGiocare;
  document.getElementById('checkCall').disabled = !possoGiocare;
  document.getElementById('betRaise').disabled = !possoGiocare;
  document.getElementById('allin').disabled = !possoGiocare;
  document.getElementById('amount').disabled = !possoGiocare;
  document.getElementById('start').hidden = !partita.canStart || partita.spectator;
  document.getElementById('status').textContent = 'Giocatori: ' + partita.players.length + '/10. Codice da condividere: ' + partita.id;
  document.getElementById('apiWarning').textContent = partita.apiWarning || '';
}

async function faiMossa(azione, importo) {
  if (!sessione || sessione.spectator) {
    return;
  }

  try {
    let datiMossa = {
      roomId: sessione.roomId,
      token: sessione.token,
      action: azione,
      amount: Number(importo || 0)
    };

    await chiediAlServer('/api/action', 'POST', datiMossa);
    aggiornaPartita();
  } catch (errore) {
    document.getElementById('status').textContent = errore.message;
  }
}

document.getElementById('createForm').addEventListener('submit', creaPartita);
document.getElementById('joinForm').addEventListener('submit', entraInPartita);
document.getElementById('watchForm').addEventListener('submit', entraComeFantasma);

document.getElementById('fold').addEventListener('click', function () {
  faiMossa('fold', 0);
});

document.getElementById('checkCall').addEventListener('click', function () {
  let mioGiocatore = null;

  for (let i = 0; i < partita.players.length; i++) {
    if (partita.players[i].isYou) {
      mioGiocatore = partita.players[i];
    }
  }

  if (partita.currentBet > mioGiocatore.roundBet) {
    faiMossa('call', 0);
  } else {
    faiMossa('check', 0);
  }
});

document.getElementById('betRaise').addEventListener('click', function () {
  let importo = document.getElementById('amount').value;

  if (partita.currentBet > 0) {
    faiMossa('raise', importo);
  } else {
    faiMossa('bet', importo);
  }
});

document.getElementById('allin').addEventListener('click', function () {
  faiMossa('allin', 0);
});

document.getElementById('start').addEventListener('click', async function () {
  try {
    let datiPartita = {
      roomId: sessione.roomId,
      token: sessione.token
    };

    await chiediAlServer('/api/start', 'POST', datiPartita);
    aggiornaPartita();
  } catch (errore) {
    document.getElementById('status').textContent = errore.message;
  }
});

document.getElementById('leave').addEventListener('click', function () {
  if (aggiornamentoAutomatico) {
    clearInterval(aggiornamentoAutomatico);
  }

  aggiornamentoAutomatico = null;
  sessione = null;
  partita = null;

  document.body.classList.remove('ghost-view');
  document.getElementById('game').hidden = true;
  document.getElementById('lobby').hidden = false;
});
