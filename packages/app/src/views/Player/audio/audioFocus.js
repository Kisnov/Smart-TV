import Spotlight from '@enact/spotlight';

// The audio player's vertical focus chain. Up from the seekbar walks into the
// queue or lyrics panel, and once inside, the panel's rows own up and down, so
// only left or back leaves it again. The dock row keeps the shared player's
// "bottom" name so the existing controls stay focusable without a special case.
const CHAIN = ['panel', 'progress', 'bottom'];

export const AUDIO_FOCUS_IDS = {
	panel: 'audio-panel',
	progress: 'progress-bar',
	bottom: 'play-pause-btn'
};

export const nextAudioFocusRow = (current, direction) => {
	const index = CHAIN.indexOf(current);
	if (index < 0) return current;
	const next = index + (direction === 'up' ? -1 : 1);
	if (next < 0 || next >= CHAIN.length) return current;
	return CHAIN[next];
};

// The row has to stop being spotlightDisabled before it can take focus, so the
// focus call waits for the render that clears it.
export const focusAudioRow = (row) => {
	window.requestAnimationFrame(() => Spotlight.focus(AUDIO_FOCUS_IDS[row]));
};

export const exitAudioPanel = (setFocusRow) => {
	setFocusRow('progress');
	focusAudioRow('progress');
};

// Walks the chain for both players. Returns true when the key was the audio
// player's to handle, which is every key while the panel holds focus since its
// own rows answer up and down.
export const handleAudioFocusKey = (e, {focusRow, setFocusRow, showControls}) => {
	const isUp = e.key === 'ArrowUp' || e.keyCode === 38;
	const isDown = e.key === 'ArrowDown' || e.keyCode === 40;

	if (focusRow === 'panel') {
		if (e.key === 'ArrowLeft' || e.keyCode === 37) {
			e.preventDefault();
			exitAudioPanel(setFocusRow);
		}
		return true;
	}

	if (isUp || isDown) {
		e.preventDefault();
		showControls();
		const next = nextAudioFocusRow(focusRow, isUp ? 'up' : 'down');
		setFocusRow(next);
		focusAudioRow(next);
		return true;
	}

	return false;
};
