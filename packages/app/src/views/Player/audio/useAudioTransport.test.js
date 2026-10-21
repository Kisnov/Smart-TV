import {renderHook, act} from '@testing-library/react';

import useAudioTransport from './useAudioTransport';
import {nextAudioFocusRow} from './audioFocus';

jest.mock('@enact/spotlight', () => ({focus: jest.fn()}));
jest.mock('../../../services/playback', () => ({reportStop: jest.fn()}));

describe('nextAudioFocusRow', () => {
	test('up walks from the dock to the seekbar and on into the panel', () => {
		expect(nextAudioFocusRow('bottom', 'up')).toBe('progress');
		expect(nextAudioFocusRow('progress', 'up')).toBe('panel');
	});

	test('down walks back to the dock and stops there', () => {
		expect(nextAudioFocusRow('progress', 'down')).toBe('bottom');
		expect(nextAudioFocusRow('bottom', 'down')).toBe('bottom');
	});
});

describe('useAudioTransport panel toggles', () => {
	beforeEach(() => {
		jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
	});

	afterEach(() => jest.restoreAllMocks());

	const setup = (hasLyrics) => {
		const setFocusRow = jest.fn();
		const {result} = renderHook(() => useAudioTransport({
			item: {Id: 'a'},
			audioPlaylist: [{Id: 'a'}, {Id: 'b'}],
			isAudioMode: true,
			positionRef: {current: 0},
			setFocusRow,
			hasLyrics
		}));
		return {result, setFocusRow};
	};

	test('lyrics lead when the track has them, and Up Next stands in when it has none', () => {
		expect(setup(true).result.current.audioPanel).toBe('lyrics');
		expect(setup(false).result.current.audioPanel).toBe('queue');
	});

	test('the other toggle swaps the panel and the one showing walks into it', () => {
		const {result, setFocusRow} = setup(true);
		act(() => result.current.handleSelectAudioPanel('queue'));
		expect(result.current.audioPanel).toBe('queue');
		expect(setFocusRow).not.toHaveBeenCalled();

		act(() => result.current.handleSelectAudioPanel('queue'));
		expect(setFocusRow).toHaveBeenCalledWith('panel');
	});

	test('Up Next walks straight in when there are no lyrics to swap from', () => {
		const {result, setFocusRow} = setup(false);
		act(() => result.current.handleSelectAudioPanel('queue'));
		expect(setFocusRow).toHaveBeenCalledWith('panel');
	});
});
