import {useCallback, useEffect, useMemo, useState} from 'react';
import $L from '@enact/i18n/$L';

import * as achievementsApi from '../../../services/achievementsApi';
import {BADGE_FILTERS, groupBadges, leaderboardValue, parseHexColor, rarityColor} from '../../../utils/achievementsModel';
import {achievementIconPath} from './achievementIcons';
import DetailsTabBar from '../../../components/DetailsTabBar/DetailsTabBar';
import SettingsView from '../SettingsView';
import {SectionTitle, NavRow} from '../settingsRows';
import {SpottableDiv} from '../settingsSpottables';

import settingsCss from '../Settings.module.less';
import css from './Achievements.module.less';

const ACCENT = '#00a4dc';

// The plugin has no category name for the overall board, but a tab still needs an id of its own.
const OVERALL_BOARD = 'score';
const BOARDS = [OVERALL_BOARD, 'movies', 'episodes', 'hours', 'streak', 'series', 'unlocked'];
const PERIODS = ['week', 'month', 'year'];

const tint = (hex, alpha = 0.18) => {
	const value = parseHexColor(hex) || ACCENT;
	const n = parseInt(value.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// The fill and outline a settings icon shell wears, in whatever colour the badge carries.
const shell = (color) => ({background: tint(color), borderColor: tint(color, 0.45), color});

const percent = (value) => `${Math.round(value * 100)}%`;

const mediumDate = (date) =>
	date.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});

const Icon = ({name, className}) => (
	<svg className={className} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
		<path d={achievementIconPath(name)} />
	</svg>
);

const Bar = ({value, color, slim}) => (
	<div className={`${css.bar}${slim ? ` ${css.barSlim}` : ''}`}>
		<div className={css.barFill} style={{width: percent(value), background: color}} />
	</div>
);

const Chip = ({icon, label}) => (
	<div className={css.chip}>
		<Icon name={icon} className={css.chipIcon} />
		<span>{label}</span>
	</div>
);

// The same bar the search results use, so a tab reads and behaves the same wherever it appears.
// Only the badge filter follows focus, since the other two fetch and would leave the bar and the
// rows disagreeing while an answer was still out.
const Tabs = ({ids, labels, activeId, onSelect, spotlightId, expanded = false}) => (
	<DetailsTabBar
		className={css.tabs}
		tabs={ids.map((id, index) => ({id, label: labels[index]}))}
		activeId={activeId}
		activeSpotlightId={`${spotlightId}-active`}
		onSelect={onSelect}
		onActivate={onSelect}
		expanded={expanded}
		spotlightId={spotlightId}
	/>
);

// One row that opens one of the screens below this one, so the handler belongs to the row rather
// than being rebuilt for every row on every render.
const OpenScreenRow = ({id, title, desc, icon, view, onOpen, enabled = true}) => {
	const handleClick = useCallback(() => onOpen(view, `setting-${id}`), [onOpen, view, id]);
	return <NavRow id={id} title={title} desc={desc} icon={icon} onClick={enabled ? handleClick : null} />;
};

const Message = ({children}) => <div className={css.message}>{children}</div>;

// A row that is there to be read rather than pressed. It still has to take focus, because a list
// whose rows cannot be focused is a list the remote cannot scroll.
const ReadOnlyRow = ({spotlightId, children}) => (
	<SpottableDiv className={settingsCss.listItem} spotlightId={spotlightId}>
		{children}
	</SpottableDiv>
);

const BadgeRow = ({badge}) => {
	const color = rarityColor(badge.rarity);
	const showsProgress = !badge.unlocked && badge.targetValue > 0;

	return (
		<ReadOnlyRow spotlightId={`achievement-badge-${badge.id}`}>
			<div
				className={`${css.badgeAvatar}${badge.unlocked ? '' : ` ${css.badgeAvatarLocked}`}`}
				style={shell(color)}
			>
				<Icon name={badge.icon} className={css.badgeIcon} />
			</div>
			<div className={settingsCss.listItemBody}>
				<div className={settingsCss.listItemHeading}>
					{badge.isSecret ? $L('Hidden achievement') : badge.title}
				</div>
				{badge.description && !badge.descriptionHidden && (
					<div className={settingsCss.listItemCaption}>{badge.description}</div>
				)}
				{showsProgress && (
					<>
						<div className={css.rowBar}><Bar value={badge.progress} color={color} slim /></div>
						<div className={css.progressText}>{`${badge.currentValue} / ${badge.targetValue}`}</div>
					</>
				)}
				{badge.unlocked && badge.unlockedAt && (
					<div className={css.progressText}>
						{$L('Unlocked {date}').replace('{date}', mediumDate(badge.unlockedAt))}
					</div>
				)}
			</div>
			<div className={css.trailingStack}>
				<div className={css.rarity} style={{color}}>{badge.rarity}</div>
				<div className={css.points}>{$L('{points} pts').replace('{points}', String(badge.score))}</div>
			</div>
		</ReadOnlyRow>
	);
};

