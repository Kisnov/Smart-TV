import {useEffect, useRef, useState} from 'react';

import {getSeerrHomeRowConfigs, fetchSeerrHomeRow, normalizeMediaItem, SEERR_SECTION_TO_CONFIG} from '../../utils/seerrHomeRows';
import {loadSliderHomeRow} from '../../utils/seerrSliders';
import {isSameServer, isSeerrSliderRow} from '../../utils/pickedRows';
import {sortExternalItems} from '../../utils/externalHomeRows';
import {settleSections} from './browseCache';
import {withoutSeerrAdult} from '../../utils/seerrAdultFilter';

// The discover rows Seerr provides. They are fetched separately from the library rows because
// they come from a different server and only exist while Seerr is connected and signed in. The
// rows still on their way come back as [pending], so they can hold their place.
const useSeerrRows = ({seerrEnabled, seerrAuthenticated, seerrUserId, homeRows, serverUrl, sortBy, sortOrder, blockAdult}) => {
	const [seerrRows, setSeerrRows] = useState([]);
	const [pending, setPending] = useState([]);
	const shownBlockAdultRef = useRef(blockAdult);

	useEffect(() => {
		// Rows loaded before the NSFW filter went on can hold what it hides, so they go at once.
		if (blockAdult && !shownBlockAdultRef.current) setSeerrRows([]);
		shownBlockAdultRef.current = blockAdult;
		if (!seerrEnabled || !seerrAuthenticated) {
			setSeerrRows([]);
			setPending([]);
			return undefined;
		}
		const enabledSections = (homeRows || []).filter((r) => r.enabled && SEERR_SECTION_TO_CONFIG[r.id]);
		const sliderRows = (homeRows || []).filter((r) => r.enabled && isSeerrSliderRow(r) && isSameServer(r.serverUrl, serverUrl));
		if (enabledSections.length === 0 && sliderRows.length === 0) {
			setSeerrRows([]);
			setPending([]);
			return undefined;
		}

		let cancelled = false;
		const configs = getSeerrHomeRowConfigs();
		const configFor = (section) => configs.find((c) => c.id === SEERR_SECTION_TO_CONFIG[section.id]);
		const pendingRows = [
			...enabledSections.filter(configFor).map((section) => ({id: section.id, title: configFor(section).title})),
			...sliderRows.map((row) => ({id: row.id, title: row.name}))
		];
		setPending(pendingRows);

		const settle = () => {
			if (!cancelled) setPending([]);
		};

		(async () => {
			const built = await Promise.all(enabledSections.map(async (section) => {
				const configId = SEERR_SECTION_TO_CONFIG[section.id];
				const cfg = configFor(section);
				if (!cfg) return null;
				const items = await fetchSeerrHomeRow(configId, {userId: seerrUserId, blockAdult});
				if (!items.length) return null;
				return {
					id: section.id,
					title: cfg.title,
					items: cfg.type === 'shortcut' ? items : sortExternalItems(items, sortBy, sortOrder),
					type: cfg.cardType,
					isSeerrRow: true,
					isTileRow: cfg.type === 'genre' || cfg.type === 'studio' || cfg.type === 'network' || cfg.type === 'shortcut'
				};
			}));
			const builtSliders = await Promise.all(sliderRows.map(async (row) => {
				const loaded = await loadSliderHomeRow(row).catch(() => null);
				const results = withoutSeerrAdult(loaded?.results || [], blockAdult);
				if (!results.length) return null;
				return {
					id: row.id,
					title: loaded.slider.title,
					items: sortExternalItems(results.map(normalizeMediaItem), sortBy, sortOrder),
					type: 'portrait',
					isSeerrRow: true
				};
			}));
			if (cancelled) return;
			const rows = [...built, ...builtSliders].filter(Boolean);
			settleSections(pendingRows.map((row) => row.id), rows);
			setSeerrRows(rows);
		})().then(settle, settle);

		return () => {
			cancelled = true;
		};
	}, [seerrEnabled, seerrAuthenticated, seerrUserId, homeRows, serverUrl, sortBy, sortOrder, blockAdult]);

	return {rows: seerrRows, pending};
};

export default useSeerrRows;
