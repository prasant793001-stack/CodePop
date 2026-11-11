'use strict';
/* Loads the same engines the browser uses (C++ interpreter, HTML linter, shared core) so the server can re-judge every submission. */
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');
let loaded = null;
function load() {
  if (loaded) return loaded;
  const root = path.join(__dirname, '..');
  for (const f of ['src/content.js', 'src/cpp.js', 'src/html.js', 'shared/core.js']) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
  const Core = globalThis.CPCore;
  Core.setHmac((secret, msg) => crypto.createHmac('sha256', secret).update(msg).digest('hex'));
  loaded = { CP: globalThis.CP, H: globalThis.HTMLX, Core };
  return loaded;
}
module.exports = { load };
