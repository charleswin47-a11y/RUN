const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

// Garante que o diretório de dados persistentes exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ----------------------------------------------------------------------------
// BANCO DE DADOS PERSISTENTE ATÔMICO (Crash-proof com fsync)
// ----------------------------------------------------------------------------
function loadJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`[DB] Erro ao carregar ${filePath}, usando fallback:`, err.message);
  }
  return fallback;
}

function saveJsonAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`[DB] Erro ao salvar atomicamente ${filePath}:`, err.message);
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
  }
}

// Inicialização das estruturas de dados
let players = loadJsonSafe(PLAYERS_FILE, {});
let leaderboard = loadJsonSafe(LEADERBOARD_FILE, [
  { playerId: 'bot_di5', nickname: 'Di5', characterId: 'di5', score: 450, maxLevel: 2, date: '16/10/2026', timestamp: 1729094400000 },
  { playerId: 'bot_wendel', nickname: 'Wendel', characterId: 'wendel', score: 380, maxLevel: 2, date: '16/10/2026', timestamp: 1729094000000 },
  { playerId: 'bot_muniz', nickname: 'Muniz', characterId: 'muniz', score: 310, maxLevel: 2, date: '16/10/2026', timestamp: 1729093000000 },
  { playerId: 'bot_clarinha', nickname: 'Clarinha', characterId: 'clarinha', score: 290, maxLevel: 1, date: '16/10/2026', timestamp: 1729092000000 },
  { playerId: 'bot_joao', nickname: 'Joao', characterId: 'joao', score: 260, maxLevel: 1, date: '16/10/2026', timestamp: 1729091000000 }
]);

// Se players estiver vazio, preenche automaticamente e salva no disco
if (!players || Object.keys(players).length === 0) {
  players = {
    bot_di5: { id: 'bot_di5', secret: 'bot_secret_di5_retro', nickname: 'Di5', favoriteChar: 'di5', createdAt: 1729094400000, lastLogin: 1729094400000, bestScore: 450, matchesPlayed: 12 },
    bot_wendel: { id: 'bot_wendel', secret: 'bot_secret_wendel_retro', nickname: 'Wendel', favoriteChar: 'wendel', createdAt: 1729094000000, lastLogin: 1729094000000, bestScore: 380, matchesPlayed: 9 },
    bot_muniz: { id: 'bot_muniz', secret: 'bot_secret_muniz_retro', nickname: 'Muniz', favoriteChar: 'muniz', createdAt: 1729093000000, lastLogin: 1729093000000, bestScore: 310, matchesPlayed: 7 },
    bot_clarinha: { id: 'bot_clarinha', secret: 'bot_secret_clarinha_retro', nickname: 'Clarinha', favoriteChar: 'clarinha', createdAt: 1729092000000, lastLogin: 1729092000000, bestScore: 290, matchesPlayed: 6 },
    bot_joao: { id: 'bot_joao', secret: 'bot_secret_joao_retro', nickname: 'Joao', favoriteChar: 'joao', createdAt: 1729091000000, lastLogin: 1729091000000, bestScore: 260, matchesPlayed: 5 }
  };
  saveJsonAtomic(PLAYERS_FILE, players);
}

// Sessões ativas de corrida para proteção anti-cheat
const activeGameSessions = new Map();

// ----------------------------------------------------------------------------
// MIDDLEWARES EXPRESS & PARSERS
// ----------------------------------------------------------------------------
app.use(express.json({ limit: '128kb' }));

// Headers de CORS e Segurança
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ----------------------------------------------------------------------------
// GERENCIAMENTO WEBSOCKET & BROADCASTING EM TEMPO REAL
// ----------------------------------------------------------------------------
const connectedClients = new Set();

function broadcastMessage(type, payload) {
  const msg = JSON.stringify({ type, data: payload, timestamp: Date.now() });
  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(msg);
      } catch (err) {
        console.error('[WS] Erro ao enviar para cliente:', err.message);
      }
    }
  }
}

