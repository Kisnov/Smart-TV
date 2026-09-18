// Client for the Achievement Badges plugin, which is a separate Jellyfin plugin rather than part
// of Moonbase, so it lives under /Plugins/AchievementBadges and is probed on its own.
//
// Nothing here throws. A server without the plugin answers 404 on every route, and a panel that
// asked for everything at once and got nothing back wants an empty screen rather than a pile of
// errors, so a failed call reads as no answer. Nothing here polls, and the login ping, the quest
// reroll, spending a power-up and buying one are the only things written, because they are the
// only parts the plugin expects a client to drive.

import {getServerUrl, getAuthHeader, getApiKey, getUserId, getServerType} from './jellyfinApi';
import {legacyAuthHeader} from '../utils/serverRoutes';
import {platformFetch} from './secureFetch';
import {
	isObject, parseBadgeChase, parseSummary, parseRank, parseBadges, parseQuests, parseRerolledQuests,
	parseLeaderboardEntry, parseRecap, parseLibraryCompletion,
	parsePowerUpState, parsePowerUpSlots, parseShopCatalog, parseActivityFeed,
	REROLLED, REROLL_ALREADY_USED, REROLL_FAILED,
	POWER_UP_USED, POWER_UP_REFUSED, POWER_UP_FAILED,
	PURCHASE_BOUGHT, PURCHASE_REFUSED, PURCHASE_FAILED
} from '../utils/achievementsModel';

const ROOT = 'Plugins/AchievementBadges';
const TIMEOUT_MS = 15000;

// What the panel opens on, so the screen that can change it knows what it was handed.
export const DEFAULT_RECAP_PERIOD = 'month';

// What the admin left switched on, as the last probe found it. They stay on until the server
// says otherwise, since a plugin too old to report them still serves them.
let leaderboardEnabled = true;
let questsEnabled = true;
let activityEnabled = true;

const base = () => (getServerUrl() || '').replace(/\/+$/, '');

const authHeaders = () => {
	const header = getAuthHeader();
	return {Authorization: header, ...legacyAuthHeader(getServerType(), header)};
};

// It is a Jellyfin plugin, so an Emby server never carries it and is never asked.
const isJellyfin = () => getServerType() !== 'emby';

const call = (path, method, body) => {
	const init = {method, headers: {...authHeaders(), Accept: 'application/json'}};
	if (body) {
		init.headers['Content-Type'] = 'application/json';
		init.body = JSON.stringify(body);
	}
	return platformFetch(`${base()}/${ROOT}/${path}`, init, TIMEOUT_MS);
};

const request = async (path, method = 'GET') => {
	if (!getApiKey()) return null;
	try {
		const res = await call(path, method);
		if (!res.ok) return null;
		const text = await res.text();
		return text ? JSON.parse(text) : null;
	} catch {
		return null;
	}
};

// Writes to a path and tells a refusal apart from a fault. refusedWith is the status the plugin
// answers when it means no, so that one comes back with whatever the plugin said, and anything
// else reads as a plain failure.
const post = async (path, {refusedWith, body: sent}) => {
	if (!getApiKey()) return {};
	try {
		const res = await call(path, 'POST', sent);
		const text = await res.text();
		let body = null;
		try {
			body = text ? JSON.parse(text) : null;
		} catch {
			body = null;
		}
		if (res.ok) return {body: isObject(body) ? body : null};
		if (res.status !== refusedWith) return {};
		return {refused: true, message: isObject(body) ? body.Message : null};
	} catch {
		return {};
	}
};

const getMap = async (path) => {
	const data = await request(path);
	return isObject(data) ? data : null;
};

const getList = async (path) => {
	const data = await request(path);
	return Array.isArray(data) ? data.filter(isObject) : [];
};

export const getFlags = () => ({leaderboardEnabled, questsEnabled, activityEnabled});

// Clears what the last server said, so a set switched to one without the plugin cannot keep
// showing the entry.
export const reset = () => {
	leaderboardEnabled = true;
	questsEnabled = true;
	activityEnabled = true;
};

// Whether the plugin answered here. public-config needs no administrator, so an ordinary user
// gets the same answer, and a server without the plugin has no such route.
export const probe = async () => {
	if (!isJellyfin()) return false;
	const config = await getMap('public-config');
	if (!config) return false;
	leaderboardEnabled = config.LeaderboardEnabled !== false;
	questsEnabled = config.QuestsEnabled !== false;
	activityEnabled = config.ActivityFeedEnabled !== false;
	return true;
};

// The one thing the plugin needs a client to drive, since it is what keeps a daily login streak
// alive. Nothing waits on it and nothing reads the answer.
export const sendLoginPing = () => {
	const userId = getUserId();
	if (!userId) return Promise.resolve(null);
	return request(`users/${userId}/login-ping`, 'POST');
};

