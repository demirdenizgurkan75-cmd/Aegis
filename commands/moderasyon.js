const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { addWarning, getWarnings } = require('../utils/database');
const { sendChannelLog } = require('../utils/logger');
const { recordCase, applyWarnPolicy } = require('../features/modlog');
const { sendPunishDm } = require('../features/punishDm');
const { createTranslator, getGuildLanguage } = require('../utils/i18n');

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord sınırı

// Süre: 10dk · 30s (saniye) · 2sa · 1g  /  10m · 1h · 1d. "s" saniyedir, saat için "sa" ya da "h" kullanılır.
function parseDuration(input) {
  if (!input) return null;
  const m = String(input).trim().match(/^(\d+)\s*(sn|saniye|sec|second|seconds|s|dk|dakika|min|minute|minutes|m|sa|saat|hour|hours|h|g|gün|gun|day|days|d)$/i);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  if (['sn', 'saniye', 'sec', 'second', 'seconds', 's'].includes(u)) return v * 1000;
  if (['dk', 'dakika', 'min', 'minute', 'minutes', 'm'].includes(u)) return v * 60 * 1000;
  if (['sa', 'saat', 'hour', 'hours', 'h'].includes(u)) return v * 60 * 60 * 1000;
  return v * 24 * 60 * 60 * 1000;
}

function fmtDuration(ms, isEn) {
  const d = ms / 86400000, h = ms / 3600000, mi = ms / 60000;
  if (d >= 1 && Number.isInteger(d)) return `${d}${isEn ? 'd' : 'g'}`;
  if (h >= 1 && Number.isInteger(h)) return `${h}${isEn ? 'h' : 'sa'}`;
  if (mi >= 1) return `${Math.round(mi)}${isEn ? 'm' : 'dk'}`;
  return `${Math.round(ms / 1000)}${isEn ? 's' : 'sn'}`;
}

// Eylem → gereken yetki. Komut izinleri sunucuda değiştirilebildiği için her eylem ayrıca denetlenir.
const NEEDS = {
  warn: PermissionFlagsBits.ModerateMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
  purge: PermissionFlagsBits.ManageMessages,
};

