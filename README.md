# 🏃 AMIGOS RUN V0.3 — ANIMAÇÕES, PARTÍCULAS, BALANCEAMENTO E UX

Jogo de corrida retrô em **Pixel Art**, inspirado no clássico dinossauro do Google, com elenco dos amigos, **máquina de estados de animação**, sistema de partículas dedicado, tabela de habilidades balanceada, novos obstáculos urbanos e **sistema de pausa real**.

---

## 🚀 Novidades da Versão V0.3

### 1. 🎭 Máquina de Estados de Animação do Personagem
- **IDLE**: Parado na tela inicial/seleção com respiração pixelada.
- **RUN**: Ciclo de corrida de 6 frames com alternância de pernas, braços e leve oscilação vertical do tronco.
- **JUMP**: Compressão na saída (squash), subida com pernas esticadas e tronco inclinado.
- **FALL**: Postura de descida com pernas flexionadas.
- **LAND**: Impacto no chão com compressão física temporária e emissão proporcional de nuvem de poeira.
- **SKILL_START / ACTIVE / END**: Antecipação rápida (ex: Di5 tragando o cigarro), execução e recuperação suave.
- **HIT**: Flash e tremor de tela ao ter o escudo quebrado ou sofrer impacto.
- **TRANSFORM**: Transformação de Vitor (Mario/Sonic), Nalu (Loira Suprema), Joao (Kart) e Julya (Moto).
- **DEATH**: Animação de derrota com olhos em "X" e poeira de tombo.

---

### 2. 💩 Correção Importante: O Cocô Voador do Junior
- O projétil do Junior é um **cocô cartunesco em pixel art** (formato swirl marrom retrô com olhinhos cômicos).
- Trajetória curva em arco parabólico com rotação e trilha de partículas marrons.
- Ao atingir qualquer obstáculo, explode em um **splat cartunesco** de fragmentos pixelados acompanhado de um som oco característico de splat!

---

### 3. 🍄⚡ Vitor — Duas Variantes Selecionáveis
- **Modo Sonic (🦔 Super Giro)**: Vitor vira uma esfera sônica azul neon girando em supervelocidade com rastro luminoso e invulnerabilidade temporária.
- **Modo Mario (🍄 Super Salto)**: Transforma Vitor com macacão clássico e concede um **salto reforçado gigante** (alcança até o topo da tela) para ultrapassar qualquer combinação de obstáculos!
- Alternância rápida com um clique nos botões **[Modo Sonic] / [Modo Mario]** no menu do personagem.

---

### 4. ✨ ParticleManager Centralizado
- Gerenciador reutilizável de partículas com delta time e limite inteligente de objetos (sem lag em celulares).
- Poeira de corrida nos pés emitida em intervalos controlados.
- Faíscas de corte da espada do Douglas.
- Partículas douradas da aura de Nalu.
- Fumaça e fogo dos escapamentos da moto e do kart.
- Brasa e fumaça viva do cigarro do Di5.
- Rastro espectral do fantasma do Vasco.
- Respingos de água cristalina da onda Rioqualit.
- Fragmentos de destruição de cada obstáculo.

---

### 5. 🛑 Sistema de Pausa Real e Menu de Saída (UX)
- Botão **[ ⏸️ Menu ]** no cabeçalho e tecla **`ESC`** no teclado.
- Congela instantaneamente física, delta time, obstáculos, partículas e recargas de habilidades.
- Opções disponíveis na pausa:
  - **Continuar Corrida** (retoma sem pulo de física).
  - **Recomeçar** (reinicia a corrida com o amigo atual sem duplicar o loop de animação).
  - **Sair para o Menu** (encerra a partida com confirmação se houver pontuação em andamento e limpa todos os timers).

---

### 6. 🚧 Novos Obstáculos Urbanos Retrô
- **Trombadinha / Bandido**: Com máscara preta nos olhos e camisa listrada P&B.
- **Bandido em Fuga (Novo Inimigo Dinâmico)**: Corre ativamente na pista em direção ao jogador segurando saco de dinheiro com cifrão `$`!
- **Viatura Policial em Perseguição (Novo Inimigo Dinâmico)**: Viatura patrulhando em alta velocidade com sirene sonora de alerta, giroflex duplo pulsando em azul/vermelho neon e faróis iluminando o asfalto.
- **Barricada de Trânsito**: Barreira de obra com faixas reflexivas laranja e branca.
- **Cone de Trânsito**: Cone retrô com base de borracha escura.
- **Buraco no Asfalto**: Com cavalete amarelo de exclamação (!).
- **Carro Abandonado**: Sucata enferrujada retrô com vidros trincados e pneu arriado.
- **Coco Gigante**: Meme de praia rolando com textura e 3 olhinhos.
- **Chuva de Boletos**: Boletos atrasados voando.
- **Pombo Urbano**: Pombo de óculos escuros (aéreo, desvie agachando!).