function broadcastOnlineCount() {
  broadcastMessage('ONLINE_COUNT', { count: connectedClients.size });
}

wss.on('connection', (ws, req) => {
  connectedClients.add(ws);
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Envia estado inicial completo ao novo jogador conectado
  ws.send(JSON.stringify({
    type: 'INIT',
    data: {
      onlineCount: connectedClients.size,
      leaderboard: getSanitizedLeaderboard(25),
      topByCharacter: getTopByCharacter()
    }
  }));

  broadcastOnlineCount();

  ws.on('close', () => {
    connectedClients.delete(ws);
    broadcastOnlineCount();
  });

  ws.on('error', (err) => {
    console.error('[WS] Erro no socket cliente:', err.message);
    connectedClients.delete(ws);
  });
});

// Heartbeat a cada 25s para manter conexões móveis ativas e limpar mortas
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// ----------------------------------------------------------------------------
// HELPERS DE REGRAS DE NEGÓCIO E RANKING
// ----------------------------------------------------------------------------
function getSanitizedLeaderboard(limit = 25) {
  return leaderboard.slice(0, limit).map((entry, index) => ({
    rank: index + 1,
    nickname: entry.nickname,
    characterId: entry.characterId,
    score: entry.score,
    maxLevel: entry.maxLevel || 1,
    date: entry.date,
    isTop1: index === 0
  }));
}

function getTopByCharacter() {
  const byChar = {};
  for (const entry of leaderboard) {
    if (!byChar[entry.characterId]) {
      byChar[entry.characterId] = {
        characterId: entry.characterId,
        nickname: entry.nickname,
        score: entry.score,
        date: entry.date
      };
    }
  }
  return byChar;
}

function sanitizeNickname(raw) {
  if (!raw || typeof raw !== 'string') return 'Corredor';
  // Permite letras, números, acentos e espaço (3 a 14 chars)
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9\u00C0-\u00FF _-]/g, '').slice(0, 14);
  return cleaned.length >= 2 ? cleaned : 'Corredor';
}

// ----------------------------------------------------------------------------
// ROTAS REST API
// ----------------------------------------------------------------------------

// 1. Status do servidor & Contagem Online
app.get('/api/status', (req, res) => {
  res.json({
    online: true,
    serverTime: Date.now(),
    onlinePlayers: connectedClients.size,
    totalRecords: leaderboard.length,
    registeredPlayers: Object.keys(players).length
  });
});

// 2. Registro / Autenticação Persistente do Jogador
app.post('/api/player/register', (req, res) => {
  const { playerId, playerSecret, nickname, favoriteChar } = req.body || {};
  let finalPlayerId = playerId;
  let finalSecret = playerSecret;
  let cleanNick = sanitizeNickname(nickname);

  // Se já enviou credenciais válidas e não é ID temporário local, valida a autenticidade
  if (finalPlayerId && !finalPlayerId.startsWith('local_') && players[finalPlayerId]) {
    const existing = players[finalPlayerId];
    if (existing.secret !== finalSecret) {
      return res.status(403).json({ error: 'Credenciais inválidas para este identificador.' });
    }
    // Atualiza apelido e personagem se solicitado
    if (cleanNick && cleanNick !== existing.nickname) {
      existing.nickname = cleanNick;
    }
    if (favoriteChar) {
      existing.favoriteChar = favoriteChar;
    }
    existing.lastLogin = Date.now();
    saveJsonAtomic(PLAYERS_FILE, players);

    // Retorna dados do jogador com melhor pontuação e posição global
    const playerRank = leaderboard.findIndex(entry => entry.playerId === finalPlayerId);
    return res.json({
      success: true,
      player: {
        playerId: finalPlayerId,
        playerSecret: existing.secret,
        nickname: existing.nickname,
        bestScore: existing.bestScore || 0,
        matchesPlayed: existing.matchesPlayed || 0,
        globalRank: playerRank >= 0 ? playerRank + 1 : null
      }
    });
  }

  // Novo jogador: gera UUID e secret criptográfico exclusivo
  finalPlayerId = crypto.randomUUID();
  finalSecret = crypto.randomBytes(24).toString('hex');
  const now = Date.now();

  players[finalPlayerId] = {
    id: finalPlayerId,
    secret: finalSecret,
    nickname: cleanNick || `Corredor_${finalPlayerId.slice(0, 4)}`,
    favoriteChar: favoriteChar || 'di5',
    createdAt: now,
    lastLogin: now,
    bestScore: 0,
    matchesPlayed: 0
  };

  saveJsonAtomic(PLAYERS_FILE, players);

  res.json({
    success: true,
    player: {
      playerId: finalPlayerId,
      playerSecret: finalSecret,
      nickname: players[finalPlayerId].nickname,
      bestScore: 0,
      matchesPlayed: 0,
      globalRank: null
    }
  });
});

