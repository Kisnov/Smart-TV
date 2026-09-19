// searchGroups reaches the games API for its fetch helper, which drags the
// whole server client and the platform storage shims in behind it. The
// matchers under test here touch none of that.
jest.mock('../services/gamesApi', () => ({}));

import {foldAccents, foldForSearch} from './accentFolding';
import {filterByName, filterGames} from './searchGroups';

describe('foldAccents', () => {
	test('replaces accented letters with the letter behind them', () => {
		expect(foldForSearch('Cançó')).toBe('canco');
		expect(foldForSearch('Pokémon')).toBe('pokemon');
		expect(foldForSearch('Amélie')).toBe('amelie');
		// The table folds the ligature to a single letter rather than spelling
		// it out, which is what the game library has always matched on.
		expect(foldForSearch('Æon Flux')).toBe('aon flux');
	});

	test('leaves letters it does not know alone', () => {
		// Nothing folds these, so they still have to survive the pass intact.
		expect(foldForSearch('Волшебник')).toBe('волшебник');
		expect(foldForSearch('東京')).toBe('東京');
		expect(foldForSearch('Straße')).toBe('straße');
	});

	test('folded letters come back uppercase, so callers case fold after', () => {
		expect(foldAccents('cançó')).toBe('canCO');
		expect(foldForSearch('cançó')).toBe('canco');
	});

	test('takes null and undefined without throwing', () => {
		expect(foldForSearch(null)).toBe('');
		expect(foldForSearch(undefined)).toBe('');
	});
});

describe('search matching folds both sides', () => {
	// What the server answers for the same term, so a title reads the same way
	// whichever box the viewer typed it into.
	const channels = [{Name: 'Cançó TV'}, {Name: 'Titanic TV'}];

	test('an unaccented query finds an accented name', () => {
		expect(filterByName(channels, 'canco')).toEqual([{Name: 'Cançó TV'}]);
	});

	test('a differently accented query finds it too', () => {
		expect(filterByName(channels, 'canço')).toEqual([{Name: 'Cançó TV'}]);
	});

	test('an accented query finds a plain name', () => {
		expect(filterByName([{Name: 'Cancion'}], 'canción')).toEqual([{Name: 'Cancion'}]);
	});

	test('games match on a folded title or filename', () => {
		const games = [{title: 'Cançó', fileName: 'canco.rom'}, {title: 'Zulu', fileName: 'zulu.rom'}];
		expect(filterGames(games, 'canco')).toEqual([games[0]]);
		expect(filterGames(games, 'cançó')).toEqual([games[0]]);
	});
});
