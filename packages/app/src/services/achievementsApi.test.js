import {platformFetch} from './secureFetch';
import * as api from './achievementsApi';

jest.mock('./secureFetch', () => ({platformFetch: jest.fn()}));

let mockServerUrl = 'http://badges.test';
let mockToken = 'mockToken';
let mockUserId = 'user1';
let mockServerType = 'jellyfin';

jest.mock('./jellyfinApi', () => ({
	getServerUrl: () => mockServerUrl,
	getAuthHeader: () => 'MediaBrowser Token="mockToken"',
	getApiKey: () => mockToken,
	getUserId: () => mockUserId,
	getServerType: () => mockServerType
}));

jest.mock('../utils/serverRoutes', () => ({legacyAuthHeader: () => ({})}));

const ok = (body) => ({ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body))});
const missing = {ok: false, status: 404, text: () => Promise.resolve('')};

// The plugin's own route shapes, matched by suffix so a path carrying a query still finds one.
const serve = (routes) => {
	platformFetch.mockImplementation((url) => {
		const path = url.split('/Plugins/AchievementBadges/')[1];
		const match = Object.keys(routes).find((suffix) => path === suffix || path.startsWith(`${suffix}?`));
		return Promise.resolve(match ? ok(routes[match]) : missing);
	});
};

const paths = () => platformFetch.mock.calls.map((call) => call[0].split('/Plugins/AchievementBadges/')[1]);

const CONFIG = {LeaderboardEnabled: true, QuestsEnabled: true};

// One reroll a day and one a week, the same budget the plugin grants.
let rerollsLeft = {daily: 1, weekly: 1};
const serveWithReroll = (routes) => {
	platformFetch.mockImplementation((url) => {
		const path = url.split('/Plugins/AchievementBadges/')[1];
		const set = /quests\/(daily|weekly)\/reroll$/.exec(path);
		if (set) {
			const which = set[1];
			if (rerollsLeft[which] <= 0) return Promise.resolve({ok: false, status: 429, text: () => Promise.resolve('')});
			rerollsLeft[which] = 0;
			return Promise.resolve(ok({
				Quests: [{Id: `${which}-new`, Title: which === 'weekly' ? 'A fresh week' : 'A fresh day', Target: 1, Current: 0, Reward: 10}],
				RerollsRemaining: 0
			}));
		}
		const match = Object.keys(routes).find((suffix) => path === suffix || path.startsWith(`${suffix}?`));
		return Promise.resolve(match ? ok(routes[match]) : missing);
	});
};
const FULL = {
	'public-config': CONFIG,
	'users/user1/summary': {Unlocked: 12, Total: 200, Percentage: 6, Score: 430, CurrentWatchStreak: 3, BestWatchStreak: 9},
	'users/user1/rank': {Score: 430, Tier: {Name: 'Viewer', MinScore: 300, Color: '#2196f3', Icon: 'visibility'}, NextTier: {Name: 'Regular', MinScore: 700, Color: '#03a9f4', Icon: 'person'}, ProgressToNext: 32},
	'users/user1': [{Id: 'first-contact', Title: 'First Contact', Rarity: 'Common', Unlocked: true, UnlockedAt: '2026-09-01T00:00:00Z', Category: 'Getting Started', CurrentValue: 1, TargetValue: 1}],
	'users/user1/equipped': [{Id: 'first-contact', Title: 'First Contact', Rarity: 'Common', Unlocked: true}],
	'users/user1/quests': {Daily: [{Id: 'd1', Title: 'Movie Night', Reward: 30, Target: 1, Current: 0, Completed: false}], Weekly: []},
	'leaderboard': [{UserId: 'u1', UserName: 'Ada', Score: 430, Unlocked: 12, Total: 200}],
	'users/user1/recap': {Period: 'month', MoviesWatched: 4, EpisodesWatched: 18, DaysWatched: 11, BadgesUnlocked: 2, TopGenres: [{Name: 'Drama', Count: 9}]},
	'users/user1/library-completion': {LibraryCompletionPercents: {Movies: 63, Shows: 12}}
};

beforeEach(() => {
	platformFetch.mockReset();
	mockServerUrl = 'http://badges.test';
	mockToken = 'mockToken';
	mockUserId = 'user1';
	mockServerType = 'jellyfin';
	rerollsLeft = {daily: 1, weekly: 1};
	api.reset();
});

