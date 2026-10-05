import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';

import * as achievementsApi from '../services/achievementsApi';
import {useAuth} from './AuthContext';

// Whether this server runs the Achievement Badges plugin, which is what decides whether the
// settings entry exists at all. False until a probe says otherwise, so the entry stays hidden on
// every server that does not run it, and cleared on the way out so it cannot survive into the
// next one.

const CLEARED = {available: false, leaderboardEnabled: true, questsEnabled: true, unlockToastsAvailable: false};

// How often newly unlocked badges are asked for. The plugin gives each user 60 requests a
// minute across all of its routes, and a read is one or two of them.
const UNLOCK_POLL_MS = 30000;

const AchievementsContext = createContext({...CLEARED, unlocks: null, clearUnlocks: () => {}});

export const AchievementsProvider = ({children}) => {
	const {isAuthenticated, serverUrl, accessToken} = useAuth();
	const [state, setState] = useState(CLEARED);
	// Badges the last read turned up that the user wants to hear about, until the shell has
	// shown them.
	const [unlocks, setUnlocks] = useState(null);

	// Keyed off the token as well as the server, since the probe reads both from the api module
	// and a sign in sets them a moment after it reports itself authenticated.
	useEffect(() => {
		achievementsApi.reset();
		setState(CLEARED);
		setUnlocks(null);
		if (!isAuthenticated || !serverUrl || !accessToken) return undefined;

		let cancelled = false;
		achievementsApi.probe().then((available) => {
			if (cancelled) return;
			const flags = achievementsApi.getFlags();
			setState({available, ...flags, unlockToastsAvailable: available && flags.unlockToastsEnabled});
			// The plugin counts a daily login from this and nothing else, so it is the one call
			// the client has to make rather than read.
			if (available) achievementsApi.sendLoginPing();
		});
		return () => {
			cancelled = true;
		};
	}, [isAuthenticated, serverUrl, accessToken]);

	// The reads stop while the app is hidden and pick up again, with one straight away, when
	// it comes back.
	useEffect(() => {
		if (!state.unlockToastsAvailable) return undefined;
		let timer = null;
		const poll = () => {
			achievementsApi.refreshUnlocks().then((found) => {
				if (found) setUnlocks({...found, key: Date.now()});
			});
		};
		const start = () => {
			if (timer) return;
			poll();
			timer = setInterval(poll, UNLOCK_POLL_MS);
		};
		const stop = () => {
			clearInterval(timer);
			timer = null;
		};
		const onVisibility = () => (document.hidden ? stop() : start());
		document.addEventListener('visibilitychange', onVisibility);
		if (!document.hidden) start();
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			stop();
		};
	}, [state.unlockToastsAvailable]);

	const clearUnlocks = useCallback(() => setUnlocks(null), []);
	const value = useMemo(() => ({...state, unlocks, clearUnlocks}), [state, unlocks, clearUnlocks]);

	return <AchievementsContext.Provider value={value}>{children}</AchievementsContext.Provider>;
};

export const useAchievements = () => useContext(AchievementsContext);
