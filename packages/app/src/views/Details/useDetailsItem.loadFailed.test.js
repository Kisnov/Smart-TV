import {act, renderHook, waitFor} from '@testing-library/react';

import useDetailsItem from './useDetailsItem';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../../services/playback', () => ({}));
jest.mock('../../services/mdblistApi', () => ({
	fetchTmdbSeasonRatings: async () => ({}),
	resolveSeriesTmdbId: async () => null,
	isRatingSourceAllowed: () => false
}));
jest.mock('../../services/subtitlePrefs', () => ({
	getItemSubtitlePref: async () => undefined,
	getSeriesSubtitlePref: async () => undefined,
	getSeriesAudioPref: async () => undefined
}));
jest.mock('../../services/homeRecommendations', () => ({
	canScoreSeedLocally: () => false,
	getOnlineRecommendations: async () => [],
	getRecommendations: async () => [],
	mergeRecommendations: () => []
}));
jest.mock('./seerrMissingCollectionItems', () => ({fetchMissingCollectionItems: async () => []}));
jest.mock('./collectionPlaylist', () => ({
	buildCollectionIndex: async () => [],
	fetchCollectionPage: async () => ({items: [], fetchedCount: 0, hasMore: false})
}));
jest.mock('./parentCollection', () => ({findParentCollections: async () => []}));
jest.mock('../../services/blockedContentGate', () => ({
	isBlocked: async () => false,
	isBlockedNow: () => false,
	observeItem: () => {}
}));
jest.mock('../../services/parentalControls', () => ({
	getActiveParentalFilter: () => ({isActive: false}),
	withoutBlockedItems: (items) => items
}));
jest.mock('../../services/userDataSync', () => ({
	apply: (item) => item,
	applyAll: (items) => items,
	applyToRows: (rows) => rows
}));
jest.mock('../../hooks/useUserDataSync', () => ({useUserDataVersion: () => 0}));

// Every other API call resolves to null, so only the item fetch matters.
const apiWith = (getItemForDetail) => new Proxy({getItemForDetail}, {
	get: (target, key) => (key in target ? target[key] : async () => null)
});

const tag = (value) => value;

const open = (effectiveApi) => renderHook(() => useDetailsItem({
	itemId: 'item-1',
	initialItem: null,
	effectiveApi,
	effectiveServerUrl: 'http://server',
	settings: {},
	recommendationsSupported: false,
	seerrEnabled: false,
	tagWithServerInfo: tag,
	skip: false
}));

describe('useDetailsItem when the item fails to load', () => {
	beforeEach(() => {
		jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		console.error.mockRestore();
	});

	test('says so instead of loading for good', async () => {
		const {result} = open(apiWith(jest.fn(() => Promise.reject(new Error('offline')))));

		await waitFor(() => expect(result.current.loadFailed).toBe(true));
		expect(result.current.isLoading).toBe(false);
		expect(result.current.item).toBeNull();
	});

	test('fetches it again on retry and clears the failure once it arrives', async () => {
		const getItemForDetail = jest.fn()
			.mockImplementationOnce(() => Promise.reject(new Error('offline')))
			.mockImplementation(() => Promise.resolve({Id: 'item-1', Type: 'Movie', Name: 'Film'}));
		const {result} = open(apiWith(getItemForDetail));

		await waitFor(() => expect(result.current.loadFailed).toBe(true));
		act(() => result.current.retryLoad());

		await waitFor(() => expect(result.current.item?.Id).toBe('item-1'));
		expect(result.current.loadFailed).toBe(false);
		expect(getItemForDetail).toHaveBeenCalledTimes(2);
	});
});