describe('availability', () => {
	test('a server running the plugin is available and reports what the admin left on', async () => {
		serve({'public-config': {LeaderboardEnabled: true, QuestsEnabled: false}});
		expect(await api.probe()).toBe(true);
		expect(api.getFlags()).toEqual({leaderboardEnabled: true, questsEnabled: false});
	});

	// A plugin too old to report a flag still serves the section, so only a definite no turns
	// one off.
	test('a flag the plugin never mentions is still on', async () => {
		serve({'public-config': {}});
		await api.probe();
		expect(api.getFlags()).toEqual({leaderboardEnabled: true, questsEnabled: true});
	});

	test('a server without the plugin is unavailable after one look', async () => {
		serve({});
		expect(await api.probe()).toBe(false);
		expect(paths()).toEqual(['public-config']);
	});

	test('an Emby server is never asked, since this is a Jellyfin plugin', async () => {
		mockServerType = 'emby';
		serve(FULL);
		expect(await api.probe()).toBe(false);
		expect(await api.loadOverview()).toBeNull();
		expect(platformFetch).not.toHaveBeenCalled();
	});

	test('a session with no token sends nothing', async () => {
		mockToken = null;
		serve(FULL);
		expect(await api.probe()).toBe(false);
		expect(platformFetch).not.toHaveBeenCalled();
	});

	test('reset puts the flags back, so they cannot survive a sign out', async () => {
		serve({'public-config': {LeaderboardEnabled: false, QuestsEnabled: false}});
		await api.probe();
		api.reset();
		expect(api.getFlags()).toEqual({leaderboardEnabled: true, questsEnabled: true});
	});
});

describe('overview', () => {
	test('reads the plugin PascalCase payloads into one shape', async () => {
		serve(FULL);
		await api.probe();
		const overview = await api.loadOverview();

		expect(overview.summary.unlocked).toBe(12);
		expect(overview.rank.tier.name).toBe('Viewer');
		expect(overview.rank.nextTier.name).toBe('Regular');
		expect(overview.badges).toHaveLength(1);
		expect(overview.equipped).toHaveLength(1);
		expect(overview.quests.daily).toHaveLength(1);
		expect(overview.leaderboard[0].userName).toBe('Ada');
		expect(overview.recap.moviesWatched).toBe(4);
		expect(overview.libraryCompletion).toEqual({Movies: 63, Shows: 12});
	});

	test('a section the admin switched off is not even asked for', async () => {
		serve({...FULL, 'public-config': {LeaderboardEnabled: false, QuestsEnabled: false}});
		await api.probe();
		const overview = await api.loadOverview();

		expect(overview.quests).toBeNull();
		expect(overview.leaderboard).toEqual([]);
		expect(paths().some((path) => path.indexOf('quests') >= 0)).toBe(false);
		expect(paths().some((path) => path.indexOf('leaderboard') >= 0)).toBe(false);
	});

	test('a plugin that answers nothing loads as nothing', async () => {
		serve({'public-config': CONFIG});
		await api.probe();
		expect(await api.loadOverview()).toBeNull();
	});

	test('a session without a user has nothing to load', async () => {
		mockUserId = null;
		serve(FULL);
		expect(await api.loadOverview()).toBeNull();
		expect(platformFetch).not.toHaveBeenCalled();
	});

	test('a trailing slash on the server address does not double up', async () => {
		mockServerUrl = 'http://badges.test/';
		serve(FULL);
		await api.probe();
		expect(platformFetch.mock.calls[0][0]).toBe('http://badges.test/Plugins/AchievementBadges/public-config');
	});

	test('a body that is not the shape asked for reads as no answer', async () => {
		platformFetch.mockResolvedValue(ok('a string, somehow'));
		await api.probe();
		expect(await api.loadOverview()).toBeNull();
	});

	test('a request that throws reads as no answer rather than breaking the screen', async () => {
		platformFetch.mockRejectedValue(new Error('network gone'));
		expect(await api.probe()).toBe(false);
		expect(await api.loadOverview()).toBeNull();
	});
});

