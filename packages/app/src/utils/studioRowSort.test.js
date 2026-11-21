import {STUDIO_PAGE_SIZE, readStudioRow} from './studioRowSort';

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
