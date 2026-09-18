import {useCallback, useEffect, useState} from 'react';

import * as achievementsApi from '../../../services/achievementsApi';
import {
	AchievementsView, AchievementsBadgesView, AchievementsBadgeView, AchievementsQuestsView,
	AchievementsLeaderboardView, AchievementsRecapView, AchievementsLibraryView
} from './AchievementsViews';

// Every achievement screen renders from here so the one load survives moving between them. Each
// of them reads a slice of it, and only the leaderboard and the recap ask the server for
// anything more.
export const ACHIEVEMENT_VIEWS = [
	'achievements', 'achievementsBadges', 'achievementsBadge', 'achievementsQuests',
	'achievementsLeaderboard', 'achievementsRecap', 'achievementsLibrary'
];

const AchievementsScreens = ({view, badgeId, onOpen, onSelectItem}) => {
	const [overview, setOverview] = useState(null);
	const [loading, setLoading] = useState(true);
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		achievementsApi.loadOverview().then((next) => {
			if (cancelled) return;
			setOverview(next);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [attempt]);

	const reload = useCallback(() => setAttempt((n) => n + 1), []);

	const openBadge = useCallback(
		(id) => onOpen('achievementsBadge', `achievement-badge-${id}`, id),
		[onOpen]
	);

	if (view === 'achievementsBadges') {
		return (
			<AchievementsBadgesView
				badges={overview ? overview.badges : []}
				onOpenBadge={openBadge}
			/>
		);
	}
	if (view === 'achievementsBadge') {
		const badge = (overview ? overview.badges : []).find((entry) => entry.id === badgeId);
		return badge ? <AchievementsBadgeView badge={badge} onSelectItem={onSelectItem} /> : null;
	}
	if (view === 'achievementsQuests') {
		return <AchievementsQuestsView quests={overview && overview.quests ? overview.quests : {daily: [], weekly: []}} />;
	}
	if (view === 'achievementsLeaderboard') {
		return <AchievementsLeaderboardView initial={overview ? overview.leaderboard : []} />;
	}
	if (view === 'achievementsRecap') {
		return <AchievementsRecapView initial={overview ? overview.recap : null} />;
	}
	if (view === 'achievementsLibrary') {
		return <AchievementsLibraryView completion={overview ? overview.libraryCompletion : {}} />;
	}

	return <AchievementsView overview={overview} loading={loading} onReload={reload} onOpen={onOpen} />;
};

export default AchievementsScreens;
