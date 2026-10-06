/**
 * Aegis Ticket System V2 — HTML & TXT Transcript Generator
 * Discord Dark Theme inspired, fully self-contained HTML transcript.
 */

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatContent(content, guild) {
  if (!content) return '';
  let text = escapeHtml(content);

  // Code blocks ```code```
  text = text.replace(/```(?:(\w+)\n)?([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="codeblock"><code>${code}</code></pre>`;
  });

  // Inline code `code`
  text = text.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

  // Bold **text**
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italic *text*
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Strikethrough ~~text~~
  text = text.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // Blockquotes > text
  text = text.replace(/^>(?:>)?\s?(.*)$/gm, '<blockquote>$1</blockquote>');

  // Mentions <@ID>
  text = text.replace(/&lt;@!?(\d+)&gt;/g, (match, id) => {
    const member = guild?.members?.cache?.get(id);
    const name = member ? member.displayName : `User:${id}`;
    return `<span class="mention">@${escapeHtml(name)}</span>`;
  });

  // Channel mentions <#ID>
  text = text.replace(/&lt;#(\d+)&gt;/g, (match, id) => {
    const channel = guild?.channels?.cache?.get(id);
    const name = channel ? channel.name : `channel-${id}`;
    return `<span class="mention">#${escapeHtml(name)}</span>`;
  });

  // Role mentions <@&ID>
  text = text.replace(/&lt;@&amp;(\d+)&gt;/g, (match, id) => {
    const role = guild?.roles?.cache?.get(id);
    const name = role ? role.name : `Role:${id}`;
    return `<span class="mention">@${escapeHtml(name)}</span>`;
  });

  // Line breaks
  text = text.replace(/\n/g, '<br>');

  return text;
}

