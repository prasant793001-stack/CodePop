/* ===== CodePop app: Arena hub (play, groups, top 10, me, reviewer console) ===== */
let hubTab = 'play', hubState = {}, me = null, installEv = null, pendingJoin = null, hubRid = 0;
const isSigned = () => !!me;
const fmtDate = ts => { const d = new Date(ts), n = Date.now() - ts; if (n < 6e4) return 'just now'; if (n < 36e5) return Math.floor(n / 6e4) + ' min ago'; if (n < 864e5) return Math.floor(n / 36e5) + ' h ago'; return d.toLocaleDateString(); };
const fmtLeft = ts => { const n = ts - Date.now(); if (n <= 0) return 'closed'; if (n < 36e5) return Math.ceil(n / 6e4) + ' min left'; if (n < 864e5) return Math.ceil(n / 36e5) + ' h left'; return Math.ceil(n / 864e5) + ' d left'; };
const medal = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '#' + r;
const ERRS = { login_required: 'Please sign in first.', locked: 'That challenge is still locked.', no_such_group: 'No group with that code.', bad_name: 'Pick a name with 2–30 letters or numbers.', bad_nickname: 'Nickname: 2–20 letters or numbers.', too_many_groups: 'You are in too many groups.', group_full: 'That group is full.', too_many_open: 'Too many open challenges in this group.', too_many_projects: 'You have 50 saved projects, delete one first.', slow_down: 'Slow down a little, try again in a minute.', bad_invitee: 'Pick a member to duel.', google_rejected: 'Google did not accept that sign-in.', reauth: 'For safety, sign out and sign in again to use the reviewer console.', judge_busy: 'The judge is busy, try again in a moment.', banned: 'This account is blocked.' };
const errText = e => ERRS[e && e.code] || ('Something went wrong (' + ((e && e.code) || 'network') + ')');
const rankRow = (r, extra) => '<div class="rank' + (r.me ? ' me' : '') + '"><span class="rn">' + medal(r.rank) + '</span><span class="av">' + esc(r.avatar) + '</span><span class="nm">' + esc(r.nickname) + (r.me ? ' (you)' : '') + (r.solved !== undefined ? '<small>' + r.solved + ' solved</small>' : '') + '</span><span class="pt">' + r.total + '</span>' + (extra || '') + '</div>';

