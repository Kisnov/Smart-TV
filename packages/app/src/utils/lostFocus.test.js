import Spotlight from '@enact/spotlight';
import serverLogger from '../services/serverLogger';
import {guardLostFocus, forgetFocus} from './lostFocus';
import {KEYS} from './keys';

jest.mock('@enact/spotlight', () => ({isPaused: jest.fn(), focus: jest.fn()}));
jest.mock('../services/serverLogger', () => ({
	__esModule: true,
	default: {LOG_CATEGORIES: {NAVIGATION: 'Navigation'}, info: jest.fn()}
}));

const container = (id, ...children) => {
	const el = document.createElement('div');
	el.setAttribute('data-spotlight-id', id);
	el.setAttribute('data-spotlight-container', '');
	children.forEach((child) => el.appendChild(child));
	return el;
};

const card = (id) => {
	const el = document.createElement('div');
	el.className = 'spottable';
	el.tabIndex = -1;
	el.setAttribute('data-spotlight-id', id);
	// jsdom lays nothing out, so a card stands in as drawn.
	el.getClientRects = () => [{}];
	return el;
};

// Focusing a container lands on its first card, which is all these cases need of Spotlight.
const spotlightFocus = (target) => {
	const node = typeof target === 'string'
		? document.querySelector(`[data-spotlight-id="${target}"] .spottable`)
		: target;
	if (node) node.focus();
	return Boolean(node) && document.activeElement === node;
};

const press = (keyCode) => {
	const event = new window.KeyboardEvent('keydown', {keyCode, bubbles: true, cancelable: true});
	document.body.dispatchEvent(event);
	return event;
};

guardLostFocus();

describe('putting focus back when it falls out of the page', () => {
	let navCard;
	let firstRowCard;
	let secondRowCard;
	let neighbour;

	beforeEach(() => {
		forgetFocus();
		Spotlight.isPaused.mockReturnValue(false);
		Spotlight.focus.mockImplementation(spotlightFocus);
		navCard = card('navbar-home');
		firstRowCard = card('first');
		secondRowCard = card('second');
		neighbour = card('neighbour');
		document.body.replaceChildren(
			container('navbar', navCard),
			container('row-0', firstRowCard),
			container('row-1', secondRowCard, neighbour)
		);
	});

	test('leaves a press alone while something holds focus', () => {
		secondRowCard.focus();
		const event = press(KEYS.DOWN);
		expect(event.defaultPrevented).toBe(false);
		expect(Spotlight.focus).not.toHaveBeenCalled();
	});

	test('takes focus back to the card it fell from', () => {
		secondRowCard.focus();
		secondRowCard.blur();
		const event = press(KEYS.DOWN);
		expect(document.activeElement).toBe(secondRowCard);
		expect(event.defaultPrevented).toBe(true);
	});

	test('goes to the row the card was in once the card has gone, not the sidebar', () => {
		secondRowCard.focus();
		secondRowCard.remove();
		press(KEYS.UP);
		expect(document.activeElement).toBe(neighbour);
	});

	test('falls back to the content when nothing around the card is left', () => {
		document.body.replaceChildren(container('navbar', navCard), container('row-x', secondRowCard));
		secondRowCard.focus();
		document.body.replaceChildren(container('navbar', navCard), container('row-0', firstRowCard));
		press(KEYS.LEFT);
		expect(document.activeElement).toBe(firstRowCard);
	});

	test('goes back into the sidebar when that is where focus was lost', () => {
		const settings = card('navbar-settings');
		document.querySelector('[data-spotlight-id="navbar"]').appendChild(settings);
		settings.focus();
		settings.remove();
		press(KEYS.DOWN);
		expect(document.activeElement).toBe(navCard);
	});

	test('lets Spotlight have the press when it is paused or the key is not an arrow', () => {
		secondRowCard.focus();
		secondRowCard.blur();
		expect(press(KEYS.ENTER).defaultPrevented).toBe(false);
		Spotlight.isPaused.mockReturnValue(true);
		expect(press(KEYS.DOWN).defaultPrevented).toBe(false);
		expect(document.activeElement).toBe(document.body);
	});

	test('notes each recovery in the diagnostics log', () => {
		secondRowCard.focus();
		secondRowCard.remove();
		press(KEYS.DOWN);
		expect(serverLogger.info).toHaveBeenCalledWith('Navigation', 'Focus put back after it fell out of the page', expect.objectContaining({
			from: 'div#second',
			containers: 'row-1',
			removed: true,
			restoredTo: 'row-1'
		}));
	});
});
