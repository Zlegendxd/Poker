function creaCarta(carta, coperta = false, indice = 0) {
  let elemento = document.createElement('span');
  elemento.className = 'playing-card' + (coperta ? ' back' : '') + (!coperta && carta && (carta.s === '♥' || carta.s === '♦') ? ' red' : ' black');
  if (!coperta && carta) {
    let valore = document.createElement('span');
    valore.className = 'card-value';
    valore.textContent = carta.v;
    let seme = document.createElement('span');
    seme.className = 'card-suit';
    seme.textContent = carta.s;
    elemento.appendChild(valore);
    elemento.appendChild(seme);
    elemento.title = carta.v + ' ' + carta.s;
  }
  return elemento;
}

function animaPiatto() {
  let piatto = document.querySelector('.pot-display');
  if (!piatto) return;
  piatto.classList.remove('updated');
  void piatto.offsetWidth;
  piatto.classList.add('updated');
}

function animaMessaggio() {
  let messaggio = document.getElementById('message');
  if (!messaggio) return;
  messaggio.classList.remove('updated');
  void messaggio.offsetWidth;
  messaggio.classList.add('updated');
}