function resultPanel(color, title, body) {
  const c = new ContainerBuilder().setAccentColor(color);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  c.addSeparatorComponents(new SeparatorBuilder());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mod_close').setLabel('✕').setStyle(ButtonStyle.Secondary)
  ));
  return { components: [c], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Moderasyon paneli: uyar, sustur, at, banla, temizle / Moderation panel')
    // Görünürlük için en düşük yetki; her eylemin kendi yetkisi komut içinde ayrıca denetlenir.
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  NEEDS,
  parseDuration,

  async execute(interaction) { return require('../features/modPanel').open(interaction); },

  /** Panelin modallarından gelen işlem. opts: { user, action, reason, durationStr, amount } */
  async perform(interaction, { user, action, reason: rawReason, durationStr, amount }) {
    const guild = interaction.guild;
    const eph = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!guild) return eph(':aegis_no: Sunucuda kullanılmalı. / Use this in a server.');

    const isEn = getGuildLanguage(guild.id) === 'en';
    const L = (tr, en) => (isEn ? en : tr);
    const t = createTranslator(guild.id);
    const reason = String(rawReason || '').trim().slice(0, 400) || L('Sebep belirtilmedi', 'No reason specified');

    if (!interaction.memberPermissions?.has(NEEDS[action])) {
      return eph(L(':aegis_no: Bu eylem için yetkin yok.', ':aegis_no: You do not have permission for this action.'));
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    // Ban sunucudan ayrılmış birine de uygulanabilir (ID ile ban); diğer eylemler üye ister.
    if (!member && action !== 'purge' && action !== 'ban') return eph(L(':aegis_no: Kullanıcı sunucuda bulunamadı.', ':aegis_no: Member not found in this server.'));

    if (action !== 'purge') {
      if (user.id === interaction.user.id) return eph(L(':aegis_no: Kendini modere edemezsin.', ':aegis_no: You cannot moderate yourself.'));
      if (user.id === guild.ownerId) return eph(L(':aegis_no: Sunucu sahibi modere edilemez.', ':aegis_no: The server owner cannot be moderated.'));
      if (user.id === interaction.client.user.id) return eph(L(':aegis_confused: Beni mi modere edeceksin?', ':aegis_confused: You want to moderate me?'));
      if (member) {
        if (member.roles.highest.position >= interaction.member.roles.highest.position && guild.ownerId !== interaction.user.id) {
          return eph(L(':aegis_no: Bu kullanıcının rolü seninkinden yüksek ya da eşit.', ':aegis_no: This user has a role equal to or higher than yours.'));
        }
        const botCan = { warn: true, timeout: member.moderatable, kick: member.kickable, ban: member.bannable }[action];
        if (!botCan) return eph(L(':aegis_no: Bu kullanıcıya işlem yapamıyorum: botun rolü onun rolünün üstünde olmalı.', ':aegis_no: I cannot act on this user: my role must be above theirs.'));
      }
    }

    try {
      switch (action) {
        case 'warn': {
          const warnList = addWarning(guild.id, user.id, interaction.user.id, reason);
          const warn = warnList[warnList.length - 1];
          const total = getWarnings(guild.id, user.id).length;
          const kase = recordCase(guild.id, { type: 'warn', userId: user.id, modId: interaction.user.id, reason, warnId: warn?.id });
          await sendChannelLog(guild, 'warn', interaction.user, user, reason);
          const auto = await applyWarnPolicy(guild, member, interaction.client, total); // N uyarıda otomatik timeout
          // Jüri itirazları açıksa uyarıyı alan üyeye itiraz yolunu özelden bildir
          try {
            const jury = require('../features/jury').getCfg(guild.id);
            if (jury.enabled && jury.appeals) {
              await user.send(L(`${guild.name}: bir uyarı aldın (${reason}). Haksız olduğunu düşünüyorsan sunucuda \`/appeal\` ile jüriye itiraz edebilirsin.`, `${guild.name}: you received a warning (${reason}). If you think it is unfair you can appeal to the jury with \`/appeal\` in the server.`)).catch(() => {});
            }
          } catch (_) {}
          return interaction.reply(resultPanel(0xf0b232, L('⚠️ Uyarı verildi', '⚠️ Warning issued'),
            `**${L('Kullanıcı', 'User')}:** <@${user.id}>\n${t('moderation.reason', { reason })}\n**${L('Toplam uyarı', 'Total warnings')}:** ${total}\n**${L('Dava', 'Case')}:** #${kase.id}` +
            (auto ? `\n:aegis_alert: ${L(`Uyarı sınırına ulaştı: otomatik ${auto.minutes} dk timeout (dava #${auto.caseId}).`, `Warning limit reached: automatic ${auto.minutes} min timeout (case #${auto.caseId}).`)}` : '')));
        }

        case 'timeout': {
          const ms = parseDuration(durationStr);
          if (!ms) return eph(L(`:aegis_no: Geçersiz süre: ${durationStr || '(boş)'}. Örnekler: 30s, 10dk, 2sa, 1g`, `:aegis_no: Invalid duration: ${durationStr || '(empty)'}. Examples: 30s, 10m, 2h, 1d`));
          if (ms > MAX_TIMEOUT_MS) return eph(L(':aegis_no: Timeout en fazla 28 gün olabilir.', ':aegis_no: A timeout can be 28 days at most.'));
          await member.timeout(ms, reason);
          const duration = fmtDuration(ms, isEn);
          const kase = recordCase(guild.id, { type: 'timeout', userId: user.id, modId: interaction.user.id, reason, durationMs: ms });
          await sendChannelLog(guild, 'timeout', interaction.user, user, reason, duration);
          return interaction.reply(resultPanel(0xf0b232, L('🔇 Timeout uygulandı', '🔇 Timeout applied'),
            `**${L('Kullanıcı', 'User')}:** <@${user.id}>\n${t('moderation.reason', { reason })}\n${t('moderation.duration', { duration })}\n**${L('Dava', 'Case')}:** #${kase.id}`));
        }

        case 'kick': {
          const dm = await sendPunishDm(guild, user, 'kick', reason);
          try { await member.kick(reason); } catch (e) { await dm?.undo(); throw e; }
          const kase = recordCase(guild.id, { type: 'kick', userId: user.id, modId: interaction.user.id, reason });
          await sendChannelLog(guild, 'kick', interaction.user, user, reason);
          return interaction.reply(resultPanel(0xed4245, L('👢 Kick uygulandı', '👢 User kicked'),
            `**${L('Kullanıcı', 'User')}:** <@${user.id}>\n${t('moderation.reason', { reason })}\n**${L('Dava', 'Case')}:** #${kase.id}`));
        }

        case 'ban': {
          const dm = member ? await sendPunishDm(guild, user, 'ban', reason) : null;
          try { await guild.members.ban(user.id, { reason }); } catch (e) { await dm?.undo(); throw e; }
          const kase = recordCase(guild.id, { type: 'ban', userId: user.id, modId: interaction.user.id, reason });
          await sendChannelLog(guild, 'ban', interaction.user, user, reason);
          return interaction.reply(resultPanel(0xed4245, L('🔨 Ban uygulandı', '🔨 User banned'),
            `**${L('Kullanıcı', 'User')}:** <@${user.id}>${member ? '' : ` (${L('sunucuda değildi', 'was not in the server')})`}\n${t('moderation.reason', { reason })}\n**${L('Dava', 'Case')}:** #${kase.id}`));
        }

        case 'purge': {
          const count = Math.min(Math.max(amount || 10, 1), 100);
          const channel = interaction.channel;
          if (!channel?.bulkDelete) return eph(L(':aegis_no: Bu kanalda mesaj silinemez.', ':aegis_no: Messages cannot be deleted in this channel.'));
          const messages = await channel.messages.fetch({ limit: 100 });
          const deletable = messages.filter(m => !m.pinned).first(count);
          const deleted = await channel.bulkDelete(deletable, true);
          await sendChannelLog(guild, 'purge', interaction.user, null, `${deleted.size} ${L('mesaj', 'messages')} · <#${channel.id}>`);
          return interaction.reply(resultPanel(0x3ba55c, L('🧹 Mesajlar temizlendi', '🧹 Messages cleared'),
            L(`**${deleted.size}** mesaj silindi. (14 günden eski mesajlar Discord tarafından silinemez.)`, `**${deleted.size}** messages deleted. (Discord cannot delete messages older than 14 days.)`)));
        }
      }
    } catch (err) {
      console.error(`[moderation ${action}]`, err.message);
      return eph(L(':aegis_sad: İşlem tamamlanamadı. Botun yetkilerini ve rol sırasını kontrol et.', ':aegis_sad: The action could not be completed. Check my permissions and role order.'));
    }
  },
};
