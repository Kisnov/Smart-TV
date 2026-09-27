import {memo, useState, useEffect, useRef, useCallback} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';

import AdminMessageDialog from '../../components/AdminMessageDialog';
import LoadingSpinner from '../../components/LoadingSpinner';
import {GAME_ICON_PATHS} from '../../components/icons/gameIcons';
import {iconViewBox} from '../../components/icons/iconViewBox';
import * as gamesApi from '../../services/gamesApi';
import serverLogger from '../../services/serverLogger';
import {initVideo, keepScreenOn, setupVisibilityHandler} from '../../services/video';
import * as ejs from '../../utils/emulatorjs';
import {gameStateKey, loadGameStateWithMigration} from '../../utils/gameSaves';
import {DETAIL_ICON_PATHS} from '../Details/detailIcons';

import css from './GamePlayer.module.less';

const SpottableRow = Spottable('div');
const OverlayContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const RowIcon = ({path}) => (
	<svg className={css.rowIcon} viewBox={iconViewBox(path)} fill="currentColor">
		<path d={path} />
	</svg>
);

// One emulator-setting row. OK / right cycles the value forward, left cycles back.
const SettingRow = memo(({opt, first, onChange}) => {
	const cur = opt.choices.find((c) => c.value === opt.current);
	const next = useCallback(() => onChange(opt, 1), [onChange, opt]);
	const prev = useCallback(() => onChange(opt, -1), [onChange, opt]);
	return (
		<SpottableRow
			spotlightId={first ? 'game-setting-0' : undefined}
			className={css.settingRow}
			onClick={next}
			onSpotlightLeft={prev}
			onSpotlightRight={next}
		>
			<span className={css.settingLabel}>{opt.label}</span>
			<span className={css.settingValue}>{cur ? cur.label : opt.current}</span>
		</SpottableRow>
	);
});

