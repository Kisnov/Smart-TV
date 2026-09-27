import {initialAudioPosition} from './initialAudio';
import {getSeriesAudioPref} from '../../services/subtitlePrefs';

jest.mock('../../services/subtitlePrefs', () => ({
	getSeriesAudioPref: jest.fn()
}));

const jpn = {index: 1, language: 'jpn', isDefault: true, channels: 2};
const spa = {index: 2, language: 'spa', isDefault: false, channels: 2};
const episode = {Id: 'episode-1', SeriesId: 'series-1'};

beforeEach(() => {
	getSeriesAudioPref.mockResolvedValue(undefined);
});

describe('initialAudioPosition', () => {
	test('is the fallback language rather than the default track, as the player picks', async () => {
		const settings = {audioLanguage: 'cat', fallbackAudioLanguage: 'spa'};
		expect(await initialAudioPosition(episode, [jpn, spa], settings)).toBe(1);
	});

	test('puts the track remembered for the series before the language preferences', async () => {
		getSeriesAudioPref.mockResolvedValue({language: 'jpn', title: '', relativeIndex: 0});
		expect(await initialAudioPosition(episode, [jpn, spa], {audioLanguage: 'spa'})).toBe(0);
	});
});
