import {
	groupBadges, leaderboardValue, parseBadge, parseLeaderboardEntry, parseLibraryCompletion,
	parseQuest, parseQuests, parseRank, parseRecap, parseSummary, parseHexColor, rarityColor,
	scoreForRarity
} from './achievementsModel';

const badge = (over) => parseBadge({
	Id: 'first-contact',
	Title: 'First Contact',
	Description: 'Watch your first item.',
	Icon: 'play_circle',
	Category: 'Getting Started',
	Rarity: 'Common',
	Unlocked: false,
	CurrentValue: 0,
	TargetValue: 1,
	...over
});

describe('scoreForRarity', () => {
	test('pays out by rarity, whatever case the plugin wrote it in', () => {
		expect(scoreForRarity('Common')).toBe(10);
		expect(scoreForRarity('uncommon')).toBe(20);
		expect(scoreForRarity(' Rare ')).toBe(35);
		expect(scoreForRarity('EPIC')).toBe(60);
		expect(scoreForRarity('Legendary')).toBe(100);
		expect(scoreForRarity('Mythic')).toBe(150);
	});

	test('treats a rarity it has never heard of as the cheapest one', () => {
		expect(scoreForRarity('Transcendent')).toBe(10);
		expect(scoreForRarity('')).toBe(10);
		expect(scoreForRarity(undefined)).toBe(10);
	});
});

describe('rarityColor', () => {
	test('gives each tier its own hue and anything unknown the common one', () => {
		expect(rarityColor('Legendary')).toBe('#FF9800');
		expect(rarityColor('mythic')).toBe('#E91E63');
		expect(rarityColor('Transcendent')).toBe('#9AA5B1');
	});
});

describe('parseHexColor', () => {
	test('takes six hex digits with or without the hash', () => {
		expect(parseHexColor('#2196f3')).toBe('#2196f3');
		expect(parseHexColor('2196F3')).toBe('#2196F3');
	});

	test('refuses anything else, so the caller keeps its own colour', () => {
		expect(parseHexColor('#abc')).toBeNull();
		expect(parseHexColor('#12345g')).toBeNull();
		expect(parseHexColor('')).toBeNull();
		expect(parseHexColor(null)).toBeNull();
	});
});

describe('parseBadge', () => {
	test('reads the plugin PascalCase names', () => {
		const item = badge({Unlocked: true, UnlockedAt: '2026-09-01T12:00:00Z', Rarity: 'Epic'});
		expect(item.id).toBe('first-contact');
		expect(item.title).toBe('First Contact');
		expect(item.category).toBe('Getting Started');
		expect(item.unlocked).toBe(true);
		expect(item.unlockedAt).toBeInstanceOf(Date);
		expect(item.score).toBe(60);
	});

	test('a locked badge keeps its progress and has no date at all', () => {
		const item = badge({CurrentValue: 4, TargetValue: 10});
		expect(item.unlockedAt).toBeNull();
		expect(item.progress).toBeCloseTo(0.4, 5);
	});

	test('an unlocked badge is finished whatever the counters say', () => {
		expect(badge({Unlocked: true, CurrentValue: 0, TargetValue: 10}).progress).toBe(1);
	});

	test('a badge that is only a flag has nothing to show progress against', () => {
		expect(badge({TargetValue: 0}).progress).toBe(0);
	});

	test('the mask on a locked title is the only sign a badge is secret', () => {
		expect(badge({Title: '???'}).isSecret).toBe(true);
		expect(badge({Title: '???', Unlocked: true}).isSecret).toBe(false);
		expect(badge({Description: '???'}).descriptionHidden).toBe(true);
	});

	test('a date it cannot read is no date rather than a crash', () => {
		expect(badge({Unlocked: true, UnlockedAt: 'not a date'}).unlockedAt).toBeNull();
	});
});

describe('parseSummary and parseRank', () => {
	test('reads a summary and leaves out what it has no use for', () => {
		const summary = parseSummary({Unlocked: 12, Total: 200, Percentage: 6, Score: 430, CurrentWatchStreak: 3, BestWatchStreak: 9, EquippedCount: 5});
		expect(summary).toEqual({unlocked: 12, total: 200, percentage: 6, score: 430, currentWatchStreak: 3, bestWatchStreak: 9});
	});

	test('a rank at the top has no next tier', () => {
		const rank = parseRank({Score: 9000, Tier: {Name: 'Maestro', MinScore: 8000, Color: '#fff000', Icon: 'star'}, ProgressToNext: 100});
		expect(rank.tier.name).toBe('Maestro');
		expect(rank.nextTier).toBeNull();
	});

	test('a missing tier still draws rather than coming back as nothing', () => {
		expect(parseRank({Score: 0}).tier).toEqual({name: '', minScore: 0, color: '', icon: ''});
	});
});

