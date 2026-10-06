const fs = require('fs');
const path = require('path');
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const names = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    if (Array.isArray(command.data)) {
      for (const cmd of command.data) {
        names.push(cmd.name);
      }
    } else {
      names.push(command.data.name);
    }
  }
}

const counts = {};
for (const n of names) counts[n] = (counts[n] || 0) + 1;

console.log('=== Duplicate Check ===');
Object.entries(counts).filter(([_, c]) => c > 1).forEach(([n, c]) => console.log('DUPLICATE:', n, 'x', c));

console.log('\n=== All Commands ===');
Object.keys(counts).sort().forEach(n => console.log(' -', n));

console.log('\nTotal unique:', Object.keys(counts).length);
console.log('Total commands:', names.length);