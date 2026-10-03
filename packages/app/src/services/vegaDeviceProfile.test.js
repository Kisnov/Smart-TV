import {clearCapabilitiesCache, getDeviceCapabilities, getJellyfinDeviceProfile} from '../../../platform-vega/src/deviceProfile';
import {getPlayMethod} from '../../../platform-vega/src/video';

const STICK_UA = 'Mozilla/5.0 (Linux; Kepler 2.0; AFTCR001 user/55; wv) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Chrome/144.0.7559.246 Safari/537.36';

// What the Fire TV Stick 4K 3rd Gen answered on a 1080p set
const canPlayType = (type) => {
	if (/hvc1|vp09|avc1|mp4a|flac|opus/.test(type)) return 'probably';
	if (/mpegurl/.test(type)) return 'maybe';
	return '';
};

const source = (over = {}) => ({
	Container: 'mkv',
	SupportsDirectPlay: true,
	SupportsDirectStream: true,
	MediaStreams: [
		{Type: 'Video', Codec: 'hevc', VideoRangeType: 'SDR', BitRate: 12_000_000},
		{Type: 'Audio', Codec: 'aac', Index: 1}
	],
	...over
});

describe('the Vega device profile', () => {
	let capabilities;

	beforeAll(async () => {
		Object.defineProperty(window.navigator, 'userAgent', {value: STICK_UA, configurable: true});
		window.__MOONFIN_VEGA__ = {v: 1, os: {name: 'Kepler/2.0', version: '2.0'}, display: {width: 1920, height: 1080, hdr: []}, ip: '192.168.50.129'};
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(canPlayType);
		clearCapabilitiesCache();
		capabilities = await getDeviceCapabilities();
	});

	afterAll(() => {
		delete window.__MOONFIN_VEGA__;
	});

	test('reads the model, the OS and the display from the shell and the probes', () => {
		expect(capabilities.modelName).toBe('AFTCR001');
		expect(capabilities.vegaVersionDisplay).toBe('Vega OS 2.0');
		expect(capabilities.uhd).toBe(false);
		expect(capabilities.hdr10).toBe(false);
		expect(capabilities.hevc).toBe(true);
		expect(capabilities.av1).toBe(false);
		expect(capabilities.ac3).toBe(false);
		expect(capabilities.nativeHls).toBe(true);
	});

	test('offers the server only what the WebView decodes', async () => {
		const profile = await getJellyfinDeviceProfile();
		const mp4 = profile.DirectPlayProfiles.find((entry) => entry.Container === 'mp4,m4v');
		expect(mp4.VideoCodec).toBe('h264,hevc,dvh1');
		expect(mp4.AudioCodec).not.toContain('ac3');
		expect(profile.TranscodingProfiles[0]).toMatchObject({Protocol: 'hls', VideoCodec: 'hevc,h264', AudioCodec: 'aac,mp2'});
		expect(profile.CodecProfiles.find((entry) => entry.Codec === 'hevc').Conditions[1].Value).toBe('SDR|DOVIWithSDR');
		expect(profile.CodecProfiles.some((entry) => entry.Codec === 'av1')).toBe(false);
	});

	test('direct plays what the WebView handles and transcodes the rest', () => {
		expect(getPlayMethod(source(), capabilities)).toBe('DirectPlay');
		expect(getPlayMethod(source({MediaStreams: [{Type: 'Video', Codec: 'hevc'}, {Type: 'Audio', Codec: 'ac3', Index: 1}]}), capabilities)).toBe('Transcode');
		expect(getPlayMethod(source({MediaStreams: [{Type: 'Video', Codec: 'av1'}, {Type: 'Audio', Codec: 'aac', Index: 1}]}), capabilities)).toBe('Transcode');
		expect(getPlayMethod(source({MediaStreams: [{Type: 'Video', Codec: 'hevc', VideoRangeType: 'HDR10'}, {Type: 'Audio', Codec: 'aac', Index: 1}]}), capabilities)).toBe('Transcode');
		expect(getPlayMethod(source({Container: 'avi'}), capabilities)).toBe('Transcode');
		expect(getPlayMethod(source({SupportsDirectPlay: false}), capabilities)).toBe('DirectStream');
	});

	test('a file the server marks as remux only is direct streamed when every track plays', () => {
		expect(getPlayMethod(source({SupportsDirectPlay: false, Container: 'mp4'}), capabilities)).toBe('DirectStream');
	});
});