describe('the boards and the recap', () => {
	test('an empty category asks for the overall board', async () => {
		serve(FULL);
		const entries = await api.fetchLeaderboard();
		expect(entries[0].score).toBe(430);
		expect(paths()).toEqual(['leaderboard?limit=10']);
	});

	test('a category board carries a value instead of a score', async () => {
		serve({'leaderboard/movies': [{UserId: 'u1', UserName: 'Ada', Value: 42}]});
		const entries = await api.fetchLeaderboard({category: 'movies'});
		expect(entries[0].value).toBe(42);
		expect(entries[0].score).toBeNull();
	});

	test('the board is not fetched when the admin turned it off', async () => {
		serve({...FULL, 'public-config': {LeaderboardEnabled: false}});
		await api.probe();
		platformFetch.mockClear();
		expect(await api.fetchLeaderboard()).toEqual([]);
		expect(platformFetch).not.toHaveBeenCalled();
	});

	test('the recap is refetched for the period asked for', async () => {
		serve({'users/user1/recap': {Period: 'year', DaysWatched: 11}});
		const recap = await api.fetchRecap('year');
		expect(recap.daysWatched).toBe(11);
		expect(paths()).toEqual(['users/user1/recap?period=year']);
	});
});

describe('the login ping', () => {
	test('is posted, since it is what keeps a daily streak alive', async () => {
		serve({'users/user1/login-ping': {}});
		await api.sendLoginPing();
		expect(platformFetch.mock.calls[0][0]).toBe('http://badges.test/Plugins/AchievementBadges/users/user1/login-ping');
		expect(platformFetch.mock.calls[0][1].method).toBe('POST');
	});

	test('has nowhere to go without a user', async () => {
		mockUserId = null;
		await api.sendLoginPing();
		expect(platformFetch).not.toHaveBeenCalled();
	});
});

describe('quest reroll', () => {
	test('a reroll swaps the set and spends the allowance', async () => {
		serveWithReroll(FULL);
		const result = await api.rerollQuests();

		expect(result.outcome).toBe('rerolled');
		expect(result.quests[0].title).toBe('A fresh day');
		expect(result.rerollsLeft).toBe(0);
		expect(paths()).toEqual(['users/user1/quests/daily/reroll']);
		expect(platformFetch.mock.calls[0][1].method).toBe('POST');
	});

	test('daily and weekly spend separately', async () => {
		serveWithReroll(FULL);
		await api.rerollQuests();

		const weekly = await api.rerollQuests({weekly: true});
		expect(weekly.outcome).toBe('rerolled');
		expect(weekly.quests[0].title).toBe('A fresh week');
	});

	test('a spent reroll reads as refused rather than broken', async () => {
		serveWithReroll(FULL);
		await api.rerollQuests();

		const again = await api.rerollQuests();
		expect(again.outcome).toBe('alreadyUsed');
		expect(again.quests).toBeUndefined();
	});

	test('anything else that goes wrong is a plain failure', async () => {
		platformFetch.mockResolvedValue({ok: false, status: 500, text: () => Promise.resolve('')});
		expect((await api.rerollQuests()).outcome).toBe('failed');

		platformFetch.mockRejectedValue(new Error('network gone'));
		expect((await api.rerollQuests()).outcome).toBe('failed');
	});

	test('a session without a user has nothing to reroll', async () => {
		mockUserId = null;
		serveWithReroll(FULL);
		expect((await api.rerollQuests()).outcome).toBe('failed');
		expect(platformFetch).not.toHaveBeenCalled();
	});

	test('the overview carries what is left to spend', async () => {
		serve({...FULL, 'users/user1/quests': {
			Daily: [{Id: 'd1', Title: 'Movie Night', Target: 1, Current: 0}],
			Weekly: [],
			DailyRerollsRemaining: 1,
			WeeklyRerollsRemaining: 0
		}});
		await api.probe();
		const overview = await api.loadOverview();

		expect(overview.quests.dailyRerollsLeft).toBe(1);
		expect(overview.quests.weeklyRerollsLeft).toBe(0);
	});
});

