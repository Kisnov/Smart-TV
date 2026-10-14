import {embyThumbnailInfo, planSeekSheetIndexes, trickplayTile} from './trickplaySheets';

// One thumbnail per sheet, a second apart, so a sheet index reads as the second it shows.
const frames = {Width: 100, Height: 60, TileWidth: 1, TileHeight: 1, Interval: 1000, ThumbnailCount: 100};
// Twenty thumbnails ten seconds apart on each sheet.
const sheets = {Width: 100, Height: 60, TileWidth: 5, TileHeight: 4, Interval: 10000, ThumbnailCount: 120};

const plan = (info, seconds, forward) => planSeekSheetIndexes({
	info,
	positionMs: seconds * 1000,
	durationMs: 100000,
	stepMs: 10000,
	forward
});

describe('planSeekSheetIndexes', () => {
	test('follows the scrub step six ahead and two behind', () => {
		expect(plan(frames, 20, true)).toEqual([20, 30, 40, 50, 60, 70, 80, 10, 0]);
		expect(plan(frames, 40, false)).toEqual([40, 30, 20, 10, 0, 50, 60]);
	});

	test('clamps at both ends and collapses shared sheets', () => {
		expect(plan(frames, 0, false)).toEqual([0, 10, 20]);
		expect(plan(frames, 95, true)).toEqual([95, 99, 85, 75]);
		expect(plan(sheets, 20, true)).toEqual([0]);
	});

	test('is empty without a manifest or a runtime', () => {
		expect(planSeekSheetIndexes({info: null, positionMs: 0, durationMs: 100000, stepMs: 10000, forward: true})).toEqual([]);
		expect(planSeekSheetIndexes({info: frames, positionMs: 0, durationMs: 0, stepMs: 10000, forward: true})).toEqual([]);
	});
});

describe('trickplayTile', () => {
	test('finds the sheet and the crop for a position', () => {
		expect(trickplayTile(sheets, 270000)).toEqual({
			imageIndex: 1, x: 200, y: 60, width: 100, height: 60, sheetWidth: 500, sheetHeight: 240
		});
	});

	test('is null past the last thumbnail', () => {
		expect(trickplayTile(sheets, 1200000)).toBeNull();
	});
});

describe('Emby thumbnail sets', () => {
	const TICKS_PER_SECOND = 10000000;
	const set = (seconds, extra = {}) => ({
		AspectRatio: 16 / 9,
		Thumbnails: seconds.map((second, i) => ({PositionTicks: second * TICKS_PER_SECOND, ImageTag: `t${i}`})),
		...extra
	});

	test('become one frame per sheet, sorted, at the width asked for', () => {
		const info = embyThumbnailInfo(set([20, 0, 10]), 320);
		expect(info).toMatchObject({Width: 320, Height: 180, TileWidth: 1, TileHeight: 1, ThumbnailCount: 3, Interval: 10000});
		expect(info.Frames.map((frame) => frame.positionTicks)).toEqual([0, 10, 20].map((s) => s * TICKS_PER_SECOND));
		expect(info.Frames.map((frame) => frame.imageTag)).toEqual(['t1', 't2', 't0']);
	});

	test('keep the last image for a position listed twice and drop frames that cannot be fetched', () => {
		const info = embyThumbnailInfo({AspectRatio: 2, Thumbnails: [
			{PositionTicks: 0, ImageTag: 'first'},
			{PositionTicks: 0, ImageTag: 'second'},
			{PositionTicks: -1, ImageTag: 'early'},
			{PositionTicks: 10, ImageTag: null},
			{PositionTicks: 20, ImageTag: '  '},
			{ImageTag: 'nowhere'}
		]}, 320);
		expect(info.Frames).toEqual([{positionTicks: 0, imageTag: 'second'}]);
		expect(info.Height).toBe(160);
	});

	test('are nothing without an aspect ratio or a usable frame', () => {
		expect(embyThumbnailInfo({Thumbnails: []}, 320)).toBeNull();
		expect(embyThumbnailInfo({AspectRatio: 0, Thumbnails: [{PositionTicks: 0, ImageTag: 't'}]}, 320)).toBeNull();
		expect(embyThumbnailInfo({AspectRatio: 1.5, Thumbnails: [{PositionTicks: 0}]}, 320)).toBeNull();
		expect(embyThumbnailInfo(null, 320)).toBeNull();
	});

	test('show the last frame taken at or before a position, however unevenly they are spaced', () => {
		const info = embyThumbnailInfo(set([0, 4, 30, 31]), 320);
		const at = (seconds) => trickplayTile(info, seconds * 1000)?.imageIndex;
		expect(at(0)).toBe(0);
		expect(at(3.9)).toBe(0);
		expect(at(4)).toBe(1);
		expect(at(29)).toBe(1);
		expect(at(30.5)).toBe(2);
		expect(at(600)).toBe(3);
		expect(trickplayTile(info, 4000)).toEqual({imageIndex: 1, x: 0, y: 0, width: 320, height: 180, sheetWidth: 320, sheetHeight: 180});
	});

	test('warm the frames the next scrub steps land on', () => {
		const info = embyThumbnailInfo(set([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]), 320);
		expect(planSeekSheetIndexes({info, positionMs: 20000, durationMs: 100000, stepMs: 10000, forward: true})).toEqual([2, 3, 4, 5, 6, 7, 8, 1, 0]);
		// Frames that only reach a few seconds in still hand the last one to a later step.
		const short = embyThumbnailInfo(set([0, 1, 50]), 320);
		expect(planSeekSheetIndexes({info: short, positionMs: 0, durationMs: 100000, stepMs: 20000, forward: true})).toEqual([0, 1, 2]);
	});
});
