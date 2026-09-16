const { ChannelType } = require('discord.js');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(date) {
  return new Date(date)
    .toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(/،/g, ' ');
}

function generateTranscript(messages, channel, guild) {
  const rows = [...messages.values()]
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((msg) => {
      const author = msg.author;
      const avatar = author.displayAvatarURL({ extension: 'png', size: 64 });
      const contact = msg.content
        ? `<div class="content">${escapeHtml(msg.content)}</div>`
        : '';
      const embeds = msg.embeds
        .map(
          (embed) =>
            `<div class="embed"><b>${escapeHtml(embed.title || '')}</b><p>${escapeHtml(
              embed.description || ''
            )}</p></div>`
        )
        .join('');
      const attachments = msg.attachments
        .map(
          (att) =>
            `<div class="attachments"><a href="${att.url}" target="_blank">📎 ${escapeHtml(
              att.name
            )}</a></div>`
        )
        .join('');
      return `
      <div class="message">
        <img class="avatar" src="${avatar}" alt="" />
        <div class="body">
          <div class="meta">
            <span class="name">${escapeHtml(author.username)}</span>
            <span class="time">${formatDate(msg.createdAt)}</span>
            ${
              msg.author.bot
                ? '<span class="badge">Bot</span>'
                : `<span class="badge">${escapeHtml(author.id)}</span>`
            }
          </div>
          ${contact}
          ${embeds}
          ${attachments}
        </div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ترانسكريبت التذكرة — ${escapeHtml(channel.name)}</title>
<style>
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    background: #1e1f29;
    color: #e0e0e0;
    margin: 0;
    padding: 24px;
  }
  .header {
    background: #2b2d3a;
    border-radius: 12px;
    padding: 20px 24px;
    margin-bottom: 20px;
    border-right: 5px solid #5865f2;
  }
  .header h1 { margin: 0; font-size: 22px; }
  .header p { margin: 6px 0 0; color: #9a9db0; }
  .message {
    display: flex;
    gap: 12px;
    background: #262833;
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 8px;
  }
  .avatar { width: 42px; height: 42px; border-radius: 50%; }
  .body { flex: 1; }
  .meta { display: flex; gap: 10px; align-items: center; margin-bottom: 4px; }
  .name { font-weight: 700; color: #ffffff; }
  .time { font-size: 12px; color: #9a9db0; }
  .badge {
    font-size: 11px;
    background: #5865f2;
    color: #fff;
    padding: 2px 8px;
    border-radius: 20px;
  }
  .content { white-space: pre-wrap; word-break: break-word; }
  .embed {
    background: #1e1f29;
    border-left: 4px solid #5865f2;
    padding: 8px 12px;
    border-radius: 6px;
    margin-top: 6px;
  }
  .attachments { margin-top: 6px; }
  .attachments a { color: #7289da; text-decoration: none; }
  .footer {
    text-align: center;
    color: #9a9db0;
    font-size: 12px;
    margin-top: 24px;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>📄 ترانسكريبت التذكرة</h1>
    <p>السيرفر: ${escapeHtml(guild.name)} — القناة: ${escapeHtml(
    channel.name
  )} — عدد الرسائل: ${messages.size}</p>
  </div>
  ${rows}
  <div class="footer">تم إنشاء هذا الترانسكريبت بواسطة بوت التذاكر • ${formatDate(
    Date.now()
  )}</div>
</body>
</html>`;
}

module.exports = { generateTranscript };