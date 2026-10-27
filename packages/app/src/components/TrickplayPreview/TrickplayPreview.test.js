import {render, waitFor} from '@testing-library/react';

import TrickplayPreview, {hasTrickplayPreview} from './TrickplayPreview';

// The CLI ships a second copy of React, so the components' JSX goes through the copy under test.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		jsxDEV: (type, {children, ...props}, key, isStaticChildren) => {
			const config = key === undefined ? props : {...props, key};
			if (children === undefined) return React.createElement(type, config);
			return isStaticChildren ? React.createElement(type, config, ...children) : React.createElement(type, config, children);
		}
	};
});

let mockServerType = 'jellyfin';
let mockPlexManifest = null;
jest.mock('../../services/jellyfinApi', () => ({
	getServerUrl: () => 'http://server',
	getApiKey: () => 'key',
	getServerType: () => mockServerType,
	getTokenParam: (type) => ((type || mockServerType) === 'emby' ? 'api_key' : 'ApiKey'),
	userRoutes: {item: (id) => `/Items/${id}?`},
	api: {getTrickplayManifest: async () => mockPlexManifest}
}));

// One width of ten by ten tiles every ten seconds, so a sheet covers 1000 seconds
const MANIFEST = {320: {Width: 320, Height: 132, TileWidth: 10, TileHeight: 10, ThumbnailCount: 870, Interval: 10000}};
const TICKS_PER_MS = 10000;
const DURATION = 8700 * 1000 * TICKS_PER_MS;

let requested = [];
const sheetsAskedFor = () => requested.map((src) => (/Trickplay\/320\/(\d+)\.jpg/.exec(src) || [])[1]).filter(Boolean);

beforeEach(() => {
	mockServerType = 'jellyfin';
	requested = [];
	global.fetch = jest.fn(async () => ({ok: true, json: async () => ({Trickplay: {source: MANIFEST}})}));
	jest.spyOn(window, 'Image').mockImplementation(() => {
		const image = {};
		Object.defineProperty(image, 'src', {set (value) { requested.push(value); }});
		return image;
	});
});

afterEach(() => {
	jest.restoreAllMocks();
});

const preview = (positionSeconds, props = {}) => (
	<TrickplayPreview item={{Id: 'item'}} mediaSourceId="source" positionTicks={positionSeconds * 1000 * TICKS_PER_MS} durationTicks={DURATION} stepSeconds={10} {...props} />
);

describe('TrickplayPreview', () => {
	test('loads the sheet under the playhead while the controls are hidden, and the next one as playback reaches it', async () => {
		const {rerender} = render(preview(0));
		await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
		expect(sheetsAskedFor()).toEqual([]);

		rerender(preview(5));
		await waitFor(() => expect(sheetsAskedFor()).toEqual(['0']));

		rerender(preview(900));
		expect(sheetsAskedFor()).toEqual(['0']);

		rerender(preview(1005));
		await waitFor(() => expect(sheetsAskedFor()).toEqual(['0', '1']));
	});
});

describe('TrickplayPreview on Emby', () => {
	// Emby's frames ten seconds apart, the way /Items/{id}/ThumbnailSet lists them.
	const THUMBNAIL_SET = {
		AspectRatio: 16 / 9,
		Thumbnails: [0, 1, 2, 3].map((i) => ({PositionTicks: i * 10 * 1000 * TICKS_PER_MS, ImageTag: `t${i}`}))
	};

	beforeEach(() => {
		mockServerType = 'emby';
		global.fetch = jest.fn(async () => ({ok: true, json: async () => THUMBNAIL_SET}));
	});

	const emby = (item, props = {}) => (
		<TrickplayPreview item={item} mediaSourceId="source" positionTicks={5 * 1000 * TICKS_PER_MS} durationTicks={DURATION} stepSeconds={10} {...props} />
	);
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

	test('loads no frames during playback, then the ones around the playhead once the controls are up', async () => {
		const item = {Id: 'emby-item'};
		const {rerender} = render(emby(item));
		await waitFor(() => expect(hasTrickplayPreview(item, 'source')).toBe(true));
		expect(global.fetch).toHaveBeenCalledWith('http://server/Items/emby-item/ThumbnailSet?Width=320&MediaSourceId=source&api_key=key');
		await settle();
		expect(requested).toEqual([]);

		rerender(emby(item, {warm: true}));
		await waitFor(() => expect(requested.length).toBeGreaterThan(0));
		expect(requested[0]).toBe('http://server/Items/emby-item/Images/Thumbnail?maxWidth=320&tag=t0&PositionTicks=0&MediaSourceId=source&quality=90&api_key=key');
		expect(requested.some((src) => src.includes('tag=t2&PositionTicks=200000000&'))).toBe(true);
	});

	test('asks the item\'s own server in multi-server mode', async () => {
		mockServerType = 'jellyfin';
		const item = {Id: 'shared-id', _serverUrl: 'http://other', _serverAccessToken: 'other-key', _serverType: 'emby'};
		render(emby(item));
		await waitFor(() => expect(hasTrickplayPreview(item, 'source')).toBe(true));
		expect(global.fetch).toHaveBeenCalledWith('http://other/Items/shared-id/ThumbnailSet?Width=320&MediaSourceId=source&api_key=other-key');
		expect(hasTrickplayPreview({Id: 'shared-id'}, 'source')).toBe(false);
	});

	test('has no preview when the server made none or refuses', async () => {
		global.fetch = jest.fn(async () => ({ok: true, json: async () => ({Thumbnails: []})}));
		render(emby({Id: 'emby-bare'}, {warm: true}));
		global.fetch = jest.fn(async () => ({ok: false, status: 404}));
		render(emby({Id: 'emby-missing'}, {warm: true}));
		await settle();
		await settle();
		expect(hasTrickplayPreview({Id: 'emby-bare'}, 'source')).toBe(false);
		expect(hasTrickplayPreview({Id: 'emby-missing'}, 'source')).toBe(false);
		expect(requested).toEqual([]);
	});
});

describe('TrickplayPreview on Plex', () => {
	test('reads the manifest through the Plex API and loads frames from the part index', async () => {
		mockServerType = 'plex';
		mockPlexManifest = {320: {Width: 320, Height: 180, TileWidth: 1, TileHeight: 1, Interval: 10000, ThumbnailCount: 10, PlexPartId: 'p1'}};
		const item = {Id: 'plex-item'};
		render(<TrickplayPreview item={item} mediaSourceId="source" positionTicks={25 * 1000 * TICKS_PER_MS} durationTicks={100 * 1000 * TICKS_PER_MS} stepSeconds={10} warm />);
		await waitFor(() => expect(hasTrickplayPreview(item, 'source')).toBe(true));
		await waitFor(() => expect(requested).toContain('http://server/library/parts/p1/indexes/sd/20000'));
		expect(global.fetch).not.toHaveBeenCalled();
	});
});