---

## ⚡ Sistema Interno de Níveis de Dificuldade

O jogo possui agora um sistema progressivo e equilibrado de 5 níveis de dificuldade:

1. **NÍVEL 1 — FÁCIL (0 a 199 PTS)**: Velocidade suave (5.2 - 5.8). Obstáculos terrestres simples para aquecimento (Cones, Boletos, Barricadas e Buracos com cavalete).
2. **NÍVEL 2 — MÉDIO (200 a 499 PTS)**: Velocidade 6.2 - 6.8. Entram os **Bandidos correndo** na pista e os **Pombos aéreos** (exigem agachar ou saltos rasantes).
3. **NÍVEL 3 — DIFÍCIL (500 a 899 PTS)**: Velocidade 7.2 - 7.8. Entra a **Viatura da Polícia patrulhando em alta velocidade** com sirene e iluminação dinâmica.
4. **NÍVEL 4 — MUITO DIFÍCIL / INSANO (900 a 1399 PTS)**: Velocidade 8.2 - 8.9. Combinações rápidas de tráfego, múltiplos bandidos em disparada e pombos.
5. **NÍVEL 5 — MESTRE EXTREMO (1400+ PTS)**: Velocidade 9.2 - 10.4+. Teste de reflexos puro arcade com feedback visual vibrante!

*Ao subir de nível, o jogo emite uma fanfarra épica sintetizada de Level Up, partículas comemorativas e um banner animado no canvas!*

---

## 🏆 Competição Entre Amigos & Estatísticas

- **Recordes por Personagem**: Cada amigo da turma tem seu próprio melhor recorde salvo no dispositivo.
- **Estatísticas Detalhadas**: Partidas jogadas, obstáculos superados e habilidades usadas registradas por amigo.
- **Tela de Resultado no Fim da Corrida**:
  - Destaque especial para **👑 NOVO RECORDE DA TURMA!** ou **⭐ NOVO RECORDE PESSOAL COM [AMIGO]!**
  - Relatório completo da corrida: Pontuação, Nível final alcançado, Obstáculos superados/destruídos e Vezes em que usou a skill.
  - Duelo direto com o atual líder: compara sua pontuação com o 1º colocado do ranking.
  - Botão **[👥 PASSAR A VEZ]** para revezar o celular na roda de amigos com um toque.
- **Abas no Painel de Recordes**: Alternância entre **🏆 TOP GERAL** e **📊 RECORDES POR AMIGO** (com coroa dourada para o "Rei da Pista").

---

## 📱 Experiência Mobile & Tela Cheia

- **Botões Grandes e Ergonômicos**: `AGACHAR`, `PULAR` e `USAR SKILL` posicionados 100% **abaixo** do canvas cabinet, garantindo visão desobstruída de toda a pista.
- **Feedback Tátil**: Vibração sutil (`navigator.vibrate`) ao tocar nos botões de pulo e skill em aparelhos celulares.
- **Toque Direto no Canvas**: Tap na metade superior pula, tap/swipe na metade inferior agacha.
- **Suporte a Tela Cheia (Fullscreen)**: Botão **[ ⛶ TELA CHEIA ]** no cabeçalho com redimensionamento automático e nitidez de pixels.

---

## 📊 Tabela Centralizada de Balanceamento (`ABILITY_CONFIG`)

| Personagem | Habilidade | Tipo | Efeito | Recarga |
| :--- | :--- | :--- | :--- | :--- |
| **Di5** | **Fumaça Blindada** | Defesa / Escudo | Traga o cigarro e cria escudo roxo-azulado que absorve integralmente 1 impacto de obstáculo! | 7.0s (prep 0.4s) |
| **Wendel** | **Chuteira Míssil** | Ataque | Dispara bola de futebol veloz (15 px/f) que destrói o obstáculo. | 4.0s |
| **Muniz** | **Espírito do Vasco** | Especial | Voz sintetizada "VASCOOOO!" com reverberação e fantasma alvinegro que limpa a pista. | 6.5s (dura 1.5s) |
| **Joao** | **Carrinho Turbo** | Mobilidade | Kart turbo (+3.5 vel) com motor contínuo e invulnerabilidade total. | 7.0s (dura 2.8s) |
| **Douglas** | **Espada** | Combate | Golpe "SHING!" metálico cortante que fatia obstáculos até 180px. | 3.8s (ataque 0.35s) |
| **Nalu** | **Modo Loira Suprema** | Magia / Buff | Brilho mágico ascendente com sininhos e **pontos x1.5 (+50%)**! | 7.0s (dura 3.8s) |
| **Beatriz** | **Rioqualit** | Água / Especial | Onda d'água azul com som aquático que varre o perigo da pista. | 6.5s (dura 1.5s) |
| **Vitor (Sonic)** | **Modo Sonic** | Arcade | Supervelocidade (+4.0 vel) com rastro neon e som laser hipersônico. | 7.5s (dura 3.2s) |
| **Vitor (Mario)** | **Modo Mario** | Arcade | Salto reforçado gigante com arpejo de power-up retrô 8-bit. | 7.5s (dura 3.2s) |
| **Julya** | **Motinha da Julya** | Mobilidade | Moto scooter rosa veloz (+3.0 vel) com ronco de motor contínuo e imunidade. | 7.0s (dura 2.8s) |
| **Junior** | **Cocô Voador** | Meme / Ataque | Arremesso de cocô com som de peido e splat cartunesco no impacto! | 4.0s |
| **Clarinha** | **Passinho Especial** | Ritmo / Distração | Manda uma dança ritmada que hipnotiza os inimigos e desintegra obstáculos próximos ao som de um funk 8-bit contagiante! | 12.0s (dura 3.0s) |

