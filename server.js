const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { Pool } = require('pg');

const app = express();
// Configuração essencial para ambientes com proxy reverso (Render, Cloudflare, NGINX)
app.set('trust proxy', 1);

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

// Garante que o diretório data/ exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ----------------------------------------------------------------------------
// BANCO DE DADOS PERSISTENTE: POSTGRESQL (PRODUÇÃO RENDER) & JSON (FALLBACK LOCAL)
// ----------------------------------------------------------------------------
function loadJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`[DB-JSON] Erro ao carregar ${filePath}, usando fallback:`, err.message);
  }
  return fallback;
}

function saveJsonAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`[DB-JSON] Erro ao salvar atomicamente ${filePath}:`, err.message);
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
  }
}

// Seeds padrão com o elenco de A Grande Família Game
const DEFAULT_LEADERBOARD = [
  { playerId: 'bot_di5', nickname: 'Di5', characterId: 'di5', score: 450, maxLevel: 2, date: '16/10/2026', timestamp: 1729094400000 },
  { playerId: 'bot_wendel', nickname: 'Wendel', characterId: 'wendel', score: 380, maxLevel: 2, date: '16/10/2026', timestamp: 1729094000000 },
  { playerId: 'bot_muniz', nickname: 'Muniz', characterId: 'muniz', score: 310, maxLevel: 2, date: '16/10/2026', timestamp: 1729093000000 },
  { playerId: 'bot_clarinha', nickname: 'Clarinha', characterId: 'clarinha', score: 290, maxLevel: 1, date: '16/10/2026', timestamp: 1729092000000 },
  { playerId: 'bot_joao', nickname: 'Joao', characterId: 'joao', score: 260, maxLevel: 1, date: '16/10/2026', timestamp: 1729091000000 },
  { playerId: 'bot_taynara', nickname: 'Taynara', characterId: 'taynara', score: 240, maxLevel: 1, date: '16/10/2026', timestamp: 1729090500000 },
  { playerId: 'bot_matheus', nickname: 'Matheus', characterId: 'matheus', score: 220, maxLevel: 1, date: '16/10/2026', timestamp: 1729090400000 },
  { playerId: 'bot_emily', nickname: 'Emily', characterId: 'emily', score: 200, maxLevel: 1, date: '16/10/2026', timestamp: 1729090300000 },
  { playerId: 'bot_lais', nickname: 'Lais', characterId: 'lais', score: 180, maxLevel: 1, date: '16/10/2026', timestamp: 1729090200000 }
];

const DEFAULT_PLAYERS = {
  bot_di5: { id: 'bot_di5', secret: 'bot_secret_di5_retro', nickname: 'Di5', favoriteChar: 'di5', createdAt: 1729094400000, lastLogin: 1729094400000, bestScore: 450, matchesPlayed: 12 },
  bot_wendel: { id: 'bot_wendel', secret: 'bot_secret_wendel_retro', nickname: 'Wendel', favoriteChar: 'wendel', createdAt: 1729094000000, lastLogin: 1729094000000, bestScore: 380, matchesPlayed: 9 },
  bot_muniz: { id: 'bot_muniz', secret: 'bot_secret_muniz_retro', nickname: 'Muniz', favoriteChar: 'muniz', createdAt: 1729093000000, lastLogin: 1729093000000, bestScore: 310, matchesPlayed: 7 },
  bot_clarinha: { id: 'bot_clarinha', secret: 'bot_secret_clarinha_retro', nickname: 'Clarinha', favoriteChar: 'clarinha', createdAt: 1729092000000, lastLogin: 1729092000000, bestScore: 290, matchesPlayed: 6 },
  bot_joao: { id: 'bot_joao', secret: 'bot_secret_joao_retro', nickname: 'Joao', favoriteChar: 'joao', createdAt: 1729091000000, lastLogin: 1729091000000, bestScore: 260, matchesPlayed: 5 },
  bot_taynara: { id: 'bot_taynara', secret: 'bot_secret_taynara_retro', nickname: 'Taynara', favoriteChar: 'taynara', createdAt: 1729090500000, lastLogin: 1729090500000, bestScore: 240, matchesPlayed: 4 },
  bot_matheus: { id: 'bot_matheus', secret: 'bot_secret_matheus_retro', nickname: 'Matheus', favoriteChar: 'matheus', createdAt: 1729090400000, lastLogin: 1729090400000, bestScore: 220, matchesPlayed: 4 },
  bot_emily: { id: 'bot_emily', secret: 'bot_secret_emily_retro', nickname: 'Emily', favoriteChar: 'emily', createdAt: 1729090300000, lastLogin: 1729090300000, bestScore: 200, matchesPlayed: 3 },
  bot_lais: { id: 'bot_lais', secret: 'bot_secret_lais_retro', nickname: 'Lais', favoriteChar: 'lais', createdAt: 1729090200000, lastLogin: 1729090200000, bestScore: 180, matchesPlayed: 3 }
};

