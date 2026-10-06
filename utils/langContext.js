/**
 * Olayın hangi sunucuda çalıştığını (AsyncLocalStorage) tutar: etkileşim, mesaj ve sunucu olayları başlarken kaydedilir,
 * o olayın içinden giden tüm REST çağrıları (cevaplar, DM'ler, loglar) aynı sunucu bağlamını görür.
 * features/emojiLayer.js bunu outputLocalizer ile birlikte kullanır.
 */
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

function guildIdOf(arg) {
  if (!arg || typeof arg !== 'object') return null;
  return arg.guildId || arg.guild?.id || (arg.constructor?.name === 'Guild' ? arg.id : null) || null;
}

/** İlk dinleyici olarak takılır; olay boyunca sunucu bağlamı kalır. */
function install(client) {
  if (client.__langContext) return;
  client.__langContext = true;
  const events = ['interactionCreate', 'messageCreate', 'guildCreate', 'guildMemberAdd', 'guildMemberRemove', 'guildMemberUpdate', 'messageUpdate', 'messageDelete', 'guildUpdate', 'channelCreate', 'channelDelete', 'roleCreate', 'roleDelete', 'webhooksUpdate'];
  for (const ev of events) {
    client.prependListener(ev, (a, b) => {
      const gid = guildIdOf(a) || guildIdOf(b);
      if (gid) als.enterWith({ guildId: gid });
    });
  }
}

const currentGuildId = () => als.getStore()?.guildId || null;

module.exports = { install, currentGuildId, als };
