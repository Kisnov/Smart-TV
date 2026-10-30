import {getFavoritesFromAllServers, getLatestPerLibraryFromAllServers} from './connectionPool';
import {createApiForServer} from './jellyfinApi';
import * as multiServerManager from './multiServerManager';

jest.mock('./multiServerManager', () => ({getAllServersArray: jest.fn()}));
jest.mock('./jellyfinApi', () => ({createApiForServer: jest.fn()}));
jest.mock('./parentalControls', () => ({withoutBlockedItems: (items) => items}));

const server = (name, url) => ({serverId: name, name, url, userId: 'u', accessToken: 't', serverType: 'jellyfin'});

describe('the latest rows across servers', () => {
	test('keep each server\'s own library order, servers by name', async () => {
		multiServerManager.getAllServersArray.mockResolvedValue([server('Zeta', 'http://z'), server('Alpha', 'http://a')]);
		const librariesFor = {
			'http://a': [{Id: 'a-shows', Name: 'Shows'}, {Id: 'a-movies', Name: 'Movies'}],
			'http://z': [{Id: 'z-music', Name: 'Music'}, {Id: 'z-anime', Name: 'Anime'}]
		};
		createApiForServer.mockImplementation((url) => ({
			getLibraries: async () => ({Items: librariesFor[url]}),
			getLatestMedia: async (libraryId) => [{Id: `${libraryId}-item`}]
		}));
		const results = await getLatestPerLibraryFromAllServers();
		expect(results.map((result) => result.lib.Id)).toEqual(['a-shows', 'a-movies', 'z-music', 'z-anime']);
	});
});

describe('favorites across servers', () => {
	const favorites = (byUrl) => createApiForServer.mockImplementation((url) => ({
		getItems: async () => {
			if (byUrl[url] instanceof Error) throw byUrl[url];
			return {Items: byUrl[url]};
		}
	}));

	beforeEach(() => {
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		multiServerManager.getAllServersArray.mockResolvedValue([server('Alpha', 'http://a'), server('Zeta', 'http://z')]);
	});

	afterEach(() => {
		console.warn.mockRestore();
	});

	test('keep what one server sent when the other fails', async () => {
		favorites({'http://a': [{Id: 'a1', Name: 'Film'}], 'http://z': new Error('offline')});
		expect((await getFavoritesFromAllServers()).map((item) => item.Id)).toEqual(['a1']);
	});

	test('fail when every server does, so the screen can offer Retry', async () => {
		favorites({'http://a': new Error('offline'), 'http://z': new Error('offline')});
		await expect(getFavoritesFromAllServers()).rejects.toThrow();
	});
});
