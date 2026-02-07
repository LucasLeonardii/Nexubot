// ─────────────────────────────────────────────────────────────────────────────
// index.js – Allowlist + /mensagem + /connect + Verificação + Tickets
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  // extras para Tickets e Modals
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { createTranscript } from 'discord-html-transcripts';

/**
 * Cliente principal do Discord.
 * - Intents: Guilds, Mensagens, Conteúdo de Mensagens e Members (pra autorole/roles).
 * - Partials: Channel (pra conseguir ler canal mesmo parcial).
 */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});


// ▸ ENV (todas as variáveis usadas no runtime)
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const CONNECT_URL = process.env.CONNECT_URL || 'https://cfx.re/join/SEU_CODIGO';
const RULES_URL = process.env.RULES_URL || 'https://seusite.com/regras';
const TIME_PER_Q = Number(process.env.TIME_PER_Q ?? 180);
const THREAD_ARCHIVE_MIN = Number(process.env.THREAD_ARCHIVE_MIN ?? 60);
const APPROVED_CHANNEL_ID = process.env.APPROVED_CHANNEL_ID || null;
const REJECTED_CHANNEL_ID = process.env.REJECTED_CHANNEL_ID || null;
const DELETE_THREAD_ON_FINISH = (process.env.DELETE_THREAD_ON_FINISH ?? 'true').toLowerCase() === 'true';
const CFX_JOIN_CODE = (process.env.CFX_JOIN_CODE || '').trim(); // ex.: ep67ba
const CONNECT_REFRESH_SEC = Number(process.env.CONNECT_REFRESH_SEC ?? 60);
const AUTO_ROLE_ID = process.env.AUTO_ROLE_ID || null;
const AUTO_ROLE_WELCOME_CHANNEL_ID = process.env.AUTO_ROLE_WELCOME_CHANNEL_ID || null;
const AUTO_ROLE_WELCOME_MESSAGE = process.env.AUTO_ROLE_WELCOME_MESSAGE || 'Bem-vindo(a), {user}!';
// Logs de ticket
const TICKET_LOG_CREATE_ENABLED = (process.env.TICKET_LOG_CREATE_ENABLED ?? 'false').toLowerCase() === 'true'; // default: não loga criação
const TICKET_LOG_CLOSE_ENABLED  = (process.env.TICKET_LOG_CLOSE_ENABLED  ?? 'true').toLowerCase()  === 'true'; // default: loga fechamento

// Tickets ENV
const TICKET_PANEL_CHANNEL_ID   = process.env.TICKET_PANEL_CHANNEL_ID;
const CAT_SUPPORT_ID            = process.env.TICKET_CATEGORY_SUPPORT_ID;
const CAT_DONATIONS_ID          = process.env.TICKET_CATEGORY_DONATIONS_ID;
const CAT_REPORTS_ID            = process.env.TICKET_CATEGORY_REPORTS_ID;
const TICKET_STAFF_ROLE_ID      = process.env.TICKET_STAFF_ROLE_ID; // um único role ID
const TICKET_LOG_CHANNEL_ID     = process.env.TICKET_LOG_CHANNEL_ID;
const TICKET_BRAND_ICON         = process.env.TICKET_BRAND_ICON || null;
const TICKET_BANNER             = process.env.TICKET_BANNER || null;
const TICKET_DELETE_DELAY_MS    = Number(process.env.TICKET_DELETE_DELAY_MS ?? 300000); // 5 min

/**
 * Mapa com os tipos de ticket e a categoria em que serão criados.
 */
const TICKET_TYPES = {
  suporte:  { label: 'Suporte',  emoji: '🛟', categoryId: CAT_SUPPORT_ID },
  doacoes:  { label: 'Doações',  emoji: '👑', categoryId: CAT_DONATIONS_ID },
  denuncia: { label: 'Denúncia', emoji: '⚠️', categoryId: CAT_REPORTS_ID },
};

/**
 * Guarda os intervals ativos do painel de connect por mensagem.
 * Usado para atualizar status periodicamente sem duplicar timers.
 */
const connectIntervals = new Map(); // messageId -> intervalId

/**
 * Banco de perguntas da allowlist.
 * - Tipos: 'open' (resposta livre) e 'choice' (múltipla escolha).
 * - correctIndex: índice da opção correta nas perguntas de choice.
 */
const QUESTIONS = [
  // texto (mantidos)
  { type: 'open', title: 'Identificação', prompt: 'Qual o nome e sobrenome do seu personagem?' },
  { type: 'open', title: 'Experiência',   prompt: 'Qual o seu nome na vida real?' },
  { type: 'open', title: 'Idade',         prompt: 'Qual sua idade? (mínimo 18)' },

  // múltipla escolha (novas)
  {
    type: 'choice',
    title: 'Combat Logging',
    prompt: 'O que é Combat Logging?',
    options: [
      'Sair/desconectar do jogo durante/antes de uma ação para evitar consequências',
      'Trocar de roupa rapidamente para despistar',
      'Reportar uma ação no Discord',
      'Reiniciar o jogo após terminar uma ação'
    ],
    correctIndex: 0
  },
  {
    type: 'choice',
    title: 'PowerGaming',
    prompt: 'O que é PowerGaming?',
    options: [
      'Forçar ações impossíveis/irreais ou sem dar chance de resposta ao outro jogador',
      'Usar atalhos de teclado para emotes',
      'Jogar com HUD minimalista',
      'Fazer /me e /do corretamente'
    ],
    correctIndex: 0
  },
  {
    type: 'choice',
    title: 'MetaGaming',
    prompt: 'O que é MetaGaming?',
    options: [
      'Usar informações OOC (fora de personagem) no IC (dentro do personagem)',
      'Criar um personagem com histórico profundo',
      'Participar de eventos organizados',
      'Trocar de roupa em Safe-Zone'
    ],
    correctIndex: 0
  },
  {
    type: 'choice',
    title: 'Safe-Zone',
    prompt: 'O que é Safe-Zone?',
    options: [
      'Área onde é proibido iniciar conflitos e certas ações hostis',
      'Zona exclusiva para polícia',
      'Local para vender itens ilegais',
      'Região de caça livre'
    ],
    correctIndex: 0
  },
  {
    type: 'choice',
    title: 'RDM',
    prompt: 'O que é RDM?',
    options: [
      'Matar/atacar sem motivo, contexto ou roleplay prévio',
      'Matar após anunciar um assalto',
      'Morrer e voltar à ação depois de 30 minutos',
      'Forçar o outro a aceitar /do'
    ],
    correctIndex: 0
  },
  {
    type: 'choice',
    title: 'Forçar RP',
    prompt: 'O que é Forçar RP?',
    options: [
      'Obrigar outro jogador a seguir sua cena sem dar escolha ou tempo de resposta',
      'Combinar uma cena por mensagem antes de começar',
      'Usar /me para descrever ações',
      'Esperar staff decidir um conflito'
    ],
    correctIndex: 0
  },
  {
    type: 'choice',
    title: 'Anti RP',
    prompt: 'O que é anti RP?',
    options: [
      'Atitudes que quebram imersão/regras e não condizem com a realidade do RP',
      'Criar uma história de fundo para seu personagem',
      'Fazer comércio em mercado legal',
      'Pedir ajuda para aprender comandos'
    ],
    correctIndex: 0
  },
  {
    type: 'choice',
    title: 'Amor à Vida',
    prompt: 'O que significa “Amor à Vida”?',
    options: [
      'Priorizar a própria sobrevivência e evitar riscos desnecessários',
      'Arriscar tudo por itens valiosos',
      'Nunca fugir de confrontos',
      'Ignorar ameaças quando estiver armado'
    ],
    correctIndex: 0
  },
  {
    type: 'choice',
    title: 'DarkRP',
    prompt: 'O que é DarkRP?',
    options: [
      'Roleplay de temas pesados (ex.: sequestro, tortura) sob regras e consentimento',
      'Modo em que tudo é permitido sem regra',
      'RP apenas noturno',
      'RP focado em comércio de itens'
    ],
    correctIndex: 0
  },

  // sua múltipla escolha original
  {
    type: 'choice',
    title: 'Situação de RP',
    prompt: 'Em uma abordagem policial, o que você deve fazer?',
    options: [
      'Fugir imediatamente, sempre',
      'Cooperar dentro do personagem e do contexto',
      'Ignorar a abordagem por estar em call externa'
    ],
    correctIndex: 1
  }
];

