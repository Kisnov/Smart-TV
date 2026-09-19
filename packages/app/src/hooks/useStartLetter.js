// The alphabet strip down the side of the favorites and library grids. Picking a letter
// narrows the grid to it and hands focus to the results, so the next press moves through
// them rather than along the letters. Picking the same letter again clears it.

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import Spotlight from '@enact/spotlight';

import {filterByStartLetter} from '../utils/gridChrome';

const useStartLetter = ({allItems, isLoading, gridSpotlightId}) => {
	const [startLetter, setStartLetter] = useState(null);

	const items = useMemo(() => filterByStartLetter(allItems, startLetter), [allItems, startLetter]);

	const handleLetterSelect = useCallback((ev) => {
		const letter = ev.currentTarget?.dataset?.letter;
		if (letter) {
			setStartLetter(letter === startLetter ? null : letter);
		}
	}, [startLetter]);

	// Which letter the grid was last handed focus for. The effect below has to
	// watch the rebuilt list to know when to move, and that list also rebuilds
	// for a filter or a search the viewer ran from somewhere else entirely.
	// Without this it would answer those too and pull focus out of whatever
	// panel they were working in.
	const focusedForLetterRef = useRef(null);

	// The grid rebuilds around the narrower list, so the focus waits for it to settle.
	useEffect(() => {
		if (!startLetter) {
			// Cleared, so the same letter picked again is a fresh pick.
			focusedForLetterRef.current = null;
			return undefined;
		}
		if (items.length === 0 || isLoading) return undefined;
		if (focusedForLetterRef.current === startLetter) return undefined;
		focusedForLetterRef.current = startLetter;
		const id = setTimeout(() => Spotlight.focus(gridSpotlightId), 100);
		return () => clearTimeout(id);
	}, [startLetter, items.length, isLoading, gridSpotlightId]);

	return {startLetter, handleLetterSelect, items};
};

export default useStartLetter;