class DataStore {
  constructor() {
    this.isPostgres = false;
    this.pool = null;
    this.memoryPlayers = {};
    this.memoryLeaderboard = [];
  }

  async init() {
    if (process.env.DATABASE_URL) {
      try {
        console.log('[DB] Conectando ao PostgreSQL (DATABASE_URL)...');
        const isRender = process.env.DATABASE_URL.includes('render.com') || process.env.NODE_ENV === 'production';
        this.pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: isRender ? { rejectUnauthorized: false } : undefined,
          connectionTimeoutMillis: 8000
        });

        const client = await this.pool.connect();
        console.log('[DB] Conexão com PostgreSQL ativa com sucesso!');

        await client.query(`
          CREATE TABLE IF NOT EXISTS players (
            id VARCHAR(64) PRIMARY KEY,
            secret VARCHAR(128) NOT NULL,
            nickname VARCHAR(32) NOT NULL,
            favorite_char VARCHAR(32) DEFAULT 'di5',
            best_score INT DEFAULT 0,
            matches_played INT DEFAULT 0,
            created_at BIGINT,
            last_login BIGINT
          );

          CREATE TABLE IF NOT EXISTS leaderboard (
            id SERIAL PRIMARY KEY,
            player_id VARCHAR(64) UNIQUE,
            nickname VARCHAR(32) NOT NULL,
            character_id VARCHAR(32) NOT NULL,
            score INT NOT NULL,
            max_level INT DEFAULT 1,
            date VARCHAR(32),
            timestamp BIGINT
          );

          CREATE INDEX IF NOT EXISTS idx_leaderboard_score_desc ON leaderboard (score DESC, timestamp ASC);
        `);

        // Migração automática se a tabela estiver vazia
        const countRes = await client.query('SELECT COUNT(*) AS count FROM leaderboard');
        const count = parseInt(countRes.rows[0].count, 10);
        if (count === 0) {
          console.log('[DB] Migrando dados existentes para PostgreSQL...');
          const existingLead = loadJsonSafe(LEADERBOARD_FILE, DEFAULT_LEADERBOARD);
          for (const item of existingLead) {
            await client.query(`
              INSERT INTO leaderboard (player_id, nickname, character_id, score, max_level, date, timestamp)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (player_id) DO UPDATE SET
                score = EXCLUDED.score,
                max_level = EXCLUDED.max_level,
                date = EXCLUDED.date,
                timestamp = EXCLUDED.timestamp
            `, [item.playerId, item.nickname, item.characterId, item.score, item.maxLevel || 1, item.date, item.timestamp || Date.now()]);
          }

          const existingPlayers = loadJsonSafe(PLAYERS_FILE, DEFAULT_PLAYERS);
          for (const p of Object.values(existingPlayers)) {
            await client.query(`
              INSERT INTO players (id, secret, nickname, favorite_char, best_score, matches_played, created_at, last_login)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT (id) DO NOTHING
            `, [p.id, p.secret, p.nickname, p.favoriteChar || 'di5', p.bestScore || 0, p.matchesPlayed || 0, p.createdAt || Date.now(), p.lastLogin || Date.now()]);
          }
          console.log('[DB] Migração para PostgreSQL concluída com sucesso!');
        }

        client.release();
        this.isPostgres = true;
        return;
      } catch (err) {
        console.error('[DB] Falha na conexão PostgreSQL. Usando fallback em JSON local:', err.message);
        this.isPostgres = false;
      }
    } else {
      console.log('[DB] DATABASE_URL não informada. Usando armazenamento atômico local JSON em data/.');
    }

    // Inicialização Local JSON
    this.memoryPlayers = loadJsonSafe(PLAYERS_FILE, DEFAULT_PLAYERS);
    this.memoryLeaderboard = loadJsonSafe(LEADERBOARD_FILE, DEFAULT_LEADERBOARD);
    saveJsonAtomic(PLAYERS_FILE, this.memoryPlayers);
    saveJsonAtomic(LEADERBOARD_FILE, this.memoryLeaderboard);
  }

  async getLeaderboard(limit = 25) {
    if (this.isPostgres) {
      const res = await this.pool.query(`
        SELECT player_id, nickname, character_id, score, max_level, date, timestamp
        FROM leaderboard
        ORDER BY score DESC, timestamp ASC
        LIMIT $1
      `, [limit]);
      return res.rows.map((row, idx) => ({
        rank: idx + 1,
        playerId: row.player_id,
        nickname: row.nickname,
        characterId: row.character_id,
        score: row.score,
        maxLevel: row.max_level || 1,
        date: row.date,
        isTop1: idx === 0
      }));
    }

    return this.memoryLeaderboard.slice(0, limit).map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      nickname: entry.nickname,
      characterId: entry.characterId,
      score: entry.score,
      maxLevel: entry.maxLevel || 1,
      date: entry.date,
      isTop1: index === 0
    }));
  }

  async getTopByCharacter() {
    let all = [];
    if (this.isPostgres) {
      const res = await this.pool.query(`
        SELECT player_id, nickname, character_id, score, date, timestamp
        FROM leaderboard
        ORDER BY score DESC, timestamp ASC
      `);
      all = res.rows.map(r => ({
        playerId: r.player_id,
        nickname: r.nickname,
        characterId: r.character_id,
        score: r.score,
        date: r.date
      }));
    } else {
      all = this.memoryLeaderboard;
    }

    const byChar = {};
    for (const entry of all) {
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

  async getTotalRecordsCount() {
    if (this.isPostgres) {
      const res = await this.pool.query('SELECT COUNT(*) AS count FROM leaderboard');
      return parseInt(res.rows[0].count, 10);
    }
    return this.memoryLeaderboard.length;
  }

  async getPlayer(playerId) {
    if (!playerId) return null;
    if (this.isPostgres) {
      const res = await this.pool.query('SELECT * FROM players WHERE id = $1', [playerId]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        secret: r.secret,
        nickname: r.nickname,
        favoriteChar: r.favorite_char,
        bestScore: r.best_score,
        matchesPlayed: r.matches_played,
        createdAt: r.created_at,
        lastLogin: r.last_login
      };
    }
    return this.memoryPlayers[playerId] || null;
  }

  async savePlayer(p) {
    if (!p || !p.id) return;
    if (this.isPostgres) {
      await this.pool.query(`
        INSERT INTO players (id, secret, nickname, favorite_char, best_score, matches_played, created_at, last_login)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          secret = EXCLUDED.secret,
          nickname = EXCLUDED.nickname,
          favorite_char = EXCLUDED.favorite_char,
          best_score = EXCLUDED.best_score,
          matches_played = EXCLUDED.matches_played,
          last_login = EXCLUDED.last_login
      `, [p.id, p.secret, p.nickname, p.favoriteChar || 'di5', p.bestScore || 0, p.matchesPlayed || 0, p.createdAt || Date.now(), p.lastLogin || Date.now()]);
      return;
    }

    this.memoryPlayers[p.id] = p;
    saveJsonAtomic(PLAYERS_FILE, this.memoryPlayers);
  }

  async recordScore({ playerId, nickname, characterId, score, maxLevel, date }) {
    const timestamp = Date.now();
    if (this.isPostgres) {
      await this.pool.query(`
        INSERT INTO leaderboard (player_id, nickname, character_id, score, max_level, date, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (player_id) DO UPDATE SET
          nickname = EXCLUDED.nickname,
          character_id = EXCLUDED.character_id,
          score = CASE WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.score ELSE leaderboard.score END,
          max_level = CASE WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.max_level ELSE leaderboard.max_level END,
          date = CASE WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.date ELSE leaderboard.date END,
          timestamp = CASE WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.timestamp ELSE leaderboard.timestamp END
      `, [playerId, nickname, characterId, score, maxLevel || 1, date, timestamp]);

      const rankRes = await this.pool.query(`
        SELECT rank FROM (
          SELECT player_id, RANK() OVER (ORDER BY score DESC, timestamp ASC) AS rank
          FROM leaderboard
        ) sub WHERE player_id = $1
      `, [playerId]);

      const rank = rankRes.rows.length > 0 ? parseInt(rankRes.rows[0].rank, 10) : null;
      return { rank, isNewGlobalLeader: rank === 1 };
    }

    // JSON fallback
    const existingIndex = this.memoryLeaderboard.findIndex(e => e.playerId === playerId);
    if (existingIndex >= 0) {
      if (score > this.memoryLeaderboard[existingIndex].score) {
        this.memoryLeaderboard[existingIndex].score = score;
        this.memoryLeaderboard[existingIndex].characterId = characterId;
        this.memoryLeaderboard[existingIndex].nickname = nickname;
        this.memoryLeaderboard[existingIndex].maxLevel = maxLevel || 1;
        this.memoryLeaderboard[existingIndex].date = date;
        this.memoryLeaderboard[existingIndex].timestamp = timestamp;
      }
    } else {
      this.memoryLeaderboard.push({
        playerId,
        nickname,
        characterId,
        score,
        maxLevel: maxLevel || 1,
        date,
        timestamp
      });
    }

    this.memoryLeaderboard.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timestamp - b.timestamp;
    });

    if (this.memoryLeaderboard.length > 100) {
      this.memoryLeaderboard = this.memoryLeaderboard.slice(0, 100);
    }

    saveJsonAtomic(LEADERBOARD_FILE, this.memoryLeaderboard);

    const rankIndex = this.memoryLeaderboard.findIndex(e => e.playerId === playerId);
    const rank = rankIndex >= 0 ? rankIndex + 1 : null;
    return { rank, isNewGlobalLeader: rank === 1 };
  }
}

