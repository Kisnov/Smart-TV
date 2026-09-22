import {featuredConfigKey} from './featuredConfig';

const base = {
	useMoonfinPlugin: false,
	mediaBarSourceType: 'library',
	featuredContentType: 'Movie,Series',
	featuredItemCount: 20,
	mediaBarLibraryIds: ['lib1'],
	mediaBarCollectionIds: [],
	excludedGenres: []
};

describe('featuredConfigKey', () => {
	test('two draws under the same settings share a key', () => {
		expect(featuredConfigKey(base)).toBe(featuredConfigKey({...base}));
	});

	// An unset list and an empty one describe the same bar. Telling them apart
	// would make a defaulted setting look like a different bar and replace one the
	// viewer is watching.
	test('an unset list reads the same as an empty one', () => {
		const unset = {...base, mediaBarLibraryIds: undefined, mediaBarCollectionIds: undefined, excludedGenres: undefined};
		const empty = {...base, mediaBarLibraryIds: [], mediaBarCollectionIds: [], excludedGenres: []};
		expect(featuredConfigKey(unset)).toBe(featuredConfigKey(empty));
	});

	test('an unset source type reads as the library default', () => {
		expect(featuredConfigKey({...base, mediaBarSourceType: undefined}))
			.toBe(featuredConfigKey({...base, mediaBarSourceType: 'library'}));
	});

	// Each of these changes what the bar holds, so a set drawn before it is not a
	// refresh of the set drawn after it.
	test.each([
		['useMoonfinPlugin', {useMoonfinPlugin: true}],
		['mediaBarSourceType', {mediaBarSourceType: 'collection'}],
		['featuredContentType', {featuredContentType: 'Movie'}],
		['featuredItemCount', {featuredItemCount: 40}],
		['mediaBarLibraryIds', {mediaBarLibraryIds: ['lib2']}],
		['mediaBarCollectionIds', {mediaBarCollectionIds: ['col1']}],
		['excludedGenres', {excludedGenres: ['Horror']}]
	])('%s changes the key', (_label, change) => {
		expect(featuredConfigKey({...base, ...change})).not.toBe(featuredConfigKey(base));
	});
});
