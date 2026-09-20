import {isHdrVideoStream, findVideoStream, isHdrOutput, videoRangeLabel} from './videoRange';

describe('isHdrVideoStream', () => {
	it.each(['HDR10', 'HDR10Plus', 'HLG', 'DOVI'])('treats %s as HDR', (rangeType) => {
		expect(isHdrVideoStream({VideoRangeType: rangeType})).toBe(true);
	});

	it('treats SDR as not HDR', () => {
		expect(isHdrVideoStream({VideoRangeType: 'SDR'})).toBe(false);
	});

	it('falls back to VideoRange when the type is missing', () => {
		expect(isHdrVideoStream({VideoRange: 'HDR'})).toBe(true);
		expect(isHdrVideoStream({VideoRange: 'SDR'})).toBe(false);
	});

	it('prefers the type over the coarse field', () => {
		expect(isHdrVideoStream({VideoRangeType: 'SDR', VideoRange: 'HDR'})).toBe(false);
	});

	it('handles missing input', () => {
		expect(isHdrVideoStream(null)).toBe(false);
		expect(isHdrVideoStream({})).toBe(false);
	});
});

describe('findVideoStream', () => {
	it('picks the video stream out of a media source', () => {
		const source = {MediaStreams: [{Type: 'Audio'}, {Type: 'Video', Codec: 'hevc'}]};

		expect(findVideoStream(source).Codec).toBe('hevc');
	});

	it('returns null when there is none', () => {
		expect(findVideoStream({MediaStreams: [{Type: 'Audio'}]})).toBeNull();
		expect(findVideoStream(null)).toBeNull();
	});
});

describe('isHdrOutput', () => {
	const hdrSource = {MediaStreams: [{Type: 'Video', VideoRangeType: 'HDR10'}]};

	it('is HDR when an HDR stream is not being transcoded', () => {
		expect(isHdrOutput(hdrSource, false)).toBe(true);
	});

	it('is not HDR while transcoding', () => {
		expect(isHdrOutput(hdrSource, true)).toBe(false);
	});

	it('is not HDR for an SDR source', () => {
		expect(isHdrOutput({MediaStreams: [{Type: 'Video', VideoRangeType: 'SDR'}]}, false)).toBe(false);
	});
});

describe('videoRangeLabel', () => {
	it.each([
		['DOVI', 'Dolby Vision'],
		['DolbyVision', 'Dolby Vision'],
		['HDR10Plus', 'HDR10+'],
		['HDR10', 'HDR10'],
		['HLG', 'HLG'],
		['SDR', 'SDR']
	])('reads a squashed %s as %s', (rangeType, expected) => {
		expect(videoRangeLabel({VideoRangeType: rangeType})).toBe(expected);
	});

	// Emby leaves VideoRangeType empty and types the range here instead. Every
	// member of its ExtendedVideoTypes enum.
	it.each([
		['Hdr10', 'HDR10'],
		['Hdr10Plus', 'HDR10+'],
		['HyperLogGamma', 'HLG'],
		['DolbyVision', 'Dolby Vision'],
		['None', 'SDR']
	])('reads a typed %s as %s', (extended, expected) => {
		expect(videoRangeLabel({ExtendedVideoType: extended})).toBe(expected);
	});

	// What Emby generates from the typed field for display. Read as written it
	// matched nothing, which is how an HDR stream came back SDR there.
	it('squashes a range written in prose before reading it', () => {
		expect(videoRangeLabel({VideoRange: 'HDR 10'})).toBe('HDR10');
		expect(videoRangeLabel({VideoRange: 'Dolby Vision'})).toBe('Dolby Vision');
		expect(videoRangeLabel({VideoRange: 'HDR'})).toBe('HDR');
	});

	it('takes the typed field over the prose generated from it', () => {
		expect(videoRangeLabel({ExtendedVideoType: 'None', VideoRange: 'HDR 10'})).toBe('SDR');
		expect(videoRangeLabel({VideoRangeType: 'SDR', VideoRange: 'HDR'})).toBe('SDR');
	});

	it('says SDR when the server said nothing at all', () => {
		expect(videoRangeLabel(null)).toBe('SDR');
		expect(videoRangeLabel({})).toBe('SDR');
		expect(videoRangeLabel({VideoRangeType: '   '})).toBe('SDR');
	});
});

// The styling and the panel's wording read the same field, so an Emby stream that
// reads as HDR has to be styled as one too.
describe('isHdrVideoStream on an Emby stream', () => {
	it.each(['Hdr10', 'Hdr10Plus', 'HyperLogGamma', 'DolbyVision'])(
		'treats a typed %s as HDR',
		(extended) => {
			expect(isHdrVideoStream({ExtendedVideoType: extended})).toBe(true);
		}
	);

	it('treats the prose it generates as HDR too', () => {
		expect(isHdrVideoStream({VideoRange: 'HDR 10'})).toBe(true);
	});

	it('leaves a typed None as SDR', () => {
		expect(isHdrVideoStream({ExtendedVideoType: 'None'})).toBe(false);
	});
});
