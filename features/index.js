/**
 * Yeni özelliklerin tek giriş noktası: Jüri Moderasyonu (+İtirazlar), Ceza Kefareti, Kural Kapısı, Çok Dilli Biletler, Buddy.
 * index.js içinde bir kez çağrılır: require('./features').init(client)
 * Kendi dinleyicilerini ekler; mevcut olay ve etkileşim kodlarına dokunmaz.
 * Her özellik, yönetici açıkça kurmadıkça sunucuda hiçbir şey yapmaz.
 */
const jury = require('./jury');
const parole = require('./parole');
const gate = require('./gate');
const appeal = require('./appeal');
const timeoutDm = require('./timeoutDm');
const mascotEmoji = require('./mascotEmoji');
const emojiLayer = require('./emojiLayer');
const weekly = require('./weekly');
const weeklyPanel = require('./weeklyPanel');
const ticketAiPanel = require('./ticketAiPanel');
const bump = require('./bump');
const bumpPanel = require('./bumpPanel');
const modlogPanel = require('./modlogPanel');
const ticketTools = require('./ticketTools');
const ticketTranslate = require('./ticketTranslate');
const buddy = require('./buddy');
const buddyPanel = require('./buddyPanel');
const juryPanel = require('./juryPanel');
const parolePanel = require('./parolePanel');
const mentionSpam = require('./mentionSpam');
const automodExtra = require('./automodExtra');
const commandLock = require('./commandLock');
const quickMod = require('./quickMod');
const gamesMenu = require('./gamesMenu');
const modPanel = require('./modPanel');
const aiPanel = require('./aiPanel');
const ticketTranslatePanel = require('./ticketTranslatePanel');
const ticketHub = require('./ticketHub');
const suggest = require('./suggest');
const sticky = require('./sticky');
const levels = require('./levels');
const joinGate = require('./joinGate');
const permGuard = require('./permGuard');
const spamFilters = require('./spamFilters');

function init(client) {
  if (client.__featuresInit) return;
  client.__featuresInit = true;

  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isMessageContextMenuCommand && interaction.isMessageContextMenuCommand()) {
        if (await commandLock.guard(interaction)) return;
        if (interaction.commandName === 'Send to Jury') await require('../commands/jury-report').execute(interaction);
        if (interaction.commandName === 'Translate') await require('../commands/translate-message').execute(interaction);
        if (interaction.commandName === 'Moderate Author') await quickMod.open(interaction);
        return;
      }
      if (interaction.isButton()) {
        const id = interaction.customId || '';
        if (id.startsWith('jury:v:')) return await jury.handleVote(interaction, client);
        if (id.startsWith('parole:')) return await parole.handleButton(interaction, client);
        if (id.startsWith('gate:')) return await gate.handleButton(interaction, client);
        if (id === 'ticket_claim') return await ticketTools.handle(interaction, client);
      }
      // Paneller: düğmeler, seçim menüleri ve modallar
      if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
        const id = interaction.customId || '';
        if (id.startsWith('buddy:')) return await buddyPanel.handle(interaction, client);
        if (id.startsWith('jury:ui:')) return await juryPanel.handle(interaction, client);
        if (id.startsWith('paroleui:')) return await parolePanel.handle(interaction, client);
        if (id.startsWith('tkhub:')) return await ticketHub.handle(interaction, client);
        if (id.startsWith('ttui:')) return await ticketTranslatePanel.handle(interaction, client);
        if (id.startsWith('gateui:')) return await gate.handlePanel(interaction, client);
        if (id.startsWith('weeklyui:')) return await weeklyPanel.handle(interaction, client);
        if (id.startsWith('ticketaiui:')) return await ticketAiPanel.handle(interaction, client);
        if (id === 'ticket_prio') return await ticketTools.handle(interaction, client);
        if (id.startsWith('bumpui:')) return await bumpPanel.handle(interaction, client);
        if (id.startsWith('modlogui:')) return await modlogPanel.handle(interaction, client);
        if (id.startsWith('qmod:') && interaction.isButton()) return await quickMod.handle(interaction, client);
        if (id.startsWith('aiui:')) return await aiPanel.handle(interaction, client);
        if (id.startsWith('modpanel:')) return await modPanel.handle(interaction, client);
        if (id.startsWith('gamesui:')) return await gamesMenu.handle(interaction, client);
        if (id.startsWith('cmdlock:')) return await commandLock.handle(interaction, client);
        if (id.startsWith('automodx:')) return await automodExtra.handle(interaction, client);
        if (id.startsWith('appeal:')) return await appeal.handle(interaction, client);
        if (id.startsWith('suggest:')) return await suggest.handle(interaction, client);
        if (id.startsWith('stickyui:')) return await sticky.handle(interaction, client);
        if (id.startsWith('lvlui:') || id.startsWith('lvl:')) return await levels.handle(interaction, client);
        if (id.startsWith('joingate:')) return await joinGate.handle(interaction, client);
        if (id.startsWith('permguard:')) return await permGuard.handle(interaction, client);
        // Çekiliş paneli: düğmeleri index.js yönlendiriyor, seçim menüleri ve modalı burada
        if (id.startsWith('gw_') && !interaction.isButton()) return await require('../commands/cekilis').handlePanelComponent(interaction, client);
      }
    } catch (e) {
      console.error('[features] interaction hatası:', e);
      try {
        const msg = { content: '❌ Something went wrong.', ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(msg); else await interaction.reply(msg);
      } catch (_) {}
    }
  });

  client.on('messageCreate', (message) => {
    try { buddy.onMessage(message); } catch (e) { console.error('[buddy] mesaj:', e.message); }
    ticketTranslate.onMessage(message).catch((e) => console.error('[ticket-translate]', e.message));
    bump.onMessage(message).catch((e) => console.error('[bump]', e.message));
    mentionSpam.onMessage(message).catch((e) => console.error('[mention-spam]', e.message));
    try { sticky.onMessage(message); } catch (e) { console.error('[sticky] mesaj:', e.message); }
    // Spam filtresine takılan mesaj XP kazandırmaz
    spamFilters.onMessage(message)
      .then((hit) => (hit ? null : levels.onMessage(message)))
      .catch((e) => console.error('[spam/levels]', e.message));
  });

  client.on('guildMemberUpdate', (oldMember, newMember) => {
    timeoutDm.onMemberUpdate(oldMember, newMember).catch((e) => console.error('[timeout-dm]', e.message));
  });

  emojiLayer.install(client);
  if (client.isReady()) mascotEmoji.init(client); else client.once('clientReady', () => mascotEmoji.init(client));

  const every = (ms, fn) => { const t = setInterval(() => { Promise.resolve(fn()).catch((e) => console.error('[features]', e.message)); }, ms); t.unref?.(); };
  every(30 * 1000, () => jury.sweep(client));
  every(60 * 1000, () => buddy.tick(client));
  every(10 * 60 * 1000, () => buddy.refreshCards(client));
  every(30 * 60 * 1000, () => weekly.tick(client));
  every(60 * 1000, () => bump.tick(client));
  every(15 * 60 * 1000, () => ticketTools.tick(client));
  every(30 * 1000, () => levels.flush());
  every(60 * 1000, () => levels.voiceTick(client));

  console.log('✨ Yeni özellikler yüklendi: Jury, Appeals, Parole, Gate, Weekly, Ticket Translate, Buddy');
}

module.exports = { init };