const db = new DataStore();

// ----------------------------------------------------------------------------
// GERENCIADOR DE CONEXÕES ONLINE & SESSÕES ÚNICAS (ONLINE TRACKER)
// Critério Oficial: Jogadores Únicos Ativos Conectados (Unique Active Players)
// ----------------------------------------------------------------------------
class OnlineTracker {
  constructor() {
    this.connections = new Map(); // connectionId -> session
    this.playerConnections = new Map(); // playerId -> Set<connectionId>
    this.connectionCounter = 0;
  }

  addConnection(ws, req) {
    this.connectionCounter++;
    const connectionId = `conn_${Date.now()}_${this.connectionCounter}_${Math.random().toString(36).slice(2, 7)}`;
    const url = new URL(req.url, 'http://localhost');
    const initialPlayerId = url.searchParams.get('playerId') || null;
    const ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress;

    const session = {
      ws,
      connectionId,
      playerId: initialPlayerId,
      ip,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      isAlive: true
    };

    this.connections.set(connectionId, session);
    ws.connectionId = connectionId;

    if (initialPlayerId) {
      if (!this.playerConnections.has(initialPlayerId)) {
        this.playerConnections.set(initialPlayerId, new Set());
      }
      this.playerConnections.get(initialPlayerId).add(connectionId);
    }

    console.log(`[ONLINE] + Conexão ${connectionId} (IP: ${ip}, PlayerId: ${initialPlayerId || 'anônimo'}). Total Conexões: ${this.connections.size}, Jogadores Únicos: ${this.getUniqueOnlineCount()}`);
    return session;
  }

