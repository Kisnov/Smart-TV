import {useEffect, useState} from 'react';
import $L from '@enact/i18n/$L';

import {getExternalHomeRowConfigs, fetchExternalPresetRow, fetchCustomHomeRow, fetchCalendarRows} from '../../utils/externalHomeRows';
import {resolveItemsByProviderIds} from '../../services/jellyfinApi';

// Home rows built from TMDB and IMDb charts, lists the viewer pasted a URL for, and the
// Radarr and Sonarr calendars. Items arrive as provider ids, so every row is resolved against
// the local library first: what the server owns becomes playable, the rest falls back to Seerr.
const useExternalRows = ({settings, homeRows, kidsMode}) => {
	const [externalRows, setExternalRows] = useState([]);

	useEffect(() => {
		if (!settings.useMoonfinPlugin) {
			setExternalRows([]);
			return undefined;
		}
		// The rows arrive already filtered, and the pasted list rows go the way the plugin rows do,
		// since nothing here can vouch for what an outside catalogue returns.
		const rows = homeRows || settings.homeRows || [];
		const enabledPresets = rows.filter((r) => r.enabled && (r.id.startsWith('tmdb_') || r.id.startsWith('imdb-'))).map((r) => r.id);
		const customRows = kidsMode ? [] : (settings.customHomeRows || []).filter((r) => r.enabled);
		const radarrEnabled = rows.some((r) => r.enabled && r.id === 'radarr_calendar');
		const sonarrEnabled = rows.some((r) => r.enabled && r.id === 'sonarr_calendar');
		const calendarsEnabled = radarrEnabled || sonarrEnabled;
		if (enabledPresets.length === 0 && customRows.length === 0 && !calendarsEnabled) {
			setExternalRows([]);
			return undefined;
		}

		let cancelled = false;
		const presetConfigs = getExternalHomeRowConfigs();

		(async () => {
			try {
				const presetData = await Promise.all(enabledPresets.map(async (id) => {
					const cfg = presetConfigs.find((c) => c.id === id);
					if (!cfg) return null;
					const items = await fetchExternalPresetRow(id);
					return {id, title: cfg.title, items: items || []};
				}));

				const customData = await Promise.all(customRows.map(async (row) => {
					const items = await fetchCustomHomeRow(row);
					return {id: `external-${row.id}`, title: row.name || row.title || $L('Custom'), items: items || [], isCustomRow: true};
				}));

				const calendarSettings = {
					mergeRadarrSonarrCalendars: settings.mergeRadarrSonarrCalendars,
					radarrCalendarShowCinema: settings.radarrCalendarShowCinema,
					radarrCalendarShowDigital: settings.radarrCalendarShowDigital,
					radarrCalendarShowPhysical: settings.radarrCalendarShowPhysical,
					radarrCalendarShowDate: settings.radarrCalendarShowDate,
					sonarrCalendarShowDate: settings.sonarrCalendarShowDate,
					sonarrCalendarShowEpisodeInfo: settings.sonarrCalendarShowEpisodeInfo
				};
				const calendarRows = calendarsEnabled ? await fetchCalendarRows(calendarSettings, {radarrEnabled, sonarrEnabled}) : [];

				const allRows = [
					...presetData,
					...customData,
					...calendarRows.map((r) => ({...r, isCalendarRow: true}))
				].filter((r) => r && r.items && r.items.length > 0);

				// Every row's items go out in one request rather than one per row, then each
				// row takes back the slice it put in.
				const allItemsToResolve = [];
				const rowIndices = [];
				for (const r of allRows) {
					rowIndices.push({start: allItemsToResolve.length, count: r.items.length});
					allItemsToResolve.push(...r.items);
				}

				const resolvedAllItems = await resolveItemsByProviderIds(allItemsToResolve);

				const presetRows = [];
				const builtCustomRows = [];
				const resolvedCalendarRows = [];

				for (let i = 0; i < allRows.length; i++) {
					const r = allRows[i];
					const sliceInfo = rowIndices[i];
					const resolvedItems = resolvedAllItems.slice(sliceInfo.start, sliceInfo.start + sliceInfo.count);

					if (r.isCalendarRow) {
						resolvedCalendarRows.push({...r, items: resolvedItems});
					} else {
						const resolvedRow = {
							id: r.id,
							title: r.title,
							items: resolvedItems,
							isExternalRow: true,
							isCustomRow: r.isCustomRow
						};
						if (r.isCustomRow) {
							builtCustomRows.push(resolvedRow);
						} else {
							presetRows.push(resolvedRow);
						}
					}
				}

				if (!cancelled) {
					setExternalRows([...presetRows, ...builtCustomRows, ...resolvedCalendarRows].filter(Boolean));
				}
			} catch (err) {
				console.warn('[Browse] Failed to fetch and resolve external rows:', err);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [settings.useMoonfinPlugin, homeRows, kidsMode, settings.homeRows, settings.customHomeRows,
		settings.mergeRadarrSonarrCalendars,
		settings.radarrCalendarShowCinema, settings.radarrCalendarShowDigital, settings.radarrCalendarShowPhysical,
		settings.radarrCalendarShowDate, settings.sonarrCalendarShowDate, settings.sonarrCalendarShowEpisodeInfo]);

	return externalRows;
};

export default useExternalRows;
