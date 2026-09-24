import {withEmbyNextUpSweep} from './embyNextUp';

const EMPTY = {Items: [], TotalRecordCount: 0};

const options = {
	itemsRoute: '/Users/user-1/Items?',
	seriesNextUpUrl: (id) => `/Shows/NextUp?UserId=user-1&SeriesId=${id}&Limit=1`,
	limit: 15
};

// Answers the played episode lookup with `played` and every series with its own next episode.
const fakeServer = (played) => {
	const calls = [];
	const send = jest.fn((endpoint) => {
		calls.push(endpoint);
		if (endpoint.indexOf('/Users/user-1/Items?') === 0) return Promise.resolve({Items: played});
		const seriesId = /SeriesId=([^&]+)/.exec(endpoint)[1];
		return Promise.resolve({Items: [{Id: `ep-${seriesId}`, SeriesId: seriesId}], TotalRecordCount: 1});
	});
	return {send, calls};
};

describe('withEmbyNextUpSweep', () => {
	test('an empty answer falls back to one question per played series, newest play first', async () => {
		const {send, calls} = fakeServer([
			{Id: 'e1', SeriesId: 's1'},
			{Id: 'e2', SeriesId: 's2'},
			{Id: 'e3', SeriesId: 's1'}
		]);

		const result = await withEmbyNextUpSweep(send, EMPTY, options);

		expect(calls[0]).toBe('/Users/user-1/Items?IncludeItemTypes=Episode&Filters=IsPlayed&Recursive=true&SortBy=DatePlayed&SortOrder=Descending&Limit=100&Fields=SeriesId');
		expect(calls.slice(1)).toEqual([options.seriesNextUpUrl('s1'), options.seriesNextUpUrl('s2')]);
		expect(result.Items.map((item) => item.Id)).toEqual(['ep-s1', 'ep-s2']);
		expect(result.TotalRecordCount).toBe(2);
	});

	test('an answer with episodes in it makes no extra calls', async () => {
		const {send} = fakeServer([]);
		const answer = {Items: [{Id: 'ep-1'}], TotalRecordCount: 1};

		expect(await withEmbyNextUpSweep(send, answer, options)).toBe(answer);
		expect(send).not.toHaveBeenCalled();
	});

	test('asks about no more than 25 series and trims to the limit', async () => {
		const played = [];
		for (let i = 0; i < 40; i++) played.push({Id: `e${i}`, SeriesId: `s${i}`});
		const {send, calls} = fakeServer(played);

		const result = await withEmbyNextUpSweep(send, EMPTY, options);

		expect(calls).toHaveLength(26);
		expect(result.Items).toHaveLength(15);
		expect(result.TotalRecordCount).toBe(25);
	});

	test('leaves a series with nothing next out', async () => {
		const send = jest.fn((endpoint) => {
			if (endpoint.indexOf('/Users/') === 0) return Promise.resolve({Items: [{SeriesId: 's1'}, {SeriesId: 's2'}]});
			return Promise.resolve(endpoint.indexOf('s1') !== -1 ? {Items: []} : {Items: [{Id: 'ep-s2'}]});
		});

		const result = await withEmbyNextUpSweep(send, EMPTY, options);

		expect(result.Items.map((item) => item.Id)).toEqual(['ep-s2']);
	});

	test('keeps the empty answer when the sweep fails', async () => {
		const send = jest.fn(() => Promise.reject(new Error('offline')));
		expect(await withEmbyNextUpSweep(send, EMPTY, options)).toBe(EMPTY);
	});

	test('keeps the empty answer when nothing has been played', async () => {
		const {send, calls} = fakeServer([]);
		expect(await withEmbyNextUpSweep(send, EMPTY, options)).toBe(EMPTY);
		expect(calls).toHaveLength(1);
	});
});
