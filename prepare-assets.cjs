const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const directory = path.join(__dirname, 'dist');
const read = (file) => fs.readFileSync(path.join(directory, file), 'utf8');
const fingerprint = (content) => crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
const client = read('lesson.js') + '\n;\n' + read('app.js');
new vm.Script(client, { filename: 'lesson-client.js' });
const clientName = 'client.' + fingerprint(client) + '.js';
const css = read('style.css');
const cssName = 'style.' + fingerprint(css) + '.css';
fs.writeFileSync(path.join(directory, clientName), client);
fs.writeFileSync(path.join(directory, cssName), css);

let html = read('index.html');
html = html.replace(/^[\t ]*<script\b[^>]*\bsrc="(?:lesson\.js|app\.js|client\.[a-f0-9]{12}\.js)"[^>]*>\s*<\/script>\s*/gm, '');
html = html.replace(/href="style(?:\.[a-f0-9]{12})?\.css"/, 'href="' + cssName + '"');
html = html.replace(/\s*<\/body>/, '\n    <script src="' + clientName + '" defer></script>\n  </body>');
fs.writeFileSync(path.join(directory, 'index.html'), html);
console.log('Prepared ' + clientName + ' and ' + cssName);
