/**
 * Timeout alan üyeye tek bir özel mesaj: kural sınavı teklifi (parole) + jüriye itiraz (appeal).
 * Hangisi açıksa o parça eklenir; ikisi de kapalıysa hiçbir şey gönderilmez.
 */
const { EmbedBuilder, ActionRowBuilder } = require('discord.js');
const parole = require('./parole');
const appeal = require('./appeal');
const { tx } = require('./util');
const { em } = require('./mascotEmoji');

const offered = new Set(); // gid:uid:until

async function onMemberUpdate(oldM, newM) {
  const d = parole.detectNewTimeout(oldM, newM);
  if (!d) return;
  const gid = newM.guild.id;
  const key = `${gid}:${newM.id}:${d.until}`;
  if (offered.has(key)) return;
  const parts = [parole.offer(newM, d.until, d.remaining), appeal.offer(newM, d.until)].filter(Boolean);
  if (!parts.length) return;
  offered.add(key);
  if (offered.size > 5000) offered.clear();

  const e = new EmbedBuilder().setColor(0x0066ff)
    .setTitle(tx(gid, `${newM.guild.name}: timeout aldın`, `${newM.guild.name}: you were timed out`))
    .setDescription(`${em('sad', '⏳')} ${tx(gid, `Kalan süre: **${parole.fmtDuration(d.remaining, gid)}**`, `Time left: **${parole.fmtDuration(d.remaining, gid)}**`)}\n\n${parts.map(p => p.text).join('\n\n')}`);
  await newM.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(parts.map(p => p.button))] }).catch(() => {});
}

module.exports = { onMemberUpdate };
