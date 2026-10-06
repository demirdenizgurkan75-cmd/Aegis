/** /automod panelindeki ek kontroller (etiket spam'i). customId'ler "automodx:" ile başlar; Sunucuyu Yönet yetkisi gerekir. */
const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getCfg, saveCfg } = require('./mentionSpam');
const { tx } = require('./util');

const canManage = (m) => !!(m?.permissions?.has(PermissionFlagsBits.ManageGuild) || m?.permissions?.has(PermissionFlagsBits.Administrator));

async function handle(interaction) {
  const g = interaction.guild;
  if (!g) return;
  interaction.__globalHandled = true; // panel collector'ı aynı etkileşimi tekrar işlemesin
  if (!canManage(interaction.member)) return interaction.reply({ content: tx(g.id, '❌ Sunucuyu Yönet yetkisi gerekli.', '❌ Manage Server permission required.'), flags: MessageFlags.Ephemeral }).catch(() => {});
  const cfg = getCfg(g.id);
  const refresh = () => {
    const { buildAutoModPanel } = require('../commands/automod');
    return interaction.update({ components: [buildAutoModPanel(g.id)], flags: MessageFlags.IsComponentsV2 });
  };
  if (interaction.customId === 'automodx:mention') { cfg.enabled = !cfg.enabled; saveCfg(g.id, cfg); return refresh(); }
  if (interaction.customId === 'automodx:mentionset') {
    const input = (id, label, value) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5).setValue(String(value)));
    return interaction.showModal(new ModalBuilder().setCustomId('automodx:mentionsave').setTitle(tx(g.id, 'Etiket spam sınırı', 'Mention spam limit')).addComponents(
      input('limit', tx(g.id, 'Puan sınırı (3-50). Kişi 1, rol 3 puan', 'Point limit (3-50). Person 1, role 3'), cfg.limit),
      input('minutes', tx(g.id, 'Susturma süresi, dakika (1-1440)', 'Timeout length, minutes (1-1440)'), cfg.timeoutMin)));
  }
  if (interaction.customId.startsWith('automodx:spam')) {
    const sf = require('./spamFilters');
    const sc = sf.getCfg(g.id);
    if (interaction.customId === 'automodx:spam') { sc.enabled = !sc.enabled; sf.saveCfg(g.id, sc); return refresh(); }
    if (interaction.customId === 'automodx:spamf') {
      const v = new Set(interaction.values || []);
      for (const f of sf.FILTERS) sc[f] = v.has(f);
      sf.saveCfg(g.id, sc); return refresh();
    }
    if (interaction.customId === 'automodx:spamset') {
      return interaction.showModal(new ModalBuilder().setCustomId('automodx:spamsave').setTitle(tx(g.id, 'Spam filtresi susturması', 'Spam filter timeout')).addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('minutes').setLabel(tx(g.id, 'İlk susturma, dakika (1-60). Sonra ikiye katlanır', 'First timeout, minutes (1-60). Then it doubles'))
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setValue(String(sc.baseMin)))));
    }
    if (interaction.customId === 'automodx:spamsave') {
      const n = parseInt(interaction.fields.getTextInputValue('minutes'), 10);
      if (Number.isFinite(n)) sc.baseMin = Math.min(60, Math.max(1, n));
      sf.saveCfg(g.id, sc); return refresh();
    }
  }
  if (interaction.customId === 'automodx:mentionsave') {
    const num = (k, lo, hi, d) => { const n = parseInt(interaction.fields.getTextInputValue(k), 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    cfg.limit = num('limit', 3, 50, cfg.limit); cfg.timeoutMin = num('minutes', 1, 1440, cfg.timeoutMin); saveCfg(g.id, cfg);
    return refresh();
  }
}

module.exports = { handle };
