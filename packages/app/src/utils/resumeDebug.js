/* global webapis */
// DEBUG BUILD ONLY: on-screen log of what the Tizen player does around background and resume.

const MAX_LINES = 34;
const STORE_KEY = 'moonfinResumeDebug';
const lines = [];
let box = null;
let statusEl = null;
let logEl = null;
let installed = false;
let ticker = null;

const pad = (n, w = 2) => String(n).padStart(w, '0');
const stamp = () => {
	const d = new Date();
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

const ensureBox = () => {
	if (box || typeof document === 'undefined' || !document.body) return;
	box = document.createElement('div');
	box.style.cssText = 'position:fixed;top:8px;left:8px;width:46%;max-height:96%;overflow:hidden;z-index:2147483647;' +
		'pointer-events:none;background:rgba(0,0,0,0.72);color:#fff;font:15px/1.25 monospace;padding:6px 8px;' +
		'border:2px solid #f80;white-space:pre-wrap;word-break:break-all;';
	statusEl = document.createElement('div');
	statusEl.style.cssText = 'color:#ff0;border-bottom:1px solid #f80;margin-bottom:4px;padding-bottom:4px;';
	logEl = document.createElement('div');
	box.appendChild(statusEl);
	box.appendChild(logEl);
	document.body.appendChild(box);
};

const render = () => {
	ensureBox();
	if (logEl) logEl.textContent = lines.join('\n');
};

export const dbg = (msg) => {
	lines.push(`${stamp()} ${msg}`);
	while (lines.length > MAX_LINES) lines.shift();
	try {
		window.localStorage.setItem(STORE_KEY, lines.join('\n'));
	} catch (e) {
		void e;
	}
	render();
};

const avState = () => {
	try {
		return webapis.avplay.getState();
	} catch (e) {
		return `ERR(${e.message})`;
	}
};

const avTime = () => {
	try {
		return webapis.avplay.getCurrentTime();
	} catch (e) {
		return '?';
	}
};

// What is painted over the middle of the screen. AVPlay draws behind the page, so any opaque
// background in this list hides the picture.
const layerCheck = (label) => {
	try {
		const x = Math.round(window.innerWidth / 2);
		const y = Math.round(window.innerHeight / 2);
		const stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
		const opaque = [];
		stack.forEach((el) => {
			if (!el || el === box || box?.contains(el)) return;
			const cs = window.getComputedStyle(el);
			const bg = cs.backgroundColor;
			const img = cs.backgroundImage;
			const clear = (!bg || bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg)) && (!img || img === 'none');
			if (!clear || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 1) {
				const cls = typeof el.className === 'string' ? el.className.split(' ')[0].slice(0, 28) : '';
				opaque.push(`${el.tagName.toLowerCase()}.${cls} bg=${bg}${img && img !== 'none' ? ' img' : ''}${Number(cs.opacity) < 1 ? ` op=${cs.opacity}` : ''}`);
			}
		});
		dbg(`[layer ${label}] ${stack.length} els, opaque: ${opaque.length ? opaque.join(' | ') : 'none'}`);
	} catch (e) {
		dbg(`[layer ${label}] failed ${e.message}`);
	}
};