// What the plugin suggests watching to move a badge along. The server picks unplayed items that
// match the badge's metric, so one measured on something it cannot query comes back with nothing.
export const fetchBadgeChase = async (badgeId, {limit = 10} = {}) => {
	const userId = getUserId();
	if (!userId) return null;
	const json = await getMap(`users/${userId}/chase/${encodeURIComponent(badgeId)}?limit=${limit}`);
	return json ? parseBadgeChase(json) : null;
};

// Swaps one quest set for a fresh one. The plugin answers 429 once that allowance is spent.
export const rerollQuests = async ({weekly = false} = {}) => {
	const userId = getUserId();
	if (!userId) return {outcome: REROLL_FAILED};

	const questSet = weekly ? 'weekly' : 'daily';
	const written = await post(`users/${userId}/quests/${questSet}/reroll`, {refusedWith: 429});
	if (written.refused) return {outcome: REROLL_ALREADY_USED};
	if (!written.body) return {outcome: REROLL_FAILED};
	return {outcome: REROLLED, ...parseRerolledQuests(written.body)};
};

export const fetchPowerUps = async () => {
	const userId = getUserId();
	if (!userId) return null;
	const json = await getMap(`users/${userId}/powerups`);
	return json ? parsePowerUpState(json) : null;
};

// Spends one power-up. The plugin refuses with 400 when the slot is empty or the boost is already
// running, and its own wording explains which better than a guess here would.
export const usePowerUp = async (type) => {
	const userId = getUserId();
	if (!userId) return {outcome: POWER_UP_FAILED};

	const written = await post(`users/${userId}/powerups/use/${encodeURIComponent(type)}`, {refusedWith: 400});
	if (written.refused) return {outcome: POWER_UP_REFUSED, message: written.message};
	if (!written.body) return {outcome: POWER_UP_FAILED};
	return {outcome: POWER_UP_USED, slots: parsePowerUpSlots(written.body.Inventory)};
};

// What the server has unlocked lately, newest first. It can come back empty because the admin
// switched the feed off, or because everyone on the server has opted out of appearing in it.
export const fetchActivity = async ({limit = 30} = {}) => {
	if (!activityEnabled) return [];
	const json = await getMap(`activity-feed?page=1&pageSize=${limit}`);
	return json ? parseActivityFeed(json) : [];
};

// What the shop sells, narrowed to the power-ups. The catalogue is the same for everyone, so this
// route carries no user.
export const fetchShopPowerUps = async () => {
	const json = await getMap('shop/catalog');
	return json ? parseShopCatalog(json) : [];
};

// Buys one thing from the shop. The plugin refuses with 400 when the bank is short or the slot is
// already full, and its wording says which.
export const buyShopItem = async (itemId) => {
	const userId = getUserId();
	if (!userId) return {outcome: PURCHASE_FAILED};

	const written = await post(`users/${userId}/shop/purchase`, {refusedWith: 400, body: {ItemId: itemId}});
	if (written.refused) return {outcome: PURCHASE_REFUSED, message: written.message};
	if (!written.body) return {outcome: PURCHASE_FAILED};

	// The answer says what the bank holds now, so nothing has to be read again.
	const after = written.body.ScoreBalanceAfter;
	return {outcome: PURCHASE_BOUGHT, bankAfter: typeof after === 'number' ? after : null};
};

export const fetchLeaderboard = async ({category = '', limit = 10} = {}) => {
	if (!leaderboardEnabled) return [];
	const path = category ? `leaderboard/${category}` : 'leaderboard';
	const rows = await getList(`${path}?limit=${limit}`);
	return rows.map(parseLeaderboardEntry);
};

export const fetchRecap = async (period) => {
	const userId = getUserId();
	if (!userId) return null;
	return parseRecap(await getMap(`users/${userId}/recap?period=${encodeURIComponent(period)}`));
};

// Everything the panel opens with, asked for at once. A section the admin switched off is not
// requested at all rather than fetched and thrown away.
export const loadOverview = async () => {
	const userId = getUserId();
	if (!userId || !isJellyfin()) return null;

	const [summary, rank, badgeRows, equippedRows, questRows, leaderboard, recap, completion] =
		await Promise.all([
			getMap(`users/${userId}/summary`),
			getMap(`users/${userId}/rank`),
			getList(`users/${userId}`),
			getList(`users/${userId}/equipped`),
			questsEnabled ? getMap(`users/${userId}/quests`) : Promise.resolve(null),
			leaderboardEnabled ? fetchLeaderboard() : Promise.resolve([]),
			getMap(`users/${userId}/recap?period=${DEFAULT_RECAP_PERIOD}`),
			getMap(`users/${userId}/library-completion`)
		]);

	const badges = parseBadges(badgeRows);

	// A server that answered none of it has lost the plugin, rather than holding an empty profile.
	if (!summary && badges.length === 0 && !rank) return null;

	return {
		summary: parseSummary(summary),
		rank: parseRank(rank),
		badges,
		equipped: parseBadges(equippedRows),
		quests: parseQuests(questRows),
		leaderboard,
		recap: parseRecap(recap),
		libraryCompletion: parseLibraryCompletion(completion),
		leaderboardEnabled,
		questsEnabled,
		activityEnabled
	};
};
