function bar(percent) {
  const filled = Math.round((percent / 100) * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

export function formatTelegram({ symbol, mode, trend, signal, confirmation, zone, strength, lastPrice, lastTime }) {
  const zFrom = zone?.from != null ? zone.from.toFixed(2) : '-';
  const zTo = zone?.to != null ? zone.to.toFixed(2) : '-';
  const priceStr = lastPrice != null ? lastPrice.toFixed(2) : '-';
  const timeStr = lastTime ? new Date(lastTime).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '';
  const tz = process.env.BOT_TZ || process.env.TIMEZONE || 'Asia/Kuala_Lumpur';
  let localStr = '';
  if (lastTime) {
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
      const parts = fmt.formatToParts(new Date(lastTime)).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
      localStr = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${tz}`;
    } catch {}
  }
  return [
    `💎 ${symbol}`,
    `Mode: ${mode}`,
    `Price: ${priceStr}${timeStr ? '  (' + timeStr + ')' : ''}${localStr ? '\nTime: ' + localStr : ''}`,
    `Trend: ${trend}`,
    `Signal: ${signal}`,
    `Confirmation: ${confirmation && confirmation !== 'None' ? '✅ ' + confirmation : '❌ None'}`,
    `Zone: ${zFrom} – ${zTo}`,
    `Strength: ⚡ [${bar(strength)}] ${strength}%`
  ].join('\n');
}


