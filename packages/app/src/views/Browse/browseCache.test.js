import {clearMemoryCache, memoryCache} from './browseCache';

// The module reaches storage on save and load, neither of which this touches.
jest.mock('../../services/storage', () => ({
	getFromStorage: () => Promise.resolve(null),
	saveToStorage: () => Promise.resolve()
}));

const fill = () => {
	memoryCache.rowData = [{id: 'resume', items: []}];
	memoryCache.libraries = [{Id: 'lib1'}];
	memoryCache.timestamp = 1;
	memoryCache.rowConfigKey = 'per-library';
	memoryCache.featuredItems = [{Id: 'item1'}];
	memoryCache.featuredConfigKey = 'key';
};

describe('clearMemoryCache', () => {
	beforeEach(fill);

	test('throws the rows away', () => {
		clearMemoryCache({keepFeatured: true});

		expect(memoryCache.rowData).toBeNull();
		expect(memoryCache.libraries).toBeNull();
		expect(memoryCache.timestamp).toBeNull();
		expect(memoryCache.rowConfigKey).toBeNull();
	});

	// Playback ending, an item being marked watched and a return to the home screen
	// all ask for this. None of them changes which items the bar may hold, and
	// dropping it would hand the viewer a different bar each time.
	test('keeps the media bar when asked to', () => {
		clearMemoryCache({keepFeatured: true});

		expect(memoryCache.featuredItems).toEqual([{Id: 'item1'}]);
		expect(memoryCache.featuredConfigKey).toBe('key');
	});

	// An account change, and a library being hidden or shown, both have to redraw it.
	test('takes the media bar with it by default', () => {
		clearMemoryCache();

		expect(memoryCache.featuredItems).toBeNull();
		expect(memoryCache.featuredConfigKey).toBeNull();
	});
});
