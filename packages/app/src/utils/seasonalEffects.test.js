import {SEASONAL_EFFECTS, normalizeSeasonalDensity, normalizeSeasonalTheme} from './seasonalEffects';

describe('normalizeSeasonalTheme', () => {
	test("keeps Moonfin-Core's effects as they are", () => {
		for (const effect of SEASONAL_EFFECTS) {
			expect(normalizeSeasonalTheme(effect)).toBe(effect);
		}
	});

	test("maps this app's old winter and fall onto Core's snow and leaves", () => {
		expect(normalizeSeasonalTheme('winter')).toBe('snow');
		expect(normalizeSeasonalTheme('fall')).toBe('leaves');
	});

	test('turns the dropped effects off', () => {
		expect(normalizeSeasonalTheme('spring')).toBe('none');
		expect(normalizeSeasonalTheme('summer')).toBe('none');
		expect(normalizeSeasonalTheme('halloween')).toBe('none');
	});

	test('leaves a value it does not know undefined, so the local choice stays', () => {
		expect(normalizeSeasonalTheme('aurora')).toBeUndefined();
		expect(normalizeSeasonalTheme(null)).toBeUndefined();
		expect(normalizeSeasonalTheme(3)).toBeUndefined();
	});

	test('ignores case and spaces', () => {
		expect(normalizeSeasonalTheme(' Snow ')).toBe('snow');
	});
});

describe('normalizeSeasonalDensity', () => {
	test('falls back to normal', () => {
		expect(normalizeSeasonalDensity('heavy')).toBe('heavy');
		expect(normalizeSeasonalDensity('blizzard')).toBe('normal');
		expect(normalizeSeasonalDensity(undefined)).toBe('normal');
	});
});
