require('dotenv').config({ path: __dirname + '/.env' });

const https = require('https');
const key = process.env.GEMINI_API_KEY;

console.log('API Key:', key ? 'SET (' + key.slice(0, 10) + '...)' : 'NOT SET');

const req = https.get('https://generativelanguage.googleapis.com/v1beta/models?key=' + key, res => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Raw response length:', data.length);
    try {
      const parsed = JSON.parse(data);
      const models = parsed.models || [];
      console.log('Total models:', models.length);
      models.filter(m => m.supportedGenerationMethods?.includes('generateContent')).forEach(m => console.log(' -', m.name));
    } catch (e) {
      console.log('Parse error:', e.message);
      console.log('First 500 chars:', data.slice(0, 500));
    }
  });
});

req.on('error', e => console.log('Request error:', e.message));
req.setTimeout(10000, () => { req.destroy(); console.log('Timeout'); });