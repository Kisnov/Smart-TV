// Anything VideoRangeType names other than SDR is some HDR format, so a new one counts
// without a change here. VideoRange is the older coarse field and only fills in.
export const isHdrVideoStream = (videoStream) => {
	if (!videoStream) return false;
	const rangeType = (videoStream.VideoRangeType || '').toUpperCase();
	if (rangeType) return rangeType !== 'SDR';
	return (videoStream.VideoRange || '').toUpperCase() === 'HDR';
};

const normalizeToken = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

// Emby sub types whose base layer is plain HDR10, so a decoder that skips the Dolby Vision
// metadata still renders the picture the file carries.
const HDR10_COMPATIBLE_EMBY_SUB_TYPES = ['DOVIPROFILE61', 'DOVIPROFILE81'];

// Jellyfin's VideoRangeType for the stream. Emby leaves that off and types Dolby Vision in
// ExtendedVideoType, or the VideoRange it derives from it, with the profile in ExtendedVideoSubType
// such as DoviProfile81, where the first digit is the profile. That reads as the range type Jellyfin
// gives the same file, so the checks written against Jellyfin's names hold for both. A Dolby Vision
// stream with no profile to go by can only ask for a Dolby Vision decoder.
export const videoRangeTypeOf = (videoStream) => {
	if (!videoStream) return '';
	if (videoStream.VideoRangeType) return videoStream.VideoRangeType;
	const type = normalizeToken(videoStream.ExtendedVideoType) || normalizeToken(videoStream.VideoRange);
	if (type !== 'DOLBYVISION') return '';
	const subType = normalizeToken(videoStream.ExtendedVideoSubType);
	if (HDR10_COMPATIBLE_EMBY_SUB_TYPES.indexOf(subType) !== -1) return 'DOVIWithHDR10';
	if (subType.indexOf('DOVIPROFILE5') === 0) return 'DOVI';
	if (subType.indexOf('DOVIPROFILE7') === 0) return 'DOVIWithEL';
	return 'DolbyVision';
};

export const findVideoStream = (mediaSource) =>
	(mediaSource?.MediaStreams || []).find((s) => s.Type === 'Video') || null;

// What reaches the screen, not what sits on disk. A transcode drops the HDR metadata,
// so an HDR source arrives as SDR and wants the SDR style.
export const isHdrOutput = (mediaSource, isTranscoding) => {
	if (isTranscoding) return false;
	return isHdrVideoStream(findVideoStream(mediaSource));
};
