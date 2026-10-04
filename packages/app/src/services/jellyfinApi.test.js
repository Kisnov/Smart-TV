import {api, setServer, setServerType, setAuth} from './jellyfinApi';
import {platformFetch} from './secureFetch';

jest.mock('./secureFetch', () => ({platformFetch: jest.fn()}));
jest.mock('./userDataSync', () => ({}));
jest.mock('../platform', () => ({getPlatform: () => 'webos'}));

const urlOf = (call) => call[0];
const empty = () => platformFetch.mockImplementation(() => Promise.resolve({ok: true, status: 200, text: () => Promise.resolve('{"Items":[]}')}));

beforeAll(() => {
	empty();
	setServer('http://server');
	// Signing in reports the session's capabilities, which is a request of its own.
	setAuth('user-1', 'token');
});
// The runner resets every mock between tests, implementation included.
beforeEach(empty);

describe('Next Up', () => {
	test('asks Emby for its legacy list and nothing else', async () => {
		setServerType('emby');
		await api.getNextUp(15);
		expect(platformFetch).toHaveBeenCalledTimes(1);
		expect(urlOf(platformFetch.mock.calls[0])).toContain('/Shows/NextUp?');
		expect(urlOf(platformFetch.mock.calls[0])).toContain('&LegacyNextUp=true');
		expect(urlOf(platformFetch.mock.calls[0])).not.toContain('NextUpDateCutoff');
	});

	test('leaves a series page on Emby alone', async () => {
		setServerType('emby');
		await api.getNextUp(1, 'series-1');
		expect(urlOf(platformFetch.mock.calls[0])).toContain('SeriesId=series-1');
		expect(urlOf(platformFetch.mock.calls[0])).not.toContain('LegacyNextUp');
	});

	test('keeps the date window on Jellyfin without the Emby flag', async () => {
		setServerType('jellyfin');
		await api.getNextUp(15, null, 30);
		expect(urlOf(platformFetch.mock.calls[0])).toContain('NextUpDateCutoff=');
		expect(urlOf(platformFetch.mock.calls[0])).not.toContain('LegacyNextUp');
	});
});

describe('search', () => {
	test('items and people are separate requests, and people get their own timeout', async () => {
		setServerType('jellyfin');
		await api.search('alien', 240);
		await api.searchPeople('alien', 24);
		const [items, people] = platformFetch.mock.calls;
		expect(urlOf(items)).toContain('searchTerm=alien');
		expect(urlOf(items)).not.toContain('/Persons');
		expect(urlOf(people)).toContain('/Persons?searchTerm=alien&Limit=24');
		expect(people[2]).toBe(10000);
	});
});