const GamePlayer = ({library, game, startFresh, onBack, backHandlerRef}) => {
	const [ready, setReady] = useState(false);
	const [error, setError] = useState(null);
	const [unsupported, setUnsupported] = useState(false);
	const [overlayOpen, setOverlayOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [options, setOptions] = useState([]);
	const [fastForward, setFastForward] = useState(false);
	const [hasSave, setHasSave] = useState(false);
	const [confirmingExit, setConfirmingExit] = useState(false);
	const [toast, setToast] = useState(null);

	const blobs = useRef([]);
	const exiting = useRef(false);
	const stateRef = useRef({overlayOpen: false, settingsOpen: false});
	stateRef.current = {overlayOpen, settingsOpen, confirmingExit, error, unsupported};

	const showMessage = useCallback((message) => setToast({message, key: Date.now()}), []);

	useEffect(() => {
		if (!toast) return undefined;
		const timer = setTimeout(() => setToast(null), 3000);
		return () => clearTimeout(timer);
	}, [toast]);

	// Fire-and-forget state upload for paths that can't await, like unmount and backgrounding.
	const flushState = useCallback(() => {
		try {
			const bytes = ejs.getState();
			if (bytes && bytes.length) gamesApi.putStateBytes(gameStateKey(game.id, game.core), bytes).catch(() => {});
		} catch (e) { /* emulator never booted */ }
	}, [game]);

	useEffect(() => {
		if (!ejs.isSupported()) {
			setUnsupported(true);
			return undefined;
		}
		let cancelled = false;
		const libraryId = library?.Id;
		// Arcade cores find a game by its zip name, which EmulatorJS takes from the ROM URL, or
		// from the game name when the ROM is a Blob.
		const arcadeFileName = game.core === 'mame' || game.core === 'arcade' ? game.fileName : null;
		(async () => {
			try {
				const [rom, settingsJson, existing] = await Promise.all([
					gamesApi.getRomUrl(libraryId, game.id, arcadeFileName),
					gamesApi.getSettingsBlob(),
					// Read on Restart too so Load state is still offered. A failed read counts as
					// no save instead of stopping the game.
					loadGameStateWithMigration(game.id, game.core).catch(() => null)
				]);
				if (cancelled) return;
				const {url: romUrl, isBlob} = rom;
				if (isBlob) blobs.current.push(romUrl);
				let biosUrl;
				if (game.bios && game.bios.length) {
					biosUrl = await gamesApi.getBiosBlobUrl(libraryId, game.bios[0].id);
					if (cancelled) return;
					blobs.current.push(biosUrl);
				}
				setHasSave(existing != null);
				await ejs.startEmulator({
					selector: '#game',
					core: game.core,
					gameUrl: romUrl,
					biosUrl,
					gameName: isBlob && arcadeFileName ? arcadeFileName : game.title,
					settingsJson,
					stateBytes: startFresh ? null : existing
				});
				if (cancelled) return;
				setReady(true);
			} catch (e) {
				// Backing out mid-load lands here too, and that is not worth reporting.
				if (cancelled) return;
				serverLogger.error(serverLogger.LOG_CATEGORIES.APP, '[Games] could not start game', {
					core: game.core,
					system: game.system,
					status: e.status || null,
					totalBytes: e.totalBytes || null,
					message: e.message || String(e)
				}, false);
				if (e.romTooLarge) setError($L('This game is too large to run on this TV.'));
				else setError(e.status === 404 ? $L('Game file not found.') : $L('Could not start this game on this device.'));
			}
		})();
		return () => {
			cancelled = true;
			// Best-effort save on unmount, skipped when the Exit action already saved.
			if (!exiting.current) {
				flushState();
				gamesApi.putSettingsBlob(ejs.getSettingsJson());
			}
			ejs.destroyEmulator();
			blobs.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e2) { /* ignore */ } });
			blobs.current = [];
		};
	}, [library, game, startFresh, flushState]);

	// True only when a state reached the server. A game with nothing to save yet gives false, and
	// a failed upload throws so the caller can say so.
	const saveState = useCallback(async () => {
		let bytes = null;
		try { bytes = ejs.getState(); } catch (e) { /* no game loaded yet */ }
		if (!bytes || !bytes.length) return false;
		await gamesApi.putStateBytes(gameStateKey(game.id, game.core), bytes);
		setHasSave(true);
		return true;
	}, [game]);

	const exit = useCallback(async ({stateSaved = false} = {}) => {
		if (exiting.current) return;
		exiting.current = true;
		if (!stateSaved) {
			try { await saveState(); } catch (e) { /* leaving either way */ }
		}
		try { gamesApi.putSettingsBlob(ejs.getSettingsJson()); } catch (e) { /* ignore */ }
		if (onBack) onBack();
	}, [saveState, onBack]);

	// While playing, Spotlight is paused so the arrow/OK keys reach EmulatorJS instead of moving
	// focus; it resumes only while the overlay is open.
	const openOverlay = useCallback(() => {
		ejs.setPaused(true);
		Spotlight.resume();
		setOverlayOpen(true);
		setTimeout(() => Spotlight.focus('game-overlay-first'), 0);
	}, []);
	const closeOverlay = useCallback(() => {
		setOverlayOpen(false);
		setSettingsOpen(false);
		setConfirmingExit(false);
		Spotlight.pause();
		ejs.setPaused(false);
	}, []);

	const cancelExitConfirmation = useCallback(() => {
		setConfirmingExit(false);
		setTimeout(() => Spotlight.focus('game-overlay-first'), 0);
	}, []);

	// BACK toggles the overlay (a TV remote has no Start/Select); Exit lives in the overlay.
	useEffect(() => {
		if (!backHandlerRef) return undefined;
		const handler = () => {
			const s = stateRef.current;
			if (s.unsupported) { /* the unsupported dialog dismisses itself on BACK */ }
			else if (s.error) { if (onBack) onBack(); }
			else if (s.confirmingExit) { cancelExitConfirmation(); }
			else if (s.settingsOpen) { setSettingsOpen(false); setTimeout(() => Spotlight.focus('game-overlay-first'), 0); }
			else if (s.overlayOpen) { closeOverlay(); }
			else { openOverlay(); }
			return true;
		};
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef, openOverlay, closeOverlay, cancelExitConfirmation, onBack]);

	// Pause Spotlight once the game is running (resumed by the overlay).
	useEffect(() => {
		if (ready) Spotlight.pause();
		return () => Spotlight.resume();
	}, [ready]);

	// Keep the TV screen awake while the game runs. initVideo() loads the platform module
	// first, since keepScreenOn throws before it loads.
	useEffect(() => {
		if (!ready) return undefined;
		let released = false;
		initVideo().then(() => { if (!released) return keepScreenOn(true); }).catch(() => {});
		return () => {
			released = true;
			try { keepScreenOn(false); } catch (e) { /* impl never loaded */ }
		};
	}, [ready]);

	// Pause the emulator when the app is backgrounded and save defensively, since Tizen
	// may kill backgrounded apps.
	useEffect(() => {
		if (!ready) return undefined;
		let remove;
		initVideo().then(() => {
			remove = setupVisibilityHandler(
				() => {
					ejs.setPaused(true);
					flushState();
				},
				() => {
					const s = stateRef.current;
					if (!s.overlayOpen && !s.settingsOpen && !s.error) ejs.setPaused(false);
				}
			);
		}).catch(() => {});
		return () => { if (remove) remove(); };
	}, [ready, flushState]);

	const openSettings = useCallback(() => {
		setOptions(ejs.getOptions());
		setSettingsOpen(true);
		setTimeout(() => Spotlight.focus('game-setting-0'), 0);
	}, []);

	const changeOption = useCallback((opt, dir) => {
		const idx = opt.choices.findIndex((c) => c.value === opt.current);
		const next = ((idx < 0 ? 0 : idx) + dir + opt.choices.length) % opt.choices.length;
		const value = opt.choices[next].value;
		ejs.setOption(opt.id, value);
		setOptions((prev) => prev.map((o) => (o.id === opt.id ? {...o, current: value} : o)));
	}, []);

	const toggleFF = useCallback(() => {
		setFastForward((prev) => { ejs.toggleFastForward(!prev); return !prev; });
	}, []);

	const runAndClose = useCallback(async (action, failure) => {
		try {
			await action();
		} catch (e) {
			showMessage(failure);
		}
		closeOverlay();
	}, [showMessage, closeOverlay]);

	const loadSave = useCallback(async () => {
		const bytes = await loadGameStateWithMigration(game.id, game.core);
		if (bytes) ejs.loadState(bytes);
	}, [game]);

	// A game that never got going has nothing to lose, so it leaves without asking.
	const requestExit = useCallback(() => {
		if (error || !ready) {
			exit();
			return;
		}
		setConfirmingExit(true);
		setTimeout(() => Spotlight.focus('game-overlay-first'), 0);
	}, [error, ready, exit]);

	// Leaves only once the state is stored. Leaving on a failed save is what the confirmation is
	// there to prevent, so the game stays and says so.
	const saveAndExit = useCallback(async () => {
		const saved = await saveState().catch(() => false);
		if (saved) exit({stateSaved: true});
		else showMessage($L('Could not save state. Still playing.'));
	}, [saveState, exit, showMessage]);

	// Back comes first so the highlight a confirmation opens on can't end the game. It returns
	// to the pause menu, which stays paused.
	const actions = confirmingExit ? [
		{label: $L('Back'), icon: GAME_ICON_PATHS.arrowBack, fn: cancelExitConfirmation},
		{label: $L('Save & exit'), icon: GAME_ICON_PATHS.save, fn: saveAndExit},
		{label: $L('Exit'), icon: GAME_ICON_PATHS.close, fn: () => exit(), danger: true}
	] : [
		{label: $L('Resume'), icon: DETAIL_ICON_PATHS.play, fn: closeOverlay},
		{label: $L('Save state'), icon: GAME_ICON_PATHS.save, fn: () => runAndClose(saveState, $L('Could not save state.'))},
		hasSave ? {label: $L('Load state'), icon: GAME_ICON_PATHS.download, fn: () => runAndClose(loadSave, $L('Could not load state.'))} : null,
		{label: $L('Restart'), icon: GAME_ICON_PATHS.refresh, fn: () => runAndClose(ejs.restart, $L('Could not restart.'))},
		{label: $L('Fast-forward'), icon: GAME_ICON_PATHS.fastForward, trailing: fastForward ? $L('On') : $L('Off'), fn: toggleFF},
		{label: $L('Emulator settings'), icon: GAME_ICON_PATHS.tune, fn: openSettings},
		{label: $L('Exit'), icon: GAME_ICON_PATHS.close, fn: requestExit, danger: true}
	].filter(Boolean);

	return (
		<div className={css.root}>
			<div id="game" className={css.game} />
			{!ready && !error && !unsupported ? <div className={css.center}><LoadingSpinner /></div> : null}
			{error ? <div className={css.center}><div className={css.message}>{error}</div></div> : null}
			<AdminMessageDialog
				open={unsupported}
				title={$L('Games')}
				message={unsupported ? ejs.unsupportedMessage() : null}
				onDismiss={onBack}
			/>

			{overlayOpen && !settingsOpen ? (
				<div className={css.scrim}>
					<OverlayContainer className={css.panel}>
						<div className={css.panelTitle}>
							{game.title}
							<div className={css.panelSubtitle}>{$L('Paused')}</div>
						</div>
						{actions.map((a, i) => (
							<SpottableRow
								key={a.label}
								spotlightId={i === 0 ? 'game-overlay-first' : undefined}
								className={a.danger ? `${css.row} ${css.danger}` : css.row}
								onClick={a.fn}
							>
								<RowIcon path={a.icon} />
								{a.label}
								{a.trailing ? <span className={css.trailing}>{a.trailing}</span> : null}
							</SpottableRow>
						))}
					</OverlayContainer>
				</div>
			) : null}

			{settingsOpen ? (
				<div className={css.scrim}>
					<OverlayContainer className={css.panel}>
						<div className={css.panelTitle}>{$L('Emulator settings')}</div>
						{options.length === 0 ? (
							<div className={css.empty}>{$L('This core has no adjustable options.')}</div>
						) : options.map((opt, i) => (
							<SettingRow key={opt.id} opt={opt} first={i === 0} onChange={changeOption} />
						))}
					</OverlayContainer>
				</div>
			) : null}

			{toast ? <div key={toast.key} className={css.toast}>{toast.message}</div> : null}
		</div>
	);
};

export default GamePlayer;
