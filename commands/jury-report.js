const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { createCase, getCfg } = require('../features/jury');
const { tx } = require('../features/util');

// Mesaja sağ tık → Apps → "Send to Jury". Yönlendirme features/index.js içinde.
module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Send to Jury')
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false),

  async execute(interaction) {
    const g = interaction.guild;
    const eph = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!g) return;
    const cfg = getCfg(g.id);
    if (!cfg.enabled) return eph(tx(g.id, '❌ Jüri bu sunucuda kapalı. Yönetici `/jury` ile kurmalı.', '❌ The jury is off here. An admin must set it up with `/jury`.'));
    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
    const isJuror = interaction.member.roles.cache.has(cfg.roleId);
    if (!isStaff && !isJuror) return eph(tx(g.id, '❌ Dava açmak için yetkili ya da jüri üyesi olmalısın.', '❌ Only staff or jury members can open a case.'));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await createCase(g, interaction.targetMessage, interaction.user);
    const msg = {
      off: tx(g.id, '❌ Jüri kurulumu eksik.', '❌ Jury setup is incomplete.'),
      bot: tx(g.id, '❌ Bot mesajları jüriye gönderilemez.', '❌ Bot messages cannot be sent to the jury.'),
      protected: tx(g.id, '❌ Yöneticilerin mesajları jüriye gönderilemez.', '❌ Administrators\' messages cannot be sent to the jury.'),
      dup: tx(g.id, '❌ Bu mesaj için zaten açık bir dava var.', '❌ There is already an open case for this message.'),
      rate: tx(g.id, '❌ Saatte en fazla 3 dava açabilirsin.', '❌ You can open at most 3 cases per hour.'),
      pool: tx(g.id, '❌ Jüri havuzunda en az 3 uygun üye olmalı.', '❌ The jury pool needs at least 3 eligible members.'),
      channel: tx(g.id, '❌ Jüri kanalı bulunamadı.', '❌ Jury channel not found.'),
      send: tx(g.id, '❌ Jüri kanalına yazamıyorum.', '❌ I cannot post in the jury channel.'),
    };
    if (res.err) return interaction.editReply({ content: msg[res.err] || '❌' });
    return interaction.editReply({ content: tx(g.id, `⚖️ Dava #${res.id} jüriye gönderildi.`, `⚖️ Case #${res.id} was sent to the jury.`) });
  },
};
