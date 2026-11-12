import * as playback from './playback';
import * as jellyfinApi from './jellyfinApi';

jest.mock('./jellyfinApi', () => {
	const server = {getEpisodes: jest.fn(), getSeasons: jest.fn()};
	return {
		api: server,
		createApiForServer: () => server,
		getServerType: () => 'jellyfin',
		getServerUrl: () => 'http://server',
		getApiKey: () => 'key',
		getDeviceId: () => 'device',
		getTokenParam: () => 'ApiKey'
	};
});
jest.mock('./deviceProfile', () => ({
	getDeviceProfile: async () => ({}),
	getDeviceCapabilities: async () => ({})
}));
jest.mock('./storage', () => ({getFromStorage: async () => ({})}));
jest.mock('./serverLogger', () => ({serverLogger: {playback: jest.fn()}}));
jest.mock('./systemVolume', () => ({getVolumeState: jest.fn(), lastVolumeState: () => null}));
jest.mock('../platform', () => ({getPlatform: () => 'webos', isVega: () => false, isXbox: () => false, isTizen: () => false}));

const {api} = jellyfinApi;
const episode = (id, extra) => ({Id: id, Type: 'Episode', SeriesId: 'series', SeasonId: 'season-1', LocationType: 'FileSystem', ...extra});
const otherServer = {_serverUrl: 'http://other', _serverType: 'jellyfin', _serverAccessToken: 'token', _serverUserId: 'user'};

beforeEach(() => {
	jest.clearAllMocks();
});

describe('getNextEpisode', () => {
	test('an episode from another server is followed by one that says which server', async () => {
		api.getEpisodes.mockResolvedValue({Items: [episode('e1'), episode('e2')]});
		const next = await playback.getNextEpisode(episode('e1', otherServer));
		expect(next).toMatchObject({Id: 'e2', ...otherServer});
	});

	test('so is the first episode of the next season', async () => {
		api.getEpisodes
			.mockResolvedValueOnce({Items: [episode('e1')]})
			.mockResolvedValueOnce({Items: [episode('s2e1', {SeasonId: 'season-2'})]});
		api.getSeasons.mockResolvedValue({Items: [{Id: 'season-1', IndexNumber: 1}, {Id: 'season-2', IndexNumber: 2}]});
		const next = await playback.getNextEpisode(episode('e1', {...otherServer, ParentIndexNumber: 1}));
		expect(next).toMatchObject({Id: 's2e1', ...otherServer});
	});

	test('an episode from the signed-in server is followed as it comes', async () => {
		api.getEpisodes.mockResolvedValue({Items: [episode('e1'), episode('e2')]});
		expect(await playback.getNextEpisode(episode('e1'))).toEqual(episode('e2'));
	});

	test('the last episode has none after it', async () => {
		api.getEpisodes.mockResolvedValue({Items: [episode('e1')]});
		api.getSeasons.mockResolvedValue({Items: [{Id: 'season-1', IndexNumber: 1}]});
		expect(await playback.getNextEpisode(episode('e1', otherServer))).toBeNull();
	});
});
