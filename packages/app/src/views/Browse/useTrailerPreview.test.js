import {renderHook, act} from '@testing-library/react';

import useTrailerPreview from './useTrailerPreview';

// Plain functions rather than jest.fn, since the shared jest config resets
// mocks between tests and would strip the implementations.
jest.mock('../../utils/trailerPlayback', () => ({
	stopPlaybackForTrailer: () => Promise.resolve()
}));

jest.mock('../../services/jellyfinApi', () => ({
	createApiForServer: () => null,
	getApiKey: () => 'token',
	getServerUrl: () => 'http://server'
}));

// No youtube fallback: the local trailer is the one under test.
jest.mock('../../services/youtubeTrailer', () => ({
	extractYouTubeId: () => null,
	extractYouTubeIdFromUrl: () => null,
	fetchSponsorSegments: () => Promise.resolve([]),
	fetchVideoStream: () => Promise.resolve(null),
	getTrailerStartTime: () => 0
}));

// jsdom has no media pipeline, so the shared element is a real <video> with the
// bits the hook drives stubbed out, and the test fires its events by hand.
let mockSharedVideo = null;
jest.mock('@moonfin/platform-webos/video', () => ({
	getSharedVideoElement: () => mockSharedVideo
}), {virtual: true});

const item = {Id: 'item1'};
const api = {getLocalTrailers: () => Promise.resolve({Items: [{Id: 'trailer1'}]})};
// Held outside the render: a fresh identity each render re-runs the hook's main
// effect, which stops the trailer it is meant to be starting.
const getItemServerUrl = () => 'http://server';

const renderPreview = () => renderHook(() => useTrailerPreview({
	currentItem: item,
	isVisible: true,
	enabled: true,
	preferMuted: true,
	api,
	getItemServerUrl
}));

const flush = async () => {
	await act(async () => {
		for (let i = 0; i < 10; i++) await Promise.resolve();
	});
};

describe('useTrailerPreview', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		mockSharedVideo = document.createElement('video');
		mockSharedVideo.play = () => Promise.resolve();
		mockSharedVideo.pause = () => {};
	});

	afterEach(() => {
		jest.useRealTimers();
		document.body.innerHTML = '';
	});

	// The container only exists once the caller renders it, so it is handed to
	// the ref the way a banner would.
	const startPlayback = async (result) => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		result.current.trailerContainerRef.current = container;
		await flush();
		expect(mockSharedVideo.src).toContain('/Videos/trailer1/stream');
		act(() => mockSharedVideo.onplaying());
	};

	test('holds the carousel as soon as the trailer plays, before it is revealed', async () => {
		const {result} = renderPreview();
		await startPlayback(result);

		// The reveal is still three seconds out, but the trailer is already
		// audible, so the banner has to be holding its carousel by now.
		expect(result.current.trailerPlaying).toBe(true);
		expect(result.current.trailerActive).toBe(false);

		act(() => jest.advanceTimersByTime(3000));
		expect(result.current.trailerActive).toBe(true);
		expect(result.current.trailerPlaying).toBe(true);
	});

	test('releases the carousel when the trailer errors after starting', async () => {
		const {result} = renderPreview();
		await startPlayback(result);
		expect(result.current.trailerPlaying).toBe(true);

		act(() => mockSharedVideo.onerror());
		expect(result.current.trailerPlaying).toBe(false);
		expect(result.current.trailerActive).toBe(false);
	});

	test('releases the carousel when the trailer ends', async () => {
		const {result} = renderPreview();
		await startPlayback(result);
		act(() => jest.advanceTimersByTime(3000));
		expect(result.current.trailerActive).toBe(true);

		act(() => mockSharedVideo.onended());
		expect(result.current.trailerPlaying).toBe(false);
		expect(result.current.trailerActive).toBe(false);
	});
});
