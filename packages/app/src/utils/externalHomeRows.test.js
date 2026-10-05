jest.mock('../services/externalRowsApi', () => ({
	fetchCustomRow: jest.fn(),
	constructSourceUrl: jest.fn()
}));

import {fetchCustomRow, constructSourceUrl} from '../services/externalRowsApi';
import {fetchExternalPresetRow, validateCustomRow} from './externalHomeRows';

const listUrl = 'https://mdblist.com/lists/user/list';
const row = {source: 'mdblist', type: 'user_list', params: {username: 'user', listname: 'list'}};

describe('validateCustomRow', () => {
	beforeEach(() => {
		constructSourceUrl.mockReturnValue(listUrl);
	});

	it('waits longer than a home row and reads the server cache', async () => {
		fetchCustomRow.mockResolvedValue([{name: 'Movie'}]);

		expect(await validateCustomRow(row)).toEqual({ok: true});
		expect(fetchCustomRow).toHaveBeenCalledWith(row, {timeoutMs: 45000});
	});

	it('names the list when it comes back empty', async () => {
		fetchCustomRow.mockResolvedValue([]);

		expect(await validateCustomRow(row)).toEqual({error: expect.stringContaining(listUrl)});
	});
});

describe('fetchExternalPresetRow', () => {
	it('takes a TMDB chart item for what the chart holds, whatever it was labelled', async () => {
		fetchCustomRow.mockResolvedValue([{name: 'Dragon Tales', type: 'Movie', providerIds: {Tmdb: '1585'}}]);

		const [show] = await fetchExternalPresetRow('tmdb_popular_tv');
		expect(show.Type).toBe('Series');
		expect(show._seerrMediaType).toBe('tv');
		expect(show._seerrRaw).toEqual({mediaId: 1585, mediaType: 'tv'});
	});

	it('keeps the type each item came with on the chart that mixes movies and shows', async () => {
		fetchCustomRow.mockResolvedValue([
			{name: 'A movie', type: 'Movie', providerIds: {Tmdb: '1'}},
			{name: 'A show', type: 'Series', providerIds: {Tmdb: '2'}}
		]);

		const items = await fetchExternalPresetRow('tmdb_trending_all_weekly');
		expect(items.map((item) => item.Type)).toEqual(['Movie', 'Series']);
	});
});