const CategorySection = ({group, open, onToggle}) => {
	const handleToggle = useCallback(() => onToggle(group.category), [onToggle, group.category]);

	return (
		<>
			<NavRow
				id={`achievement-category-${group.category}`}
				title={group.category}
				desc={$L('{unlocked} of {total} badges')
					.replace('{unlocked}', String(group.unlocked))
					.replace('{total}', String(group.badges.length))}
				icon={open ? 'folder_open' : 'folder'}
				onClick={handleToggle}
			/>
			{open && group.badges.map((badge) => <BadgeRow key={badge.id} badge={badge} />)}
		</>
	);
};

const RankHeader = ({rank, summary}) => {
	const color = (rank && parseHexColor(rank.tier.color)) || ACCENT;

	return (
		<div className={css.rankHeader}>
			{rank && (
				<>
					<div className={css.rankRow}>
						<div className={css.rankAvatar} style={shell(color)}>
							<Icon name={rank.tier.icon} className={css.rankAvatarIcon} />
						</div>
						<div>
							<div className={css.rankName}>{rank.tier.name}</div>
							<div className={css.rankScore}>
								{$L('{score} points').replace('{score}', String(rank.score))}
							</div>
						</div>
					</div>
					<Bar value={rank.progressToNext / 100} color={color} />
					<div className={css.rankNote}>
						{rank.nextTier
							? $L('{points} points to {tier}')
								.replace('{points}', String(Math.max(0, rank.nextTier.minScore - rank.score)))
								.replace('{tier}', rank.nextTier.name)
							: $L('Top rank reached')}
					</div>
				</>
			)}
			{summary && (
				<div className={css.chips} style={rank ? {marginTop: '20px'} : null}>
					<Chip
						icon="military_tech"
						label={$L('{unlocked} of {total} badges')
							.replace('{unlocked}', String(summary.unlocked))
							.replace('{total}', String(summary.total))}
					/>
					<Chip icon="percent" label={`${summary.percentage.toFixed(1)}%`} />
					<Chip
						icon="local_fire_department"
						label={$L('{days} day streak').replace('{days}', String(summary.currentWatchStreak))}
					/>
					<Chip
						icon="emoji_events"
						label={$L('Best: {days} days').replace('{days}', String(summary.bestWatchStreak))}
					/>
				</div>
			)}
		</div>
	);
};

const Showcase = ({badges}) => (
	<>
		<SectionTitle>{$L('Showcase')}</SectionTitle>
		<div className={css.showcase}>
			{badges.map((badge) => {
				const color = rarityColor(badge.rarity);
				return (
					<div key={badge.id} className={css.showcaseItem}>
						<div className={css.showcaseAvatar} style={shell(color)}>
							<Icon name={badge.icon} className={css.showcaseIcon} />
						</div>
						<div className={css.showcaseTitle}>{badge.title}</div>
					</div>
				);
			})}
		</div>
	</>
);

