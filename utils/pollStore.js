// Anket v2 kalıcı depo: data/polls.json (atomik yazma). Yeniden başlatmada anketler ve oylar korunur.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'polls.json');
let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

function save() {
  const tmp = `${FILE}.tmp`;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(load()));
  fs.renameSync(tmp, FILE);
}

module.exports = {
  get: (messageId) => load()[messageId] || null,
  set(poll) {
    load()[poll.id] = poll;
    save();
    return poll;
  },
  save,
  remove(messageId) {
    delete load()[messageId];
    save();
  },
  /** Süresi dolmamış, bitmemiş tüm anketler */
  active: () => Object.values(load()).filter((p) => !p.ended),
  /** 60 günden eski bitmiş anketleri temizle */
  prune() {
    const limit = Date.now() - 60 * 24 * 60 * 60 * 1000;
    let changed = false;
    for (const [id, p] of Object.entries(load())) {
      if (p.ended && (p.endedAt || p.endAt || 0) < limit) {
        delete cache[id];
        changed = true;
      }
    }
    if (changed) save();
  },
};
