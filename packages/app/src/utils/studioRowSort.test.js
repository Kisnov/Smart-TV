import {STUDIO_PAGE_SIZE, rankStudiosByCount, readStudioRow, studioRowSortBy} from './studioRowSort';

// A server holding `total` studios that, like Jellyfin, lists them by name whatever it is asked.
const nameOnlyServer = (total) => {
	const calls = [];
	const fetchPage = async (startIndex, limit) => {
		calls.push({startIndex, limit});
		const Items = [];
		for (let i = startIndex; i < Math.min(startIndex + limit, total); i++) {
			const name = `Studio ${String(i).padStart(4, '0')}`;
			Items.push({Id: name, Name: name});
		}
		return {Items, TotalRecordCount: total};
	};
	return {calls, fetchPage};
};

const read = (server, sortBy, sortOrder = 'Ascending') => readStudioRow(server.fetchPage, {limit: 20, sortBy, sortOrder});

describe('reading the studio row', () => {
	it('reads just the row for name A to Z', async () => {
		const server = nameOnlyServer(1000);
		const row = await read(server, 'SortName');
		expect(server.calls).toEqual([{startIndex: 0, limit: 20}]);
		expect(row.Items[0].Name).toBe('Studio 0000');
	});

	it('reads the last 20 for name Z to A', async () => {
		const server = nameOnlyServer(1000);
		const row = await read(server, 'SortName', 'Descending');
		expect(server.calls.map((c) => c.startIndex)).toEqual([0, 980]);
		expect(row.Items[0].Name).toBe('Studio 0999');
		expect(row.Items).toHaveLength(20);
	});

	it('reads a page from anywhere in the list for Random', async () => {
		const server = nameOnlyServer(1000);
		const random = jest.spyOn(Math, 'random').mockReturnValue(0.5);
		const row = await read(server, 'Random');
		random.mockRestore();
		expect(server.calls).toEqual([{startIndex: 0, limit: STUDIO_PAGE_SIZE}, {startIndex: 400, limit: STUDIO_PAGE_SIZE}]);
		const names = row.Items.map((item) => item.Name);
		expect(names).toHaveLength(20);
		expect(names.every((name) => name >= 'Studio 0400' && name < 'Studio 0600')).toBe(true);
		expect(names).not.toEqual([...names].sort());
	});

	it('reads a short list once', async () => {
		const server = nameOnlyServer(15);
		await read(server, 'SortName', 'Descending');
		expect(server.calls).toHaveLength(1);
	});

	it('reads picked studios until the last one turns up', async () => {
		const server = nameOnlyServer(1000);
		const row = await readStudioRow(server.fetchPage, {limit: 20, sortBy: 'SortName', sortOrder: 'Ascending', picked: ['Studio 0450', 'Studio 0010']});
		expect(server.calls.map((c) => c.startIndex)).toEqual([0, 200, 400]);
		expect(row.Items.map((item) => item.Name)).toEqual(['Studio 0010', 'Studio 0450']);
	});

	it('orders picked studios Z to A', async () => {
		const server = nameOnlyServer(1000);
		const row = await readStudioRow(server.fetchPage, {limit: 20, sortBy: 'SortName', sortOrder: 'Descending', picked: ['Studio 0010', 'Studio 0450']});
		expect(row.Items.map((item) => item.Name)).toEqual(['Studio 0450', 'Studio 0010']);
	});

	it('stops at the end of the list when a pick is gone', async () => {
		const server = nameOnlyServer(300);
		const row = await readStudioRow(server.fetchPage, {limit: 20, sortBy: 'SortName', sortOrder: 'Ascending', picked: ['Studio 0005', 'Removed']});
		expect(server.calls).toHaveLength(2);
		expect(row.Items.map((item) => item.Name)).toEqual(['Studio 0005']);
	});
});

describe('ranking picked studios by item count', () => {
	it('is only offered once studios are picked', () => {
		expect(studioRowSortBy('ItemCount', true)).toBe('ItemCount');
		expect(studioRowSortBy('ItemCount', false)).toBe('SortName');
		expect(studioRowSortBy('Random', false)).toBe('Random');
	});

	it('adds movies and series, counts a studio sent without counts, and breaks ties by name', async () => {
		const api = {getItems: jest.fn(async ({Studios}) => ({TotalRecordCount: Studios === 'Uncounted' ? 7 : 0}))};
		const studios = [
			{Name: 'Small', MovieCount: 1, SeriesCount: 1},
			{Name: 'Uncounted'},
			{Name: 'Big', MovieCount: 9, SeriesCount: 3},
			{Name: 'Also Small', MovieCount: 2, SeriesCount: 0}
		];
		const ranked = await rankStudiosByCount(api, studios, 'Descending');
		expect(ranked.map((studio) => studio.Name)).toEqual(['Big', 'Uncounted', 'Also Small', 'Small']);
		expect(api.getItems).toHaveBeenCalledTimes(1);
		expect(api.getItems).toHaveBeenCalledWith({Studios: 'Uncounted', IncludeItemTypes: 'Movie,Series', Recursive: true, Limit: 1});
		expect(studios[1].ChildCount).toBeUndefined();
	});

	it('puts the smallest first for Ascending', async () => {
		const api = {getItems: jest.fn()};
		const ranked = await rankStudiosByCount(api, [{Name: 'A', MovieCount: 5}, {Name: 'B', SeriesCount: 2}], 'Ascending');
		expect(ranked.map((studio) => studio.Name)).toEqual(['B', 'A']);
		expect(api.getItems).not.toHaveBeenCalled();
	});
});