const wrapAvplay = () => {
	const av = webapis.avplay;
	['open', 'close', 'stop', 'suspend', 'restore', 'play', 'pause', 'prepare', 'setDisplayRect', 'setDisplayMethod'].forEach((name) => {
		const orig = av[name];
		if (typeof orig !== 'function') return;
		av[name] = function (...args) {
			const before = avState();
			const shown = name === 'open' || name === 'restore' ? [String(args[0]).split('?')[0].slice(-40), ...args.slice(1)] : args;
			try {
				const out = orig.apply(av, args);
				dbg(`av.${name}(${shown.join(',')}) ${before}->${avState()}`);
				return out;
			} catch (e) {
				dbg(`av.${name}(${shown.join(',')}) ${before} THREW ${e.name}: ${e.message}`);
				throw e;
			}
		};
	});

	['prepareAsync', 'restoreAsync'].forEach((name) => {
		const orig = av[name];
		if (typeof orig !== 'function') return;
		av[name] = function (...args) {
			const started = Date.now();
			const cbAt = name === 'restoreAsync' ? 3 : 0;
			const ok = args[cbAt];
			const fail = args[cbAt + 1];
			const settled = {done: false};
			args[cbAt] = (...r) => {
				settled.done = true;
				dbg(`av.${name} SUCCESS after ${Date.now() - started}ms state=${avState()}`);
				return ok?.(...r);
			};
			args[cbAt + 1] = (err) => {
				settled.done = true;
				dbg(`av.${name} ERROR after ${Date.now() - started}ms ${err?.name || ''} ${err?.message || err} state=${avState()}`);
				return fail?.(err);
			};
			const shown = name === 'restoreAsync' ? `${String(args[0]).split('?')[0].slice(-40)},${args[1]},${args[2]}` : '';
			dbg(`av.${name}(${shown}) called, state=${avState()}`);
			setTimeout(() => { if (!settled.done) dbg(`av.${name} NO CALLBACK after 10s, state=${avState()}`); }, 10000);
			try {
				return orig.apply(av, args);
			} catch (e) {
				dbg(`av.${name} THREW ${e.name}: ${e.message}`);
				throw e;
			}
		};
	});

	const origSetListener = av.setListener;
	av.setListener = function (listener) {
		const wrapped = {};
		Object.keys(listener || {}).forEach((key) => {
			wrapped[key] = (...a) => {
				if (key !== 'oncurrentplaytime' && key !== 'onsubtitlechange' && key !== 'onbufferingprogress') {
					dbg(`ev.${key}(${a.map((v) => String(v).slice(0, 40)).join(',')}) state=${avState()}`);
				}
				return listener[key](...a);
			};
		});
		dbg(`av.setListener(${Object.keys(wrapped).length} handlers)`);
		return origSetListener.call(av, wrapped);
	};
};

const installPageEvents = () => {
	const hidden = () => (document.hidden || document.webkitHidden ? 'hidden' : 'visible');
	document.addEventListener('visibilitychange', () => {
		dbg(`[page] visibilitychange -> ${hidden()} state=${avState()}`);
		if (!document.hidden) {
			setTimeout(() => layerCheck('+1.5s'), 1500);
			setTimeout(() => layerCheck('+5s'), 5000);
		}
	}, true);
	document.addEventListener('webkitvisibilitychange', () => dbg(`[page] webkitvisibilitychange -> ${hidden()}`), true);
	window.addEventListener('pagehide', (e) => dbg(`[page] pagehide persisted=${e.persisted}`), true);
	window.addEventListener('pageshow', (e) => dbg(`[page] pageshow persisted=${e.persisted}`), true);
	window.addEventListener('beforeunload', () => dbg('[page] beforeunload'), true);
	window.addEventListener('blur', () => dbg('[page] window blur'), true);
	window.addEventListener('focus', () => dbg('[page] window focus'), true);
	window.addEventListener('appcontrol', () => dbg('[page] appcontrol'), true);
	document.addEventListener('tizenRelaunch', () => dbg('[page] tizenRelaunch'), true);
	window.addEventListener('keydown', (e) => dbg(`[key] ${e.keyCode} ${e.key || ''}`), true);
	window.addEventListener('online', () => dbg('[page] online'), true);
	window.addEventListener('offline', () => dbg('[page] offline'), true);
};

export const installResumeDebug = () => {
	if (installed || typeof webapis === 'undefined' || !webapis.avplay) return;
	installed = true;
	let previous = null;
	try {
		previous = window.localStorage.getItem(STORE_KEY);
	} catch (e) {
		void e;
	}
	if (previous) {
		previous.split('\n').slice(-8).forEach((l) => lines.push(`(prev) ${l}`));
	}
	dbg('=== resume debug on ===');
	const origOpen = webapis.avplay.open;
	wrapAvplay();
	dbg(webapis.avplay.open === origOpen ? 'WARNING: avplay methods could not be wrapped' : 'avplay methods wrapped');
	installPageEvents();
	layerCheck('start');
};

// The status line, live while a player is mounted.
export const startResumeDebugStatus = (readExtra) => {
	ensureBox();
	clearInterval(ticker);
	ticker = setInterval(() => {
		if (!statusEl) return;
		let extra = '';
		try {
			extra = readExtra?.() || '';
		} catch (e) {
			extra = `extra ERR ${e.message}`;
		}
		statusEl.textContent = `${stamp()} AVPlay=${avState()} t=${avTime()} page=${document.hidden ? 'hidden' : 'visible'} ${extra}`;
	}, 1000);
	return () => {
		clearInterval(ticker);
		ticker = null;
		if (statusEl) statusEl.textContent = `${stamp()} (player unmounted)`;
	};
};
