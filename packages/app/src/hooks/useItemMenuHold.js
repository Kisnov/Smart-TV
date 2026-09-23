import {useCallback, useEffect, useRef} from 'react';

import {useItemMenu} from '../components/ItemContextMenu';
import {LONG_PRESS_MS, isSelectKey} from '../utils/longPress';

// Where in its list the card a press landed on sits, for lists whose cards carry a data-index.
export const cardIndexOf = (target) => {
	const card = target.closest('[data-index]');
	return card ? parseInt(card.getAttribute('data-index'), 10) : -1;
};

// The one of `items` whose id the card a press landed on carries in `attribute`.
export const itemWithIdAt = (items, attribute, target) => {
	const card = target.closest(`[${attribute}]`);
	const id = card && card.getAttribute(attribute);
	return (id && items.find((entry) => entry.Id === id)) || null;
};

// Holding OK on a card opens its menu rather than the card. Spread the returned props on the card,
// or on the list around a run of cards with `itemAt` finding the card's item from the element the
// press landed on.
//
// A pointer lets go over the card and clicks it, so the hold leaves a mark and that click is
// swallowed on its way down.
const useItemMenuHold = (itemAt, options) => {
	const menu = useItemMenu();
	const timerRef = useRef(null);
	const heldRef = useRef(false);
	// Held down rather than timing, because the browsers on the oldest sets don't report
	// KeyboardEvent.repeat and every repeat would otherwise read as a fresh press.
	const pressedRef = useRef(false);

	const release = useCallback(() => {
		pressedRef.current = false;
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	useEffect(() => release, [release]);

	// Spotlight raises a mousedown of its own from the keydown handler, so this runs twice for one
	// press and the flag is what settles it.
	const start = useCallback((target) => {
		heldRef.current = false;
		if (pressedRef.current || !menu) return;
		const item = itemAt(target);
		if (!item || !menu.canOpen(item, options)) return;
		pressedRef.current = true;
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			// The menu takes focus, so the release lands on it rather than here.
			pressedRef.current = false;
			heldRef.current = true;
			menu.open(item, options);
		}, LONG_PRESS_MS);
	}, [menu, itemAt, options]);

	const handleKeyDown = useCallback((e) => {
		if (isSelectKey(e)) start(e.target);
	}, [start]);

	const handleKeyUp = useCallback((e) => {
		if (isSelectKey(e)) release();
	}, [release]);

	const handleMouseDown = useCallback((e) => start(e.target), [start]);

	const handleClickCapture = useCallback((e) => {
		release();
		if (!heldRef.current) return;
		heldRef.current = false;
		e.stopPropagation();
	}, [release]);

	return {
		onKeyDown: handleKeyDown,
		onKeyUp: handleKeyUp,
		onMouseDown: handleMouseDown,
		onMouseUp: release,
		onMouseLeave: release,
		onClickCapture: handleClickCapture
	};
};

export default useItemMenuHold;
