'use strict';
/* Runs one judge job in a worker thread so a student's infinite loop can never freeze the server. */
const { parentPort, workerData } = require('worker_threads');
const { load } = require('./engines');
(async () => {
  const { CP, H, Core } = load();
  const ch = Core.byId(workerData.cid);
  const res = await Core.judge(String(workerData.code), ch, { CP, H });
  parentPort.postMessage({ ok: true, res });
})().catch(e => parentPort.postMessage({ ok: false, error: String(e && e.message || e) }));
