import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('mensagem')
    .setDescription('O bot envia um texto no canal atual.')
    .addStringOption(o =>
      o.setName('texto')
        .setDescription('Mensagem a ser enviada pelo bot')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('connect')
    .setDescription('Envia painel simples de conexão.'),

  new SlashCommandBuilder()
    .setName('connectpainel')
    .setDescription('Publica o painel auto-atualizável de conexão.'),

  new SlashCommandBuilder()
    .setName('allowlistsetup')
    .setDescription('Publica a mensagem da allowlist com os botões.'),

  new SlashCommandBuilder()
    .setName('verificacao')
    .setDescription('Publica o painel de verificação (captcha simples).'),

  // novo: publicar painel de tickets manualmente
  new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Publica/atualiza o painel de tickets no canal configurado.'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

try {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('✅ Comandos registrados com sucesso.');
} catch (err) {
  console.error('❌ Falha ao registrar comandos:', err);
}