describe('parseQuests', () => {
	test('splits the two kinds and works out how far each has got', () => {
		const quests = parseQuests({
			Daily: [{Id: 'd1', Title: 'Movie Night', Reward: 30, Target: 4, Current: 1, Completed: false}],
			Weekly: []
		});
		expect(quests.daily[0].progress).toBeCloseTo(0.25, 5);
		expect(quests.weekly).toEqual([]);
		expect(quests.isEmpty).toBe(false);
	});

	test('knows when there is nothing to show', () => {
		expect(parseQuests({Daily: [], Weekly: []}).isEmpty).toBe(true);
		expect(parseQuests(null)).toBeNull();
	});

	test('a finished quest is full however the counters read', () => {
		expect(parseQuest({Completed: true, Current: 0, Target: 5}).progress).toBe(1);
	});
});

describe('parseLeaderboardEntry', () => {
	test('an overall row carries a score and a badge count', () => {
		const entry = parseLeaderboardEntry({UserId: 'u1', UserName: 'Ada', Score: 430, Unlocked: 12, Total: 200});
		expect(entry.score).toBe(430);
		expect(entry.value).toBeNull();
		expect(leaderboardValue(entry)).toBe(430);
	});

	test('a category row carries one value and leaves the rest out', () => {
		const entry = parseLeaderboardEntry({UserId: 'u1', UserName: 'Ada', Value: 42});
		expect(entry.value).toBe(42);
		expect(entry.score).toBeNull();
		expect(entry.unlocked).toBeNull();
		expect(leaderboardValue(entry)).toBe(42);
	});

	// A key that is there but zero is a real zero, which is why presence decides this and not
	// whether the number is truthy.
	test('a zero that was sent is kept, and a key that was not sent is not', () => {
		const zero = parseLeaderboardEntry({UserId: 'u1', UserName: 'Ada', Score: 0});
		expect(zero.score).toBe(0);
		expect(leaderboardValue(zero)).toBe(0);
		expect(parseLeaderboardEntry({UserId: 'u1', UserName: 'Ada'}).score).toBeNull();
	});

	test('an empty shop title reads as none', () => {
		expect(parseLeaderboardEntry({CustomTitle: ''}).customTitle).toBeNull();
		expect(parseLeaderboardEntry({CustomTitle: 'The Completionist'}).customTitle).toBe('The Completionist');
	});
});

describe('parseRecap and parseLibraryCompletion', () => {
	test('reads the counts the recap carries', () => {
		const recap = parseRecap({
			Period: 'year', MoviesWatched: 4, EpisodesWatched: 18, DaysWatched: 11, BadgesUnlocked: 2,
			TopGenres: [{Name: 'Drama', Count: 9}], TopDirectors: [], TopActors: []
		});
		expect(recap.period).toBe('year');
		expect(recap.topGenres).toEqual([{name: 'Drama', count: 9}]);
		expect(recap.topDirectors).toEqual([]);
	});

	test('rounds each library percent and drops anything that is not a number', () => {
		expect(parseLibraryCompletion({LibraryCompletionPercents: {Movies: 62.6, Shows: 12, Books: 'lots'}}))
			.toEqual({Movies: 63, Shows: 12});
	});

	test('an empty envelope is no libraries', () => {
		expect(parseLibraryCompletion({LibraryCompletionPercents: {}})).toEqual({});
		expect(parseLibraryCompletion(null)).toEqual({});
	});
});

describe('groupBadges', () => {
	const badges = [
		badge({Id: 'a', Category: 'Getting Started', Unlocked: true}),
		badge({Id: 'b', Category: 'Binge'}),
		badge({Id: 'c', Category: 'Binge'}),
		badge({Id: 'd', Category: ''})
	];

	test('sorts the groups and counts what is unlocked in each', () => {
		const groups = groupBadges(badges, 'all', 'Other');
		expect(groups.map((group) => group.category)).toEqual(['Binge', 'Getting Started', 'Other']);
		expect(groups[1].unlocked).toBe(1);
		expect(groups[0].badges.map((item) => item.id)).toEqual(['b', 'c']);
	});

	// Filtering runs before grouping, so the only unlocked badge takes its category off the list
	// with it rather than leaving an empty heading behind.
	test('a category the filter emptied leaves the list', () => {
		expect(groupBadges(badges, 'locked', 'Other').map((group) => group.category))
			.toEqual(['Binge', 'Other']);
		expect(groupBadges(badges, 'unlocked', 'Other').map((group) => group.category))
			.toEqual(['Getting Started']);
	});

	test('a badge with no category of its own goes in the named bucket', () => {
		const groups = groupBadges([badges[3]], 'all', 'Elsewhere');
		expect(groups[0].category).toBe('Elsewhere');
	});
});
