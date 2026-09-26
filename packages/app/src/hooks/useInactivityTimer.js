import {useState, useEffect, useCallback, useRef} from 'react';

const useInactivityTimer = (timeoutSeconds = 90, enabled = true) => {
	const [isInactive, setIsInactive] = useState(false);
	const timerRef = useRef(null);
	const enabledRef = useRef(enabled);
	const timeoutRef = useRef(timeoutSeconds);
	const inactiveRef = useRef(false);

	enabledRef.current = enabled;
	timeoutRef.current = timeoutSeconds;
	inactiveRef.current = isInactive;

	const dismiss = useCallback(() => {
		setIsInactive(false);
		if (enabledRef.current) {
			timerRef.current = setTimeout(() => {
				setIsInactive(true);
			}, timeoutRef.current * 1000);
		}
	}, []);

	// Added once, ahead of the window listeners the screens add later, so the key that wakes the screensaver goes no further.
	useEffect(() => {
		const handleWakeKey = (e) => {
			if (!inactiveRef.current) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			dismiss();
		};
		window.addEventListener('keydown', handleWakeKey, true);
		return () => window.removeEventListener('keydown', handleWakeKey, true);
	}, [dismiss]);

	useEffect(() => {
		if (!enabled) {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			setIsInactive(false);
			return;
		}

		const handleActivity = () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
			setIsInactive(false);
			timerRef.current = setTimeout(() => {
				setIsInactive(true);
			}, timeoutRef.current * 1000);
		};

		const events = ['keydown', 'mousedown', 'touchstart'];
		events.forEach(event => window.addEventListener(event, handleActivity, {passive: true, capture: true}));

		timerRef.current = setTimeout(() => {
			setIsInactive(true);
		}, timeoutRef.current * 1000);

		return () => {
			events.forEach(event => window.removeEventListener(event, handleActivity, true));
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [enabled]);

	return {isInactive, dismiss};
};

export default useInactivityTimer;