/**
 * Armazena o progresso da allowlist por usuário.
 * Estrutura: Map<userId, { index, answers[], threadId, startedAt }>
 */
const sessions = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Ready: instala painéis automáticos (allowlist, connect, verificação, tickets)
// ─────────────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logado como ${client.user.tag}`);

  // Publica/atualiza os painéis automaticamente nos canais configurados
  installAllowlistMessage(process.env.ALLOWLIST_CHANNEL_ID);
  installConnectPanel(process.env.CONNECT_PANEL_CHANNEL_ID);
  installVerificationPanel(process.env.VERIFICATION_CHANNEL_ID);
  installTicketPanel(process.env.TICKET_PANEL_CHANNEL_ID);
});

// ─────────────────────────────────────────────────────────────────────────────
// Entrada de membros (autorole)
// ─────────────────────────────────────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async (member) => {
  // Só em guilds; aplica o cargo automático definido no .env
  if (!member?.guild) return;
  giveAutoRole(member);
});

// ─────────────────────────────────────────────────────────────────────────────
// Slash commands + botões (principal)
// ─────────────────────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  // /mensagem – envia texto simples no canal
  if (interaction.isChatInputCommand() && interaction.commandName === 'mensagem') {
    const texto = interaction.options.getString('texto', true);
    await interaction.reply({ content: 'Mensagem enviada!', flags: 64 });
    await interaction.channel.send({ content: texto });
    return;
  }

  // /connect – mostra botão para conectar (ou instrução)
  if (interaction.isChatInputCommand() && interaction.commandName === 'connect') {
    const embed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('Conectar ao Servidor')
      .setDescription('Use o botão abaixo para se conectar.');

    const isHttp = /^(https?:|discord:)/i.test(CONNECT_URL || '');
    const row = new ActionRowBuilder().addComponents(
      isHttp
        ? new ButtonBuilder().setLabel('Conectar agora').setStyle(ButtonStyle.Link).setURL(CONNECT_URL)
        : new ButtonBuilder().setCustomId('connect:show').setLabel('Mostrar link de conexão').setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    return;
  }

  // /ticketsetup – publica/atualiza o painel de tickets no canal configurado
  if (interaction.isChatInputCommand() && interaction.commandName === 'ticketsetup') {
    const chId = process.env.TICKET_PANEL_CHANNEL_ID;
    if (!chId) return interaction.reply({ content: 'Defina TICKET_PANEL_CHANNEL_ID no .env', flags: 64 });

    const ch = await interaction.client.channels.fetch(chId).catch(() => null);
    if (!ch || !ch.isTextBased()) return interaction.reply({ content: 'Canal inválido/inacessível.', flags: 64 });

    const embed = buildTicketPanelEmbed();
    const components = buildTicketPanelComponents();

    // Evita duplicar: edita a última do bot se já for o painel
    const last = (await ch.messages.fetch({ limit: 1 }).catch(() => null))?.first();
    const isPanel = last?.author?.id === interaction.client.user.id &&
                    last?.components?.[0]?.components?.[0]?.data?.custom_id === 'ticket:choose';

    if (isPanel) {
      await last.edit({ embeds: [embed], components }).catch(() => {});
    } else {
      await ch.send({ embeds: [embed], components }).catch(() => {});
    }

    return interaction.reply({ content: '✅ Painel de tickets publicado/atualizado!', flags: 64 });
  }

  // Botão auxiliar /connect – mostra instruções de conexão
  if (interaction.isButton() && interaction.customId === 'connect:show') {
    const help = [
      '**Link de conexão:**',
      '```',
      CONNECT_URL || 'NÃO CONFIGURADO — defina CONNECT_URL no .env',
      '```',
      'Cole no **F8** do RedM:',
      '```',
      'connect novopantanal.com.br',
      '```',
      'Ou use **Win+R** no Windows:',
      '```',
      'redm://connect/novopantanal.com.br',
      '```'
    ].join('\n');
    await interaction.reply({ content: help, flags: 64 });
    return;
  }

  // /allowlistsetup – publica o painel de início da allowlist
  if (interaction.isChatInputCommand() && interaction.commandName === 'allowlistsetup') {
    const embed = new EmbedBuilder()
      .setColor(0x0C9D57)
      .setTitle('Allowlist Novo Pantanal! ✅')
      .setDescription('Para fazer sua allowlist, basta clicar no botão abaixo!\nLembre-se de ler as regras da cidade antes de iniciar o processo.')
      .setThumbnail('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyaDE1Y2duY2psZWZnbGIwcmlxYThsZGMxbmJxeXk4eHUzNDJmY2Z2byZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Oo8Ly1JXZjrqm54qK4/giphy-downsized.gif')
      .setFooter({
        text: 'Equipe Novo Pantanal',
        iconURL: 'https://media.discordapp.net/attachments/571532052973748229/1434916448328876103/60bc922b-3a06-44b7-8d47-25f385ed847a.png'
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('wl:start').setLabel('Fazer a Allowlist!').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(RULES_URL).setLabel('Ler as regras da cidade!')
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    return;
  }

  // wl:start – inicia a allowlist criando uma thread privada com o jogador
  if (interaction.isButton() && interaction.customId === 'wl:start') {
    const userId = interaction.user.id;
    if (sessions.has(userId))
      return interaction.reply({ content: 'Você já tem uma allowlist em andamento.', flags: 64 });

    const channel = interaction.channel;
    let thread;
    try {
      thread = await channel.threads.create({
        name: `allowlist-${interaction.user.username}`.slice(0, 90),
        autoArchiveDuration: THREAD_ARCHIVE_MIN,
        type: ChannelType.PrivateThread,
        invitable: false,
      });
      await thread.members.add(interaction.user.id);
    } catch {
      return interaction.reply({ content: 'Erro: o bot precisa de permissão para criar threads privadas.', flags: 64 });
    }

    sessions.set(userId, { index: 0, answers: [], threadId: thread.id, startedAt: Date.now() });

    const welcome = new EmbedBuilder()
      .setColor(0x0C9D57)
      .setTitle('Sistema de Allowlist')
      .setThumbnail('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyaDE1Y2duY2psZWZnbGIwcmlxYThsZGMxbmJxeXk4eHUzNDJmY2Z2byZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Oo8Ly1JXZjrqm54qK4/giphy-downsized.gif')
      .setDescription([
        '[Seja bem-vindo ao nosso Sistema!](https://discord.com/channels/@me)',
        '',
        'Leia atentamente todas as questões. É necessário ter **18 anos** completos!',
        '',
        '```',
        `Você terá ${Math.round(TIME_PER_Q/60)} minuto(s) para responder cada pergunta.`,
        'Somente você e o bot possuem acesso a este canal.',
        'Para iniciar, digite **iniciar**',
        '```'
      ].join('\n'));

    await thread.send({ content: `${interaction.user}`, embeds: [welcome] });
    await interaction.reply({ content: `Criei sua thread privada: <#${thread.id}>`, flags: 64 });

    // Espera o jogador digitar "iniciar" (ou "start") para começar
    const startMsg = await waitForMessage(thread, userId, m => /^(iniciar|start)$/i.test(m.content), 180);
    if (!startMsg) {
      await thread.send('Tempo para iniciar esgotado. Use o botão novamente.');
      sessions.delete(userId);
      return;
    }
    await startMsg.delete().catch(() => {});
    await askNext(thread, interaction.user);
    return;
  }

  // /verificacao – publica o painel com o botão CAPTCHA (verify:click)
  if (interaction.isChatInputCommand() && interaction.commandName === 'verificacao') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔐 Verificação de Segurança')
      .setDescription([
        'Para acessar o servidor, confirme que você **não é um robô** clicando no botão abaixo.',
        '',
        '⚠️ **Atenção:** caso o botão não funcione, tente novamente em alguns segundos.'
      ].join('\n'))
      .setThumbnail('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyaDE1Y2duY2psZWZnbGIwcmlxYThsZGMxbmJxeXk4eHUzNDJmY2Z2byZlcD12MV9naWZzX3NlYXJjaCZjdT1n/Oo8Ly1JXZjrqm54qK4/giphy-downsized.gif')
      .setFooter({
        text: 'Equipe Novo Pantanal',
        iconURL: 'https://media.discordapp.net/attachments/571532052973748229/1434916448328876103/60bc922b-3a06-44b7-8d47-25f385ed847a.png'
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify:click')
        .setLabel('Verificar')
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    return;
  }

  // /connectpainel – cria/atualiza painel que mostra status do servidor (com auto refresh)
  if (interaction.isChatInputCommand() && interaction.commandName === 'connectpainel') {
    if (!CFX_JOIN_CODE) {
      await interaction.reply({ content: 'Configure CFX_JOIN_CODE no .env (ex.: ep67ba).', flags: 64 });
      return;
    }

    await interaction.deferReply();

    const info = await fetchCfxStatus(CFX_JOIN_CODE);
    const embed = buildConnectEmbed(info);
    const components = buildConnectComponents();

    const sent = await interaction.editReply({ embeds: [embed], components });

    // Se rodar de novo, mata o interval antigo desse painel
    if (connectIntervals.has(sent.id)) {
      clearInterval(connectIntervals.get(sent.id));
      connectIntervals.delete(sent.id);
    }

    // Atualizações periódicas do painel
    const interval = setInterval(async () => {
      try {
        const ch = await client.channels.fetch(sent.channelId).catch(() => null);
        if (!ch) { clearInterval(interval); connectIntervals.delete(sent.id); return; }

        const msg = await ch.messages.fetch(sent.id).catch(() => null);
        if (!msg) { clearInterval(interval); connectIntervals.delete(sent.id); return; }

        const info2 = await fetchCfxStatus(CFX_JOIN_CODE);
        const embed2 = buildConnectEmbed(info2);
        await msg.edit({ embeds: [embed2], components });
      } catch (e) {
        console.warn('[connectpainel] update falhou:', e.message);
      }
    }, Math.max(15, CONNECT_REFRESH_SEC) * 1000);

    connectIntervals.set(sent.id, interval);
    return;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: sanitiza URLs de imagem (garante HTTPS e domínio confiável)
// ─────────────────────────────────────────────────────────────────────────────
function sanitizeImageUrl(url, fallback) {
  if (typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return fallback;
  // Evita domínios problemáticos em DM; preferimos CDN do Discord ou formatos comuns de imagem
  const ok =
    /\.(png|jpe?g|gif|webp)$/i.test(trimmed) ||
    /cdn\.discordapp\.com/i.test(trimmed) ||
    /media\.discordapp\.net/i.test(trimmed);
  return ok ? trimmed : fallback;
}

// ───────────────── Tickets: interações ─────────────────
client.on(Events.InteractionCreate, async (i) => {
  try {
    // Seletor do painel de tickets → abre modal pedindo assunto
    if (i.isStringSelectMenu() && i.customId === 'ticket:choose') {
      const kind = i.values?.[0];
      if (!TICKET_TYPES[kind]?.categoryId) return i.reply({ content: 'Tipo de ticket não configurado.', flags: 64 });
      return i.showModal(buildSubjectModal(kind));
    }

    // Modal submit → cria o canal do ticket com base no tipo
    if (i.isModalSubmit() && i.customId.startsWith('ticket:subject:')) {
      const kind = i.customId.split(':')[2];
      const subject = i.fields.getTextInputValue('subject');
      await i.deferReply({ ephemeral: true });
      const ch = await createTicketChannel(i.guild, i.user, kind, subject);
      await i.editReply({ content: `✅ Ticket criado em ${ch}` });

      // Loga criação apenas se explicitamente habilitado
if (TICKET_LOG_CREATE_ENABLED && TICKET_LOG_CHANNEL_ID) {
  const log = await client.channels.fetch(TICKET_LOG_CHANNEL_ID).catch(() => null);
  if (log?.isTextBased()) {
    const e = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Ticket criado')
      .addFields(
        { name: 'Usuário', value: `${i.user} (${i.user.id})`, inline: true },
        { name: 'Tipo', value: TICKET_TYPES[kind].label, inline: true },
        { name: 'Canal', value: `${ch}`, inline: true },
        { name: 'Assunto', value: subject || '—', inline: false },
      )
      .setTimestamp(new Date());
    await log.send({ embeds: [e] });
  }
}
      return;
    }

    // Painel dentro do ticket (adicionar/remover membro, assumir, fechar)
    if (i.isButton() && i.channel?.type === ChannelType.GuildText) {
      // Só aplique botões se o canal for um ticket (topic em JSON)
      const isTicket = i.channel.topic && (() => { try { JSON.parse(i.channel.topic); return true; } catch { return false; } })();
      if (!isTicket) return;

      const topic = JSON.parse(i.channel.topic || '{}');
      const ownerId = topic.ownerId;
      const isStaff = TICKET_STAFF_ROLE_ID && i.member?.roles?.cache?.has(TICKET_STAFF_ROLE_ID);

      // Restringe funcionalidades a staff
      if (['ticket:add','ticket:remove','ticket:claim','ticket:close'].includes(i.customId) && !isStaff) {
        return i.reply({ content: 'Apenas equipe pode usar esse painel.', flags: 64 });
      }

      // Adicionar membro
      if (i.customId === 'ticket:add') {
        const menu = new UserSelectMenuBuilder().setCustomId('ticket:add:pick').setPlaceholder('Selecione 1 membro para adicionar').setMinValues(1).setMaxValues(1);
        return i.reply({ content: 'Escolha um usuário para **adicionar** ao ticket:', components: [ new ActionRowBuilder().addComponents(menu) ], flags: 64 });
      }

      // Remover membro
      if (i.customId === 'ticket:remove') {
        const menu = new UserSelectMenuBuilder().setCustomId('ticket:remove:pick').setPlaceholder('Selecione 1 membro para remover').setMinValues(1).setMaxValues(1);
        return i.reply({ content: 'Escolha um usuário para **remover** do ticket:', components: [ new ActionRowBuilder().addComponents(menu) ], flags: 64 });
      }

      // Assumir ticket (feedback para cliente)
      if (i.customId === 'ticket:claim') {
        await i.reply({ content: 'Você **assumiu** este ticket.', flags: 64 });
        await i.channel.send(`📌 ${i.user} assumiu seu ticket e dará continuidade ao atendimento, <@${ownerId}>.`);
        return;
      }

      // ─────────────────────────────────────────────────────────────────
      // FECHAMENTO RÁPIDO DO TICKET (gera transcrição + log + DM)
      // ─────────────────────────────────────────────────────────────────
      if (i.customId === 'ticket:close') {
        await i.reply({ content: 'Fechando ticket…', flags: 64 });

        const topic = JSON.parse(i.channel.topic || '{}');
        const ownerId = topic.ownerId;
        const opener = ownerId ? await i.client.users.fetch(ownerId).catch(() => null) : null;

        // 1) Gera a transcrição como Attachment (melhor compatibilidade)
        const fileName = `ticket-${i.channel.id}.html`;
        let transcriptAttachment = null;
        try {
          transcriptAttachment = await createTranscript(i.channel, {
            limit: -1,
            returnBuffer: false,   // Attachment pronto
            fileName,
            poweredBy: false,
            saveImages: false,
          });
        } catch (e) {
          console.warn('[ticket:close] Falha ao gerar transcrição:', e?.message || e);
        }

        // 2) Sobe no canal de logs e captura a URL CDN do Discord
        let cdnUrl = null;
        if (process.env.TICKET_LOG_CHANNEL_ID && transcriptAttachment) {
          const logCh = await i.client.channels.fetch(process.env.TICKET_LOG_CHANNEL_ID).catch(() => null);
          if (logCh?.isTextBased?.()) {
            try {
              const msgLog = await logCh.send({
                content: `🗂️ Transcrição do ticket **${i.channel.name}** (${i.channel.id})\nFechado por: ${i.user}`,
                files: [transcriptAttachment],
              });
              cdnUrl = msgLog?.attachments?.first()?.url || null;
            } catch (e) {
              console.warn('[ticket:close] Falha ao enviar transcrição no canal de log:', e?.message || e);
            }
          }
        }

// 3) Envia mensagem privada ao dono com histórico bonito (com thumbnail e footer com hora)
if (opener) {
  // helper: "Hoje às HH:MM" com timezone de São Paulo
  const hora = new Date().toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  });
  const footerText = `Novo Pantanal © Todos os direitos reservados`;

  // Fallbacks 100% confiáveis (CDN do Discord)
  const DEFAULT_ICON  = 'https://cdn.discordapp.com/embed/avatars/0.png';
  const DEFAULT_THUMB = 'https://cdn.discordapp.com/embed/avatars/1.png';

  // Sanitiza envs e faz fallback seguro
  const BRAND_ICON = sanitizeImageUrl(process.env.TICKET_BRAND_ICON, DEFAULT_ICON);
  const THUMB_URL  = sanitizeImageUrl(process.env.TICKET_BANNER,      DEFAULT_THUMB);

  const dmEmbed = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle('💬 Seu ticket foi fechado')
    .setDescription(
      cdnUrl
        ? 'Você encerrou seu ticket. O histórico da conversa foi salvo e pode ser acessado pelo botão abaixo.'
        : (transcriptAttachment
            ? 'Você encerrou seu ticket. O histórico da conversa está em anexo.'
            : 'Seu ticket foi fechado com sucesso.')
    )
    .addFields(
      { name: 'Tipo', value: `\`${topic?.kind || '—'}\``, inline: true },
      { name: 'Fechado por', value: `${i.user} (VOCÊ)`, inline: true }
    )
    .setThumbnail(THUMB_URL)
    .setFooter({ text: footerText, iconURL: BRAND_ICON })
    .setTimestamp(new Date());

  const dmComponents = cdnUrl
    ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Abrir histórico da conversa')
            .setURL(cdnUrl)
            .setEmoji('🗂️')
        )
      ]
    : [];

  const dmPayload = { embeds: [dmEmbed], components: dmComponents };
  if (!cdnUrl && transcriptAttachment) dmPayload.files = [transcriptAttachment];

  try {
    await opener.send(dmPayload);
  } catch (e) {
    console.warn('[ticket:close] Não consegui enviar DM ao dono:', e?.message || e);
  }
}
        // Envia log de fechamento apenas se habilitado
if (TICKET_LOG_CLOSE_ENABLED && process.env.TICKET_LOG_CHANNEL_ID) {
  const log = await i.client.channels.fetch(process.env.TICKET_LOG_CHANNEL_ID).catch(() => null);
  if (log?.isTextBased?.()) {
    const e = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('Ticket fechado')
      .addFields(
        { name: 'Canal', value: `${i.channel}`, inline: true },
        { name: 'Encerrado por', value: `${i.user}`, inline: true },
        { name: 'Histórico', value: cdnUrl ? `[Abrir histórico](${cdnUrl})` : '—', inline: false },
      )
      .setTimestamp(new Date());
    try { await log.send({ embeds: [e] }); } catch {}
  }
}

        // 5) Avisa e agenda deleção do canal
        const delayMs = Math.max(15000, Number(process.env.TICKET_DELETE_DELAY_MS ?? 300000));
        await i.channel.send(`⌛ Este canal será deletado em **${Math.round(delayMs/1000/60)} minuto(s)**.`).catch(() => {});
        setTimeout(() => i.channel.delete('Ticket fechado').catch(() => {}), delayMs);
        return;
      }
    }

    // Seletores de usuário (add/remove) – gerencia permissões de visualização do ticket
    if (i.isUserSelectMenu() && (i.customId === 'ticket:add:pick' || i.customId === 'ticket:remove:pick')) {
      const memberId = i.values[0];
      const allow = i.customId.startsWith('ticket:add');
      await i.deferReply({ ephemeral: true });
      await i.channel.permissionOverwrites.edit(memberId, {
        ViewChannel: allow, SendMessages: allow, ReadMessageHistory: allow, AttachFiles: allow
      }).catch(() => {});
      await i.editReply({ content: allow ? `✅ <@${memberId}> **adicionado** ao ticket.` : `✅ <@${memberId}> **removido** do ticket.` });
      return;
    }
  } catch (err) {
    console.error('[Ticket]', err);
    if (i.isRepliable()) i.reply({ content: 'Ocorreu um erro ao processar a ação.', flags: 64 }).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Sistema de verificação (CAPTCHA simples) — botão verify:click
// ─────────────────────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isButton() || i.customId !== 'verify:click') return;

  const VERIFIED_ROLE_ID   = process.env.VERIFIED_ROLE_ID;
  const UNVERIFIED_ROLE_ID = process.env.UNVERIFIED_ROLE_ID || null;

  if (!VERIFIED_ROLE_ID) {
    return i.reply({ content: '⚙️ Cargo de verificação não configurado. Defina VERIFIED_ROLE_ID no .env', flags: 64 });
  }

  const member = await i.guild.members.fetch(i.user.id).catch(() => null);
  if (!member) {
    return i.reply({ content: 'Não consegui encontrar seu perfil no servidor.', flags: 64 });
  }

  // Checagem de permissão/hierarquia do bot para gerenciar roles
  const me = await i.guild.members.fetchMe().catch(() => null);
  const canManage = me?.permissions?.has('ManageRoles');
  const verifiedRole = await i.guild.roles.fetch(VERIFIED_ROLE_ID).catch(() => null);
  const unverifiedRole = UNVERIFIED_ROLE_ID ? await i.guild.roles.fetch(UNVERIFIED_ROLE_ID).catch(() => null) : null;

  if (!canManage || !verifiedRole || verifiedRole.position >= (me?.roles?.highest?.position ?? 0)) {
    return i.reply({ content: '⚠️ Não tenho permissão/hierarquia para gerenciar cargos (verifique **Manage Roles** e a posição do cargo do bot).', flags: 64 });
  }

  // já verificado?
  if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      await member.roles.remove(unverifiedRole.id).catch(() => {});
    }
    return i.reply({ content: '✅ Você já está verificado!', flags: 64 });
  }

  // fluxo: remover cargo antigo (se existir) → adicionar verificado
  try {
    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      const steps = [0, 800];
      for (const d of steps) {
        if (d) await new Promise(r => setTimeout(r, d));
        try {
          await member.roles.remove(unverifiedRole.id, 'Verificação concluída — remover cargo antigo');
          break;
        } catch (err) {
          if (d === steps[steps.length - 1]) throw err;
        }
      }
    }

    await member.roles.add(VERIFIED_ROLE_ID, 'Verificação concluída — dar cargo verificado');
    await i.reply({ content: '✅ Verificação concluída! Seu acesso foi liberado.', flags: 64 });
  } catch (err) {
    console.error('[verify:click] erro ao trocar cargos:', err);
    await i.reply({ content: '❌ Não consegui alterar seus cargos. Verifique permissões/hierarquia do bot e tente novamente.', flags: 64 }).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Fluxo da allowlist (pergunta por pergunta)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Controla o fluxo de perguntas da allowlist dentro da thread do usuário.
 * Chama recursivamente até terminar as questões e delega para finish().
 */
async function askNext(thread, user) {
  const s = sessions.get(user.id);
  if (!s) return;

  const q = QUESTIONS[s.index];
  if (!q) {
    await finish(thread, user);
    return;
  }

  // Thumbnails diferentes por tipo de pergunta
  const thumbOpen  = 'https://media.discordapp.net/attachments/571532052973748229/1434916448328876103/60bc922b-3a06-44b7-8d47-25f385ed847a.png'; // abertas
  const thumbChoice = 'https://media.discordapp.net/attachments/571532052973748229/1434927572649574440/f71d3503-7ab0-4f65-85b2-1f1704aa5513.png'; // múltipla escolha
  const thumbUrl = q.type === 'choice' ? thumbChoice : thumbOpen;

  // Pergunta aberta (texto livre)
  if (q.type === 'open') {
    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle('Responda atentamente abaixo:')
      .setDescription(`> **${q.prompt}**\n\n• Você possui **${Math.round(TIME_PER_Q / 60)} minuto(s)** para responder!`)
      .setThumbnail(thumbUrl);

    const promptMsg = await thread.send({ embeds: [embed] });

    const resp = await waitForMessage(thread, user.id, m => m.author.id === user.id, TIME_PER_Q);
    if (!resp) {
      await promptMsg.delete().catch(() => {});
      await thread.send('⏱️ Tempo esgotado. Você precisará refazer a allowlist.');
      sessions.delete(user.id);
      return;
    }

    const text = resp.content.trim();
    await Promise.all([promptMsg.delete().catch(() => {}), resp.delete().catch(() => {})]);

    // Validação de idade mínima (baseado no título da pergunta)
    if (/^idade$/i.test(q.title)) {
      const age = parseInt(text.replace(/\D/g, ''), 10);
      if (!Number.isFinite(age) || age < 18) {
        await thread.send('🚫 Idade mínima é 18 anos. Processo encerrado.');
        sessions.delete(user.id);
        try { await closeThreadById(s.threadId ?? thread.id); } catch {}
        return;
      }
    }

    s.answers.push({ type: 'open', title: q.title, prompt: q.prompt, answer: text });
    s.index++;
    await askNext(thread, user);
    return;
  }

  // Pergunta de múltipla escolha
  if (q.type === 'choice') {
    const opcoesFormatadas = q.options.map((opt, i) => `**${i + 1}.** ${opt}`).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle('Responda atentamente abaixo:')
      .setDescription(
        [
          `> **${q.prompt}**`,
          '',
          opcoesFormatadas,
          '',
          `• Você possui **${Math.round(TIME_PER_Q / 60)} minuto(s)** para responder!`
        ].join('\n')
      )
      .setThumbnail(thumbUrl);

    // Quatro botões numerados (1–4)
    const row = new ActionRowBuilder().addComponents(
      q.options.map((_, i) =>
        new ButtonBuilder()
          .setCustomId(`q:${user.id}:${s.index}:${i}`)
          .setLabel(String(i + 1))
          .setStyle(ButtonStyle.Primary)
      )
    );

    const promptMsg = await thread.send({ embeds: [embed], components: [row] });
    const chosen = await waitForButton(promptMsg, user.id, TIME_PER_Q);
    await promptMsg.delete().catch(() => {});

    if (chosen == null) {
      await thread.send('⏱️ Tempo esgotado. Você precisará refazer a allowlist.');
      sessions.delete(user.id);
      return;
    }

    s.answers.push({
      type: 'choice',
      title: q.title,
      prompt: q.prompt,
      chosen: q.options[chosen],
      correct: q.options[q.correctIndex],
      isCorrect: chosen === q.correctIndex
    });
    s.index++;
    await askNext(thread, user);
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de encerramento de threads (allowlist)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tenta fechar/deletar a thread de forma "gentil":
 * - Desarquiva, bloqueia, deleta; se não conseguir, arquiva e trava.
 */
async function closeThreadById(threadId) {
  try {
    const th = await client.channels.fetch(threadId).catch(() => null);
    if (!th) {
      console.warn('[closeThreadById] Thread não encontrada:', threadId);
      return false;
    }

    if (th.isThread?.() && th.archived) {
      await th.setArchived(false).catch(() => {});
    }

    if (th.isThread?.()) {
      await th.setLocked(true).catch(() => {});
    }

    if (th.deletable) {
      await th.delete('Allowlist finalizada — limpeza automática').catch(() => {});
      return true;
    }

    if (th.isThread?.()) {
      await th.setArchived(true).catch(() => {});
      console.warn('[closeThreadById] Não consegui deletar; arquivei a thread:', threadId);
      return false;
    }

    console.warn('[closeThreadById] Canal não é thread:', threadId);
    return false;
  } catch (err) {
    console.error('[closeThreadById] Erro:', err);
    return false;
  }
}

/**
 * Força a deleção da thread com algumas tentativas e pequenos delays.
 * Se não conseguir, ao menos bloqueia/arquiva.
 */
async function forceDeleteThreadById(threadId, reason = 'Allowlist finalizada — limpeza automática') {
  try {
    const th = await client.channels.fetch(threadId).catch(() => null);
    if (!th) {
      console.warn('[forceDeleteThreadById] Thread não encontrada:', threadId);
      return false;
    }

    if (typeof th.isThread === 'function' && th.isThread() && th.archived) {
      await th.setArchived(false).catch(() => {});
    }

    const attempts = [0, 800, 1600]; // ms
    for (const delay of attempts) {
      if (delay) await new Promise(r => setTimeout(r, delay));
      try {
        await th.delete(reason);
        return true;
      } catch (err) {
        if (err?.code === 50013) {
          console.error('[forceDeleteThreadById] Sem permissão para deletar thread.');
          return false;
        }
        if (err?.code === 10003) return true; // já deletada
      }
    }

    try {
      if (typeof th.isThread === 'function' && th.isThread()) {
        await th.setLocked(true).catch(() => {});
        await th.setArchived(true).catch(() => {});
      }
    } catch {}
    console.warn('[forceDeleteThreadById] Não consegui deletar; deixei arquivada/lockada:', threadId);
    return false;
  } catch (err) {
    console.error('[forceDeleteThreadById] Erro inesperado:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca Status do servidor (RedM/FiveM)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Consulta o endpoint público do FiveM/RedM para obter status, players e max slots.
 * Retorna objeto normalizado para montar embed.
 */
async function fetchCfxStatus(joinCode) {
  if (!joinCode) return { online: false, clients: 0, maxClients: 0, hostname: null };

  const url = `https://servers-frontend.fivem.net/api/servers/single/${joinCode}`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const d = data?.Data ?? data?.data ?? {};

    const players = d.players ?? d.Players ?? d.PlayerList ?? [];
    const clients =
      (typeof d.clients === 'number' ? d.clients :
      typeof d.clientsCurrent === 'number' ? d.clientsCurrent :
      Array.isArray(players) ? players.length : 0);

    const maxClients =
      (typeof d.svMaxclients === 'number' ? d.svMaxclients :
      typeof d.maxClients === 'number' ? d.maxClients :
      typeof d.maxclients === 'number' ? d.maxclients : 0);

    const hostname = d.hostname ?? d.hostnameSource ?? d.mem?._hostname ?? null;
    const online = Boolean(maxClients && clients >= 0);

    return { online, clients, maxClients, hostname };
  } catch (err) {
    console.warn('[fetchCfxStatus] erro:', err.message);
    return { online: false, clients: 0, maxClients: 0, hostname: null, error: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder painel de Connect
// ─────────────────────────────────────────────────────────────────────────────

const FOOTER_ICON_URL = 'https://media.discordapp.net/attachments/571532052973748229/1434916448328876103/60bc922b-3a06-44b7-8d47-25f385ed847a.png';
const FOOTER_ICON_ON  = FOOTER_ICON_URL;
const FOOTER_ICON_OFF = FOOTER_ICON_URL;

/**
 * Monta a embed do painel de conexão com status atual, contagem de players e horário.
 */
function buildConnectEmbed({ online, clients, maxClients, hostname }) {
  const now  = new Date();
  const hora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const e = new EmbedBuilder()
    .setColor(online ? 0x2ECC71 : 0xE74C3C)
    .setTitle('✅ Novo Pantanal | Connect')
    .setDescription('Utilize o botão abaixo para se conectar ao condado.')
    .setThumbnail('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyaDE1Y2duY2psZWZnbGIwcmlxYThsZGMxbmJxeXk4eHUzNDJmY2Z2byZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Oo8Ly1JXZjrqm54qK4/giphy-downsized.gif');

  e.addFields(
    { name: 'Status:',           value: online ? '`🟢 Online`' : '`🔴 Offline`', inline: false },
    { name: 'Jogadores Online:', value: `\`${clients ?? 0}/${maxClients ?? 0}\``, inline: false },
    { name: 'Servidor:',         value: '`connect novopantanal.com.br`', inline: false },
  );
  e.addFields({ name: '\u2009', value: '\u2009', inline: false });

  const freqMin    = Math.max(1, Math.round((CONNECT_REFRESH_SEC || 60) / 60));
  const statusText = `Atualizado a cada ${freqMin} minuto${freqMin > 1 ? 's' : ''} • Hoje às ${hora}`;
  const footerIcon = online ? FOOTER_ICON_ON : FOOTER_ICON_OFF;

  e.setFooter({ text: statusText, iconURL: footerIcon });
  return e;
}

/**
 * Monta o botão/link de conexão (cfx.re). Usado junto ao embed de connect.
 */
function buildConnectComponents() {
  const url = `https://cfx.re/join/${CFX_JOIN_CODE || 'SEU_CODIGO'}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Entrar no servidor')
      .setStyle(ButtonStyle.Link)
      .setURL(url)
  );
  return [row];
}

// ───────────────── Tickets: helpers (painel, criação, modal) ─────────────────

/**
 * Embed do painel inicial de tickets com instruções e observações gerais.
 */
function buildTicketPanelEmbed() {
  const e = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('✅ Tickets Novo Pantanal')
    .setDescription([
      'Escolha uma opção com base no assunto que você deseja discutir com um membro da equipe através de um ticket:',
      '',
      '__**Observações:**__',
      '・ **`Cada tipo é específico para um assunto, abra apenas se realmente precisar.`**',
      '・ **`Abrir ticket sem motivo pode resultar em punições.`**'
    ].join('\n'));
  e.addFields({ name: '\u2009', value: '\u2009', inline: false });
  e.setFooter({
    text: 'Novo Pantanal © Todos os direitos reservados',
    iconURL: 'https://media.discordapp.net/attachments/571532052973748229/1434916448328876103/60bc922b-3a06-44b7-8d47-25f385ed847a.png'
  });
  return e;
}

/**
 * Componente (select) com as opções de tipo de ticket.
 */
function buildTicketPanelComponents() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket:choose')
    .setPlaceholder('Escolha um tipo de ticket…')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Suporte').setValue('suporte').setEmoji('🛠️'),
      new StringSelectMenuOptionBuilder().setLabel('Doações').setValue('doacoes').setEmoji('💸'),
      new StringSelectMenuOptionBuilder().setLabel('Denúncia').setValue('denuncia').setEmoji('⛔'),
    );
  return [ new ActionRowBuilder().addComponents(select) ];
}

/**
 * Cria o canal do ticket:
 * - Define permissões: apenas autor + staff (se configurado).
 * - Topic com JSON (kind/ownerId) pra validar ações dentro do ticket.
 * - Envia painel de ações (add/remove/claim/close).
 */
async function createTicketChannel(guild, ownerUser, kind, subject) {
  const cfg = TICKET_TYPES[kind];
  if (!cfg?.categoryId) throw new Error('Categoria não configurada para: ' + kind);

  const name = `🧾-${kind}-${ownerUser.username}`.toLowerCase().replaceAll(' ', '-').slice(0, 90);
  const overwrites = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ownerUser.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
  ];
  if (TICKET_STAFF_ROLE_ID) {
    overwrites.push({
      id: TICKET_STAFF_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages],
    });
  }

  const ch = await guild.channels.create({
    name, type: ChannelType.GuildText, parent: cfg.categoryId,
    permissionOverwrites: overwrites,
    reason: `Ticket de ${ownerUser.tag} (${cfg.label})`,
    topic: JSON.stringify({ kind, ownerId: ownerUser.id }),
  });

  const e = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('Novo Pantanal — Ticket')
    .setThumbnail('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyaDE1Y2duY2psZWZnbGIwcmlxYThsZGMxbmJxeXk4eHUzNDJmY2Z2byZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Oo8Ly1JXZjrqm54qK4/giphy-downsized.gif')
    .setDescription([
      `${ownerUser}, você abriu um ticket de **${cfg.label}**.`,
      '',
      '**`Explique seu problema/assunto com o máximo de detalhes possível.`**',
      '',
      '__**Assunto Informado**__',
      subject || '_não informado_'
    ].join('\n'));
  e.addFields({ name: '\u2009', value: '\u2009', inline: false });
  e.setFooter({
    text: 'Novo Pantanal © Todos os direitos reservados',
    iconURL: 'https://media.discordapp.net/attachments/571532052973748229/1434916448328876103/60bc922b-3a06-44b7-8d47-25f385ed847a.png'
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:add').setLabel('Add Membro').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
    new ButtonBuilder().setCustomId('ticket:remove').setLabel('Remover Membro').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Assumir Ticket').setStyle(ButtonStyle.Primary).setEmoji('🧩'),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Fechar').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  );

  await ch.send({ content: TICKET_STAFF_ROLE_ID ? `<@&${TICKET_STAFF_ROLE_ID}>` : null, embeds: [e], components: [row] }).catch(() => {});
  return ch;
}

/**
 * Cria o Modal que coleta o assunto do ticket.
 */
function buildSubjectModal(kind) {
  return new ModalBuilder()
    .setCustomId(`ticket:subject:${kind}`)
    .setTitle('Informe o assunto do ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('subject')
          .setLabel('Assunto/Resumo')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
      )
    );
}

/**
 * Autorole: atribui cargo ao membro que acabou de entrar (se configurado).
 * - Verifica existência do cargo, hierarquia e permissões do bot.
 * - Envia mensagem de boas-vindas (opcional).
 */
async function giveAutoRole(member) {
  try {
    if (!AUTO_ROLE_ID) return;

    const role = await member.guild.roles.fetch(AUTO_ROLE_ID).catch(() => null);
    if (!role) {
      console.warn('[autorole] Role não encontrada (AUTO_ROLE_ID inválido)');
      return;
    }

    const me = await member.guild.members.fetchMe();
    if (!me.permissions.has('ManageRoles') || role.position >= me.roles.highest.position) {
      console.warn('[autorole] Sem permissão/hierarquia para dar o cargo.');
      return;
    }

    if (member.roles.cache.has(role.id)) return;

    const attempts = [0, 1000, 2500];
    for (const delay of attempts) {
      if (delay) await new Promise(r => setTimeout(r, delay));
      try {
        await member.roles.add(role.id, 'Autorole automático ao entrar no servidor');
        break;
      } catch (err) {
        if (delay === attempts[attempts.length - 1]) {
          console.error('[autorole] Falha ao dar cargo:', err?.message || err);
        }
      }
    }

    if (AUTO_ROLE_WELCOME_CHANNEL_ID) {
      const ch = await member.guild.channels.fetch(AUTO_ROLE_WELCOME_CHANNEL_ID).catch(() => null);
      if (ch?.isTextBased()) {
        const text = AUTO_ROLE_WELCOME_MESSAGE.replace('{user}', `${member}`);
        ch.send({ content: text }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[autorole] Erro inesperado:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Instalação automática: allowlist (painel de início)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publica/atualiza o painel com o botão "Fazer a Allowlist!" no canal indicado.
 * Evita duplicar e pode fixar a mensagem se PIN_INSTALLED_MESSAGES=true.
 */
async function installAllowlistMessage(channelId) {
  if (!channelId) return;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const recent = await ch.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = recent?.find(m =>
    m.author?.id === client.user.id &&
    Array.isArray(m.components) &&
    m.components.some(row => row.components?.some(c => c.customId === 'wl:start'))
  );

  const embed = new EmbedBuilder()
    .setColor(0x0C9D57)
    .setTitle('Sistema de Allowlist exclusivo! ✅')
    .setDescription(
      [
        'Para fazer sua allowlist, basta clicar no botão abaixo!',
        '',
        '・ ** `Você terá 10 minutos para responder as perguntas.`**',
        '・ ** `Lembre-se de ser o mais claro possível.`**',
        '・ ** `Iremos fazer uma análise — basta aguardar.`**'
      ].join('\n')
    )
    .setThumbnail('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyaDE1Y2duY2psZWZnbGIwcmlxYThsZGMxbmJxeXk4eHUzNDJmY2Z2byZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Oo8Ly1JXZjrqm54qK4/giphy-downsized.gif')
    .setFooter({
      text: 'Equipe Novo Pantanal',
      iconURL: 'https://media.discordapp.net/attachments/571532052973748229/1434916448328876103/60bc922b-3a06-44b7-8d47-25f385ed847a.png'
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wl:start').setLabel('Fazer a Allowlist!').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(RULES_URL).setLabel('Ler as regras da cidade!')
  );

  if (existing) {
    await existing.edit({ embeds: [embed], components: [row] }).catch(() => {});
    if ((process.env.PIN_INSTALLED_MESSAGES ?? 'false').toLowerCase() === 'true' && !existing.pinned) {
      await existing.pin().catch(() => {});
    }
    return;
  }

  const sent = await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (sent && (process.env.PIN_INSTALLED_MESSAGES ?? 'false').toLowerCase() === 'true') {
    await sent.pin().catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Instalação automática: Ticket (painel do seletor)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publica/atualiza o painel de tickets com o seletor de tipos.
 */
async function installTicketPanel(channelId) {
  if (!channelId) return;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const recent = await ch.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = recent?.find(m =>
    m.author?.id === client.user.id &&
    Array.isArray(m.components) &&
    m.components.some(row =>
      row.components?.some(c => c.customId === 'ticket:choose')
    )
  );

  const embed = buildTicketPanelEmbed()
    .setThumbnail('https://media3.giphy.com/media/v1.Y2lkPTZjMDliOTUyaDE1Y2duY2psZWZnbGIwcmlxYThsZGMxbmJxeXk4eHUzNDJmY2Z2byZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Oo8Ly1JXZjrqm54qK4/giphy-downsized.gif');
  const components = buildTicketPanelComponents();

  if (existing) {
    await existing.edit({ embeds: [embed], components }).catch(() => {});
    if ((process.env.PIN_INSTALLED_MESSAGES ?? 'false').toLowerCase() === 'true' && !existing.pinned)
      await existing.pin().catch(() => {});
    return;
  }

  const sent = await ch.send({ embeds: [embed], components }).catch(() => null);
  if (sent && (process.env.PIN_INSTALLED_MESSAGES ?? 'false').toLowerCase() === 'true')
    await sent.pin().catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Instalação automática: Connect (painel com auto refresh)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publica/atualiza o painel de connect e agenda atualização periódica.
 */
async function installConnectPanel(channelId) {
  if (!channelId || !CFX_JOIN_CODE) return;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const recent = await ch.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = recent?.find(m =>
    m.author?.id === client.user.id &&
    Array.isArray(m.components) &&
    m.components.some(row => row.components?.some(c =>
      c.style === ButtonStyle.Link &&
      typeof c.url === 'string' &&
      c.url.includes(`https://cfx.re/join/${CFX_JOIN_CODE}`)
    ))
  );

  const info = await fetchCfxStatus(CFX_JOIN_CODE);
  const embed = buildConnectEmbed(info);
  const components = buildConnectComponents();

  if (existing) {
    await existing.edit({ embeds: [embed], components }).catch(() => {});
    if ((process.env.PIN_INSTALLED_MESSAGES ?? 'false').toLowerCase() === 'true' && !existing.pinned) {
      await existing.pin().catch(() => {});
    }
    ensureConnectAutoRefresh(existing.channelId, existing.id);
    return;
  }

  const sent = await ch.send({ embeds: [embed], components }).catch(() => null);
  if (!sent) return;
  if ((process.env.PIN_INSTALLED_MESSAGES ?? 'false').toLowerCase() === 'true') {
    await sent.pin().catch(() => {});
  }
  ensureConnectAutoRefresh(sent.channelId, sent.id);
}

/**
 * Agenda/garante atualização periódica do painel de connect.
 * Evita múltiplos intervals para a mesma mensagem.
 */
function ensureConnectAutoRefresh(channelId, messageId) {
  if (connectIntervals.has(messageId)) {
    clearInterval(connectIntervals.get(messageId));
    connectIntervals.delete(messageId);
  }
  const interval = setInterval(async () => {
    try {
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (!ch) { clearInterval(interval); connectIntervals.delete(messageId); return; }
      const msg = await ch.messages.fetch(messageId).catch(() => null);
      if (!msg) { clearInterval(interval); connectIntervals.delete(messageId); return; }

      const info2 = await fetchCfxStatus(CFX_JOIN_CODE);
      const embed2 = buildConnectEmbed(info2);
      const components = buildConnectComponents();
      await msg.edit({ embeds: [embed2], components }).catch(() => {});
    } catch { /* no-op */ }
  }, Math.max(15, CONNECT_REFRESH_SEC) * 1000);

  connectIntervals.set(messageId, interval);
}

// ─────────────────────────────────────────────────────────────────────────────
// Instala automaticamente o painel de verificação (CAPTCHA)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publica/atualiza o painel com o botão "Verificar" (verify:click).
 */
async function installVerificationPanel(channelId) {
  if (!channelId) return;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const recent = await ch.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = recent?.find(m =>
    m.author?.id === client.user.id &&
    m.components?.some(row =>
      row.components?.some(c => c.customId === 'verify:click')
    )
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔐 Verificação de Segurança')
    .setDescription([
      'Para acessar o servidor, confirme que você **não é um robô** clicando no botão abaixo.',
      '',
      '⚠️ **Atenção:** caso o botão não funcione, tente novamente em alguns segundos.'
    ].join('\n'))
    .setThumbnail('https://cdn-icons-png.flaticon.com/512/942/942751.png')
    .setFooter({
      text: 'Equipe Novo Pantanal',
      iconURL: 'https://media.discordapp.net/attachments/571532052973748229/1434916448328876103/60bc922b-3a06-44b7-8d47-25f385ed847a.png'
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify:click')
      .setLabel('Verificar')
      .setStyle(ButtonStyle.Success)
  );

  if (existing) {
    await existing.edit({ embeds: [embed], components: [row] }).catch(() => {});
    if ((process.env.PIN_INSTALLED_MESSAGES ?? 'false').toLowerCase() === 'true' && !existing.pinned)
      await existing.pin().catch(() => {});
    return;
  }

  const sent = await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (sent && (process.env.PIN_INSTALLED_MESSAGES ?? 'false').toLowerCase() === 'true')
    await sent.pin().catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Finalização da allowlist (monta resumos e envia para logs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finaliza a allowlist:
 * - Calcula pontuação
 * - Envia resumo + detalhes para o canal de LOG
 * - Exibe mensagem ao usuário
 * - Apaga (ou não) a thread conforme DELETE_THREAD_ON_FINISH
 */
async function finish(thread, user) {
  const s = sessions.get(user.id);
  if (!s) return;

  const score = s.answers.filter(a => a.type === 'choice' && a.isCorrect).length;
  const totalChoice = s.answers.filter(a => a.type === 'choice').length;

  const resumo = new EmbedBuilder()
    .setColor(0x0C9D57)
    .setTitle('Resumo da Allowlist')
    .addFields(
      { name: 'Usuário', value: `${user}`, inline: true },
      { name: 'Pontuação (múltipla escolha)', value: `${score}/${totalChoice}`, inline: true }
    )
    .setTimestamp(new Date());

  const detalhes = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Respostas')
    .setDescription(
      s.answers.map((a, i) =>
        a.type === 'open'
          ? `**${i + 1}. ${a.title}**\n• ${a.prompt}\n> ${a.answer}`
          : `**${i + 1}. ${a.title}**\n• ${a.prompt}\n> Escolha: ${a.chosen}\n> Correta: ${a.correct} ${a.isCorrect ? '✅' : '❌'}`
      ).join('\n\n')
    );

  const modRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod:approve:${user.id}:${thread.id}`).setLabel('Aprovar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`mod:reject:${user.id}:${thread.id}`).setLabel('Reprovar').setStyle(ButtonStyle.Danger)
  );

  if (LOG_CHANNEL_ID) {
    const logCh = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logCh) await logCh.send({ embeds: [resumo, detalhes], components: [modRow] });
  }

  await thread.send({ content: `${user} sua allowlist foi registrada! Aguardando avaliação da staff.` }).catch(() => {});
  sessions.delete(user.id);

  if (DELETE_THREAD_ON_FINISH) {
    const ok = await forceDeleteThreadById(s.threadId ?? thread.id);
    if (!ok) console.warn('[finish] Falha ao deletar thread (permissão ou timing).');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de coleta (awaitMessages/awaitMessageComponent)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aguarda uma mensagem de um usuário específico no canal, com filtro opcional.
 * @returns {Message|null} primeira mensagem coletada ou null em timeout.
 */
async function waitForMessage(channel, userId, filterFn, seconds) {
  try {
    const collected = await channel.awaitMessages({
      max: 1, time: seconds * 1000, errors: ['time'],
      filter: (m) => m.author?.id === userId && (!filterFn || filterFn(m)),
    });
    return collected.first();
  } catch { return null; }
}

/**
 * Aguarda clique em componente (botões das questões de múltipla escolha).
 * @returns {number|null} índice da opção escolhida ou null em timeout.
 */
async function waitForButton(message, userId, seconds) {
  try {
    const collected = await message.awaitMessageComponent({
      time: seconds * 1000,
      filter: (i) => i.user.id === userId && i.customId.startsWith('q:'),
    });
    const [, , , idx] = collected.customId.split(':');
    await collected.deferUpdate();
    return Number(idx);
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisões da staff (Aprovar / Reprovar)  ➜  com troca de cargos na aprovação
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trata os botões de decisão da staff:
 * - 'mod:approve:<userId>:<threadId>' e 'mod:reject:<userId>:<threadId>'
 * - Anuncia no canal configurado (aprovados/reprovados)
 * - Na aprovação, troca cargos do usuário (remove antigo e dá o novo)
 * - Encerra a thread da allowlist
 */
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isButton() || !i.customId.startsWith('mod:')) return;
  const [, action, userId, threadId] = i.customId.split(':');

  const member = await i.guild.members.fetch(i.user.id);
  if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return i.reply({ content: 'Você não tem permissão para decidir allowlists.', flags: 64 });
  }

  // Canais de anúncio (mantidos)
  const targetChannelId = action === 'approve' ? APPROVED_CHANNEL_ID : REJECTED_CHANNEL_ID;
  if (!targetChannelId) {
    return i.reply({ content: 'Defina APPROVED_CHANNEL_ID e REJECTED_CHANNEL_ID no .env', flags: 64 });
  }
  const targetCh = await client.channels.fetch(targetChannelId).catch(() => null);
  if (!targetCh) {
    return i.reply({ content: 'Não consegui acessar o canal configurado.', flags: 64 });
  }

  const targetUser = await client.users.fetch(userId).catch(() => null);
  const em = new EmbedBuilder()
    .setColor(action === 'approve' ? 0x2ECC71 : 0xE74C3C)
    .setTitle(action === 'approve' ? 'Allowlist aprovada' : 'Allowlist reprovada')
    .setDescription(`${targetUser ? targetUser : `<@${userId}>`} ${action === 'approve' ? 'foi **aprovado(a)**' : 'foi **reprovado(a)**'} pela staff.`)
    .setTimestamp(new Date());

  await targetCh.send({ embeds: [em] });

  // Troca de cargos na APROVAÇÃO
  if (action === 'approve') {
    const ROLE_ADD   = process.env.ALLOWLIST_APPROVED_ROLE_ID; // obrig.
    const ROLE_REMOVE = process.env.ALLOWLIST_REMOVE_ROLE_ID || null; // opc.

    if (!ROLE_ADD) {
      await i.reply({ content: '✅ Decisão registrada (aprovado). ⚠️ ALLOWLIST_APPROVED_ROLE_ID não definido — não adicionei cargo.', flags: 64 });
    } else {
      try {
        const me = await i.guild.members.fetchMe().catch(() => null);
        const canManage = me?.permissions?.has(PermissionFlagsBits.ManageRoles);
        const addRole   = await i.guild.roles.fetch(ROLE_ADD).catch(() => null);
        const remRole   = ROLE_REMOVE ? await i.guild.roles.fetch(ROLE_REMOVE).catch(() => null) : null;

        if (!canManage || !addRole || addRole.position >= (me?.roles?.highest?.position ?? 0)) {
          await i.reply({ content: '✅ Decisão registrada (aprovado). ⚠️ Sem permissão/hierarquia para gerenciar o cargo de aprovado.', flags: 64 });
        } else {
          const approvedMember = await i.guild.members.fetch(userId).catch(() => null);
          if (!approvedMember) {
            await i.reply({ content: '✅ Decisão registrada (aprovado). ⚠️ Não encontrei o membro para aplicar cargos.', flags: 64 });
          } else {
            if (remRole && approvedMember.roles.cache.has(remRole.id)) {
              try { await approvedMember.roles.remove(remRole.id, 'Allowlist aprovada — remover cargo antigo'); } catch {}
            }

            await approvedMember.roles.add(addRole.id, 'Allowlist aprovada — conceder cargo');
            await i.reply({ content: '✅ Decisão registrada: **Aprovado**. Cargos atualizados com sucesso.', flags: 64 });
          }
        }
      } catch (err) {
        console.error('[allowlist approve] erro ao trocar cargos:', err);
        await i.reply({ content: '✅ Decisão registrada (aprovado). ❌ Falha ao atualizar cargos. Verifique permissões/hierarquia.', flags: 64 }).catch(() => {});
      }
    }
  } else {
    // Reprovação: apenas feedback
    await i.reply({ content: 'Decisão registrada: **Reprovado**.', flags: 64 });
  }

  // Limpa a thread da allowlist ao final
  await forceDeleteThreadById(threadId, 'Allowlist encerrada pela staff');
});

// Login do bot
client.login(process.env.DISCORD_TOKEN);