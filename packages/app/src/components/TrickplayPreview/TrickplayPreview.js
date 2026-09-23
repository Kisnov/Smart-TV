import {useState, useEffect, useRef} from 'react';
import * as jellyfinApi from '../../services/jellyfinApi';
import {planSeekSheetIndexes, trickplayTile} from '../../utils/trickplaySheets';

import css from './TrickplayPreview.module.less';
import {formatPlaybackDuration} from '../../utils/playbackTimeLabels';

export const getTrickplayManifest = async (itemId, mediaSourceId) => {
    try {
        const serverUrl = jellyfinApi.getServerUrl();
        const apiKey = jellyfinApi.getApiKey();

        const response = await fetch(
            `${serverUrl}${jellyfinApi.userRoutes.item(itemId)}Fields=Trickplay&${jellyfinApi.getTokenParam()}=${apiKey}`
        );

        if (!response.ok) return null;

        const data = await response.json();
        return data?.Trickplay?.[mediaSourceId] || null;
    } catch {
        return null;
    }
};

// Manifests are kept per item and source for the session, so a preview that comes and goes with
// the controls asks the server once.
const MANIFEST_CAP = 20;
const manifests = new Map();
const manifestKey = (itemId, mediaSourceId) => `${itemId}|${mediaSourceId}`;

const loadTrickplayManifest = (itemId, mediaSourceId) => {
	const key = manifestKey(itemId, mediaSourceId);
	let entry = manifests.get(key);
	if (!entry) {
		if (manifests.size >= MANIFEST_CAP) manifests.delete(manifests.keys().next().value);
		entry = {value: null};
		entry.promise = getTrickplayManifest(itemId, mediaSourceId).then((manifest) => {
			entry.value = manifest;
			return manifest;
		});
		manifests.set(key, entry);
	}
	return entry.promise;
};

// True once the item's manifest is in and has thumbnails, which is when scrubbing has a preview.
export const hasTrickplayPreview = (itemId, mediaSourceId) =>
	Boolean(manifests.get(manifestKey(itemId, mediaSourceId))?.value);

// Sheets that have finished loading, and the ones still on their way with whoever is waiting on
// them. Holding the Image keeps a pending load from being dropped before it lands.
const SHEET_MEMORY = 64;
const loadedSheets = new Set();
const pendingSheets = new Map();

const whenSheetLoaded = (url, onLoaded) => {
	if (loadedSheets.has(url)) {
		onLoaded?.();
		return;
	}
	const pending = pendingSheets.get(url);
	if (pending) {
		if (onLoaded) pending.waiting.push(onLoaded);
		return;
	}
	const image = new window.Image();
	const entry = {image, waiting: onLoaded ? [onLoaded] : []};
	pendingSheets.set(url, entry);
	image.onload = () => {
		pendingSheets.delete(url);
		if (loadedSheets.size >= SHEET_MEMORY) loadedSheets.delete(loadedSheets.values().next().value);
		loadedSheets.add(url);
		entry.waiting.forEach((callback) => callback());
	};
	// A failed sheet isn't remembered, so a later pass can try it again.
	image.onerror = () => pendingSheets.delete(url);
	image.src = url;
};

const pickWidth = (manifest, preferredWidth) => {
	const widths = Object.keys(manifest).map(Number).sort((a, b) => a - b);
	let best = widths[0];
	for (const w of widths) {
		if (w <= preferredWidth) best = w;
	}
	return best;
};

const sheetUrl = (itemId, mediaSourceId, width, imageIndex) =>
	`${jellyfinApi.getServerUrl()}/Videos/${itemId}/Trickplay/${width}/${imageIndex}.jpg?MediaSourceId=${mediaSourceId}&ApiKey=${jellyfinApi.getApiKey()}`;

// The scrub preview. It stays mounted while the controls are up so the sheets the next scrub
// steps need are already loading when the viewer starts moving (warm), and it shows only while
// scrubbing (visible). The tile on screen, sheet and crop together, stays until the next sheet has
// loaded, since a new crop over the old sheet would show the wrong moment.
const TrickplayPreview = ({
	itemId,
	mediaSourceId,
	positionTicks,
	durationTicks,
	stepSeconds,
	visible = false,
	warm = false,
	preferredWidth = 320
}) => {
	const [info, setInfo] = useState(null);
	const [displayed, setDisplayed] = useState(null);
	const widthRef = useRef(null);
	const targetRef = useRef(null);
	const lastPrefetchRef = useRef(null);

	useEffect(() => {
		setInfo(null);
		setDisplayed(null);
		widthRef.current = null;
		lastPrefetchRef.current = null;
		if (!itemId || !mediaSourceId) return undefined;
		let cancelled = false;
		loadTrickplayManifest(itemId, mediaSourceId).then((manifest) => {
			if (cancelled || !manifest) return;
			const width = pickWidth(manifest, preferredWidth);
			widthRef.current = width;
			setInfo(manifest[width] || null);
		});
		return () => {
			cancelled = true;
		};
	}, [itemId, mediaSourceId, preferredWidth]);

	const positionMs = positionTicks / 10000;
	const durationMs = durationTicks / 10000;

	// Warms the sheets around a position in the direction the viewer is heading.
	const prefetch = (fromMs, forward) => {
		const indexes = planSeekSheetIndexes({info, positionMs: fromMs, durationMs, stepMs: stepSeconds * 1000, forward});
		indexes.forEach((index) => whenSheetLoaded(sheetUrl(itemId, mediaSourceId, widthRef.current, index)));
	};

	// The controls coming up is the cue that a scrub may follow.
	useEffect(() => {
		if (warm && info && !visible) prefetch(positionMs, true);
	}, [warm, info]); // eslint-disable-line react-hooks/exhaustive-deps

	// Waiting a frame collapses a burst of presses into one prefetch.
	useEffect(() => {
		if (!visible || !info) return undefined;
		const previous = lastPrefetchRef.current ?? positionMs;
		if (lastPrefetchRef.current === positionMs) return undefined;
		lastPrefetchRef.current = positionMs;
		const frame = window.requestAnimationFrame(() => prefetch(positionMs, positionMs >= previous));
		return () => window.cancelAnimationFrame(frame);
	}, [visible, info, positionMs]); // eslint-disable-line react-hooks/exhaustive-deps

	const tile = visible && info ? trickplayTile(info, positionMs) : null;
	const url = tile ? sheetUrl(itemId, mediaSourceId, widthRef.current, tile.imageIndex) : null;
	targetRef.current = tile ? {url, tile} : null;

	useEffect(() => {
		if (!visible) {
			setDisplayed(null);
			lastPrefetchRef.current = null;
			return;
		}
		if (!url) return;
		whenSheetLoaded(url, () => {
			const target = targetRef.current;
			if (target?.url === url) setDisplayed(target);
		});
	}, [visible, url, tile?.x, tile?.y]); // eslint-disable-line react-hooks/exhaustive-deps

	if (!tile) return null;

	return (
		<div className={css.trickplayPreview}>
			<div className={css.thumbnailContainer} style={{width: tile.width, height: tile.height}}>
				{displayed && (
					<div
						className={css.thumbnailSprite}
						style={{
							backgroundImage: `url(${displayed.url})`,
							backgroundPosition: `-${displayed.tile.x}px -${displayed.tile.y}px`,
							width: displayed.tile.sheetWidth,
							height: displayed.tile.sheetHeight
						}}
					/>
				)}
			</div>
			<div className={css.timeDisplay}>
				{formatPlaybackDuration(positionTicks / 10000000)}
			</div>
		</div>
	);
};

export default TrickplayPreview;
