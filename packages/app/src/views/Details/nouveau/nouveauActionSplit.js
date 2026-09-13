// Nouveau keeps its action row short. Up to three secondary buttons all stay on screen, and past
// that only two do with the rest moving behind a More button.
//
// This is deliberately not `countSplit` from utils/buttonLayout. That one counts the primary button
// into its total and derives the threshold from the cap, so no argument to it produces three then
// two. Other rows depend on how it behaves today, so this brings its own rule rather than
// changing one they share.

export const MAX_SECONDARY_WITHOUT_OVERFLOW = 3;
export const VISIBLE_SECONDARY_WITH_OVERFLOW = 2;

export const splitNouveauActions = (secondaryActions) => {
	const actions = Array.isArray(secondaryActions) ? secondaryActions : [];
	const needsOverflow = actions.length > MAX_SECONDARY_WITHOUT_OVERFLOW;

	if (!needsOverflow) {
		return {inline: actions, overflow: [], lastAction: null, needsOverflow: false};
	}

	return {
		inline: actions.slice(0, VISIBLE_SECONDARY_WITH_OVERFLOW),
		overflow: actions.slice(VISIBLE_SECONDARY_WITH_OVERFLOW),
		// The More button stands in for everything it hides, so it answers the arrows with the last
		// action's own callbacks. That action is always one of the hidden ones once the row has
		// overflowed, and it is where the hand off past the right edge of the row lives.
		lastAction: actions[actions.length - 1],
		needsOverflow: true
	};
};
