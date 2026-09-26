import {renderHook, act} from '@testing-library/react';

import useInactivityTimer from './useInactivityTimer';

// A screen's own window listener, added after the hook like App's Back handler or the player's.
const pressKey = (screen) => {
	const event = new window.KeyboardEvent('keydown', {bubbles: true, cancelable: true});
	window.addEventListener('keydown', screen, true);
	act(() => {
		document.body.dispatchEvent(event);
	});
	window.removeEventListener('keydown', screen, true);
	return event;
};

beforeEach(() => {
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
});

describe('useInactivityTimer', () => {
	test('the key that wakes the screensaver reaches nothing behind it', () => {
		const {result} = renderHook(() => useInactivityTimer(1, true));
		act(() => jest.advanceTimersByTime(1000));
		const screen = jest.fn();

		const event = pressKey(screen);

		expect(result.current.isInactive).toBe(false);
		expect(screen).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(true);
	});

	test('keys pressed while the screensaver is down reach the screen', () => {
		const {result} = renderHook(() => useInactivityTimer(1, true));
		act(() => jest.advanceTimersByTime(1000));
		pressKey(jest.fn());
		const screen = jest.fn();

		const event = pressKey(screen);

		expect(result.current.isInactive).toBe(false);
		expect(screen).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(false);
	});
});
