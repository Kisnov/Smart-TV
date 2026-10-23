// Putting focus back when it falls out of the page.
//
// A re-render that unmounts the focused card leaves focus on the body, and the next arrow then
// has Spotlight pick a target from the last pointer position. A remote has never set one, so
// that is the top left corner of the screen, and the sidebar is what sits there: it opens and
// keeps focus although nobody went near it. The arrow is caught just before Spotlight sees it,
// and focus goes back to where it was, or the nearest container of it still on screen.

import Spotlight from '@enact/spotlight';
import serverLogger from '../services/serverLogger';
import {CONTENT_FOCUS_TARGETS} from './navFocusTargets';
import {KEYS} from './keys';

const ROOT_CONTAINER_ID = 'spotlightRootDecorator';
const NAVBAR_ID = 'navbar';

const ARROWS = [KEYS.UP, KEYS.DOWN, KEYS.LEFT, KEYS.RIGHT];

// A screen that unmounts with focus in it is usually handing over to one still loading, such
// as details opened from a Seerr row, which focuses itself once it has drawn. Until then a press
// is held back rather than sent to the sidebar. After this long the screen is taken to have
// nothing to focus, and Spotlight has the press so the sidebar can still be reached.
const LOADING_GRACE_MS = 3000;

// What last held focus, with the containers around it from the innermost out, since those are
// gone from the node's ancestors once it has been unmounted.
let last = null;

const containersOf = (node) => {
	const ids = [];
	for (let el = node.parentElement; el; el = el.parentElement) {
		const id = el.getAttribute('data-spotlight-id');
		if (id && id !== ROOT_CONTAINER_ID && el.hasAttribute('data-spotlight-container')) ids.push(id);
	}
	return ids;
};

const describe = (node) => {
	const id = node.getAttribute('data-spotlight-id');
	const text = (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
	return `${node.tagName.toLowerCase()}${id ? `#${id}` : ''}${text ? ` "${text}"` : ''}`;
};

const hasFocus = () => {
	const active = document.activeElement;
	return Boolean(active) && active !== document.body;
};

const onScreen = (node) => node.isConnected && node.getClientRects().length > 0;

const remember = (ev) => {
	const node = ev.target;
	if (!node || node === document.body || node === window || !node.getAttribute) return;
	const containers = containersOf(node);
	last = {node, containers, inNav: containers.includes(NAVBAR_ID), label: describe(node), lostAt: null};
};

// Noted for the diagnostics log only. Older engines fire nothing when the focused node is
// removed, so the press that finds focus missing is logged as well.
const noteLoss = (ev) => {
	// Focus going nowhere comes with no related target, or with the document on some engines.
	if (ev.relatedTarget?.nodeType === 1 || !last || ev.target !== last.node) return;
	setTimeout(() => {
		if (hasFocus() || !last || last.node !== ev.target) return;
		last.lostAt = Date.now();
		serverLogger.info(serverLogger.LOG_CATEGORIES.NAVIGATION, 'Focus fell out of the page', {
			from: last.label,
			containers: last.containers.join(' < '),
			removed: !last.node.isConnected
		});
	}, 0);
};

const focusContainer = (id) => (
	Boolean(document.querySelector(`[data-spotlight-id="${id}"]`)) && Spotlight.focus(id) && hasFocus()
);

// Where focus goes back to. The sidebar is only a candidate when focus was lost from it.
const restore = () => {
	const {node, containers, inNav} = last;
	if (onScreen(node) && Spotlight.focus(node) && document.activeElement === node) return 'element';
	for (const id of containers) {
		if (id === NAVBAR_ID && !inNav) continue;
		if (focusContainer(id)) return id;
	}
	if (inNav) return null;
	return CONTENT_FOCUS_TARGETS.find(focusContainer) || null;
};

export const recoverLostFocus = (ev) => {
	if (!ARROWS.includes(ev.keyCode) || hasFocus() || !last || Spotlight.isPaused()) return false;
	// Read before restoring, since the focus that restores it replaces what is remembered.
	const lost = {
		key: ev.keyCode,
		from: last.label,
		containers: last.containers.join(' < '),
		removed: !last.node.isConnected,
		lostForMs: last.lostAt ? Date.now() - last.lostAt : null
	};
	const restoredTo = restore();
	const holding = !restoredTo && lost.lostForMs !== null && lost.lostForMs < LOADING_GRACE_MS;
	let message = 'Focus put back after it fell out of the page';
	if (holding) message = 'Focus missing, press held back while the screen loads';
	else if (!restoredTo) message = 'Focus missing and nowhere to put it back';
	serverLogger.info(serverLogger.LOG_CATEGORIES.NAVIGATION, message, {...lost, restoredTo});
	if (!restoredTo && !holding) return false;
	// The press only brings focus back, or waits, so nothing moves twice on one key.
	ev.preventDefault();
	ev.stopPropagation();
	return true;
};

// On the document in the bubble phase, which every screen's own capture listener on the window
// and every component handler has already had, and Spotlight's listener on the window has not.
export const guardLostFocus = (target = document) => {
	target.addEventListener('focusin', remember, true);
	target.addEventListener('focusout', noteLoss, true);
	target.addEventListener('keydown', recoverLostFocus);
};

// For tests, which install the listeners once and start each case from nothing.
export const forgetFocus = () => {
	last = null;
};