  identifyPlayer(connectionId, playerId) {
    const session = this.connections.get(connectionId);
    if (!session || !playerId) return;

    if (session.playerId && session.playerId !== playerId) {
      const oldSet = this.playerConnections.get(session.playerId);
      if (oldSet) {
        oldSet.delete(connectionId);
        if (oldSet.size === 0) this.playerConnections.delete(session.playerId);
      }
    }

    session.playerId = playerId;
    session.lastSeen = Date.now();

    if (!this.playerConnections.has(playerId)) {
      this.playerConnections.set(playerId, new Set());
    }
    this.playerConnections.get(playerId).add(connectionId);
  }

  removeConnection(connectionId) {
    const session = this.connections.get(connectionId);
    if (!session) return;

    if (session.playerId) {
      const set = this.playerConnections.get(session.playerId);
      if (set) {
        set.delete(connectionId);
        if (set.size === 0) this.playerConnections.delete(session.playerId);
      }
    }

    this.connections.delete(connectionId);
    console.log(`[ONLINE] - Conexão ${connectionId} desconectada. Total Conexões: ${this.connections.size}, Jogadores Únicos: ${this.getUniqueOnlineCount()}`);
  }

  heartbeatTick() {
    for (const [connectionId, session] of this.connections) {
      if (session.isAlive === false) {
        console.log(`[ONLINE] Conexão ${connectionId} inativa/timeout, removendo.`);
        try { session.ws.terminate(); } catch (_) {}
        this.removeConnection(connectionId);
        continue;
      }
      session.isAlive = false;
      try {
        session.ws.ping();
      } catch (err) {
        this.removeConnection(connectionId);
      }
    }
  }

  handlePong(connectionId) {
    const session = this.connections.get(connectionId);
    if (session) {
      session.isAlive = true;
      session.lastSeen = Date.now();
    }
  }

