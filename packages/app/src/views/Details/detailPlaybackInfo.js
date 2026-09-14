import {getDeviceProfile} from '../../services/deviceProfile';

// Asks the server how it would play this item with the tracks the screen currently has selected,
// which is all the direct play line in the details footer needs to know.
//
// This deliberately does not go through services/playback. That one gathers device capabilities,
// negotiates codecs, opens a live stream and takes the current session over, none of which a
// details screen should set in motion just to print a word.
export const fetchDetailPlaybackInfo = async (api, {
	itemId,
	serverType,
	mediaSourceId,
	audioStreamIndex,
	subtitleStreamIndex
} = {}) => {
	if (!api?.getPlaybackInfo || !itemId) return null;

	// Asked without a profile the server answers that it supports everything, so the line would
	// read as direct play for every title on every set.
	const deviceProfile = await getDeviceProfile(serverType).catch(() => null);

	const body = {
		EnableDirectPlay: true,
		EnableDirectStream: true,
		EnableTranscoding: true
	};
	if (deviceProfile) body.DeviceProfile = deviceProfile;
	if (mediaSourceId) body.MediaSourceId = mediaSourceId;
	if (audioStreamIndex != null) body.AudioStreamIndex = audioStreamIndex;
	if (subtitleStreamIndex != null) body.SubtitleStreamIndex = subtitleStreamIndex;

	const result = await api.getPlaybackInfo(itemId, body);
	const sources = result?.MediaSources || [];
	const source = (mediaSourceId && sources.find((s) => s.Id === mediaSourceId)) || sources[0];
	if (!source) return null;

	return {
		supportsDirectPlay: source.SupportsDirectPlay === true,
		supportsDirectStream: source.SupportsDirectStream === true,
		// Only some servers say why they would transcode, so nothing here means no reason was
		// given rather than that there is no reason.
		transcodeReasons: source.TranscodeReasons || result?.TranscodeReasons || []
	};
};