---

## 🕹️ Controles Atualizados

### No Computador (Teclado)
- **`ESC`**: Pausar / Abrir Menu da Partida.
- **`X`** (ou `E`): Ativar Habilidade Especial.
- **`Espaço`**, **`↑`** ou **`W`**: Pular.
- **`↓`** ou **`S`**: Agachar / Deslizar (evita pombos aéreos e executa fast-fall no ar).

### No Celular / Tablet
- **Botão `⛶ TELA CHEIA`**: Ativa modo tela cheia imersivo.
- **Botão `⚡ USAR SKILL`**: Ativação grande com contador de recarga numérico.
- **Botões `PULAR` e `AGACHAR`**: Controles virtuais ergonômicos abaixo da pista.
- **Toque no Canvas**: Toque na parte de cima pula, parte de baixo agacha.

---

## 🌐 INFRAESTRUTURA ONLINE: SERVIDOR COMPARTILHADO + PARTIDAS INDIVIDUAIS + RANKING EM TEMPO REAL

O AMIGOS RUN agora conta com um backend completo com persistência atômica, WebSockets em tempo real e sistema anti-cheat!

### 1. Partidas 100% Individuais
- Cada jogador joga sua própria corrida de forma autônoma.
- Pausas, mortes e habilidades de um jogador **nunca** interferem nos demais.
- Física, obstáculos e progressão de velocidade rodam de forma fluida no cliente.

### 2. Identidade Persistente do Jogador
- Todo jogador recebe um identificador seguro (`playerId` + `playerSecret` criptográfico) salvo no navegador.
- O jogador pode personalizar seu **Apelido Público** a qualquer momento clicando no botão do cabeçalho ou no painel de ranking.
- O apelido é validado e sincronizado no servidor central via `POST /api/player/register`.

### 3. Ranking Global em Tempo Real (WebSockets `/ws`)
- **Aba 🌍 GLOBAL ONLINE**: Mostra os maiores recordes mundiais atualizados em tempo real para todos os jogadores.
- **Aba 🏆 TOP LOCAL**: Mantém os recordes salvos no dispositivo.
- **Aba 📊 POR AMIGO**: Estatísticas detalhadas por personagem.
- **Notificação Flutuante no Topo**: Quando qualquer pessoa no mundo bate um novo recorde, todos os jogadores conectados recebem um banner retrô animado anunciando a conquista!
- **Contador Online Real**: Exibe a quantidade exata de corredores online conectados simultaneamente.

### 4. Segurança & Proteção Anti-Cheat
- As partidas utilizam ciclo de vida de sessão:
  - `POST /api/session/start`: O servidor registra o timestamp de início da corrida.
  - `POST /api/session/finish`: O servidor valida a coerência física entre a duração real da corrida e a pontuação informada (taxa máxima teórica ~35 pts/s). Tentativas de submissão instantânea de pontos impossíveis são rejeitadas com erro HTTP 400.

---

## 🚀 Como Executar Localmente

```bash
# 1. Instalar as dependências
npm install

# 2. Iniciar o servidor
npm start
# ou
node server.js

# 3. Abrir no navegador
# Acesse http://localhost:3000
```

Para testar com múltiplos jogadores em tempo real:
Abra `http://localhost:3000` em dois navegadores diferentes (ou em uma janela anônima). Altere o apelido em cada um e jogue uma partida. Quando um jogador fizer pontuação, o ranking no outro navegador atualizará automaticamente em tempo real sem precisar recarregar a página!

---

## ☁️ Publicação no Render

O projeto está configurado no arquivo `render.yaml` como um serviço Web Node.js nativo compatível com o plano gratuito do Render:
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **WebSockets**: Habilitados nativamente na rota `/ws`