  getUniqueOnlineCount() {
    let anonymousCount = 0;
    for (const session of this.connections.values()) {
      if (!session.playerId) anonymousCount++;
    }
    return Math.max(0, this.playerConnections.size + anonymousCount);
  }

  getTotalConnectionsCount() {
    return Math.max(0, this.connections.size);
  }
}

const onlineTracker = new OnlineTracker();

// ----------------------------------------------------------------------------
// BROADCAST WEBSOCKET
// ----------------------------------------------------------------------------
function broadcastMessage(type, payload) {
  const msg = JSON.stringify({ type, data: payload, timestamp: Date.now() });
  for (const session of onlineTracker.connections.values()) {
    if (session.ws.readyState === WebSocket.OPEN) {
      try {
        session.ws.send(msg);
      } catch (err) {
        console.error('[WS] Erro no broadcast:', err.message);
      }
    }
  }
}

function broadcastOnlineCount() {
  const uniqueCount = onlineTracker.getUniqueOnlineCount();
  const totalSockets = onlineTracker.getTotalConnectionsCount();
  broadcastMessage('ONLINE_COUNT', {
    count: uniqueCount,
    totalConnections: totalSockets
  });
}

// ----------------------------------------------------------------------------
// CHAT GLOBAL ONLINE — CHAT DA TROPA (PC STUDIOS)
// ----------------------------------------------------------------------------
const VALID_CHARACTERS = new Set([
  'di5', 'wendel', 'muniz', 'clarinha', 'joao', 'douglas',
  'nalu', 'beatriz', 'vitor', 'julya', 'junior', 'taynara',
  'matheus', 'emily', 'lais'
]);

class ChatManager {
  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
    this.messages = [];
    this.rateLimiter = new Map(); // playerId -> [timestamps]
    this.lastUserMsg = new Map(); // playerId -> { text, time }
    this.joinAnnouncements = new Map(); // playerId -> timestamp

    // Mensagem de boas-vindas inicial no histórico
    this.addSystemNotice('🎮 Bem-vindo ao CHAT DA TROPA de A Grande Família Game! Conversem em tempo real com toda a comunidade online!');
  }

  getHistory() {
    return [...this.messages];
  }

  addMessage({ playerId, nickname, characterId, text }) {
    if (!text || typeof text !== 'string') {
      throw new Error('A mensagem não pode ser vazia.');
    }

    const cleanText = text.trim();
    if (cleanText.length === 0) {
      throw new Error('A mensagem não pode conter apenas espaços.');
    }

    if (cleanText.length > 250) {
      throw new Error('A mensagem excede o limite máximo de 250 caracteres.');
    }

    const id = playerId || 'anon';
    const now = Date.now();

    // 1. Rate Limiting: Máximo de 20 mensagens por minuto (60.000 ms)
    const timestamps = (this.rateLimiter.get(id) || []).filter(t => now - t < 60000);
    if (timestamps.length >= 20) {
      throw new Error('Calma aí! Limite de 20 mensagens por minuto atingido. Aguarde um instante.');
    }
    timestamps.push(now);
    this.rateLimiter.set(id, timestamps);

    // 2. Anti-Flood / Spam idêntico consecutivo (3.5 segundos)
    const last = this.lastUserMsg.get(id);
    if (last && last.text.toLowerCase() === cleanText.toLowerCase() && now - last.time < 3500) {
      throw new Error('Evite enviar mensagens repetidas em sequência tão rápida.');
    }
    this.lastUserMsg.set(id, { text: cleanText, time: now });

    // 3. Validação do personagem selecionado
    const validChar = (characterId && VALID_CHARACTERS.has(characterId)) ? characterId : 'di5';

    // 4. Criação do objeto seguro de mensagem
    const message = {
      id: `msg_${now}_${Math.random().toString(36).slice(2, 8)}`,
      playerId: id,
      nickname: sanitizeNickname(nickname),
      characterId: validChar,
      text: cleanText,
      timestamp: now,
      type: 'user'
    };

    this.messages.push(message);
    if (this.messages.length > this.maxHistory) {
      this.messages.shift();
    }

    return message;
  }

  addSystemNotice(text) {
    const message = {
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      playerId: 'system',
      nickname: 'SISTEMA',
      characterId: 'di5',
      text: String(text).slice(0, 300),
      timestamp: Date.now(),
      type: 'system'
    };

    this.messages.push(message);
    if (this.messages.length > this.maxHistory) {
      this.messages.shift();
    }
    return message;
  }

  handlePlayerJoin(playerId, nickname) {
    if (!playerId || playerId.startsWith('local_')) return null;
    const now = Date.now();
    const lastJoin = this.joinAnnouncements.get(playerId) || 0;
    // Não envia anúncio se reconectar em menos de 10 minutos
    if (now - lastJoin < 10 * 60 * 1000) {
      return null;
    }
    this.joinAnnouncements.set(playerId, now);
    const cleanNick = sanitizeNickname(nickname);
    return this.addSystemNotice(`👋 ${cleanNick} entrou na tropa!`);
  }
}