export const AchievementsView = ({overview, loading, onReload, onOpen}) => {
	if (loading) return <SettingsView spotlightId="achievements-view"><Message>{$L('Loading...')}</Message></SettingsView>;

	if (!overview) {
		return (
			<SettingsView spotlightId="achievements-view">
				<Message>{$L('Could not load your achievements.')}</Message>
				<div className={css.retryRow}>
					<SpottableDiv className={css.retryButton} spotlightId="achievements-retry" onClick={onReload}>
						{$L('Retry')}
					</SpottableDiv>
				</div>
			</SettingsView>
		);
	}

	const unlocked = overview.badges.filter((badge) => badge.unlocked).length;
	const questCount = overview.quests
		? [...overview.quests.daily, ...overview.quests.weekly].filter((quest) => quest.completed).length
		: 0;
	const libraries = Object.keys(overview.libraryCompletion);

	return (
		<SettingsView spotlightId="achievements-view">
			<RankHeader rank={overview.rank} summary={overview.summary} />
			{overview.equipped.length > 0 && <Showcase badges={overview.equipped} />}
			<OpenScreenRow
				id="achievements-badges"
				title={$L('Badges')}
				desc={$L('{unlocked} of {total} badges')
					.replace('{unlocked}', String(unlocked))
					.replace('{total}', String(overview.badges.length))}
				icon="military_tech"
				view="achievementsBadges"
				onOpen={onOpen}
				enabled={overview.badges.length > 0}
			/>
			{overview.questsEnabled && overview.quests && !overview.quests.isEmpty && (
				<OpenScreenRow
					id="achievements-quests"
					title={$L('Quests')}
					desc={$L('{count} completed').replace('{count}', String(questCount))}
					icon="task_alt"
					view="achievementsQuests"
					onOpen={onOpen}
				/>
			)}
			{overview.leaderboardEnabled && (
				<OpenScreenRow
					id="achievements-leaderboard"
					title={$L('Leaderboard')}
					desc={$L('How you compare with other users on this server')}
					icon="leaderboard"
					view="achievementsLeaderboard"
					onOpen={onOpen}
				/>
			)}
			<OpenScreenRow
				id="achievements-recap"
				title={$L('Recap')}
				desc={$L('What you watched recently')}
				icon="insights"
				view="achievementsRecap"
				onOpen={onOpen}
			/>
			{libraries.length > 0 && (
				<OpenScreenRow
					id="achievements-libraries"
					title={$L('Library completion')}
					desc={$L('{count} libraries').replace('{count}', String(libraries.length))}
					icon="collections_bookmark"
					view="achievementsLibrary"
					onOpen={onOpen}
				/>
			)}
		</SettingsView>
	);
};

export const AchievementsBadgesView = ({badges}) => {
	const [filter, setFilter] = useState(BADGE_FILTERS[0]);
	const [open, setOpen] = useState([]);

	const groups = useMemo(
		() => groupBadges(badges, filter, $L('Other')),
		[badges, filter]
	);

	const toggle = useCallback((category) => {
		setOpen((prev) => (prev.includes(category)
			? prev.filter((name) => name !== category)
			: [...prev, category]));
	}, []);

	return (
		<SettingsView spotlightId="achievements-badges-view">
			<Tabs
				ids={BADGE_FILTERS}
				labels={[$L('All'), $L('Unlocked'), $L('Locked')]}
				activeId={filter}
				onSelect={setFilter}
				spotlightId="achievement-filter"
				expanded
			/>
			{groups.length === 0
				? <Message>{$L('Nothing here yet.')}</Message>
				: groups.map((group) => (
					<CategorySection
						key={group.category}
						group={group}
						open={open.includes(group.category)}
						onToggle={toggle}
					/>
				))}
		</SettingsView>
	);
};

const QuestRow = ({quest}) => (
	<ReadOnlyRow spotlightId={`achievement-quest-${quest.id}`}>
		<div className={css.badgeAvatar} style={shell(ACCENT)}>
			<Icon name={quest.completed ? 'check_circle' : quest.icon} className={css.badgeIcon} />
		</div>
		<div className={settingsCss.listItemBody}>
			<div className={settingsCss.listItemHeading}>{quest.title}</div>
			{quest.description && <div className={settingsCss.listItemCaption}>{quest.description}</div>}
			<div className={css.rowBar}><Bar value={quest.progress} color={ACCENT} slim /></div>
			<div className={css.progressText}>{`${quest.current} / ${quest.target}`}</div>
		</div>
		<div className={css.reward}>{$L('+{points}').replace('{points}', String(quest.reward))}</div>
	</ReadOnlyRow>
);

export const AchievementsQuestsView = ({quests}) => (
	<SettingsView spotlightId="achievements-quests-view">
		{quests.daily.length > 0 && (
			<>
				<SectionTitle>{$L('Daily')}</SectionTitle>
				{quests.daily.map((quest) => <QuestRow key={quest.id} quest={quest} />)}
			</>
		)}
		{quests.weekly.length > 0 && (
			<>
				<SectionTitle>{$L('Weekly')}</SectionTitle>
				{quests.weekly.map((quest) => <QuestRow key={quest.id} quest={quest} />)}
			</>
		)}
	</SettingsView>
);

