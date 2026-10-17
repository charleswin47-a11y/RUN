const http = require('http');
const WebSocket = require('ws');

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🧪 Iniciando Bateria de Testes Automatizados...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Status API
    const statusRes = await request('/api/status');
    assert(statusRes.status === 200 && statusRes.body.status === 'ok', 'GET /api/status retorna status ok');

    // 2. Online Players API
    const initialOnlineRes = await request('/api/players/online');
    assert(initialOnlineRes.status === 200 && initialOnlineRes.body.onlineCount === 0, 'GET /api/players/online retorna contador zerado inicialmente');

    // 3. Leaderboard API
    const leaderboardRes = await request('/api/leaderboard');
    assert(leaderboardRes.status === 200 && Array.isArray(leaderboardRes.body.leaderboard), 'GET /api/leaderboard retorna array de recordes');

    // 4. Registro de Jogadores
    const regRes1 = await request('/api/player/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { nickname: 'Jogador Alfa' });
    assert(regRes1.status === 200 && regRes1.body.player && regRes1.body.player.playerId, 'POST /api/player/register cria Jogador 1 com ID e Secret');
    const player1 = regRes1.body.player;

    const regRes2 = await request('/api/player/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { nickname: 'Jogador Beta' });
    assert(regRes2.status === 200 && regRes2.body.player && regRes2.body.player.playerId, 'POST /api/player/register cria Jogador 2');
    const player2 = regRes2.body.player;

    // 5. Conexão WebSocket Cliente 1
    const wsMessages1 = [];
    const ws1 = new WebSocket(`${WS_URL}?playerId=${player1.playerId}&connectionId=conn_1`);
    ws1.on('message', data => {
      try { wsMessages1.push(JSON.parse(data.toString())); } catch (e) {}
    });

    await wait(400);
    const countAfterClient1 = await request('/api/players/online');
    assert(countAfterClient1.body.onlineCount === 1, 'Contador sobe para 1 após conexão do Cliente 1');

    // 6. Conexão WebSocket Cliente 2
    const wsMessages2 = [];
    const ws2 = new WebSocket(`${WS_URL}?playerId=${player2.playerId}&connectionId=conn_2`);
    ws2.on('message', data => {
      try { wsMessages2.push(JSON.parse(data.toString())); } catch (e) {}
    });

    await wait(400);
    const countAfterClient2 = await request('/api/players/online');
    assert(countAfterClient2.body.onlineCount === 2, 'Contador sobe para 2 com Cliente 2 conectado');

    // 7. Deduplicação: Cliente 2 abre 2ª aba
    const ws2Tab2 = new WebSocket(`${WS_URL}?playerId=${player2.playerId}&connectionId=conn_2_tab2`);
    await wait(400);
    const countDeduplicated = await request('/api/players/online');
    assert(countDeduplicated.body.onlineCount === 2, 'Deduplicação de sessões ativas: 2ª aba do mesmo jogador mantém contagem em 2');

    // 8. Início de Sessão de Partida e Gravação de Recorde
    const startRes = await request('/api/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      playerId: player1.playerId,
      playerSecret: player1.playerSecret,
      characterId: 'di5'
    });
    assert(startRes.status === 200 && startRes.body.sessionId, 'POST /api/session/start inicia sessão de jogo autorizada');
    const sessionId = startRes.body.sessionId;

    // Aguarda 1.1s para tempo de jogo válido (max pts: 1.1 * 35 + 20 = 58.5)
    await wait(1100);

    const finishRes = await request('/api/session/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      playerId: player1.playerId,
      playerSecret: player1.playerSecret,
      sessionId: sessionId,
      score: 45,
      meters: 120,
      coins: 5,
      maxLevel: 1,
      characterId: 'di5',
      nickname: 'Jogador Alfa'
    });
    assert(finishRes.status === 200 && finishRes.body.saved === true, 'POST /api/session/finish valida e salva recorde com sucesso');

    await wait(500);

    // 9. Verificar Broadcast em tempo real para os dois clientes
    const p1ReceivedNewRecord = wsMessages1.some(m => m.type === 'NEW_RECORD' && m.data && m.data.score === 45);
    const p2ReceivedNewRecord = wsMessages2.some(m => m.type === 'NEW_RECORD' && m.data && m.data.score === 45);
    assert(p1ReceivedNewRecord && p2ReceivedNewRecord, 'Ambos os clientes WebSocket receberam evento NEW_RECORD em tempo real');

    // 10. Envio e Broadcast de Mensagem de Chat Real-Time (Jogador 1 -> Jogador 2)
    ws1.send(JSON.stringify({
      type: 'CHAT_SEND',
      data: {
        playerId: player1.playerId,
        nickname: 'Jogador Alfa',
        characterId: 'di5',
        text: 'Bora tropa! Consegui 45 pts!'
      }
    }));
    await wait(400);

    const p1ChatReceived = wsMessages1.some(m => m.type === 'CHAT_MESSAGE' && m.data && m.data.text === 'Bora tropa! Consegui 45 pts!');
    const p2ChatReceived = wsMessages2.some(m => m.type === 'CHAT_MESSAGE' && m.data && m.data.text === 'Bora tropa! Consegui 45 pts!');
    assert(p1ChatReceived && p2ChatReceived, 'Chat em Tempo Real: mensagem transmitida e recebida por ambos os jogadores');

    // 11. Validação de Segurança: Mensagem acima de 250 caracteres é rejeitada com CHAT_ERROR
    const hugeText = 'A'.repeat(260);
    ws2.send(JSON.stringify({
      type: 'CHAT_SEND',
      data: {
        playerId: player2.playerId,
        nickname: 'Jogador Beta',
        characterId: 'wendel',
        text: hugeText
      }
    }));
    await wait(300);

    const p2GotCharLimitError = wsMessages2.some(m => m.type === 'CHAT_ERROR' && m.error && m.error.includes('250'));
    assert(p2GotCharLimitError, 'Segurança do Chat: mensagem acima de 250 caracteres rejeitada com CHAT_ERROR sem derrubar conexão');

    // 12. Validação de Segurança: Mensagem vazia rejeitada
    ws2.send(JSON.stringify({
      type: 'CHAT_SEND',
      data: {
        playerId: player2.playerId,
        nickname: 'Jogador Beta',
        characterId: 'wendel',
        text: '   '
      }
    }));
    await wait(300);

    const p2GotEmptyError = wsMessages2.some(m => m.type === 'CHAT_ERROR' && m.error && m.error.includes('espaços'));
    assert(p2GotEmptyError, 'Segurança do Chat: mensagem de espaços em branco rejeitada');

    // 13. Teste de Histórico em nova conexão (Jogador 3 conecta e recebe o histórico com as mensagens anteriores)
    const wsMessages3 = [];
    const ws3 = new WebSocket(`${WS_URL}?playerId=p3_test&connectionId=conn_3_test`);
    ws3.on('message', data => {
      try { wsMessages3.push(JSON.parse(data.toString())); } catch (e) {}
    });
    await wait(400);

    const initMsg = wsMessages3.find(m => m.type === 'INIT');
    const historyContainsMsg = initMsg && initMsg.data && Array.isArray(initMsg.data.chatHistory) &&
      initMsg.data.chatHistory.some(m => m.text === 'Bora tropa! Consegui 45 pts!');
    assert(historyContainsMsg, 'Histórico do Chat: novo cliente recebe as últimas mensagens no evento INIT');
    ws3.close();

    // 14. Desconexão de Cliente 2 e Atualização do Contador
    ws2Tab2.close();
    ws2.close();
    await wait(500);

    const countAfterDisconnect = await request('/api/players/online');
    assert(countAfterDisconnect.body.onlineCount === 1, 'Desconexão do Cliente 2 reduz contador corretamente para 1');

    // 15. Limpeza final
    ws1.close();
    await wait(300);

    const finalCount = await request('/api/players/online');
    assert(finalCount.body.onlineCount === 0, 'Desconexão total zera contador de conexões ativas');

    console.log(`\n========================================`);
    console.log(`Resultado dos Testes: ${passed} PASSOU | ${failed} FALHOU`);
    console.log(`========================================\n`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Erro durante execução dos testes:', err);
    process.exit(1);
  }
}

runTests();
