/**
 * Komut panelleri ve cevapları herkese görünür olsun ("yalnızca sen görebilirsin" kalksın).
 * discord.js'in reply / followUp / deferReply çağrıları tek yerden sarılır:
 *  - slash komutlarının cevaplarında ve komut panellerinin düğme/menü/modal cevaplarında Ephemeral bayrağı kaldırılır
 *  - yalnızca düz metinli kısa uyarılar (hata, yetki, bekleme) gizli kalır
 *  - { __keepEphemeral: true } işaretli cevaplar her zaman gizli kalır (komut kilidi uyarısı gibi)
 *  - gate sınavı, jüri oyları, bilet düğmeleri, bağlam menüleri ve /appeal bu kapsamda değildir (kişiye özel akışlar)
 */
const discord = require('discord.js');

const EPHEMERAL = 64;
// Komut panellerinin customId önekleri (features/index.js yönlendirmesiyle aynı)
const PANEL_IDS = /^(gateui:|jury:ui:|paroleui:|weeklyui:|ticketaiui:|ttui:|tkhub:|modlogui:|modpanel:|aiui:|bumpui:|automodx:|cmdlock:|buddy:|gamesui:)/;

// Kişiye özel bilgi gösteren komutlar gizli kalır: /appeal kişinin kendi cezalarını, /suggest kendi önerilerini listeler;
// /sticky paneli açıkta kalırsa sabit mesajın durduğu kanalı doldurur
const PRIVATE_COMMANDS = new Set(['appeal', 'suggest', 'sticky']);

function isCommandPanel(i) {
  if (typeof i.isChatInputCommand === 'function' && i.isChatInputCommand()) return !PRIVATE_COMMANDS.has(i.commandName);
  return typeof i.customId === 'string' && PANEL_IDS.test(i.customId);
}

function flagsOf(v) { try { return discord.MessageFlagsBitField.resolve(v); } catch (_) { return 0; } }

/** Bu seçenekler gizli kalmalı mı? */
function keepPrivate(opts) {
  if (!opts || typeof opts !== 'object') return true;
  if (opts.__keepEphemeral) return true;
  const hasPanel = (Array.isArray(opts.components) && opts.components.length > 0) || (Array.isArray(opts.files) && opts.files.length > 0) || (Array.isArray(opts.embeds) && opts.embeds.length > 0);
  return !hasPanel; // yalnızca düz metin (hata/uyarı) gizli
}

function publicize(opts, always) {
  if (!opts || typeof opts !== 'object') return opts;
  if (!always && keepPrivate(opts)) return opts;
  if (opts.__keepEphemeral) return opts;
  const out = { ...opts };
  if (out.flags !== undefined) { const n = flagsOf(out.flags); if (n & EPHEMERAL) out.flags = n & ~EPHEMERAL; }
  if (out.ephemeral === true) delete out.ephemeral;
  return out;
}

function install() {
  const classes = [
    'ChatInputCommandInteraction', 'ButtonInteraction', 'StringSelectMenuInteraction', 'UserSelectMenuInteraction',
    'RoleSelectMenuInteraction', 'ChannelSelectMenuInteraction', 'MentionableSelectMenuInteraction', 'ModalSubmitInteraction',
  ];
  for (const name of classes) {
    const C = discord[name];
    if (!C || C.prototype.__publicReplies) continue;
    C.prototype.__publicReplies = true;
    for (const method of ['reply', 'followUp', 'deferReply', 'editReply']) {
      const orig = C.prototype[method];
      if (typeof orig !== 'function') continue;
      C.prototype[method] = function (opts, ...rest) {
        // editReply mesajın görünürlüğünü değiştiremez; gizli bayrağı taşıyan kartlar (aiTools.card) bozulmasın diye bayrak kaldırılır
        if (isCommandPanel(this)) opts = publicize(opts, method === 'deferReply' || method === 'editReply');
        return orig.call(this, opts, ...rest);
      };
    }
  }
}

module.exports = { install, publicize, keepPrivate, isCommandPanel, PANEL_IDS };
