/**
 * test-emojis-and-rich-messages.js
 * 
 * Verifies Telegram custom emojis, button custom emoji icons, and rich message API routing.
 */

const assert = require('assert');

const EMOJI = {
  ONLINE:    { id: '5416081784641168838', fallback: '🟢' },
  OFFLINE:   { id: '5411225014148014586', fallback: '🔴' },
  PENDING:   { id: '5386367538735104399', fallback: '🟡' },
  ALERT:     { id: '5395695537687123235', fallback: '🚨' },
  RECOVERY:  { id: '5774022692642492953', fallback: '✅' },
  SHIELD:    { id: '5784993237412351403', fallback: '🛡️' },
  ROCKET:    { id: '5857290546459973028', fallback: '🚀' },
  DASHBOARD: { id: '5231200819986047254', fallback: '📊' },
  LIGHTNING: { id: '5456140674028019486', fallback: '⚡' },
  BELL:      { id: '5458603043203327669', fallback: '🔔' },
  KEY:       { id: '6005570495603282482', fallback: '🔑' },
  GLOBE:     { id: '5447410659077661506', fallback: '🌐' },
  SERVER:    { id: '5282843764451195532', fallback: '🖥️' },
  GEAR:      { id: '5787237370709413702', fallback: '⚙️' },
  TRASH:     { id: '5445267414562389170', fallback: '🗑️' },
  CLOCK:     { id: '5778496382117613636', fallback: '🕒' },
  WARNING:   { id: '5447644880824181073', fallback: '⚠️' },
  ADD:       { id: '5877219383691972108', fallback: '➕' },
  SERVICES:  { id: '5875462364110787088', fallback: '🗂️' },
  REFRESH:   { id: '5839200986022812209', fallback: '🔄' },
  HOME:      { id: '5416041192905265756', fallback: '🏠' },
  BACK:      { id: '5877629862306385808', fallback: '🔙' },
  CANCEL:    { id: '5210952531676504517', fallback: '❌' },
  CHANNEL:   { id: '5771695636411847302', fallback: '📢' },
  GROUP:     { id: '5915556996215476302', fallback: '👥' },
  TIP:       { id: '5422439311196834318', fallback: '💡' }
};

function tgEmoji(key, customFallback) {
  const em = EMOJI[key];
  if (!em) return customFallback || '';
  const fallback = customFallback || em.fallback;
  return `<tg-emoji emoji-id="${em.id}">${fallback}</tg-emoji>`;
}

function cleanBtnText(text) {
  if (typeof text !== 'string') return text;
  const cleaned = text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || text;
}

function btn(text, callback_data, emojiKey, extra = {}) {
  const button = { text: cleanBtnText(text), callback_data, ...extra };
  if (emojiKey && EMOJI[emojiKey] && EMOJI[emojiKey].id) {
    button.icon_custom_emoji_id = EMOJI[emojiKey].id;
  }
  return button;
}

function isRichMessage(text) {
  const richTags = ['<h1', '<h2', '<h3', '<h4', '<h5', '<h6', '<table', '<details', '<summary', '<mark', '<sub', '<sup'];
  return typeof text === 'string' && richTags.some(t => text.toLowerCase().includes(t));
}

const UNICODE_TO_EMOJI_KEY = {
  '🟢': 'ONLINE', '🔴': 'OFFLINE', '🟡': 'PENDING', '⚪': 'PENDING',
  '🚨': 'ALERT', '✅': 'RECOVERY', '🛡️': 'SHIELD', '🛡': 'SHIELD',
  '🚀': 'ROCKET', '📊': 'DASHBOARD', '⚡️': 'LIGHTNING', '⚡': 'LIGHTNING',
  '🔔': 'BELL', '🔑': 'KEY', '🌐': 'GLOBE', '🖥️': 'SERVER', '🖥': 'SERVER',
  '⚙️': 'GEAR', '⚙': 'GEAR', '🗑️': 'TRASH', '🗑': 'TRASH',
  '🕒': 'CLOCK', '⏱️': 'CLOCK', '⏱': 'CLOCK', '⚠️': 'WARNING', '⚠': 'WARNING',
  '➕': 'ADD', '🗂️': 'SERVICES', '🗂': 'SERVICES', '🔄': 'REFRESH',
  '🏠': 'HOME', '🔙': 'BACK', '❌': 'CANCEL', '✖️': 'CANCEL', '✖': 'CANCEL',
  '📢': 'CHANNEL', '👥': 'GROUP', '💡': 'TIP', '⛔️': 'WARNING', '⛔': 'WARNING',
  '🔒': 'SHIELD', '🏷️': 'SERVICES', '🏷': 'SERVICES', '📡': 'ROCKET',
  '📋': 'SERVICES', '📝': 'SERVICES', '🎉': 'RECOVERY', '🏢': 'SERVER',
  '📍': 'GLOBE', '📶': 'DASHBOARD', '💬': 'TIP', '🧠': 'GEAR',
  '💾': 'SERVER', '🌍': 'GLOBE', '🐧': 'SERVER'
};