const chatManager = new ChatManager(50);

// Configuração do WebSocket Server
wss.on('connection', async (ws, req) => {
  const session = onlineTracker.addConnection(ws, req);

  ws.on('pong', () => {
    onlineTracker.handlePong(session.connectionId);
  });

  ws.on('message', async (dataRaw) => {
    try {
      const msg = JSON.parse(dataRaw);
      if (msg.type === 'IDENTIFY' && msg.data && msg.data.playerId) {
        onlineTracker.identifyPlayer(session.connectionId, msg.data.playerId);
        broadcastOnlineCount();
        if (msg.data.nickname) {
          const joinNotice = chatManager.handlePlayerJoin(msg.data.playerId, msg.data.nickname);
          if (joinNotice) {
            broadcastMessage('CHAT_MESSAGE', joinNotice);
          }
        }
      } else if (msg.type === 'PING') {
        onlineTracker.handlePong(session.connectionId);
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      } else if (msg.type === 'CHAT_SEND' && msg.data) {
        try {
          const newMsg = chatManager.addMessage({
            playerId: session.playerId || msg.data.playerId,
            nickname: msg.data.nickname,
            characterId: msg.data.characterId,
            text: msg.data.text
          });
          broadcastMessage('CHAT_MESSAGE', newMsg);
        } catch (chatErr) {
          ws.send(JSON.stringify({
            type: 'CHAT_ERROR',
            error: chatErr.message
          }));
        }
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    onlineTracker.removeConnection(session.connectionId);
    broadcastOnlineCount();
  });

  ws.on('error', (err) => {
    console.error(`[WS] Erro na conexão ${session.connectionId}:`, err.message);
    onlineTracker.removeConnection(session.connectionId);
    broadcastOnlineCount();
  });

  // Envia estado inicial completo ao cliente com contrato padronizado
  try {
    const [lead, topByChar] = await Promise.all([
      db.getLeaderboard(25),
      db.getTopByCharacter()
    ]);

    ws.send(JSON.stringify({
      type: 'INIT',
      data: {
        connectionId: session.connectionId,
        onlineCount: onlineTracker.getUniqueOnlineCount(),
        totalConnections: onlineTracker.getTotalConnectionsCount(),
        leaderboard: lead,
        topGlobal: lead,
        topByCharacter: topByChar,
        chatHistory: chatManager.getHistory()
      }
    }));
  } catch (err) {
    console.error('[WS] Erro ao enviar INIT:', err.message);
  }

  broadcastOnlineCount();
});

// Heartbeat a cada 15 segundos para eliminar conexões fantasmas
const heartbeatTimer = setInterval(() => {
  onlineTracker.heartbeatTick();
  broadcastOnlineCount();
}, 15000);

wss.on('close', () => {
  clearInterval(heartbeatTimer);
});

// ----------------------------------------------------------------------------
// MIDDLEWARES EXPRESS & PARSERS
// ----------------------------------------------------------------------------
app.use(express.json({ limit: '128kb' }));

// Headers de CORS e Segurança para conexões remotas
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Sessões de partida ativas para anti-cheat
const activeGameSessions = new Map();

function sanitizeNickname(raw) {
  if (!raw || typeof raw !== 'string') return 'Corredor';
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9\u00C0-\u00FF _-]/g, '').slice(0, 14);
  return cleaned.length >= 2 ? cleaned : 'Corredor';
}

// ----------------------------------------------------------------------------
// ROTAS REST API
// ----------------------------------------------------------------------------

