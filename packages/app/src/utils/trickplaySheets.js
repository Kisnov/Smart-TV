// Where a moment's trickplay thumbnail sits on the server's sprite sheets, and which sheets the
// next scrub steps will need. `info` is one width's entry from an item's Trickplay manifest, or
// an Emby thumbnail set turned into one (embyThumbnailInfo).

// Scrubbing carries on the way it started, so the run ahead is the longer.
const STEPS_AHEAD = 6;
const STEPS_BEHIND = 2;

// Emby has no sprite sheets. Its thumbnail set lists one image per frame, each found by the
// position it was taken at, and they needn't be evenly spaced. So every frame is a sheet of its
// own, and a position shows the last frame taken at or before it, as on Core.
const frameTile = (info, positionMs) => {
	const frames = info.Frames;
	if (frames.length === 0 || !isFinite(positionMs)) return null;
	const ticks = positionMs * 10000;
	let low = 0;
	let high = frames.length - 1;
	while (low <= high) {
		const middle = (low + high) >> 1;
		if (frames[middle].positionTicks <= ticks) low = middle + 1;
		else high = middle - 1;
	}
	return {
		imageIndex: Math.max(0, high),
		x: 0,
		y: 0,
		width: info.Width,
		height: info.Height,
		sheetWidth: info.Width,
		sheetHeight: info.Height
	};
};

// Emby's /Items/{id}/ThumbnailSet in the shape trickplayTile reads, or null when there are no
// usable frames. Frames come back sorted, and a position listed twice keeps its last image.
export const embyThumbnailInfo = (thumbnailSet, width) => {
	const aspectRatio = Number(thumbnailSet?.AspectRatio);
	if (!(aspectRatio > 0) || !isFinite(aspectRatio) || !Array.isArray(thumbnailSet.Thumbnails)) return null;
	const sorted = thumbnailSet.Thumbnails
		.map((thumbnail) => ({
			positionTicks: Number(thumbnail?.PositionTicks),
			imageTag: thumbnail?.ImageTag == null ? '' : String(thumbnail.ImageTag).trim()
		}))
		.filter((frame) => isFinite(frame.positionTicks) && frame.positionTicks >= 0 && frame.imageTag)
		.sort((a, b) => a.positionTicks - b.positionTicks);
	const frames = [];
	sorted.forEach((frame) => {
		if (frames.length > 0 && frames[frames.length - 1].positionTicks === frame.positionTicks) frames[frames.length - 1] = frame;
		else frames.push(frame);
	});
	if (frames.length === 0) return null;
	return {
		Width: width,
		Height: Math.round(width / aspectRatio),
		TileWidth: 1,
		TileHeight: 1,
		Interval: frames.length > 1 ? Math.max(1, Math.floor((frames[1].positionTicks - frames[0].positionTicks) / 10000)) : 10000,
		ThumbnailCount: frames.length,
		Frames: frames
	};
};

// The sheet and the crop within it for a position, or null past the last thumbnail.
export const trickplayTile = (info, positionMs) => {
	if (info && Array.isArray(info.Frames)) return frameTile(info, positionMs);
	if (!info || !(info.Interval > 0) || !isFinite(positionMs)) return null;
	const thumbnailIndex = Math.floor(positionMs / info.Interval);
	if (thumbnailIndex < 0 || thumbnailIndex >= info.ThumbnailCount) return null;
	const tilesPerSheet = info.TileWidth * info.TileHeight;
	const indexInSheet = thumbnailIndex % tilesPerSheet;
	return {
		imageIndex: Math.floor(thumbnailIndex / tilesPerSheet),
		x: (indexInSheet % info.TileWidth) * info.Width,
		y: Math.floor(indexInSheet / info.TileWidth) * info.Height,
		width: info.Width,
		height: info.Height,
		sheetWidth: info.Width * info.TileWidth,
		sheetHeight: info.Height * info.TileHeight
	};
};

// The sheets the next few scrub steps land on, from where the scrub is now, so they're already
// loaded when it gets there. A set, since neighboring steps usually share a sheet.
export const planSeekSheetIndexes = ({info, positionMs, durationMs, stepMs, forward}) => {
	if (!info || !(durationMs > 0)) return [];
	const lastMs = durationMs - 1;
	const step = Math.max(1, stepMs || 0);
	const indexes = [];
	const add = (offsetMs) => {
		const target = Math.min(lastMs, Math.max(0, positionMs + offsetMs));
		// A runtime a little past the last thumbnail still wants the last sheet. Emby's frames
		// already settle on the last one, and aren't spaced evenly enough to work out where it is.
		const tile = trickplayTile(info, info.Frames ? target : Math.min(target, (info.ThumbnailCount - 1) * info.Interval));
		if (tile && indexes.indexOf(tile.imageIndex) < 0) indexes.push(tile.imageIndex);
	};
	add(0);
	for (let i = 1; i <= STEPS_AHEAD; i++) add(i * (forward ? step : -step));
	for (let i = 1; i <= STEPS_BEHIND; i++) add(i * (forward ? -step : step));
	return indexes;
};
