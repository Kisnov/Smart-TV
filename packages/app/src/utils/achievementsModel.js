// Shapes for the Achievement Badges plugin.
//
// The plugin writes PascalCase names and leaves a null property out of the payload rather than
// writing it, so anything it can omit has to be read as missing rather than as a value. Admins
// author badges with any category, rarity or icon they like, which is why none of those are a
// fixed set.

export const isObject = (value) =>
	Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asInt = (value) => {
	if (typeof value === 'number') return Math.round(value);
	if (typeof value === 'string') {
		const parsed = parseInt(value, 10);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const asNumber = (value) => {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const parsed = parseFloat(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const asString = (value) => (typeof value === 'string' ? value : '');

// Every array the plugin sends is a list of objects, and a missing one arrives as nothing rather
// than as an empty array.
const mapList = (value, from) => (Array.isArray(value) ? value.filter(isObject).map(from) : []);

const asBool = (value) => value === true;

// An unparseable date reads as nothing rather than throwing, since a badge with a bad timestamp
// should still draw.
const asDate = (value) => {
	if (typeof value !== 'string' || !value) return null;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date : null;
};

// Points a badge is worth. The plugin works this out from rarity rather than storing it per
// badge, so the table has to be repeated here.
export const scoreForRarity = (rarity) => {
	switch (String(rarity || '').trim().toLowerCase()) {
		case 'uncommon': return 20;
		case 'rare': return 35;
		case 'epic': return 60;
		case 'legendary': return 100;
		case 'mythic': return 150;
		default: return 10;
	}
};

// Rarity arrives as free text, so anything unrecognised reads as common.
const RARITY_COLORS = {
	common: '#9AA5B1',
	uncommon: '#4CAF50',
	rare: '#2196F3',
	epic: '#9C27B0',
	legendary: '#FF9800',
	mythic: '#E91E63'
};

export const rarityColor = (rarity) =>
	RARITY_COLORS[String(rarity || '').trim().toLowerCase()] || RARITY_COLORS.common;

// The rank tier carries its own colour as the plugin wrote it. Six hex digits or the caller
// keeps whatever it was going to use instead.
export const parseHexColor = (value) => {
	const hex = String(value || '').trim().replace(/^#/, '');
	return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : null;
};

const ratio = (current, target) => {
	if (target <= 0) return 0;
	return Math.min(1, Math.max(0, current / target));
};

export const parseSummary = (json) => (json ? {
	unlocked: asInt(json.Unlocked),
	total: asInt(json.Total),
	percentage: asNumber(json.Percentage),
	score: asInt(json.Score),
	currentWatchStreak: asInt(json.CurrentWatchStreak),
	bestWatchStreak: asInt(json.BestWatchStreak)
} : null);

const parseTier = (json) => ({
	name: asString(json && json.Name),
	minScore: asInt(json && json.MinScore),
	color: asString(json && json.Color),
	icon: asString(json && json.Icon)
});

export const parseRank = (json) => {
	if (!json) return null;
	const next = json.NextTier;
	return {
		score: asInt(json.Score),
		// A missing tier still has to draw, so it falls back to an empty one rather than nothing.
		tier: parseTier(json.Tier),
		// Left out of the payload once the user reaches the top tier.
		nextTier: next && typeof next === 'object' ? parseTier(next) : null,
		progressToNext: asInt(json.ProgressToNext)
	};
};

export const parseBadge = (json) => {
	const unlocked = asBool(json.Unlocked);
	const title = asString(json.Title);
	const description = asString(json.Description);
	const currentValue = asInt(json.CurrentValue);
	const targetValue = asInt(json.TargetValue);
	const rarity = asString(json.Rarity);

	return {
		id: asString(json.Id),
		title,
		description,
		icon: asString(json.Icon),
		category: asString(json.Category),
		rarity,
		unlocked,
		unlockedAt: asDate(json.UnlockedAt),
		currentValue,
		targetValue,
		// The plugin never sends a secret flag. It masks a locked secret badge's title instead,
		// and that mask is all a client gets to go on.
		isSecret: !unlocked && title.trim() === '???',
		descriptionHidden: !unlocked && description.trim() === '???',
		score: scoreForRarity(rarity),
		progress: unlocked ? 1 : ratio(currentValue, targetValue)
	};
};

export const parseQuest = (json) => {
	const completed = asBool(json.Completed);
	const current = asInt(json.Current);
	const target = asInt(json.Target);

	return {
		id: asString(json.Id),
		title: asString(json.Title),
		description: asString(json.Description),
		icon: asString(json.Icon),
		reward: asInt(json.Reward),
		target,
		current,
		completed,
		progress: completed ? 1 : ratio(current, target)
	};
};

// Reads either the quest arrays on the overview or the replacement list a reroll answers with,
// which carry the same shape.
const parseQuestList = (value) => mapList(value, parseQuest);

export const parseQuests = (json) => {
	if (!json) return null;
	const daily = parseQuestList(json.Daily);
	const weekly = parseQuestList(json.Weekly);
	return {
		daily,
		weekly,
		// The plugin grants one reroll per UTC day and one per ISO week, so these are only ever
		// 1 or 0.
		dailyRerollsLeft: asInt(json.DailyRerollsRemaining),
		weeklyRerollsLeft: asInt(json.WeeklyRerollsRemaining),
		isEmpty: daily.length === 0 && weekly.length === 0
	};
};

// How a reroll attempt ended. A spent reroll is a refusal the panel reports plainly, not a fault.
export const REROLLED = 'rerolled';
export const REROLL_ALREADY_USED = 'alreadyUsed';
export const REROLL_FAILED = 'failed';

// One thing to watch that would move a badge along. Year and runtime come back as zero when the
// server holds no such value for the item.
const parseChaseItem = (json) => ({
	id: asString(json.Id),
	name: asString(json.Name),
	type: asString(json.Type),
	year: asInt(json.Year),
	runtimeMinutes: asInt(json.RunTimeMinutes)
});

// What the plugin suggests watching for one badge.
export const parseBadgeChase = (json) => {
	const progress = isObject(json.Progress) ? json.Progress : {};
	return {
		current: asInt(progress.Current),
		target: asInt(progress.Target),
		items: mapList(json.Items, parseChaseItem)
	};
};

// The replacement set comes back with the answer, so a reroll needs no second fetch.
export const parseRerolledQuests = (json) => ({
	quests: parseQuestList(json.Quests),
	rerollsLeft: asInt(json.RerollsRemaining)
});

// The overall board carries a score and a completion count. A category board carries one value
// that means whatever the category is and leaves the rest out, so what is present decides which
// board this row came from.
export const parseLeaderboardEntry = (json) => {
	const customTitle = json.CustomTitle;
	return {
		userId: asString(json.UserId),
		userName: asString(json.UserName),
		score: 'Score' in json ? asInt(json.Score) : null,
		unlocked: 'Unlocked' in json ? asInt(json.Unlocked) : null,
		total: 'Total' in json ? asInt(json.Total) : null,
		value: 'Value' in json ? asInt(json.Value) : null,
		customTitle: typeof customTitle === 'string' && customTitle ? customTitle : null
	};
};

export const leaderboardValue = (entry) => {
	if (entry.value !== null) return entry.value;
	return entry.score !== null ? entry.score : 0;
};

const parseCount = (json) => ({name: asString(json.Name), count: asInt(json.Count)});

const countList = (value) => mapList(value, parseCount);

export const parseRecap = (json) => (json ? {
	period: asString(json.Period),
	moviesWatched: asInt(json.MoviesWatched),
	episodesWatched: asInt(json.EpisodesWatched),
	daysWatched: asInt(json.DaysWatched),
	badgesUnlocked: asInt(json.BadgesUnlocked),
	topGenres: countList(json.TopGenres),
	topDirectors: countList(json.TopDirectors),
	topActors: countList(json.TopActors)
} : null);

export const parseLibraryCompletion = (json) => {
	const percents = json && json.LibraryCompletionPercents;
	if (!isObject(percents)) return {};
	const out = {};
	Object.keys(percents).forEach((key) => {
		if (typeof percents[key] === 'number') out[key] = Math.round(percents[key]);
	});
	return out;
};

export const parseBadges = (list) => mapList(list, parseBadge);

export const BADGE_FILTERS = ['all', 'unlocked', 'locked'];

const filterBadges = (badges, filter) => {
	if (filter === 'unlocked') return badges.filter((badge) => badge.unlocked);
	if (filter === 'locked') return badges.filter((badge) => !badge.unlocked);
	return badges;
};

// Filtering happens before grouping, so a category the filter emptied leaves the list rather
// than sitting there with nothing under it. Badges keep the order the server sent them in.
export const groupBadges = (badges, filter, otherLabel) => {
	const grouped = new Map();
	filterBadges(badges, filter).forEach((badge) => {
		const category = badge.category || otherLabel;
		if (!grouped.has(category)) grouped.set(category, []);
		grouped.get(category).push(badge);
	});
	return [...grouped.keys()].sort().map((category) => ({
		category,
		badges: grouped.get(category),
		unlocked: grouped.get(category).filter((badge) => badge.unlocked).length
	}));
};