// 1. Status do Servidor
app.get('/api/status', async (req, res) => {
  try {
    const totalRecords = await db.getTotalRecordsCount();
    const onlineCount = onlineTracker.getUniqueOnlineCount();
    const activeConns = onlineTracker.getTotalConnectionsCount();
    res.json({
      status: 'ok',
      online: true,
      serverTime: Date.now(),
      onlinePlayers: onlineCount,
      onlineCount: onlineCount,
      activeConnections: activeConns,
      totalRecords,
      storage: db.isPostgres ? 'postgresql' : 'json_atomic'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', online: false, error: err.message });
  }
});

// 2. Contador de Jogadores Online (Conforme Requisito 3)
app.get('/api/players/online', (req, res) => {
  const count = onlineTracker.getUniqueOnlineCount();
  const conns = onlineTracker.getTotalConnectionsCount();
  res.json({
    success: true,
    onlinePlayers: count,
    onlineCount: count,
    activeConnections: conns,
    criterion: 'unique_active_players',
    timestamp: Date.now()
  });
});

// 3. Consulta Pública do Ranking Global e por Personagem
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 25));
    const [lead, topByChar, total] = await Promise.all([
      db.getLeaderboard(limit),
      db.getTopByCharacter(),
      db.getTotalRecordsCount()
    ]);

    res.json({
      success: true,
      leaderboard: lead,
      topGlobal: lead,
      topByCharacter: topByChar,
      totalEntries: total,
      onlinePlayers: onlineTracker.getUniqueOnlineCount(),
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('[API] Erro em /api/leaderboard:', err.message);
    res.status(500).json({ success: false, error: 'Falha ao buscar ranking' });
  }
});

