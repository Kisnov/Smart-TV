const SEPARATORS = /[\s_-]/g;

// Which HDR format a stream carries, from whichever range field the server filled in.
//
// Jellyfin squashes it into VideoRangeType as a token like HDR10. Emby types it in
// ExtendedVideoType and only generates VideoRange from it as display prose, `HDR 10`
// rather than `HDR10`, so the value is normalised before it is read. Reading the prose
// as written is how an Emby stream used to come back SDR.
//
// The same reading as Moonfin-Core's video_range_label.dart, so a title is described the
// same way on either client.
export const videoRangeLabel = (videoStream) => {
	if (!videoStream) return 'SDR';

	const raw = [
		videoStream.VideoRangeType,
		videoStream.ExtendedVideoType,
		videoStream.VideoRange
	].find((value) => typeof value === 'string' && value.trim() !== '') || '';
	const range = raw.toUpperCase().replace(SEPARATORS, '');

	if (range.indexOf('DOVI') >= 0 || range.indexOf('DOLBYVISION') >= 0) return 'Dolby Vision';
	// Ahead of the plain HDR10 test, which its own name would satisfy first.
	if (range.indexOf('HDR10PLUS') >= 0 || range.indexOf('HDR10+') >= 0) return 'HDR10+';
	if (range.indexOf('HDR10') >= 0) return 'HDR10';
	if (range.indexOf('HLG') >= 0 || range.indexOf('HYPERLOGGAMMA') >= 0) return 'HLG';
	if (range.indexOf('HDR') >= 0) return 'HDR';
	return 'SDR';
};

// Anything the reading above names other than SDR is some HDR format, so a new one
// counts without a change here.
export const isHdrVideoStream = (videoStream) => videoRangeLabel(videoStream) !== 'SDR';

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