function generateHtmlTranscript({ guild, channel, ticket, messages, closedBy, rating }) {
  const sortedMessages = Array.from(messages.values()).reverse();
  const guildIcon = guild.iconURL({ size: 128, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
  const openDate = ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('tr-TR') : 'Bilinmiyor';
  const closeDate = new Date().toLocaleString('tr-TR');

  let ratingHtml = '';
  if (rating) {
    ratingHtml = `
      <div class="stat-badge rating-badge">
        <span class="badge-label">Memnuniyet:</span>
        <span class="badge-value">${'⭐'.repeat(rating)} (${rating}/5)</span>
      </div>`;
  }

  let messagesHtml = '';
  let lastAuthorId = null;

  for (const msg of sortedMessages) {
    const author = msg.author;
    const isBot = author.bot;
    const avatarUrl = author.displayAvatarURL({ size: 64, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const timeStr = msg.createdAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const fullDate = msg.createdAt.toLocaleString('tr-TR');
    const isContinuation = lastAuthorId === author.id;
    lastAuthorId = author.id;

    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.size > 0) {
      for (const [, att] of msg.attachments) {
        const isImg = att.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(att.name);
        if (isImg) {
          attachmentsHtml += `
            <div class="msg-attachment">
              <a href="${escapeHtml(att.url)}" target="_blank" rel="noopener noreferrer">
                <img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name)}" loading="lazy" class="attachment-img" />
              </a>
            </div>`;
        } else {
          const sizeKb = Math.round((att.size || 0) / 1024);
          attachmentsHtml += `
            <div class="msg-file">
              <div class="file-icon">📁</div>
              <div class="file-info">
                <a href="${escapeHtml(att.url)}" target="_blank" class="file-name">${escapeHtml(att.name)}</a>
                <span class="file-size">${sizeKb} KB</span>
              </div>
            </div>`;
        }
      }
    }

    let embedsHtml = '';
    if (msg.embeds && msg.embeds.length > 0) {
      for (const embed of msg.embeds) {
        const colorHex = embed.color ? '#' + embed.color.toString(16).padStart(6, '0') : '#5865f2';
        embedsHtml += `
          <div class="msg-embed" style="border-left-color: ${colorHex}">
            ${embed.title ? `<div class="embed-title">${escapeHtml(embed.title)}</div>` : ''}
            ${embed.description ? `<div class="embed-desc">${formatContent(embed.description, guild)}</div>` : ''}
            ${embed.fields && embed.fields.length ? `
              <div class="embed-fields">
                ${embed.fields.map(f => `
                  <div class="embed-field ${f.inline ? 'inline' : ''}">
                    <div class="field-name">${escapeHtml(f.name)}</div>
                    <div class="field-value">${formatContent(f.value, guild)}</div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>`;
      }
    }

    const contentFormatted = formatContent(msg.content, guild);

    if (isContinuation) {
      messagesHtml += `
        <div class="msg-group continuation">
          <div class="msg-timestamp-short" title="${fullDate}">${timeStr}</div>
          <div class="msg-body">
            ${contentFormatted ? `<div class="msg-text">${contentFormatted}</div>` : ''}
            ${attachmentsHtml}
            ${embedsHtml}
          </div>
        </div>`;
    } else {
      messagesHtml += `
        <div class="msg-group">
          <img src="${avatarUrl}" class="msg-avatar" alt="${escapeHtml(author.tag)}" />
          <div class="msg-content-wrapper">
            <div class="msg-header">
              <span class="msg-author">${escapeHtml(author.displayName || author.username)}</span>
              ${isBot ? '<span class="bot-tag">BOT</span>' : ''}
              <span class="msg-timestamp" title="${fullDate}">${fullDate}</span>
            </div>
            <div class="msg-body">
              ${contentFormatted ? `<div class="msg-text">${contentFormatted}</div>` : ''}
              ${attachmentsHtml}
              ${embedsHtml}
            </div>
          </div>
        </div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aegis Ticket Transkript — ${escapeHtml(ticket.id || channel.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #313338;
      color: #dbdee1;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.4;
      padding: 24px 16px;
      display: flex;
      justify-content: center;
    }
    .transcript-container {
      width: 100%;
      max-width: 960px;
      background-color: #2b2d31;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      border: 1px solid #1e1f22;
    }
    .header-bar {
      background: linear-gradient(135deg, #1e1f22 0%, #2b2d31 100%);
      padding: 24px;
      border-bottom: 2px solid #383a40;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 20px;
    }
    .guild-icon {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      object-fit: cover;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      border: 2px solid #5865f2;
    }
    .header-info {
      flex: 1;
      min-width: 250px;
    }
    .header-title {
      font-size: 24px;
      font-weight: 700;
      color: #f2f3f5;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .ticket-badge {
      background-color: #5865f2;
      color: #fff;
      font-size: 13px;
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: 600;
    }
    .header-subtitle {
      font-size: 14px;
      color: #949ba4;
      margin-top: 4px;
    }
    .stats-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      background-color: #1e1f22;
      padding: 14px 24px;
      border-bottom: 1px solid #383a40;
      font-size: 13px;
    }
    .stat-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #2b2d31;
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid #383a40;
    }
    .badge-label { color: #949ba4; font-weight: 500; }
    .badge-value { color: #f2f3f5; font-weight: 600; }
    .rating-badge { border-color: #f1c40f; background: rgba(241, 196, 15, 0.1); }
    .rating-badge .badge-value { color: #f1c40f; }
    .messages-area {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .msg-group {
      display: flex;
      gap: 16px;
      padding: 4px 8px;
      border-radius: 6px;
      transition: background-color 0.15s;
    }
    .msg-group:hover {
      background-color: #2e3035;
    }
    .msg-avatar {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .msg-content-wrapper {
      flex: 1;
      min-width: 0;
    }
    .msg-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 4px;
    }
    .msg-author {
      font-size: 15px;
      font-weight: 600;
      color: #f2f3f5;
    }
    .bot-tag {
      background-color: #5865f2;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .msg-timestamp {
      font-size: 11px;
      color: #949ba4;
    }
    .msg-group.continuation {
      margin-top: -10px;
      padding-left: 66px;
      position: relative;
    }
    .msg-timestamp-short {
      position: absolute;
      left: 12px;
      font-size: 10px;
      color: #949ba4;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .msg-group.continuation:hover .msg-timestamp-short {
      opacity: 1;
    }
    .msg-text {
      font-size: 14.5px;
      color: #dbdee1;
      word-break: break-word;
    }
    .codeblock {
      background-color: #1e1f22;
      border: 1px solid #111214;
      border-radius: 6px;
      padding: 10px 12px;
      margin-top: 6px;
      font-family: monospace;
      font-size: 13px;
      color: #e0e1e5;
      overflow-x: auto;
    }
    .inline-code {
      background-color: #1e1f22;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 85%;
    }
    .mention {
      background-color: rgba(88, 101, 242, 0.3);
      color: #c9cdfb;
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 500;
    }
    blockquote {
      border-left: 4px solid #4e5058;
      padding-left: 10px;
      margin: 4px 0;
      color: #949ba4;
    }
    .msg-attachment {
      margin-top: 8px;
    }
    .attachment-img {
      max-width: 100%;
      max-height: 400px;
      border-radius: 8px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    }
    .msg-file {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background-color: #1e1f22;
      padding: 10px 14px;
      border-radius: 8px;
      margin-top: 6px;
      border: 1px solid #383a40;
    }
    .file-name {
      color: #00a8fc;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
    }
    .file-name:hover { text-decoration: underline; }
    .file-size { color: #949ba4; font-size: 11px; margin-left: 6px; }
    .msg-embed {
      background-color: #1e1f22;
      border-left: 4px solid #5865f2;
      border-radius: 4px;
      padding: 12px 16px;
      margin-top: 8px;
      max-width: 520px;
    }
    .embed-title {
      font-size: 15px;
      font-weight: 700;
      color: #f2f3f5;
      margin-bottom: 6px;
    }
    .embed-desc {
      font-size: 13.5px;
      color: #dbdee1;
    }
    .footer-bar {
      background-color: #1e1f22;
      padding: 16px 24px;
      border-top: 1px solid #383a40;
      text-align: center;
      font-size: 12px;
      color: #949ba4;
    }
    .footer-bar a { color: #5865f2; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="transcript-container">
    <div class="header-bar">
      <img src="${guildIcon}" alt="${escapeHtml(guild.name)}" class="guild-icon" />
      <div class="header-info">
        <div class="header-title">
          <span>${escapeHtml(guild.name)}</span>
          <span class="ticket-badge">${escapeHtml(ticket.id || channel.name)}</span>
        </div>
        <div class="header-subtitle">Aegis Guard Destek Talebi Arşivi</div>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat-badge">
        <span class="badge-label">Açan:</span>
        <span class="badge-value">${escapeHtml(ticket.userTag || ticket.userId || 'Bilinmiyor')}</span>
      </div>
      <div class="stat-badge">
        <span class="badge-label">Kapatan:</span>
        <span class="badge-value">${escapeHtml(closedBy?.tag || closedBy?.username || 'Yetkili')}</span>
      </div>
      <div class="stat-badge">
        <span class="badge-label">Açılış:</span>
        <span class="badge-value">${openDate}</span>
      </div>
      <div class="stat-badge">
        <span class="badge-label">Kapanış:</span>
        <span class="badge-value">${closeDate}</span>
      </div>
      <div class="stat-badge">
        <span class="badge-label">Toplam Mesaj:</span>
        <span class="badge-value">${sortedMessages.length}</span>
      </div>
      ${ratingHtml}
    </div>

    <div class="messages-area">
      ${messagesHtml || '<div style="text-align: center; color: #949ba4;">Bu kanalda hiç mesaj bulunamadı.</div>'}
    </div>

    <div class="footer-bar">
      Aegis Destek Sistemi • <a href="https://aegis.kimchidev.com.tr" target="_blank">Aegis Bot</a> tarafından oluşturuldu • ${closeDate}
    </div>
  </div>
</body>
</html>`;
}

function generateTextTranscript(messages) {
  return Array.from(messages.values())
    .reverse()
    .map(m => `[${m.createdAt.toLocaleString('tr-TR')}] ${m.author.tag}: ${m.content}${m.attachments && m.attachments.size > 0 ? ' [Ek: ' + Array.from(m.attachments.values()).map(a => a.name).join(', ') + ']' : ''}`)
    .join('\n');
}

module.exports = {
  generateHtmlTranscript,
  generateTextTranscript,
};
