const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();
const PORT = Number(process.env.PORT || 3000);
const API_BASE = (process.env.GAME_API_BASE || 'https://classe5ID.altervista.org/games').replace(/\/$/, '');
const API_USER = process.env.GAME_API_USER || '';
const API_PASS = process.env.GAME_API_PASS || '';
const rooms = new Map();

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) reject(new Error('Richiesta troppo grande')); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('JSON non valido')); } });
    req.on('error', reject);
  });
}
function cleanName(v) {
  const s = String(v || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 18);
  if (s.length < 2) throw new Error('Il nome deve avere almeno 2 caratteri e può contenere lettere, numeri, _ e -.');
  return s;
}
function token() { return crypto.randomBytes(24).toString('hex'); }
function playerFor(room, playerToken) { return room.players.find(p => p.token === playerToken); }
function apiReady() { return Boolean(API_USER && API_PASS); }
async function apiRequest(endpoint, method = 'GET') {
  if (!apiReady()) return { ok: false, error: 'Credenziali API non configurate nel file .env' };
  try {
    const auth = Buffer.from(`${API_USER}:${API_PASS}`).toString('base64');
    const response = await fetch(`${API_BASE}${endpoint}`, { method, headers: { Authorization: `Basic ${auth}` } });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!response.ok) return { ok: false, error: `API HTTP ${response.status}`, data };
    return { ok: true, data };
  } catch (e) { return { ok: false, error: e.message }; }
}
function findId(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of ['id_partita', 'ID_PARTITA', 'id', 'ID', 'game_id', 'gameId']) {
    if (obj[k] !== undefined && (typeof obj[k] === 'number' || typeof obj[k] === 'string') && String(obj[k])) return String(obj[k]);
  }
  for (const v of Object.values(obj)) { const id = findId(v); if (id) return id; }
  return null;
}
const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const VALUE_NUM = Object.fromEntries(VALUES.map((v, i) => [v, i + 2]));
function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const v of VALUES) d.push({ v, n: VALUE_NUM[v], s, id: `${v}${s}` });
  for (let i = d.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function cmpVec(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x - y; }
  return 0;
}
function straightHigh(nums) {
  const u = [...new Set(nums)].sort((a,b) => b-a);
  if (u.includes(14)) u.push(1);
  for (let i = 0; i <= u.length - 5; i++) if (u[i] - u[i+4] === 4 && new Set(u.slice(i,i+5)).size === 5) return u[i];
  return 0;
}
function rankFive(cards) {
  const nums = cards.map(c => c.n).sort((a,b) => b-a);
  const counts = new Map(); for (const n of nums) counts.set(n, (counts.get(n) || 0) + 1);
  const groups = [...counts.entries()].sort((a,b) => b[1]-a[1] || b[0]-a[0]);
  const flush = cards.every(c => c.s === cards[0].s);
  const sh = straightHigh(nums);
  if (flush && sh) return { score: [8, sh], name: sh === 14 ? 'Scala colore (possibile scala reale)' : 'Scala colore' };
  if (groups[0][1] === 4) return { score: [7, groups[0][0], groups.find(g => g[1] === 1)[0]], name: 'Poker' };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { score: [6, groups[0][0], groups[1][0]], name: 'Full' };
  if (flush) return { score: [5, ...nums], name: 'Colore' };
  if (sh) return { score: [4, sh], name: 'Scala' };
  if (groups[0][1] === 3) return { score: [3, groups[0][0], ...groups.filter(g => g[1] === 1).map(g => g[0]).sort((a,b) => b-a)], name: 'Tris' };
  const pairs = groups.filter(g => g[1] === 2).map(g => g[0]).sort((a,b) => b-a);
  if (pairs.length >= 2) return { score: [2, pairs[0], pairs[1], groups.find(g => g[1] === 1)[0]], name: 'Doppia coppia' };
  if (pairs.length === 1) return { score: [1, pairs[0], ...groups.filter(g => g[1] === 1).map(g => g[0]).sort((a,b) => b-a)], name: 'Coppia' };
  return { score: [0, ...nums], name: 'Carta alta' };
}
function combinations(cards, n, start = 0, current = [], out = []) {
  if (current.length === n) { out.push(current.slice()); return out; }
  for (let i = start; i <= cards.length - (n - current.length); i++) { current.push(cards[i]); combinations(cards, n, i+1, current, out); current.pop(); }
  return out;
}
function bestHand(cards) {
  let best = null;
  for (const c of combinations(cards, 5)) { const r = rankFive(c); if (!best || cmpVec(r.score, best.score) > 0) best = { ...r, cards: c }; }
  return best;
}
function activePlayers(room) { return room.players.filter(p => p.inHand && !p.folded); }
function canAct(p) { return p.inHand && !p.folded && !p.allIn && p.chips > 0; }
function nextIndex(room, from, predicate = canAct) {
  for (let step = 1; step <= room.players.length; step++) { const i = (from + step) % room.players.length; if (predicate(room.players[i])) return i; }
  return -1;
}
function clockwiseIndices(room, from, predicate) {
  const arr = []; for (let step = 1; step <= room.players.length; step++) { const i = (from + step) % room.players.length; if (predicate(room.players[i])) arr.push(room.players[i]); } return arr;
}
function takeChips(p, amount) { const paid = Math.min(p.chips, amount); p.chips -= paid; p.roundBet += paid; p.contribution += paid; if (p.chips === 0) p.allIn = true; return paid; }
function nextPending(room, after) {
  const eligible = room.players.filter(canAct);
  if (eligible.length === 0) { room.pending = []; return; }
  let i = after;
  room.pending = [];
  for (const p of clockwiseIndices(room, i, canAct)) room.pending.push(p.name);
}
function setFirstPending(room, firstIndex) {
  room.pending = [];
  for (let step = 0; step < room.players.length; step++) { const i = (firstIndex + step) % room.players.length; if (canAct(room.players[i])) room.pending.push(room.players[i].name); }
  room.acting = room.pending[0] || null;
}
function currentToCall(room, p) { return Math.max(0, room.currentBet - p.roundBet); }
function startHand(room) {
  const ready = room.players.filter(p => p.chips > 0);
  if (ready.length < 2) throw new Error('Servono almeno due giocatori con fiches.');
  room.handNo++;
  room.deck = makeDeck(); room.board = []; room.pot = 0; room.currentBet = 0; room.minRaise = room.bigBlind;
  room.phase = 'preflop'; room.message = `Mano ${room.handNo}: pre-flop.`;
  for (const p of room.players) { p.hole = []; p.folded = p.chips <= 0; p.allIn = false; p.inHand = p.chips > 0; p.roundBet = 0; p.contribution = 0; p.lastAction = ''; p.handName = ''; }
  const active = room.players.filter(p => p.inHand);
  room.dealer = room.dealer < 0 ? 0 : (room.dealer + 1) % room.players.length;
  while (!room.players[room.dealer].inHand) room.dealer = (room.dealer + 1) % room.players.length;
  for (let n = 0; n < 2; n++) for (const p of clockwiseIndices(room, room.dealer - 1, x => x.inHand)) p.hole.push(room.deck.pop());
  let sbIndex, bbIndex;
  if (active.length === 2) { sbIndex = room.dealer; bbIndex = nextIndex(room, room.dealer, p => p.inHand); }
  else { sbIndex = nextIndex(room, room.dealer, p => p.inHand); bbIndex = nextIndex(room, sbIndex, p => p.inHand); }
  room.smallBlindPlayer = room.players[sbIndex]?.name; room.bigBlindPlayer = room.players[bbIndex]?.name;
  const sb = takeChips(room.players[sbIndex], room.smallBlind); const bb = takeChips(room.players[bbIndex], room.bigBlind);
  room.pot = sb + bb; room.currentBet = Math.max(room.players[sbIndex].roundBet, room.players[bbIndex].roundBet);
  room.minRaise = room.bigBlind;
  room.pending = [];
  const first = active.length === 2 ? sbIndex : nextIndex(room, bbIndex, p => p.inHand);
  setFirstPending(room, first);
  if (room.pending.length === 0) advanceRound(room);
}
function finishIfOne(room) {
  const alive = activePlayers(room);
  if (alive.length === 1) {
    const winner = alive[0]; winner.chips += room.pot;
    room.message = `${winner.name} vince il piatto di ${room.pot} fiches perché tutti gli avversari hanno passato.`;
    room.pot = 0; room.phase = 'finished'; room.pending = []; room.acting = null; return true;
  }
  return false;
}
function awardShowdown(room) {
  const alive = activePlayers(room);
  if (!alive.length) return;
  const levels = [...new Set(room.players.map(p => p.contribution).filter(v => v > 0))].sort((a,b) => a-b);
  let previous = 0; const results = [];
  for (const level of levels) {
    const contributors = room.players.filter(p => p.contribution >= level);
    const pot = (level - previous) * contributors.length; previous = level;
    const eligible = contributors.filter(p => p.inHand && !p.folded);
    if (!eligible.length || pot <= 0) continue;
    const scored = eligible.map(p => ({ p, hand: bestHand([...p.hole, ...room.board]) }));
    scored.sort((a,b) => cmpVec(b.hand.score, a.hand.score));
    const winners = scored.filter(x => cmpVec(x.hand.score, scored[0].hand.score) === 0);
    const share = Math.floor(pot / winners.length); let remainder = pot - share * winners.length;
    winners.forEach(w => { w.p.chips += share + (remainder-- > 0 ? 1 : 0); w.p.handName = w.hand.name; });
    results.push(`${winners.map(w => w.p.name).join(' e ')} vince ${pot} (${winners[0].hand.name})`);
  }
  room.message = results.length ? `Showdown: ${results.join('; ')}.` : 'Showdown terminato.';
  room.phase = 'finished'; room.pot = 0; room.pending = []; room.acting = null;
}
function advanceRound(room) {
  room.players.forEach(p => { p.roundBet = 0; });
  room.currentBet = 0; room.minRaise = room.bigBlind;
  if (activePlayers(room).length <= 1) { finishIfOne(room); return; }
  if (room.phase === 'preflop') { room.phase = 'flop'; room.board.push(room.deck.pop(), room.deck.pop(), room.deck.pop()); room.message = 'Flop: tre carte comuni.'; }
  else if (room.phase === 'flop') { room.phase = 'turn'; room.board.push(room.deck.pop()); room.message = 'Turn: quarta carta comune.'; }
  else if (room.phase === 'turn') { room.phase = 'river'; room.board.push(room.deck.pop()); room.message = 'River: quinta carta comune.'; }
  else { awardShowdown(room); return; }
  const eligible = room.players.filter(canAct);
  if (eligible.length <= 1) { room.players.forEach(p => { if (p.roundBet) { room.pot += p.roundBet; p.roundBet = 0; } });
    // No meaningful betting remains; deal the rest of the board automatically.
    while (room.board.length < 5) { room.board.push(room.deck.pop()); if (room.board.length === 3) room.phase = 'flop'; else if (room.board.length === 4) room.phase = 'turn'; else room.phase = 'river'; }
    awardShowdown(room); return;
  }
  setFirstPending(room, (room.dealer + 1) % room.players.length);
  if (!room.pending.length) advanceRound(room);
}
function normalizePot(room) {
  // Every chip put in during a betting round is held in roundBet until the round closes.
  room.pot = room.players.reduce((sum,p) => sum + p.contribution, 0);
}
function processAction(room, player, action, amount) {
  if (room.phase === 'waiting' || room.phase === 'finished') throw new Error('La mano non è in corso.');
  if (room.acting !== player.name) throw new Error('Non è il tuo turno.');
  if (!canAct(player)) throw new Error('Questo giocatore non può agire.');
  const owed = currentToCall(room, player); let paid = 0; let label = '';
  action = String(action || '').toLowerCase();
  if (action === 'fold') { player.folded = true; player.lastAction = 'FOLD'; label = 'FOLD'; }
  else if (action === 'check') { if (owed !== 0) throw new Error('Non puoi fare check: devi chiamare la puntata.'); player.lastAction = 'CHECK'; label = 'CHECK'; }
  else if (action === 'call') { if (owed === 0) throw new Error('Non c’è nessuna puntata da chiamare: usa CHECK.'); paid = takeChips(player, owed); player.lastAction = paid < owed ? 'ALL-IN' : 'CALL'; label = paid < owed ? `ALLIN_${paid}` : `CALL_${paid}`; }
  else if (action === 'bet' || action === 'raise') {
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) throw new Error('Inserisci una puntata intera positiva.');
    if (action === 'bet' && room.currentBet !== 0) throw new Error('C’è già una puntata: devi fare call o raise.');
    if (action === 'raise' && room.currentBet === 0) throw new Error('Non c’è una puntata da rilanciare: usa BET.');
    const target = action === 'bet' ? n : room.currentBet + n;
    const cost = target - player.roundBet;
    if (cost <= owed) throw new Error('Il rilancio deve essere maggiore della puntata da chiamare.');
    if (target > player.roundBet + player.chips) {
      if (player.chips + player.roundBet <= room.currentBet) throw new Error('Non hai abbastanza fiches per rilanciare: puoi chiamare o andare all-in.');
      throw new Error('Puntata superiore alle fiches disponibili.');
    }
    const increase = target - room.currentBet;
    if (increase < room.minRaise) throw new Error(`Il rilancio minimo è ${room.minRaise} fiches.`);
    paid = takeChips(player, cost); room.currentBet = target; room.minRaise = increase;
    player.lastAction = action === 'bet' ? `BET ${n}` : `RAISE +${n}`; label = `${action.toUpperCase()}_${n}`;
    room.pending = clockwiseIndices(room, room.players.indexOf(player), canAct).map(p => p.name);
  }
  else if (action === 'allin') {
    if (player.chips <= 0) throw new Error('Non hai fiches da puntare.');
    const oldBet = room.currentBet; paid = takeChips(player, player.chips); const newBet = player.roundBet;
    if (newBet > oldBet) {
      const increase = newBet - oldBet;
      room.currentBet = newBet;
      if (increase >= room.minRaise) { room.minRaise = increase; room.pending = clockwiseIndices(room, room.players.indexOf(player), canAct).map(p => p.name); }
      else room.pending = room.pending.filter(n => n !== player.name);
    }
    player.lastAction = 'ALL-IN'; label = `ALLIN_${paid}`;
  }
  else throw new Error('Mossa non riconosciuta.');
  room.pending = room.pending.filter(n => n !== player.name);
  normalizePot(room);
  if (finishIfOne(room)) return label;
  if (!room.pending.length) { advanceRound(room); return label; }
  const next = room.pending[0]; room.acting = next;
  return label;
}
function view(room, player) {
  return {
    id: room.id, apiGameId: room.apiGameId, host: room.host, phase: room.phase, handNo: room.handNo,
    board: room.board, pot: room.pot, currentBet: room.currentBet, minRaise: room.minRaise,
    smallBlind: room.smallBlind, bigBlind: room.bigBlind, dealer: room.players[room.dealer]?.name || '',
    acting: room.acting, pending: room.pending, message: room.message,
    players: room.players.map(p => ({ name:p.name, chips:p.chips, folded:p.folded, allIn:p.allIn, inHand:p.inHand, roundBet:p.roundBet, lastAction:p.lastAction, handName:p.handName, isYou:!player.spectator && p.token === player.token, hole: !player.spectator && p.token === player.token ? p.hole : undefined })),
    you: player.name, spectator: Boolean(player.spectator), isHost: player.name === room.host, canStart: player.name === room.host && (room.phase === 'waiting' || room.phase === 'finished') && room.players.filter(p => p.chips > 0).length >= 2,
    apiConfigured: apiReady()
  };
}
async function logMove(room, player, move) {
  if (!room.apiGameId) return;
  const safeName = encodeURIComponent(player.name);
  const safeMove = encodeURIComponent(move);
  const result = await apiRequest(`/mossa/${encodeURIComponent(room.apiGameId)}/${safeName}/${safeMove}`, 'POST');
  if (!result.ok) room.apiWarning = `Mossa giocata localmente, ma non registrata nell'API: ${result.error}`;
  else room.apiWarning = '';
}
async function route(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok:true, apiConfigured:apiReady() });
    if (req.method === 'GET' && url.pathname === '/api/rooms') return send(res, 200, [...rooms.values()].filter(r => r.phase === 'waiting' && r.players.length < 10).map(r => ({ id:r.id, host:r.host, players:r.players.length, maxPlayers:10, blinds:`${r.smallBlind}/${r.bigBlind}` })));
    if (req.method === 'POST' && url.pathname === '/api/create') {
      const body = await readBody(req); const name = cleanName(body.name);
      const existing = rooms.values(); for (const r of existing) if (r.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('Questo nome è già in uso in una partita attiva.');
      const smallBlind = Number(body.smallBlind || 10), bigBlind = Number(body.bigBlind || 20);
      if (!Number.isInteger(smallBlind) || !Number.isInteger(bigBlind) || smallBlind < 1 || bigBlind <= smallBlind) throw new Error('Blind non validi. Il big blind deve essere maggiore dello small blind.');
      const external = await apiRequest(`/partita/${encodeURIComponent(name)}`, 'POST');
      const externalId = external.ok ? findId(external.data) : null;
      const roomId = crypto.randomBytes(3).toString('hex').toUpperCase(); const t = token();
      const room = { id:roomId, spectators:[], apiGameId: externalId, apiWarning: externalId ? '' : (external.ok ? 'L’API ha risposto, ma non è stato trovato l’ID partita nella risposta. Controlla il JSON restituito dal professore.' : `API non collegata: ${external.error}. La partita locale funziona solo su questo server.`), host:name, players:[{name,token:t,chips:1000,hole:[],folded:false,allIn:false,inHand:false,roundBet:0,contribution:0,lastAction:'',handName:''}], phase:'waiting', handNo:0, dealer:-1, board:[], pot:0, currentBet:0, minRaise:bigBlind, smallBlind, bigBlind, acting:null, pending:[], message:'Partita creata. Condividi il codice con gli altri giocatori.' };
      rooms.set(roomId, room);
      return send(res, 200, { roomId, token:t, player:name, apiGameId:room.apiGameId, apiWarning:room.apiWarning });
    }
    if (req.method === 'POST' && url.pathname === '/api/join') {
      const body = await readBody(req); const room = rooms.get(String(body.roomId || '').toUpperCase()); if (!room) throw new Error('Partita non trovata su questo server.');
      if (room.phase !== 'waiting') throw new Error('La mano è già iniziata. Aspetta la prossima partita.');
      if (room.players.length >= 10) throw new Error('Il tavolo è pieno: massimo 10 giocatori.');
      const name = cleanName(body.name); if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('Questo nome è già presente al tavolo.');
      for (const r of rooms.values()) if (r.id !== room.id && r.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('Questo nome è già in uso in un altro tavolo.');
      let apiWarning = '';
      if (room.apiGameId) { const jr = await apiRequest(`/join/${encodeURIComponent(room.apiGameId)}/${encodeURIComponent(name)}`, 'POST'); if (!jr.ok) apiWarning = `Giocatore aggiunto al tavolo del gioco, ma API join fallita: ${jr.error}`; }
      const t = token(); room.players.push({name,token:t,chips:1000,hole:[],folded:false,allIn:false,inHand:false,roundBet:0,contribution:0,lastAction:'',handName:''}); room.message = `${name} si è unito al tavolo (${room.players.length}/10).`;
      return send(res, 200, { roomId:room.id, token:t, player:name, apiWarning:apiWarning || room.apiWarning });
    }
    if (req.method === 'POST' && url.pathname === '/api/watch') {
      const body = await readBody(req); const room = rooms.get(String(body.roomId || '').toUpperCase()); if (!room) throw new Error('Partita non trovata.');
      const name = cleanName(body.name); const t = token(); room.spectators.push({ name, token:t, spectator:true });
      return send(res, 200, { roomId:room.id, token:t, player:name, spectator:true });
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const room = rooms.get(String(url.searchParams.get('roomId') || '').toUpperCase()); if (!room) throw new Error('Partita non trovata.');
      const t = url.searchParams.get('token'); const player = playerFor(room, t) || room.spectators.find(p => p.token === t);
      if (!player) throw new Error('Sessione non valida. Rientra con il codice della partita.');
      const state = view(room, player); state.apiWarning = room.apiWarning || ''; return send(res, 200, state);
    }
    if (req.method === 'POST' && url.pathname === '/api/start') {
      const body = await readBody(req); const room = rooms.get(String(body.roomId || '').toUpperCase()); if (!room) throw new Error('Partita non trovata.');
      const player = playerFor(room, body.token); if (!player) throw new Error('Sessione non valida.'); if (player.name !== room.host) throw new Error('Solo chi ha creato il tavolo può iniziare la mano.');
      startHand(room); return send(res, 200, { ok:true });
    }
    if (req.method === 'POST' && url.pathname === '/api/action') {
      const body = await readBody(req); const room = rooms.get(String(body.roomId || '').toUpperCase()); if (!room) throw new Error('Partita non trovata.');
      const player = playerFor(room, body.token); if (!player) throw new Error('Sessione non valida.');
      const label = processAction(room, player, body.action, body.amount);
      await logMove(room, player, label);
      return send(res, 200, { ok:true, apiWarning:room.apiWarning || '' });
    }
    if (req.method === 'GET') {
      const filePath = url.pathname === '/' ? path.join(PUBLIC, 'index.html') : path.join(PUBLIC, path.normalize(url.pathname).replace(/^([/\\])+/, ''));
      if (!filePath.startsWith(PUBLIC)) return send(res, 403, { error:'Accesso negato.' });
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return send(res, 404, { error:'File non trovato.' });
      const ext = path.extname(filePath); const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.svg':'image/svg+xml' };
      res.writeHead(200, { 'Content-Type':types[ext] || 'application/octet-stream', 'Cache-Control':'no-store' }); fs.createReadStream(filePath).pipe(res); return;
    }
    return send(res, 404, { error:'Endpoint non trovato.' });
  } catch (e) { return send(res, 400, { error:e.message || 'Errore imprevisto.' }); }
}
http.createServer(route).listen(PORT, () => console.log(`Texas Hold'em avviato: http://localhost:${PORT}`));