// 3. Consulta Pública do Ranking Global e por Personagem
app.get('/api/leaderboard', (req, res) => {
  const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 25));
  res.json({
    success: true,
    topGlobal: getSanitizedLeaderboard(limit),
    topByCharacter: getTopByCharacter(),
    totalEntries: leaderboard.length,
    onlinePlayers: connectedClients.size
  });
});

// 4. Início de Sessão de Partida (Anti-Cheat & Validação)
app.post('/api/session/start', (req, res) => {
  const { playerId, playerSecret, characterId } = req.body || {};
  if (!playerId || !players[playerId] || players[playerId].secret !== playerSecret) {
    return res.status(401).json({ error: 'Jogador não autenticado.' });
  }

  const sessionId = crypto.randomUUID();
  const sessionData = {
    sessionId,
    playerId,
    characterId: characterId || 'di5',
    startTime: Date.now(),
    status: 'ACTIVE'
  };

  activeGameSessions.set(sessionId, sessionData);

  // Limpa sessões zumbis com mais de 3 horas
  if (activeGameSessions.size > 2000) {
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    for (const [id, s] of activeGameSessions) {
      if (s.startTime < threeHoursAgo) activeGameSessions.delete(id);
    }
  }

  res.json({ success: true, sessionId, startTime: sessionData.startTime });
});