describe('badge suggestions', () => {
	const CHASE = {
		BadgeId: 'binge-titan',
		BadgeTitle: 'Binge Titan',
		Progress: {Current: 4, Target: 10},
		Items: [
			{Id: 'item-1', Name: 'Trolls Band Together', Type: 'Movie', Year: 2023, RunTimeMinutes: 91},
			{Id: 'item-2', Name: 'Turf War', Type: 'Episode', Year: 2012, RunTimeMinutes: 22}
		]
	};

	test('a badge carries its progress and what to watch', async () => {
		serve({'users/user1/chase/binge-titan': CHASE});
		const chase = await api.fetchBadgeChase('binge-titan');

		expect(chase.current).toBe(4);
		expect(chase.target).toBe(10);
		expect(chase.items).toHaveLength(2);
		expect(chase.items[0].name).toBe('Trolls Band Together');
		expect(chase.items[0].runtimeMinutes).toBe(91);
		expect(chase.items[0].id).toBe('item-1');
		expect(paths()).toEqual(['users/user1/chase/binge-titan?limit=10']);
	});

	test('a badge the plugin cannot recommend for comes back as nothing', async () => {
		serve({});
		expect(await api.fetchBadgeChase('binge-titan')).toBeNull();
	});

	test('a session without a user has nothing to ask for', async () => {
		mockUserId = null;
		serve({'users/user1/chase/binge-titan': CHASE});
		expect(await api.fetchBadgeChase('binge-titan')).toBeNull();
		expect(platformFetch).not.toHaveBeenCalled();
	});
});

describe('loadout', () => {
	// An account holding two boosts and no double credit, before and after one boost is spent.
	const inventory = ({boosts, running}) => [
		{Type: 'XpBoost', Icon: 'bolt', Count: boosts, Active: running},
		{Type: 'DoubleCredit', Icon: 'filter_2', Count: 0, Active: false},
		{Type: 'StreakFreeze', Icon: 'ac_unit', Count: 1, Active: false}
	];

	// The plugin answers a spend it will not grant with 400 and says why, rather than failing.
	const serveLoadout = () => {
		platformFetch.mockImplementation((url, options) => {
			const path = url.split('/Plugins/AchievementBadges/')[1];
			if (path === 'users/user1/powerups') {
				return Promise.resolve(ok({ScoreBank: 1240, Inventory: inventory({boosts: 2, running: false})}));
			}
			if (path === 'users/user1/powerups/use/XpBoost' && options.method === 'POST') {
				return Promise.resolve(ok({Message: 'Boost running.', Inventory: inventory({boosts: 1, running: true})}));
			}
			if (path === 'users/user1/powerups/use/DoubleCredit' && options.method === 'POST') {
				return Promise.resolve({
					ok: false,
					status: 400,
					text: () => Promise.resolve(JSON.stringify({Message: 'None left.'}))
				});
			}
			return Promise.resolve(missing);
		});
	};

	test('the bank and the inventory come back together', async () => {
		serveLoadout();
		const state = await api.fetchPowerUps();

		expect(state.bank).toBe(1240);
		expect(state.slots).toHaveLength(3);
		expect(state.slots.find((slot) => slot.type === 'XpBoost').count).toBe(2);
		expect(state.slots.find((slot) => slot.type === 'DoubleCredit').count).toBe(0);
	});

	test('spending one hands back the inventory it left', async () => {
		serveLoadout();
		const result = await api.usePowerUp('XpBoost');

		expect(result.outcome).toBe('used');
		const boost = result.slots.find((slot) => slot.type === 'XpBoost');
		expect(boost.count).toBe(1);
		expect(boost.active).toBe(true);
	});

	test("an empty slot is refused in the plugin's own wording", async () => {
		serveLoadout();
		const result = await api.usePowerUp('DoubleCredit');

		expect(result.outcome).toBe('refused');
		expect(result.message).toBe('None left.');
	});

	test('anything else that goes wrong is a plain failure', async () => {
		platformFetch.mockResolvedValue({ok: false, status: 500, text: () => Promise.resolve('')});
		expect((await api.usePowerUp('XpBoost')).outcome).toBe('failed');
		expect(await api.fetchPowerUps()).toBeNull();
	});

	test('a session without a user spends nothing', async () => {
		mockUserId = null;
		serveLoadout();
		expect((await api.usePowerUp('XpBoost')).outcome).toBe('failed');
		expect(await api.fetchPowerUps()).toBeNull();
		expect(platformFetch).not.toHaveBeenCalled();
	});
});
