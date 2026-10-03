// What the Vega WebView can play, and the Jellyfin profile that says so.
//
// The WebView answers canPlayType honestly for the codecs that matter here, and
// the shell reports the display, so nothing is read from OS version tables. Dolby
// and DTS are offered only where the WebView says it decodes them.
import {bootData} from './bridge';
import {modelFromUserAgent} from './deviceInfo';

let cachedCapabilities = null;
let probeElement = null;

const canPlay = (type) => {
	if (!probeElement) probeElement = document.createElement('video');
	return !!probeElement.canPlayType(type).replace(/no/, '');
};

export const clearCapabilitiesCache = () => {
	cachedCapabilities = null;
};

export const detectVegaVersion = () => bootData()?.os?.version || '';

export const getDeviceCapabilities = async () => {
	if (cachedCapabilities) return cachedCapabilities;

	const display = bootData()?.display;
	const hdr = display?.hdr || [];
	const version = detectVegaVersion();

	cachedCapabilities = {
		modelName: modelFromUserAgent(navigator.userAgent) || 'Fire TV',
		vegaVersionDisplay: version ? `Vega OS ${version}` : 'Vega OS',

		uhd: (display?.width || window.screen.width) >= 3840,
		uhd8K: false,

		hdr10: hdr.includes('hdr10'),
		hdr10Plus: hdr.includes('hdr10plus'),
		hlg: hdr.includes('hlg'),
		dolbyVision: false,

		hevc: canPlay('video/mp4; codecs="hvc1.2.4.L153.B0"'),
		av1: canPlay('video/mp4; codecs="av01.0.08M.08"'),
		vp9: canPlay('video/mp4; codecs="vp09.02.10.10"'),

		ac3: canPlay('audio/mp4; codecs="ac-3"'),
		eac3: canPlay('audio/mp4; codecs="ec-3"'),
		dts: canPlay('audio/mp4; codecs="dtsc"'),
		flac: true,
		opus: true,

		// Chromium plays Matroska through its WebM demuxer and never says so in canPlayType,
		// and a 1080p H.264 MKV did direct play on a Fire TV Stick 4K 3rd Gen
		mkv: true,
		webm: true,
		ts: true,

		nativeHls: canPlay('application/vnd.apple.mpegurl')
	};

	console.log('[deviceProfile] Capabilities:', cachedCapabilities);
	return cachedCapabilities;
};

// Dual layer Dolby Vision carries a base layer the WebView can play on its own,
// so those files are accepted for the base layer they carry.
const buildVideoRangeTypes = (caps) => {
	const rangeTypes = ['SDR', 'DOVIWithSDR'];
	if (caps.hdr10) rangeTypes.push('HDR10', 'HDR10Plus', 'DOVIWithHDR10', 'DOVIWithHDR10Plus', 'DOVIWithEL', 'DOVIWithELHDR10Plus', 'DOVIInvalid');
	if (caps.hlg) rangeTypes.push('HLG', 'DOVIWithHLG');
	return rangeTypes.join('|');
};

const buildVideoCodecs = (caps) => {
	const codecs = ['h264'];
	if (caps.hevc) codecs.push('hevc', 'dvh1');
	if (caps.av1) codecs.push('av1');
	return codecs;
};

const buildAudioCodecs = (caps) => {
	const codecs = ['aac', 'mp3', 'opus', 'flac'];
	if (caps.ac3) codecs.push('ac3');
	if (caps.eac3) codecs.push('eac3');
	if (caps.dts) codecs.push('dca', 'dts');
	return codecs;
};

const buildDirectPlayProfiles = (caps) => {
	const videoCodecs = buildVideoCodecs(caps).join(',');
	const audioCodecs = buildAudioCodecs(caps).join(',');
	const tsAudioCodecs = ['aac', 'mp2', 'mp3'].concat(caps.ac3 ? ['ac3'] : [], caps.eac3 ? ['eac3'] : []).join(',');
	const webmVideoCodecs = ['vp8'].concat(caps.vp9 ? ['vp9'] : [], caps.av1 ? ['av1'] : []).join(',');

	const profiles = [
		{Container: 'webm', Type: 'Video', VideoCodec: webmVideoCodecs, AudioCodec: 'vorbis,opus'},
		{Container: 'mp4,m4v', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: audioCodecs},
		{Container: 'mkv', Type: 'Video', VideoCodec: videoCodecs + (caps.vp9 ? ',vp9' : ''), AudioCodec: audioCodecs + ',vorbis'},
		{Container: 'ts,mpegts', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: tsAudioCodecs},
		{Container: 'mov', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: audioCodecs},
		{Container: 'mp3', Type: 'Audio'},
		{Container: 'flac', Type: 'Audio'},
		{Container: 'aac', Type: 'Audio'},
		{Container: 'ogg', Type: 'Audio'},
		{Container: 'wav', Type: 'Audio'},
		{Container: 'webm', AudioCodec: 'opus', Type: 'Audio'},
		{Container: 'm4a', AudioCodec: 'aac', Type: 'Audio'},
		{Container: 'm4b', AudioCodec: 'aac', Type: 'Audio'}
	];
	if (caps.nativeHls) {
		profiles.push({Container: 'hls', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: tsAudioCodecs});
	}
	return profiles;
};

