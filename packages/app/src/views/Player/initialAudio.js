import {getSeriesAudioPref} from '../../services/subtitlePrefs';
import {selectPreferredAudioStream} from '../../utils/audioTrackSelection';
import {matchSeriesTrackIndex} from '../../utils/seriesTrackPrefs';

/**
 * The audio track remembered for this series, when one of the episode's own tracks
 * can still be it. Null leaves the choice to the language preferences.
 */
export const resolveSeriesAudio = async (item, audioStreams) => {
	if (!item?.SeriesId || !audioStreams?.length) return null;

	const pref = await getSeriesAudioPref(item.SeriesId);
	if (!pref) return null;

	const matched = matchSeriesTrackIndex(audioStreams, pref);
	if (matched === null || matched < 0) return null;

	return audioStreams.find((stream) => stream.index === matched) || null;
};

/**
 * Where among these audio tracks the player starts when none is picked, so Details
 * can show that track.
 */
export const initialAudioPosition = async (item, audioStreams, settings) => {
	const start = await resolveSeriesAudio(item, audioStreams) || selectPreferredAudioStream(audioStreams, settings);
	return Math.max(0, audioStreams.indexOf(start));
};
