import {createContext, useContext, useEffect, useState} from 'react';

import * as achievementsApi from '../services/achievementsApi';
import {useAuth} from './AuthContext';

// Whether this server runs the Achievement Badges plugin, which is what decides whether the
// settings entry exists at all. False until a probe says otherwise, so the entry stays hidden on
// every server that does not run it, and cleared on the way out so it cannot survive into the
// next one.

const CLEARED = {available: false, leaderboardEnabled: true, questsEnabled: true};

const AchievementsContext = createContext(CLEARED);

export const AchievementsProvider = ({children}) => {
	const {isAuthenticated, serverUrl, accessToken} = useAuth();
	const [state, setState] = useState(CLEARED);

	// Keyed off the token as well as the server, since the probe reads both from the api module
	// and a sign in sets them a moment after it reports itself authenticated.
	useEffect(() => {
		achievementsApi.reset();
		setState(CLEARED);
		if (!isAuthenticated || !serverUrl || !accessToken) return undefined;

		let cancelled = false;
		achievementsApi.probe().then((available) => {
			if (cancelled) return;
			setState({available, ...achievementsApi.getFlags()});
			// The plugin counts a daily login from this and nothing else, so it is the one call
			// the client has to make rather than read.
			if (available) achievementsApi.sendLoginPing();
		});
		return () => {
			cancelled = true;
		};
	}, [isAuthenticated, serverUrl, accessToken]);

	return <AchievementsContext.Provider value={state}>{children}</AchievementsContext.Provider>;
};

export const useAchievements = () => useContext(AchievementsContext);
