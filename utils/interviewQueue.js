/**
 * Aegis Roleplay Interview Queue Manager
 * Keeps track of candidates waiting in the voice interview room
 */

const queues = new Map(); // guildId -> Array<{ userId, joinedAt, tag }>

function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, []);
  }
  return queues.get(guildId);
}

function addToQueue(guildId, userId, tag = "") {
  const queue = getQueue(guildId);
  if (queue.some(item => item.userId === userId)) {
    return { added: false, position: queue.findIndex(i => i.userId === userId) + 1 };
  }
  queue.push({
    userId,
    joinedAt: Date.now(),
    tag
  });
  return { added: true, position: queue.length };
}

function removeFromQueue(guildId, userId) {
  const queue = getQueue(guildId);
  const idx = queue.findIndex(item => item.userId === userId);
  if (idx !== -1) {
    queue.splice(idx, 1);
    return true;
  }
  return false;
}

function getNextCandidate(guildId) {
  const queue = getQueue(guildId);
  if (queue.length === 0) return null;
  return queue.shift();
}

function getQueuePosition(guildId, userId) {
  const queue = getQueue(guildId);
  const idx = queue.findIndex(item => item.userId === userId);
  return idx === -1 ? -1 : idx + 1;
}

function isInQueue(guildId, userId) {
  const queue = getQueue(guildId);
  return queue.some(item => item.userId === userId);
}

function clearQueue(guildId) {
  queues.set(guildId, []);
}

module.exports = {
  getQueue,
  addToQueue,
  removeFromQueue,
  getNextCandidate,
  getQueuePosition,
  isInQueue,
  clearQueue
};