const AUDIO_TRANSCODING_PROFILES = [
	{Container: 'mp3', Type: 'Audio', AudioCodec: 'mp3', Context: 'Streaming', Protocol: 'http'},
	{Container: 'aac', Type: 'Audio', AudioCodec: 'aac', Context: 'Streaming', Protocol: 'http'}
];

const SUBTITLE_PROFILES = [
	{Format: 'vtt', Method: 'External'},
	{Format: 'srt', Method: 'External'},
	{Format: 'ass', Method: 'External'},
	{Format: 'ssa', Method: 'External'},
	{Format: 'sub', Method: 'Encode'},
	{Format: 'smi', Method: 'Encode'},
	{Format: 'ttml', Method: 'External'},
	{Format: 'pgssub', Method: 'External'},
	{Format: 'dvdsub', Method: 'Encode'},
	{Format: 'dvbsub', Method: 'Encode'}
];

export const getJellyfinDeviceProfile = async () => {
	const caps = await getDeviceCapabilities();
	const videoRangeTypes = buildVideoRangeTypes(caps);
	const hlsAudioCodecs = ['aac', 'mp2'].concat(caps.ac3 ? ['ac3'] : [], caps.eac3 ? ['eac3'] : []).join(',');

	const transcodingProfiles = [
		caps.nativeHls
			? {Container: 'ts', Type: 'Video', AudioCodec: hlsAudioCodecs, VideoCodec: caps.hevc ? 'hevc,h264' : 'h264', Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '6', MinSegments: '1', BreakOnNonKeyFrames: false}
			: {Container: 'ts', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '2', MinSegments: '1', BreakOnNonKeyFrames: false},
		{Container: 'mp4', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Static'},
		...AUDIO_TRANSCODING_PROFILES
	];

	const codecProfiles = [
		{
			Type: 'Video',
			Codec: 'h264',
			Conditions: [
				{Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'high|main|baseline|constrained baseline', IsRequired: false},
				{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: 'SDR', IsRequired: false},
				{Condition: 'LessThanEqual', Property: 'VideoLevel', Value: caps.uhd ? '51' : '42', IsRequired: false}
			]
		},
		{
			Type: 'Video',
			Codec: 'hevc',
			Conditions: [
				{Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'main|main 10', IsRequired: false},
				{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: videoRangeTypes, IsRequired: false},
				{Condition: 'LessThanEqual', Property: 'VideoLevel', Value: caps.uhd ? '153' : '123', IsRequired: false}
			]
		},
		{
			Type: 'Video',
			Codec: 'dvh1',
			Conditions: [
				{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: videoRangeTypes, IsRequired: false},
				{Condition: 'LessThanEqual', Property: 'VideoLevel', Value: caps.uhd ? '153' : '123', IsRequired: false}
			]
		},
		{
			Type: 'Video',
			Codec: 'vp9',
			Conditions: [
				{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: videoRangeTypes, IsRequired: false}
			]
		},
		{
			Type: 'VideoAudio',
			Codec: 'flac',
			Conditions: [
				{Condition: 'LessThanEqual', Property: 'AudioChannels', Value: '8', IsRequired: false}
			]
		}
	];

	return {
		Name: 'Moonfin Fire TV',
		MaxStreamingBitrate: 120_000_000,
		MaxStaticBitrate: 120_000_000,
		MaxStaticMusicBitrate: 40_000_000,
		MusicStreamingTranscodingBitrate: 384_000,
		DirectPlayProfiles: buildDirectPlayProfiles(caps),
		TranscodingProfiles: transcodingProfiles,
		CodecProfiles: codecProfiles,
		SubtitleProfiles: SUBTITLE_PROFILES,
		ResponseProfiles: [
			{Type: 'Video', Container: 'm4v', MimeType: 'video/mp4'},
			{Type: 'Video', Container: 'mkv', MimeType: 'video/x-matroska'}
		]
	};
};

// H.264 and stereo AAC only, for the hls.js retry after a native transcode fails.
export const getH264FallbackProfile = async () => {
	const profile = await getJellyfinDeviceProfile();
	profile.TranscodingProfiles = [
		{Container: 'ts', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '2', MinSegments: '1', BreakOnNonKeyFrames: false},
		{Container: 'mp4', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Static'},
		...AUDIO_TRANSCODING_PROFILES
	];
	return profile;
};

export const getDeviceId = () => {
	let deviceId = localStorage.getItem('moonfin_device_id');
	if (!deviceId) {
		deviceId = 'moonfin_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
		localStorage.setItem('moonfin_device_id', deviceId);
	}
	return deviceId;
};

export const getDeviceName = async () => {
	const caps = await getDeviceCapabilities();
	return `Fire TV ${caps.modelName}`;
};