export const AchievementsLeaderboardView = ({initial}) => {
	const [board, setBoard] = useState(OVERALL_BOARD);
	const [entries, setEntries] = useState(initial);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (board === OVERALL_BOARD) {
			setEntries(initial);
			return undefined;
		}
		let cancelled = false;
		setLoading(true);
		achievementsApi.fetchLeaderboard({category: board}).then((rows) => {
			if (cancelled) return;
			setEntries(rows);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [board, initial]);

	const selectBoard = useCallback((id) => {
		if (!loading) setBoard(id);
	}, [loading]);

	const labels = [
		$L('Score'), $L('Movies'), $L('Episodes'), $L('Hours'),
		$L('Streak'), $L('Series'), $L('Badges')
	];

	return (
		<SettingsView spotlightId="achievements-leaderboard-view">
			<Tabs
				ids={BOARDS}
				labels={labels}
				activeId={board}
				onSelect={selectBoard}
				spotlightId="achievement-board"
			/>
			{loading && <Message>{$L('Loading...')}</Message>}
			{!loading && entries.length === 0 && <Message>{$L('Nothing here yet.')}</Message>}
			{!loading && entries.map((entry, index) => (
				<ReadOnlyRow key={entry.userId || index} spotlightId={`achievement-board-row-${index}`}>
					<div className={css.rankGutter}>{index + 1}</div>
					<div className={settingsCss.listItemBody}>
						<div className={settingsCss.listItemHeading}>{entry.userName}</div>
						{(entry.customTitle || entry.unlocked !== null) && (
							<div className={settingsCss.listItemCaption}>
								{entry.customTitle || $L('{unlocked} of {total} badges')
									.replace('{unlocked}', String(entry.unlocked))
									.replace('{total}', String(entry.total || 0))}
							</div>
						)}
					</div>
					<div className={css.boardValue}>{leaderboardValue(entry)}</div>
				</ReadOnlyRow>
			))}
		</SettingsView>
	);
};

const CountList = ({title, counts, idPrefix}) => (
	<>
		<SectionTitle>{title}</SectionTitle>
		{counts.map((count, index) => (
			<ReadOnlyRow key={count.name} spotlightId={`${idPrefix}-${index}`}>
				<div className={settingsCss.listItemBody}>
					<div className={settingsCss.listItemHeading}>{count.name}</div>
				</div>
				<div className={css.boardValue}>{count.count}</div>
			</ReadOnlyRow>
		))}
	</>
);

export const AchievementsRecapView = ({initial}) => {
	const [period, setPeriod] = useState(achievementsApi.DEFAULT_RECAP_PERIOD);
	const [recap, setRecap] = useState(initial);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (period === achievementsApi.DEFAULT_RECAP_PERIOD) {
			setRecap(initial);
			return undefined;
		}
		let cancelled = false;
		setLoading(true);
		achievementsApi.fetchRecap(period).then((next) => {
			if (cancelled) return;
			setRecap(next);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [period, initial]);

	const selectPeriod = useCallback((id) => {
		if (!loading) setPeriod(id);
	}, [loading]);

	return (
		<SettingsView spotlightId="achievements-recap-view">
			<Tabs
				ids={PERIODS}
				labels={[$L('Week'), $L('Month'), $L('Year')]}
				activeId={period}
				onSelect={selectPeriod}
				spotlightId="achievement-period"
			/>
			{loading && <Message>{$L('Loading...')}</Message>}
			{!loading && !recap && <Message>{$L('Nothing here yet.')}</Message>}
			{!loading && recap && (
				<>
					<div className={css.chips} style={{padding: '0 24px 16px'}}>
						<Chip icon="movie" label={`${recap.moviesWatched} ${$L('Movies')}`} />
						<Chip icon="live_tv" label={`${recap.episodesWatched} ${$L('Episodes')}`} />
						<Chip
							icon="calendar_month"
							label={$L('{count} days watched').replace('{count}', String(recap.daysWatched))}
						/>
						<Chip
							icon="military_tech"
							label={$L('{count} badges earned').replace('{count}', String(recap.badgesUnlocked))}
						/>
					</div>
					{recap.topGenres.length > 0 && (
						<CountList title={$L('Genres')} counts={recap.topGenres} idPrefix="achievement-genre" />
					)}
					{recap.topDirectors.length > 0 && (
						<CountList title={$L('Top directors')} counts={recap.topDirectors} idPrefix="achievement-director" />
					)}
					{recap.topActors.length > 0 && (
						<CountList title={$L('Top actors')} counts={recap.topActors} idPrefix="achievement-actor" />
					)}
				</>
			)}
		</SettingsView>
	);
};

export const AchievementsLibraryView = ({completion}) => (
	<SettingsView spotlightId="achievements-library-view">
		{Object.keys(completion).sort().map((name) => (
			<ReadOnlyRow key={name} spotlightId={`achievement-library-${name}`}>
				<div className={settingsCss.listItemBody}>
					<div className={settingsCss.listItemHeading}>{name}</div>
					<div className={css.rowBar}>
						<Bar value={Math.min(1, Math.max(0, completion[name] / 100))} color={ACCENT} slim />
					</div>
				</div>
				<div className={css.boardValue}>{`${completion[name]}%`}</div>
			</ReadOnlyRow>
		))}
	</SettingsView>
);