const UNICODE_EMOJI_KEYS_SORTED = Object.keys(UNICODE_TO_EMOJI_KEY).sort((a, b) => b.length - a.length);
const EMOJI_SANITIZE_REGEX = new RegExp(UNICODE_EMOJI_KEYS_SORTED.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + '|\\p{Extended_Pictographic}', 'gu');

function cleanMessageEmojis(text) {
  if (typeof text !== 'string') return text;

  const parts = text.split(/(<tg-emoji[^>]*>[\s\S]*?<\/tg-emoji>)/g);

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('<tg-emoji')) continue;

    parts[i] = parts[i].replace(EMOJI_SANITIZE_REGEX, (match) => {
      const key = UNICODE_TO_EMOJI_KEY[match];
      if (key && EMOJI[key]) {
        return tgEmoji(key);
      }
      return '';
    }).replace(/[\uFE0E\uFE0F]/g, '');
  }

  let joined = parts.join('');
  joined = joined.replace(/(<tg-emoji emoji-id="(\d+)">[^<]*<\/tg-emoji>)\s*(<tg-emoji emoji-id="\2">[^<]*<\/tg-emoji>)/g, '$1');
  return joined.replace(/ {2,}/g, ' ');
}

function copyBtn(text, copyText, emojiKey, extra = {}) {
  const button = { text: cleanBtnText(text), copy_text: { text: copyText }, ...extra };
  if (emojiKey && EMOJI[emojiKey] && EMOJI[emojiKey].id) {
    button.icon_custom_emoji_id = EMOJI[emojiKey].id;
  }
  return button;
}

function run() {
  console.log('🧪 Testing Telegram Rich Message & Premium Emoji Integration...\n');

  // Test 1: Rich Message Tag Detection
  console.log('1. Checking Rich Message tag detection:');
  const tableText = '<h2>Title</h2><table border="1"><tr><th>Col</th></tr></table>';
  assert.strictEqual(isRichMessage(tableText), true);
  console.log('   Table HTML -> Detected as Rich Message:', isRichMessage(tableText));

  const detailsText = '<details><summary>More info</summary>Body</details>';
  assert.strictEqual(isRichMessage(detailsText), true);
  console.log('   Details HTML -> Detected as Rich Message:', isRichMessage(detailsText));

  const plainText = '<b>Hello</b> World!';
  assert.strictEqual(isRichMessage(plainText), false);
  console.log('   Plain HTML -> Detected as Standard Message:', !isRichMessage(plainText));

  // Test 2: Button Custom Emoji Icons & Copy Text
  console.log('\n2. Checking InlineKeyboardButton icon_custom_emoji_id & copy_text generation:');
  const addBtn = btn('Add Service', 'm:newservice', 'ADD');
  assert.strictEqual(addBtn.icon_custom_emoji_id, '5877219383691972108');
  assert.strictEqual(addBtn.text, 'Add Service');
  console.log('   Add Button:   ', JSON.stringify(addBtn));

  // Verify normal emojis are stripped from button text
  const powerBtn = btn('⚡ Power Controls', 'm:vps_power', 'LIGHTNING');
  assert.strictEqual(powerBtn.text, 'Power Controls');
  assert.strictEqual(powerBtn.icon_custom_emoji_id, '5456140674028019486');
  console.log('   Cleaned Button:', JSON.stringify(powerBtn));

  const cBtn = copyBtn('Copy Secret Token', 'sec_test_token', 'KEY');
  assert.strictEqual(cBtn.icon_custom_emoji_id, '6005570495603282482');
  assert.strictEqual(cBtn.copy_text.text, 'sec_test_token');
  console.log('   Copy Button:  ', JSON.stringify(cBtn));

  // Test 3: Text Custom Emoji Tags
  console.log('\n3. Checking custom emoji HTML tags:');
  assert.strictEqual(tgEmoji('ONLINE'), '<tg-emoji emoji-id="5416081784641168838">🟢</tg-emoji>');
  console.log('   ONLINE:   ', tgEmoji('ONLINE'));

  // Test 4: Text Message Custom Emoji Conversion & Normal Emoji Stripping
  console.log('\n4. Checking message text custom emoji conversion:');
  const rawMsg = '⚡️ <b>Restart VPS 514 Requested!</b>\n⚙️ <b>Config</b>: <code>OK</code>';
  const cleanedMsg = cleanMessageEmojis(rawMsg);
  assert(cleanedMsg.includes('<tg-emoji emoji-id="5456140674028019486">'));
  assert(cleanedMsg.includes('<tg-emoji emoji-id="5787237370709413702">'));

  // Ensure no normal emoji exists outside of <tg-emoji>
  const msgWithoutCustomTags = cleanedMsg.replace(/<tg-emoji[^>]*>.*?<\/tg-emoji>/g, '');
  const hasRawEmoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u.test(msgWithoutCustomTags);
  assert.strictEqual(hasRawEmoji, false);
  console.log('   Converted Msg:\n' + cleanedMsg);
  console.log('   No raw emojis remaining outside tg-emoji:', !hasRawEmoji);

  console.log('\n🎉 ALL RICH MESSAGE & PREMIUM EMOJI TESTS PASSED!\n');
}

run();