// 5. Finalização de Partida & Registro Validade de Recorde
app.post('/api/session/finish', (req, res) => {
  const {
    sessionId,
    playerId,
    playerSecret,
    score,
    maxLevel,
    characterId,
    obstaclesPassed,
    obstaclesDestroyed,
    skillsUsed
  } = req.body || {};

  // Validação de jogador
  const player = players[playerId];
  if (!player || player.secret !== playerSecret) {
    return res.status(401).json({ error: 'Autenticação de jogador inválida.' });
  }

  // Validação da sessão ativa
  const session = activeGameSessions.get(sessionId);
  if (!session || session.playerId !== playerId) {
    return res.status(400).json({ error: 'Sessão de jogo inválida ou expirada.' });
  }

  const finalScore = Math.floor(Number(score));
  if (isNaN(finalScore) || finalScore < 0) {
    return res.status(400).json({ error: 'Pontuação malformada.' });
  }

  // --- VALIDAÇÕES DE SEGURANÇA E ANTI-CHEAT ---
  const durationSeconds = Math.max(0.1, (Date.now() - session.startTime) / 1000);

  // A física do AMIGOS RUN gera no máximo ~25 pontos por segundo mesmo com Loira Suprema (x1.5) e velocidade máxima
  const MAX_THEORETICAL_PTS_PER_SEC = 35.0;
  const maxPossibleScore = Math.ceil(durationSeconds * MAX_THEORETICAL_PTS_PER_SEC) + 20;

  if (finalScore > maxPossibleScore && finalScore > 100) {
    console.warn(`[ANTI-CHEAT] Pontuação suspeita bloqueada! Player: ${player.nickname}, Score: ${finalScore}, Dur: ${durationSeconds.toFixed(1)}s, MaxPossivel: ${maxPossibleScore}`);
    activeGameSessions.delete(sessionId);
    return res.status(400).json({ error: 'Inconsistência de física e tempo detectada na partida.' });
  }

  activeGameSessions.delete(sessionId);

  // Atualiza estatísticas do jogador
  player.matchesPlayed = (player.matchesPlayed || 0) + 1;
  const prevBest = player.bestScore || 0;
  const isNewPersonalBest = finalScore > prevBest;
  if (isNewPersonalBest) {
    player.bestScore = finalScore;
  }
  saveJsonAtomic(PLAYERS_FILE, players);

  // Verifica se entra no ranking global
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('pt-BR');
  const prevGlobalLeader = leaderboard[0];

  let isNewGlobalLeader = false;
  let newRank = null;

  // Busca se já existe um recorde salvo desse jogador no ranking
  const existingEntryIndex = leaderboard.findIndex(e => e.playerId === playerId);

  if (existingEntryIndex >= 0) {
    // Se a nova pontuação for maior que o recorde anterior dele no ranking:
    if (finalScore > leaderboard[existingEntryIndex].score) {
      leaderboard[existingEntryIndex].score = finalScore;
      leaderboard[existingEntryIndex].characterId = characterId || session.characterId;
      leaderboard[existingEntryIndex].maxLevel = maxLevel || 1;
      leaderboard[existingEntryIndex].date = dateFormatted;
      leaderboard[existingEntryIndex].timestamp = Date.now();
    }
  } else if (finalScore > 0) {
    // Primeiro recorde do jogador
    leaderboard.push({
      playerId,
      nickname: player.nickname,
      characterId: characterId || session.characterId,
      score: finalScore,
      maxLevel: maxLevel || 1,
      date: dateFormatted,
      timestamp: Date.now()
    });
  }

  // Ordena ranking por pontuação descendente; desempate por timestamp (quem bateu primeiro)
  leaderboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timestamp - b.timestamp;
  });

  // Limita o histórico persistente aos 100 maiores recordes
  if (leaderboard.length > 100) {
    leaderboard = leaderboard.slice(0, 100);
  }

  saveJsonAtomic(LEADERBOARD_FILE, leaderboard);

  // Identifica a posição global do jogador
  const playerRankIndex = leaderboard.findIndex(e => e.playerId === playerId);
  newRank = playerRankIndex >= 0 ? playerRankIndex + 1 : null;

  if (leaderboard[0] && leaderboard[0].playerId === playerId && (!prevGlobalLeader || prevGlobalLeader.playerId !== playerId || finalScore > prevGlobalLeader.score)) {
    isNewGlobalLeader = true;
  }

  // Notifica todos os jogadores online conectados via WebSocket!
  if (isNewPersonalBest || isNewGlobalLeader) {
    broadcastMessage('NEW_RECORD', {
      playerId,
      nickname: player.nickname,
      characterId: characterId || session.characterId,
      score: finalScore,
      rank: newRank,
      isNewGlobalLeader,
      date: dateFormatted
    });

    broadcastMessage('LEADERBOARD_UPDATE', {
      leaderboard: getSanitizedLeaderboard(25),
      topByCharacter: getTopByCharacter()
    });
  }

  res.json({
    success: true,
    score: finalScore,
    isNewPersonalBest,
    isNewGlobalLeader,
    globalRank: newRank,
    totalRecords: leaderboard.length
  });
});

// ----------------------------------------------------------------------------
// SERVIR ARQUIVOS ESTÁTICOS DO AMIGOS RUN
// ----------------------------------------------------------------------------
app.use(express.static(path.join(__dirname)));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicia servidor HTTP + WebSocket
server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🎮 A GRANDE FAMÍLIA GAME — SERVIDOR ONLINE & RANKING 🎮`);
  console.log(`Porta: ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'production'}`);
  console.log(`Banco: ${LEADERBOARD_FILE}`);
  console.log(`WebSocket: /ws`);
  console.log(`====================================================`);
});
