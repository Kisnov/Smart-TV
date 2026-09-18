// Client for the Achievement Badges plugin, which is a separate Jellyfin plugin rather than part
// of Moonbase, so it lives under /Plugins/AchievementBadges and is probed on its own.
//
// Nothing here throws. A server without the plugin answers 404 on every route, and a panel that
// asked for everything at once and got nothing back wants an empty screen rather than a pile of
// errors, so a failed call reads as no answer. Nothing here polls, and the login ping and the
// quest reroll are the only things written, because they are the only parts the plugin expects a
// client to drive.

import {getServerUrl, getAuthHeader, getApiKey, getUserId, getServerType} from './jellyfinApi';
import {legacyAuthHeader} from '../utils/serverRoutes';
import {platformFetch} from './secureFetch';
import {
	isObject, parseBadgeChase, parseSummary, parseRank, parseBadges, parseQuests, parseRerolledQuests,
	parseLeaderboardEntry, parseRecap, parseLibraryCompletion,
	REROLLED, REROLL_ALREADY_USED, REROLL_FAILED
} from '../utils/achievementsModel';

const ROOT = 'Plugins/AchievementBadges';
const TIMEOUT_MS = 15000;

// What the panel opens on, so the screen that can change it knows what it was handed.
export const DEFAULT_RECAP_PERIOD = 'month';

// What the admin left switched on, as the last probe found it. Both stay on until the server
// says otherwise, since a plugin too old to report them still serves them.
let leaderboardEnabled = true;
let questsEnabled = true;

const base = () => (getServerUrl() || '').replace(/\/+$/, '');

const authHeaders = () => {
	const header = getAuthHeader();
	return {Authorization: header, ...legacyAuthHeader(getServerType(), header)};
};

// It is a Jellyfin plugin, so an Emby server never carries it and is never asked.
const isJellyfin = () => getServerType() !== 'emby';

// The status travels back with the body because the reroll is the one call that has to tell a
// refusal from a fault. Everything else only wants what came back.
const send = async (path, method = 'GET') => {
	if (!getApiKey()) return {status: 0, data: null};
	try {
		const res = await platformFetch(`${base()}/${ROOT}/${path}`, {
			method,
			headers: {...authHeaders(), Accept: 'application/json'}
		}, TIMEOUT_MS);
		if (!res.ok) return {status: res.status, data: null};
		const text = await res.text();
		return {status: res.status, data: text ? JSON.parse(text) : null};
	} catch {
		return {status: 0, data: null};
	}
};

const request = async (path, method) => (await send(path, method)).data;

const getMap = async (path) => {
	const data = await request(path);
	return isObject(data) ? data : null;
};

const getList = async (path) => {
	const data = await request(path);
	return Array.isArray(data) ? data.filter(isObject) : [];
};

export const getFlags = () => ({leaderboardEnabled, questsEnabled});

// Clears what the last server said, so a set switched to one without the plugin cannot keep
// showing the entry.
export const reset = () => {
	leaderboardEnabled = true;
	questsEnabled = true;
};

// Whether the plugin answered here. public-config needs no administrator, so an ordinary user
// gets the same answer, and a server without the plugin has no such route.
export const probe = async () => {
	if (!isJellyfin()) return false;
	const config = await getMap('public-config');
	if (!config) return false;
	leaderboardEnabled = config.LeaderboardEnabled !== false;
	questsEnabled = config.QuestsEnabled !== false;
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
	const {status, data} = await send(`users/${userId}/quests/${questSet}/reroll`, 'POST');
	if (status === 429) return {outcome: REROLL_ALREADY_USED};
	if (!isObject(data)) return {outcome: REROLL_FAILED};
	return {outcome: REROLLED, ...parseRerolledQuests(data)};
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
		questsEnabled
	};
};