function updateWho() {
  const w = $('#hubWho'); w.innerHTML = me ? '<i>' + esc(me.avatar) + '</i>' + esc(me.nickname) : esc('Not signed in'); w.hidden = false;
  $('#arenaBadge').hidden = !A;
}
async function refreshMe() { try { me = await Api.me(); } catch (e) { me = null; } updateWho(); return me; }
function openHub(tab, o) {
  if (tab) hubTab = tab; hubState = Object.assign({}, o || {}); $('#hub').hidden = false; sfx.tap();
  if (!HUB_TABS().some(x => x[0] === hubTab)) hubTab = 'play';
  renderHub(); refreshMe().then(() => { if (!$('#hub').hidden) renderHub(); });
}
function closeHub() { $('#hub').hidden = true; updateWho(); }
const HUB_TABS = () => [['play', '🎯', 'Play'], ['groups', '👥', 'Groups'], ['top', '🏆', 'Top 10'], ['me', '🙂', 'Me']].concat(me && me.isAdmin ? [['review', '🛡️', 'Review']] : []);
function renderHub() {
  const id = ++hubRid; $('#hubTitle').textContent = '🏆 ' + t('arena.title'); updateWho();
  $('#hubTabs').innerHTML = HUB_TABS().map(x => '<button data-tab="' + x[0] + '" aria-pressed="' + (hubTab === x[0]) + '"><b>' + x[1] + '</b>' + esc(x[2]) + '</button>').join('');
  const body = $('#hubBody'), set = h => { if (id === hubRid) body.innerHTML = h; };
  const run = fn => fn(set, id).catch(e => set('<div class="card"><h4>😕</h4><p>' + esc(errText(e)) + '</p></div>'));
  if (hubTab === 'top') return run(renderTop);
  if (!isSigned() && hubTab !== 'top') { set(signInCard() + '<div class="card"><h4>' + esc('What is the Arena?') + '</h4><p>' + esc('Solve level-based coding challenges, challenge your friends in groups, and climb the Top 10. Your score depends on your technique, errors, help and tips used.') + '</p></div>'); mountSignIn(); return; }
  if (hubTab === 'play') return run(renderPlay);
  if (hubTab === 'groups') return run(hubState.gid ? renderGroup : renderGroups);
  if (hubTab === 'me') return run(renderMe);
  if (hubTab === 'review') return run(renderReview);
}
$('#hubTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; hubTab = b.dataset.tab; hubState = {}; sfx.tap(); renderHub(); });
$('#hubClose').addEventListener('click', () => { closeHub(); sfx.tap(); });
$('#btnArena').addEventListener('click', () => openHub('play'));

/* ---------- sign-in ---------- */
function signInCard() {
  let h = '<div class="card"><h4>👋 ' + esc('Sign in to play') + '</h4>';
  if (SERVER) {
    h += CFG.googleClientId ? '<p>' + esc('Use your Google account. We only keep your first name and last initial; your photo is never shown.') + '</p><div id="gbtn" style="min-height:44px"></div>' : '<p>' + esc('Google sign-in is not configured on this server yet.') + '</p>';
    if (CFG.devLogin) h += '<div class="sec">' + esc('Developer login') + '</div><div class="row2"><input class="in" id="devName" placeholder="name" maxlength="30"><input class="in" id="devMail" placeholder="email (optional)" maxlength="80"><button class="btn" data-act="devlogin">Go</button></div>';
  } else {
    h += '<p>' + esc('This is the demo: it runs fully in your browser with practice friends. Pick a nickname to start.') + '</p><div class="row2"><input class="in" id="devName" placeholder="Nickname" maxlength="14" value="' + esc((me && me.nickname) || '') + '"><button class="btn good" data-act="guest">Play ▶</button></div><small class="muted">' + esc('On the deployed site this is “Sign in with Google”.') + '</small>';
  }
  return h + '</div>';
}
function loadGis() { return new Promise((res, rej) => { if (window.google && window.google.accounts && window.google.accounts.id) return res(); const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function mountSignIn() {
  const el = $('#gbtn'); if (!el || !CFG.googleClientId) return;
  try {
    await loadGis(); const g = window.google.accounts.id;
    g.initialize({ client_id: CFG.googleClientId, auto_select: false, callback: async r => { try { me = await Api.google(r.credential); toast('Welcome, ' + me.nickname + '!'); sfx.ok(); afterLogin(); } catch (e) { toast(errText(e)); } } });
    g.renderButton(el, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', logo_alignment: 'left' });
  } catch (e) { el.textContent = 'Could not load Google sign-in. Check your connection and try again.'; }
}
function afterLogin() { updateWho(); if (pendingJoin) { hubTab = 'groups'; hubState = {}; } renderHub(); }

/* ---------- play ---------- */
async function renderPlay(set, id) {
  const data = await Api.challenges(hubState.lang || null); let h = '';
  if (A) h += '<div class="card" style="background:var(--pop);color:#1a1a1a"><h4>🏁 ' + esc('You are in a challenge') + '</h4><p><b>' + esc(A.title) + '</b> · ' + fmtT(Date.now() - A.t0) + '</p><div class="row2"><button class="btn good" data-act="resume">' + esc('Resume ▶') + '</button><button class="btn alt" data-act="quit">' + esc('Quit') + '</button></div></div>';
  h += '<div class="chips" style="margin:0 0 6px">' + [[null, 'All'], ['cpp', 'C++'], ['html', 'HTML']].map(x => '<button class="pill" data-act="lang" data-v="' + (x[0] || '') + '" aria-pressed="' + ((hubState.lang || null) === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
  for (const lv of data.levels) {
    const list = data.challenges.filter(c => c.level === lv.n); if (!list.length) continue;
    h += '<div class="lvl">' + esc(lv.emoji + ' Level ' + lv.n + ' · ' + lv.name) + '<em>' + lv.points + ' pts</em>' + (list.every(c => c.locked) ? '<em>🔒</em>' : '') + '</div>';
    h += list.map(c => '<button class="chal' + (c.locked ? ' locked' : '') + (c.solved ? ' solved' : '') + '" data-act="chal" data-id="' + esc(c.id) + '"><span class="ce">' + esc(c.emoji) + '</span><span class="cm"><b>' + esc(c.title) + '</b><small><span class="tag ' + c.lang + '">' + (c.lang === 'cpp' ? 'C++' : 'HTML') + '</span>' + esc(c.technique) + '</small></span><span class="cs">' + (c.locked ? '🔒' : c.solved ? '✅ ' + c.best : c.pending ? '⏳ review' : c.best !== null ? c.best + ' pts' : '⭐ ' + c.points) + (c.best !== null && !c.solved ? '<i>best</i>' : '') + '</span></button>').join('');
  }
  hubState.data = data; set(h);
}
function chalDetail(c) {
  const lv = Core.LEVELS[c.level - 1];
  m2Open('<div class="mh"><h3>' + esc(c.emoji + ' ' + c.title) + '</h3><button class="round sm" data-act="m2close" aria-label="Close">✕</button></div>' +
    '<div class="row2" style="margin-bottom:6px"><span class="tag ' + c.lang + '">' + (c.lang === 'cpp' ? 'C++' : 'HTML') + '</span><span class="tag">Level ' + c.level + '</span><span class="tag">⭐ ' + lv.points + ' pts</span><span class="tag">⏱ ' + Math.round(c.par / 60) + ' min</span><span class="tag">✔ ' + c.tests + ' checks</span></div>' +
    '<p>' + esc('Bonus technique: ' + c.technique) + '</p>' +
    '<p class="muted">' + esc('You score for: correct code, clean technique and speed. You lose points for errors, auto-fixes, viewed solutions and tips. Hidden integrity codes are part of every challenge, so write it yourself!') + '</p>' +
    (c.locked ? '<div class="verdict review"><span class="vi">🔒</span><div>' + esc('Solve one Level ' + (c.level - 1) + ' ' + (c.lang === 'cpp' ? 'C++' : 'HTML') + ' challenge to unlock this.') + '</div></div>' : '<div class="row2" style="margin-top:8px"><button class="btn good" data-act="go">Start ▶</button><button class="btn alt" data-act="friends">👥 ' + esc('Challenge friends') + '</button></div>'),
    { go: async () => { try { m2Close(); await beginChallenge(c.id); } catch (e) { toast(errText(e)); } }, friends: () => challengeForm(c) });
}
async function challengeForm(c) {
  let groups = []; try { groups = await Api.groups(); } catch (e) { toast(errText(e)); return; }
  if (!groups.length) { m2Open('<div class="mh"><h3>👥 ' + esc('Challenge friends') + '</h3><button class="round sm" data-act="m2close">✕</button></div><p>' + esc('You need a group first. Create one in the Groups tab and share its code with your friends.') + '</p><div class="row2"><button class="btn good" data-act="tog">Go to Groups</button></div>', { tog: () => { m2Close(); hubTab = 'groups'; hubState = {}; renderHub(); } }); return; }
  m2Open('<div class="mh"><h3>👥 ' + esc(c.title) + '</h3><button class="round sm" data-act="m2close">✕</button></div><div class="sec">Group</div><select class="in" id="cfG" style="width:100%">' + groups.map(g => '<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>').join('') + '</select>' +
    '<div class="sec">Who plays?</div><select class="in" id="cfM" style="width:100%"><option value="">Everyone in the group</option></select>' +
    '<div class="sec">Time to finish</div><select class="in" id="cfH" style="width:100%"><option value="24">24 hours</option><option value="72" selected>3 days</option><option value="168">7 days</option></select>' +
    '<div class="row2" style="margin-top:10px"><button class="btn good" data-act="send">Send challenge 🚀</button></div>',
    { send: async () => { try { const gid = $('#cfG').value, inv = $('#cfM').value; await Api.addChallenge(gid, { cid: c.id, hours: +$('#cfH').value, invitee: inv || undefined }); m2Close(); toast('Challenge sent! 🚀'); hubTab = 'groups'; hubState = { gid }; renderHub(); } catch (e) { toast(errText(e)); } } });
  const fill = async () => { const gid = $('#cfG').value; try { const g = await Api.group(gid), sel = $('#cfM'); if (!sel) return; sel.innerHTML = '<option value="">Everyone in the group</option>' + g.members.filter(m => !m.you).map(m => '<option value="' + esc(m.uid) + '">Duel: ' + esc(m.avatar + ' ' + m.nickname) + '</option>').join(''); } catch (e) { } };
  $('#cfG').addEventListener('change', fill); fill();
}

/* ---------- groups ---------- */
async function renderGroups(set) {
  const groups = await Api.groups(); let h = '';
  if (pendingJoin) h += '<div class="card" style="background:var(--pop);color:#1a1a1a"><h4>💌 ' + esc('You were invited!') + '</h4><p>' + esc('Join the group with code') + ' <b>' + esc(pendingJoin) + '</b>?</p><div class="row2"><button class="btn good" data-act="joinp">Join ▶</button><button class="btn alt" data-act="skipj">Not now</button></div></div>';
  h += '<div class="card"><h4>' + esc('Your groups') + '</h4>' + (groups.length ? groups.map(g => '<button class="chal" data-act="opengroup" data-id="' + esc(g.id) + '"><span class="ce">👥</span><span class="cm"><b>' + esc(g.name) + '</b><small>' + g.members + ' players · code ' + esc(g.code) + '</small></span><span class="cs">›</span></button>').join('') : '<p class="muted">' + esc('No groups yet. Make one for your class or friends, then share the code.') + '</p>') + '</div>';
  h += '<div class="card"><h4>➕ ' + esc('Create a group') + '</h4><div class="row2"><input class="in" id="gName" placeholder="Group name" maxlength="30"><button class="btn good" data-act="mkgroup">Create</button></div></div>';
  h += '<div class="card"><h4>🔑 ' + esc('Join with a code') + '</h4><div class="row2"><input class="in" id="gCode" placeholder="CODE" maxlength="8" style="text-transform:uppercase" value="' + esc(pendingJoin || '') + '"><button class="btn" data-act="joingroup">Join</button></div>' + (SERVER ? '' : '<small class="muted">' + esc('Try the demo code DEMO42') + '</small>') + '</div>';
  set(h);
}
async function renderGroup(set) {
  const gd = await Api.group(hubState.gid), g = gd.group; let h = '<button class="pill" data-act="backg" style="margin-bottom:8px">‹ ' + esc('Groups') + '</button>';
  h += '<div class="card"><h4>👥 ' + esc(g.name) + '</h4><div class="sharebox"><span class="code">' + esc(g.code) + '</span><button class="btn sm" data-act="share">📤 ' + esc('Share') + '</button></div><small class="muted">' + esc('Friends join with this code or the invite link.') + '</small></div>';
  h += '<div class="card"><h4>🏅 ' + esc('Group ranking') + '</h4>' + gd.members.map((m, i) => '<div class="rank' + (m.you ? ' me' : '') + '"><span class="rn">' + medal(i + 1) + '</span><span class="av">' + esc(m.avatar) + '</span><span class="nm">' + esc(m.nickname) + (m.you ? ' (you)' : '') + '</span><span class="pt">' + m.points + '</span></div>').join('') + '</div>';
  h += '<div class="card"><h4>⚔️ ' + esc('Challenges') + '</h4><button class="btn good sm" data-act="newch">➕ ' + esc('New challenge') + '</button>';
  if (!gd.challenges.length) h += '<p class="muted" style="margin-top:6px">' + esc('No challenges yet. Create one and dare your friends!') + '</p>';
  h += gd.challenges.map(c => '<div class="card" style="margin:8px 0 0;box-shadow:2px 2px 0 var(--ink)"><div class="row2"><span style="font-size:24px">' + esc(c.emoji) + '</span><div style="flex:1;min-width:0"><b>' + esc(c.title) + '</b><br><small class="muted"><span class="tag ' + c.lang + '">' + (c.lang === 'cpp' ? 'C++' : 'HTML') + '</span>L' + c.level + ' · ' + (c.mode === 'duel' ? '⚔️ duel' : '👥 group') + ' · ' + esc(fmtLeft(c.due)) + ' · by ' + esc(c.creator) + '</small></div>' + (c.open ? '<button class="btn sm" data-act="playgc" data-cid="' + esc(c.cid) + '">Play ▶</button>' : '') + '</div><div class="stand">' +
    c.standings.map((s, i) => '<div class="rank' + (s.uid === (me && me.id) ? ' me' : '') + '"><span class="rn">' + (s.score ? medal(i + 1) : '–') + '</span><span class="av">' + esc(s.avatar) + '</span><span class="nm">' + esc(s.nickname) + '</span><span class="pt">' + (s.status === 'done' ? s.score + (s.solved ? ' ✅' : '') : s.status === 'review' ? '⏳' : '…') + '</span></div>').join('') + '</div></div>').join('') + '</div>';
  h += '<div class="row2"><button class="btn alt sm" data-act="leave">' + esc('Leave group') + '</button></div>';
  hubState.gd = gd; set(h);
}
async function shareGroup(g) {
  const url = Api.shareUrl(g.code), text = 'Join my CodePop group “' + g.name + '”! Code: ' + g.code;
  if (navigator.share) { try { await navigator.share({ title: 'CodePop', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  let copied = false; try { await navigator.clipboard.writeText(text + '\n' + url); copied = true; } catch (e) { }
  m2Open('<div class="mh"><h3>📤 ' + esc('Invite friends') + '</h3><button class="round sm" data-act="m2close">✕</button></div><p>' + esc(copied ? 'Copied! Paste it in your chat.' : 'Copy this and send it to your friends:') + '</p><div class="sharebox" style="flex-direction:column;align-items:stretch;user-select:all"><span>' + esc(text) + '</span><span style="font-family:var(--mono);font-size:12.5px;word-break:break-all">' + esc(url) + '</span></div>', {});
}
async function newGroupChallenge(gid) {
  const data = hubState.data || await Api.challenges(null), open = data.challenges.filter(c => !c.locked);
  m2Open('<div class="mh"><h3>⚔️ ' + esc('New challenge') + '</h3><button class="round sm" data-act="m2close">✕</button></div><div class="sec">Challenge</div><select class="in" id="ncC" style="width:100%">' + open.map(c => '<option value="' + esc(c.id) + '">' + esc(c.emoji + ' ' + c.title + ' · L' + c.level + ' ' + (c.lang === 'cpp' ? 'C++' : 'HTML')) + '</option>').join('') + '</select>' +
    '<div class="sec">Who plays?</div><select class="in" id="ncM" style="width:100%"><option value="">Everyone in the group</option>' + ((hubState.gd && hubState.gd.members) || []).filter(m => !m.you).map(m => '<option value="' + esc(m.uid) + '">Duel: ' + esc(m.avatar + ' ' + m.nickname) + '</option>').join('') + '</select>' +
    '<div class="sec">Time to finish</div><select class="in" id="ncH" style="width:100%"><option value="24">24 hours</option><option value="72" selected>3 days</option><option value="168">7 days</option></select><div class="row2" style="margin-top:10px"><button class="btn good" data-act="mk">Send 🚀</button></div>',
    { mk: async () => { try { await Api.addChallenge(gid, { cid: $('#ncC').value, hours: +$('#ncH').value, invitee: $('#ncM').value || undefined }); m2Close(); toast('Challenge sent! 🚀'); renderHub(); } catch (e) { toast(errText(e)); } } });
}

/* ---------- top 10 ---------- */
async function renderTop(set) {
  const b = await Api.board(); let h = '<div class="card"><h4>🏆 ' + esc('Top 10 players') + '</h4><small class="muted">' + b.players + ' ' + esc('players · points come from verified solutions only') + '</small></div>';
  h += b.top.length ? b.top.map(r => rankRow(r)).join('') : '<div class="card"><p>' + esc('No scores yet. Be the first!') + '</p></div>';
  if (b.me && !b.top.some(r => r.me)) h += '<div class="muted" style="text-align:center;margin:-2px 0 4px">⋮</div>' + rankRow({ rank: b.me.rank, avatar: (me && me.avatar) || '🙂', nickname: (me && me.nickname) || 'You', total: b.me.total, solved: b.me.solved, me: true });
  if (!isSigned()) h += signInCard();
  set(h); if (!isSigned()) mountSignIn();
}

/* ---------- me ---------- */
async function renderMe(set) {
  const [projects, log, board] = await Promise.all([Api.projects(), Api.accessLog(), Api.board()]);
  let h = '<div class="card"><div class="row2"><span class="big">' + esc(me.avatar) + '</span><div style="flex:1;min-width:150px"><div class="row2"><input class="in" id="nick" value="' + esc(me.nickname) + '" maxlength="20"><button class="btn sm" data-act="savenick">Save</button></div></div></div>' +
    '<div class="kv"><div><b>' + lvOf(S.xp) + '</b><small>level</small></div><div><b>' + S.xp + '</b><small>XP</small></div><div><b>' + (board.me ? '#' + board.me.rank : '–') + '</b><small>rank</small></div></div>' +
    '<div class="sec">Avatar</div><div class="avs">' + AVATARS.map(a => '<button data-act="avatar" data-v="' + a + '" aria-pressed="' + (me.avatar === a) + '">' + a + '</button>').join('') + '</div></div>';
  h += '<div class="card"><h4>💾 ' + esc('My projects') + '</h4><div class="row2"><input class="in" id="pname" maxlength="60" value="' + esc('My ' + (S.lang === 'cpp' ? 'C++' : 'web') + ' project') + '"><button class="btn good sm" data-act="saveproj">Save current code</button><button class="btn alt sm" data-act="pushcur">🐙 Push to GitHub</button></div>' +
    (projects.length ? projects.map(p => '<div class="rank" style="margin-top:6px"><span class="av">' + (p.lang === 'cpp' ? '⚙️' : '🌐') + '</span><span class="nm">' + esc(p.name) + '<small>' + esc(fmtDate(p.updated)) + ' · ' + p.size + ' chars</small></span><button class="btn sm" data-act="openproj" data-id="' + esc(p.id) + '">Open</button><button class="btn alt sm" data-act="pushproj" data-id="' + esc(p.id) + '" aria-label="Push to GitHub" title="Push to GitHub">🐙</button><button class="btn alt sm" data-act="delproj" data-id="' + esc(p.id) + '" aria-label="Delete">🗑</button></div>').join('') : '<p class="muted" style="margin-top:6px">' + esc('Nothing saved yet.') + '</p>') + '</div>';
  h += '<div class="card"><h4>👀 ' + esc('Who looked at my projects') + '</h4><p class="muted">' + esc('Only the CodePop reviewers can open saved projects, and only to check fairness. Every look is written here.') + '</p>' +
    (log.length ? log.slice(0, 12).map(e => '<div class="rank" style="box-shadow:none"><span class="av">🛡️</span><span class="nm">' + esc(e.actor) + '<small>' + esc(e.action.replace(/_/g, ' ')) + (e.detail ? ' · ' + esc(e.detail) : '') + ' · ' + esc(fmtDate(e.ts)) + '</small></span></div>').join('') : '<div class="verdict clean"><span class="vi">🎉</span><div>' + esc('Nobody has looked at your projects.') + '</div></div>') + '</div>';
  h += '<div class="card"><h4>📲 ' + esc('Install the app') + '</h4>' + (installEv ? '<button class="btn good" data-act="install">📲 ' + esc('Install CodePop') + '</button>' : '<p>' + esc('Android: open the site in Chrome, tap ⋮ then “Install app”. iPhone: tap Share then “Add to Home Screen”.') + '</p>') + '</div>';
  h += '<div class="card"><h4>⚙️ ' + esc('Account') + '</h4>' + (SERVER ? '' : '<div class="row2" style="margin-bottom:6px"><button class="btn alt sm" data-act="rev" aria-pressed="' + !!me.isAdmin + '">🛡️ ' + esc(me.isAdmin ? 'Turn off reviewer preview' : 'Preview the reviewer console (demo)') + '</button></div>') +
    '<div class="row2">' + (SERVER ? '<button class="btn alt sm" data-act="export">⬇ ' + esc('Export my data') + '</button>' : '') + '<button class="btn alt sm" data-act="logout">' + esc('Sign out') + '</button><button class="btn alt sm" data-act="delacct">' + esc(hubState.armDel ? 'Really delete?' : 'Delete account') + '</button></div></div>';
  set(h);
}

/* ---------- reviewer console ---------- */
async function renderReview(set) {
  const items = await Api.adminQueue(); let h = '<div class="card"><h4>🛡️ ' + esc('Review queue') + '</h4><p class="muted">' + esc(SERVER ? 'Attempts held back for a human check. Everything you open is logged and shown to the player.' : 'Demo reviewer console with sample cases. In the real server, only allow-listed verified emails can see this.') + '</p></div>';
  h += items.length ? items.map(i => '<div class="card"><div class="row2"><span style="font-size:22px">' + esc(i.avatar) + '</span><div style="flex:1;min-width:0"><b>' + esc(i.nickname) + '</b> · ' + esc(i.title) + '<br><span class="tag ' + (i.verdict === 'ai' ? 'warn' : '') + '">' + (i.verdict === 'ai' ? '🤖 AI-copy suspected' : '⚠️ under review') + '</span><small class="muted">' + i.score + ' pts · ' + esc(fmtDate(i.submitted)) + '</small></div></div><ul style="margin:4px 0 6px;padding-inline-start:18px;font-size:13px;font-weight:600">' + i.reasons.slice(0, 4).map(r => '<li>' + esc(r.text) + '</li>').join('') + '</ul>' + (i.tel ? '<small class="muted">typed ' + (i.tel.typedChars || 0) + ' · pasted ' + (i.tel.pastedChars || 0) + ' · copy events ' + (i.tel.copyEvents || 0) + '</small>' : '') +
    '<div class="row2" style="margin-top:6px"><button class="btn alt sm" data-act="viewatt" data-id="' + esc(i.id) + '">👁 View code</button><button class="btn good sm" data-act="clear" data-id="' + esc(i.id) + '">✓ Clear</button><button class="btn sm" data-act="reject" data-id="' + esc(i.id) + '">✕ Reject</button></div></div>').join('') : '<div class="card"><p>' + esc('Queue is empty. 🎉') + '</p></div>';
  h += '<div class="card"><h4>🔎 ' + esc('Find a player') + '</h4><div class="row2"><input class="in" id="uq" placeholder="nickname" maxlength="40"><button class="btn sm" data-act="usearch">Search</button></div><div id="ures"></div></div>';
  set(h);
}
async function reviewUsers() {
  const q = $('#uq').value, us = await Api.adminUsers(q);
  $('#ures').innerHTML = us.length ? us.map(u => '<div class="rank" style="margin-top:6px"><span class="av">' + esc(u.avatar) + '</span><span class="nm">' + esc(u.nickname) + '<small>' + u.projects + ' projects · ' + u.attempts + ' attempts</small></span>' + (u.projects ? '<button class="btn sm" data-act="uprojs" data-id="' + esc(u.id) + '">Projects</button>' : '') + '</div>').join('') : '<p class="muted">No players found.</p>';
}
async function reviewProjects(uid) {
  const ps = await Api.adminProjects(uid);
  m2Open('<div class="mh"><h3>' + esc('Saved projects') + '</h3><button class="round sm" data-act="m2close">✕</button></div>' + (ps.length ? ps.map(p => '<div class="rank"><span class="av">' + (p.lang === 'cpp' ? '⚙️' : '🌐') + '</span><span class="nm">' + esc(p.name) + '<small>' + esc(fmtDate(p.updated)) + '</small></span><button class="btn sm" data-act="vp" data-id="' + esc(p.id) + '">View</button></div>').join('') : '<p class="muted">Nothing saved.</p>'),
    { vp: async b => { try { const p = await Api.adminProject(uid, b.dataset.id); m2Open('<div class="mh"><h3>' + esc(p.name) + '</h3><button class="round sm" data-act="m2close">✕</button></div><div class="code-view">' + esc(p.code) + '</div><small class="muted">' + esc('This look was logged and the player can see it.') + '</small>', {}); } catch (e) { toast(errText(e)); } } });
}
async function reviewAttempt(id) {
  const a = await Api.adminAttempt(id);
  m2Open('<div class="mh"><h3>' + esc(a.nickname + ' · ' + (Core.byId(a.cid) || {}).title) + '</h3><button class="round sm" data-act="m2close">✕</button></div><div class="code-view">' + esc(a.code || '') + '</div><ul style="padding-inline-start:18px;font-size:13px;font-weight:600">' + (a.reasons || []).map(r => '<li>' + esc(r.text) + '</li>').join('') + '</ul><small class="muted">' + esc('This look was logged and the player can see it.') + '</small>', {});
}

/* ---------- hub clicks ---------- */
$('#hubBody').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act; if (b.disabled) return; sfx.tap();
  try {
    if (a === 'guest' || a === 'devlogin') { const nm = ($('#devName').value || '').trim(); if (!nm) { toast('Type a nickname first'); return; } me = a === 'guest' ? await Api.dev(nm) : await Api.dev(nm, ($('#devMail').value || '').trim()); toast('Welcome, ' + me.nickname + '!'); afterLogin(); }
    else if (a === 'lang') { hubState.lang = b.dataset.v || null; renderHub(); }
    else if (a === 'resume') { closeHub(); openTask(); }
    else if (a === 'quit') askQuit();
    else if (a === 'chal') { const c = (hubState.data && hubState.data.challenges || []).find(x => x.id === b.dataset.id); if (c) chalDetail(c); }
    else if (a === 'opengroup') { hubState = { gid: b.dataset.id }; renderHub(); }
    else if (a === 'backg') { hubState = {}; renderHub(); }
    else if (a === 'mkgroup') { const n = $('#gName').value; const g = await Api.createGroup(n); toast('Group created! Share the code 🎉'); hubState = { gid: g.id }; renderHub(); }
    else if (a === 'joingroup' || a === 'joinp') { const code = a === 'joinp' ? pendingJoin : $('#gCode').value; const g = await Api.joinGroup(code); pendingJoin = null; toast('Joined ' + g.name + '! 🎉'); hubState = { gid: g.id }; renderHub(); }
    else if (a === 'skipj') { pendingJoin = null; renderHub(); }
    else if (a === 'share') shareGroup(hubState.gd.group);
    else if (a === 'newch') newGroupChallenge(hubState.gid);
    else if (a === 'playgc') { try { await beginChallenge(b.dataset.cid, { gid: hubState.gid }); } catch (er) { toast(errText(er)); } }
    else if (a === 'leave') { await Api.leaveGroup(hubState.gid); hubState = {}; toast('You left the group'); renderHub(); }
    else if (a === 'savenick') { me = await Api.update({ nickname: $('#nick').value }); toast('Saved ✓'); renderHub(); }
    else if (a === 'avatar') { me = await Api.update({ avatar: b.dataset.v }); renderHub(); }
    else if (a === 'saveproj') { const nm = $('#pname').value; await Api.saveProject({ name: nm, lang: S.lang, code: ed.value }); toast('Saved ✓'); renderHub(); }
    else if (a === 'openproj') { if (A) { toast('Finish or quit your challenge first'); return; } const p = await Api.project(b.dataset.id); if (p.lang !== S.lang) setLang(p.lang); ed.setValue(p.code, 0); closeHub(); toast('Opened ' + p.name); }
    else if (a === 'pushcur') openGitPush();
    else if (a === 'pushproj') { const p = await Api.project(b.dataset.id); openGitPush(p); }
    else if (a === 'delproj') { await Api.deleteProject(b.dataset.id); renderHub(); }
    else if (a === 'install') { await installApp(); renderHub(); }
    else if (a === 'rev') { Api.setReviewer(!me.isAdmin); await refreshMe(); hubTab = me.isAdmin ? 'review' : 'me'; renderHub(); }
    else if (a === 'export') { const d = await Api.exportData(); try { const bl = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), u = URL.createObjectURL(bl), l = document.createElement('a'); l.href = u; l.download = 'codepop-my-data.json'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); toast('Downloading…'); } catch (er) { toast('Could not download here'); } }
    else if (a === 'logout') { if (A) endChallenge(true); await Api.logout(); me = null; hubTab = 'play'; hubState = {}; renderHub(); toast('Signed out'); }
    else if (a === 'delacct') { if (!hubState.armDel) { hubState.armDel = true; renderHub(); return; } if (A) endChallenge(true); await Api.remove(); me = null; hubTab = 'play'; hubState = {}; renderHub(); toast('Account deleted'); }
    else if (a === 'viewatt') await reviewAttempt(b.dataset.id);
    else if (a === 'clear' || a === 'reject') { await Api.adminDecide(b.dataset.id, a); toast(a === 'clear' ? 'Cleared ✓' : 'Rejected'); renderHub(); }
    else if (a === 'usearch') await reviewUsers();
    else if (a === 'uprojs') await reviewProjects(b.dataset.id);
  } catch (er) { toast(errText(er)); }
});
$('#hubBody').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'devName') { e.preventDefault(); const g = $('#hubBody [data-act=guest],#hubBody [data-act=devlogin]'); if (g) g.click(); } });

/* ---------- install (PWA) ---------- */
async function installApp() { if (!installEv) return; try { installEv.prompt(); await installEv.userChoice; } catch (e) { } installEv = null; $('#btnInstall').hidden = true; }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; $('#btnInstall').hidden = false; });
window.addEventListener('appinstalled', () => { installEv = null; $('#btnInstall').hidden = true; toast('CodePop installed 🎉'); });
$('#btnInstall').addEventListener('click', installApp);
(function inviteFromUrl() {
  let c = null; try { const m = /[?&]join=([A-Za-z0-9]{4,12})/.exec(location.search) || /#join-([A-Za-z0-9]{4,12})/.exec(location.hash); if (m) c = m[1].toUpperCase(); } catch (e) { }
  if (c) { pendingJoin = c; setTimeout(() => openHub('groups'), 400); }
  else if (/[?&]open=arena/.test(location.search)) setTimeout(() => openHub('play'), 400);
})();
