import {splitNouveauActions} from './nouveauActionSplit';

const actions = (count) => Array.from({length: count}, (_, i) => ({id: `action-${i}`}));

describe('splitNouveauActions', () => {
	it('leaves a short row alone', () => {
		[0, 1, 2, 3].forEach((count) => {
			const split = splitNouveauActions(actions(count));
			expect(split.needsOverflow).toBe(false);
			expect(split.inline).toHaveLength(count);
			expect(split.overflow).toEqual([]);
			expect(split.lastAction).toBeNull();
		});
	});

	it('keeps two on screen once there is a fourth', () => {
		const split = splitNouveauActions(actions(4));
		expect(split.needsOverflow).toBe(true);
		expect(split.inline.map((a) => a.id)).toEqual(['action-0', 'action-1']);
		expect(split.overflow.map((a) => a.id)).toEqual(['action-2', 'action-3']);
	});

	// Lose this and the right edge of the row dead ends on most items, because the hand off it was
	// carrying went behind the More button with it.
	it('hands the More button the last action, which is always a hidden one', () => {
		[4, 7, 12].forEach((count) => {
			const split = splitNouveauActions(actions(count));
			expect(split.lastAction.id).toBe(`action-${count - 1}`);
			expect(split.overflow).toContain(split.lastAction);
		});
	});

	it('copes with being handed nothing at all', () => {
		expect(splitNouveauActions().inline).toEqual([]);
		expect(splitNouveauActions(null).needsOverflow).toBe(false);
	});
});