// 4. Registro / Autenticação Persistente do Jogador
app.post('/api/player/register', async (req, res) => {
  const { playerId, playerSecret, nickname, favoriteChar } = req.body || {};
  let finalPlayerId = playerId;
  let finalSecret = playerSecret;
  let cleanNick = sanitizeNickname(nickname);

  try {
    if (finalPlayerId && !finalPlayerId.startsWith('local_')) {
      const existing = await db.getPlayer(finalPlayerId);
      if (existing) {
        if (existing.secret !== finalSecret) {
          return res.status(403).json({ error: 'Credenciais inválidas para este jogador.' });
        }
        if (cleanNick && cleanNick !== existing.nickname) {
          existing.nickname = cleanNick;
        }
        if (favoriteChar) {
          existing.favoriteChar = favoriteChar;
        }
        existing.lastLogin = Date.now();
        await db.savePlayer(existing);

        const currentLead = await db.getLeaderboard(100);
        const playerRank = currentLead.findIndex(entry => entry.playerId === finalPlayerId);

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
    }

    // Cria novo jogador
    finalPlayerId = crypto.randomUUID();
    finalSecret = crypto.randomBytes(24).toString('hex');
    const now = Date.now();

    const newPlayer = {
      id: finalPlayerId,
      secret: finalSecret,
      nickname: cleanNick || `Corredor_${finalPlayerId.slice(0, 4)}`,
      favoriteChar: favoriteChar || 'di5',
      createdAt: now,
      lastLogin: now,
      bestScore: 0,
      matchesPlayed: 0
    };

    await db.savePlayer(newPlayer);

    res.json({
      success: true,
      player: {
        playerId: finalPlayerId,
        playerSecret: finalSecret,
        nickname: newPlayer.nickname,
        bestScore: 0,
        matchesPlayed: 0,
        globalRank: null
      }
    });
  } catch (err) {
    console.error('[API] Erro ao registrar jogador:', err.message);
    res.status(500).json({ error: 'Erro interno ao registrar perfil.' });
  }
});

// 5. Início de Sessão de Partida (Anti-Cheat & Validação)
app.post('/api/session/start', async (req, res) => {
  const { playerId, playerSecret, characterId } = req.body || {};
  if (!playerId) {
    return res.status(400).json({ error: 'PlayerId não informado.' });
  }

  const player = await db.getPlayer(playerId);
  if (!player || player.secret !== playerSecret) {
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

  // Limpa sessões expiradas (> 2 horas)
  if (activeGameSessions.size > 1000) {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    for (const [id, s] of activeGameSessions) {
      if (s.startTime < twoHoursAgo) activeGameSessions.delete(id);
    }
  }

  res.json({ success: true, sessionId, startTime: sessionData.startTime });
});

// 6. Finalização / Envio de Pontuação (Suporta /api/session/finish e /api/leaderboard/submit)
async function handleScoreSubmission(req, res) {
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

  const player = await db.getPlayer(playerId);
  if (!player || player.secret !== playerSecret) {
    return res.status(401).json({ error: 'Autenticação de jogador inválida.' });
  }

  const finalScore = Math.floor(Number(score));
  if (isNaN(finalScore) || finalScore < 0) {
    return res.status(400).json({ error: 'Pontuação malformada.' });
  }

  // Se enviou sessionId, valida anti-cheat da sessão
  if (sessionId) {
    const session = activeGameSessions.get(sessionId);
    if (!session || session.playerId !== playerId) {
      return res.status(400).json({ error: 'Sessão de jogo inválida ou expirada.' });
    }
    const durationSeconds = Math.max(0.1, (Date.now() - session.startTime) / 1000);
    const MAX_THEORETICAL_PTS_PER_SEC = 35.0;
    const maxPossibleScore = Math.ceil(durationSeconds * MAX_THEORETICAL_PTS_PER_SEC) + 20;

    if (finalScore > maxPossibleScore && finalScore > 100) {
      console.warn(`[ANTI-CHEAT] Pontuação suspeita bloqueada! Player: ${player.nickname}, Score: ${finalScore}, Dur: ${durationSeconds.toFixed(1)}s`);
      activeGameSessions.delete(sessionId);
      return res.status(400).json({ error: 'Inconsistência de física e tempo detectada na partida.' });
    }
    activeGameSessions.delete(sessionId);
  }

  // Atualiza jogador
  player.matchesPlayed = (player.matchesPlayed || 0) + 1;
  const prevBest = player.bestScore || 0;
  const isNewPersonalBest = finalScore > prevBest;
  if (isNewPersonalBest) {
    player.bestScore = finalScore;
  }
  await db.savePlayer(player);

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('pt-BR');

  // Grava recorde no leaderboard
  const { rank: newRank, isNewGlobalLeader } = await db.recordScore({
    playerId,
    nickname: player.nickname,
    characterId: characterId || player.favoriteChar || 'di5',
    score: finalScore,
    maxLevel: maxLevel || 1,
    date: dateFormatted
  });

  const total = await db.getTotalRecordsCount();

  // Notifica todos os jogadores online conectados via WebSocket
  if (isNewPersonalBest || isNewGlobalLeader) {
    broadcastMessage('NEW_RECORD', {
      playerId,
      nickname: player.nickname,
      characterId: characterId || player.favoriteChar || 'di5',
      score: finalScore,
      rank: newRank,
      isNewGlobalLeader,
      date: dateFormatted
    });

    const [lead, topByChar] = await Promise.all([
      db.getLeaderboard(25),
      db.getTopByCharacter()
    ]);

    broadcastMessage('LEADERBOARD_UPDATE', {
      leaderboard: lead,
      topGlobal: lead,
      topByCharacter: topByChar
    });

    // Anúncio em tempo real no CHAT DA TROPA
    const noticeText = isNewGlobalLeader
      ? `👑 ${player.nickname} ASSUMIU O 1º LUGAR GLOBAL COM ${finalScore} PTS!`
      : `⚡ ${player.nickname} BATEU NOVO RECORDE PESSOAL: ${finalScore} PTS!`;
    const sysMsg = chatManager.addSystemNotice(noticeText);
    broadcastMessage('CHAT_MESSAGE', sysMsg);
  }

  res.json({
    success: true,
    saved: true,
    score: finalScore,
    isNewPersonalBest,
    isNewGlobalLeader,
    globalRank: newRank,
    totalRecords: total
  });
}

app.post('/api/session/finish', handleScoreSubmission);
app.post('/api/leaderboard/submit', handleScoreSubmission);

// ----------------------------------------------------------------------------
// ROTAS DE CHAT REST (Fallback para clientes)
// ----------------------------------------------------------------------------
app.get('/api/chat/history', (req, res) => {
  res.json({
    success: true,
    history: chatManager.getHistory(),
    timestamp: Date.now()
  });
});

app.post('/api/chat/send', (req, res) => {
  const { playerId, nickname, characterId, text } = req.body || {};
  try {
    const newMsg = chatManager.addMessage({
      playerId,
      nickname,
      characterId,
      text
    });
    broadcastMessage('CHAT_MESSAGE', newMsg);
    res.json({ success: true, message: newMsg });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// SERVIR ARQUIVOS ESTÁTICOS
// ----------------------------------------------------------------------------
app.use(express.static(path.join(__dirname)));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicialização segura com migração
async function startServer() {
  await db.init();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🎮 A GRANDE FAMÍLIA GAME — SERVIDOR ONLINE & RANKING 🎮`);
    console.log(`Porta: ${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'production'}`);
    console.log(`Armazenamento: ${db.isPostgres ? 'PostgreSQL' : 'JSON Atômico (data/)'}`);
    console.log(`WebSocket: /ws`);
    console.log(`====================================================`);
  });
}

startServer().catch(err => {
  console.error('[FATAL] Erro ao iniciar servidor:', err);
  process.exit(1);
});
