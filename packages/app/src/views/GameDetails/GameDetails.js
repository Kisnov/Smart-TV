import {useState, useEffect, useCallback, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spotlight from '@enact/spotlight';
import Button from '@enact/sandstone/Button';

import AdminMessageDialog from '../../components/AdminMessageDialog';
import GameCard from '../../components/GameCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import {iconViewBox} from '../../components/icons/iconViewBox';
import * as gamesApi from '../../services/gamesApi';
import {isSupported, unsupportedMessage} from '../../utils/emulatorjs';
import {gameDisplayTitle, gameFallbackColor} from '../../utils/gameArt';
import {loadGameStateWithMigration} from '../../utils/gameSaves';
import {DETAIL_ICON_PATHS} from '../Details/detailIcons';

import css from './GameDetails.module.less';

const metaLine = (game) => [
	game.system,
	game.year,
	game.genre,
	game.players ? (game.players === 1 ? $L('1 player') : $L('{count} players').replace('{count}', game.players)) : null
].filter(Boolean).join('  ·  ');

// Material Symbols refresh and hourglass_top, filled.
const REFRESH_ICON = 'M480-160q-133 0-226.5-93.5T160-480q0-133 93.5-226.5T480-800q85 0 149 34.5T740-671v-129h60v254H546v-60h168q-38-60-97-97t-137-37q-109 0-184.5 75.5T220-480q0 109 75.5 184.5T480-220q83 0 152-47.5T728-393h62q-29 105-115 169t-195 64Z';
const HOURGLASS_ICON = 'M308-140h344v-127q0-72-50-121.5T480-438q-72 0-122 49.5T308-267v127ZM160-80v-60h88v-127q0-71 40-129t106-84q-66-27-106-85t-40-129v-126h-88v-60h640v60h-88v126q0 71-40 129t-106 85q66 26 106 84t40 129v127h88v60H160Z';

const ButtonIcon = ({path}) => (
	<svg className={css.buttonIcon} viewBox={iconViewBox(path)} fill="currentColor">
		<path d={path} />
	</svg>
);

const primaryAction = (saveReadiness) => {
	if (saveReadiness === 'checking') return {icon: HOURGLASS_ICON, label: $L('Checking for save…')};
	if (saveReadiness === 'failed') return {icon: REFRESH_ICON, label: $L('Retry save check')};
	return {icon: DETAIL_ICON_PATHS.play, label: saveReadiness === 'available' ? $L('Continue') : $L('Play')};
};

const GameDetails = ({library, gameId, initialGame, onPlay, onSelectGame, backHandlerRef}) => {
	const [game, setGame] = useState(initialGame || null);
	const [loading, setLoading] = useState(!initialGame);
	// Play waits for a definite answer, since booting fresh after a failed read would overwrite
	// the save on exit.
	const [saveReadiness, setSaveReadiness] = useState('checking');
	const saveCheck = useRef(0);
	const [related, setRelated] = useState([]);
	const [showUnsupported, setShowUnsupported] = useState(false);

	const libraryId = library?.Id;

	const checkSave = useCallback((g) => {
		const generation = ++saveCheck.current;
		const current = () => saveCheck.current === generation;
		setSaveReadiness('checking');
		loadGameStateWithMigration(g.id, g.core)
			.then((b) => { if (current()) setSaveReadiness(b ? 'available' : 'absent'); })
			.catch(() => { if (current()) setSaveReadiness('failed'); })
			.then(() => { if (current()) setTimeout(() => Spotlight.focus('game-play-btn'), 0); });
	}, []);

	useEffect(() => {
		let cancelled = false;
		if (!libraryId || !gameId) return undefined;
		// Drops a check still running for the previous game.
		saveCheck.current++;
		setSaveReadiness('checking');
		gamesApi.getGame(libraryId, gameId).then((g) => {
			if (cancelled) return;
			setGame(g);
			setLoading(false);
			if (g) {
				checkSave(g);
				gamesApi.getGames(libraryId, g.system).then((all) => {
					if (cancelled) return;
					setRelated((all || []).filter((x) => x.id !== g.id).slice(0, 20));
				});
			}
		}).catch(() => {
			if (cancelled) return;
			setLoading(false);
			// The summary still has the id and core the save key needs.
			if (initialGame) checkSave(initialGame);
		});
		return () => { cancelled = true; };
	}, [libraryId, gameId, initialGame, checkSave]);

	useEffect(() => {
		if (!backHandlerRef) return undefined;
		// While the unsupported dialog is open it handles BACK itself, otherwise the app pops the panel.
		const handler = () => showUnsupported;
		backHandlerRef.current = handler;
		return () => { if (backHandlerRef.current === handler) backHandlerRef.current = null; };
	}, [backHandlerRef, showUnsupported]);

	useEffect(() => {
		if (game) setTimeout(() => Spotlight.focus('game-play-btn'), 0);
	}, [game]);

	const play = useCallback((fresh) => {
		if (saveReadiness !== 'absent' && saveReadiness !== 'available') return;
		if (!isSupported()) {
			setShowUnsupported(true);
			return;
		}
		if (onPlay) onPlay(library, game, {fresh});
	}, [saveReadiness, onPlay, library, game]);
	const handlePrimary = useCallback(() => {
		if (saveReadiness === 'failed') checkSave(game);
		else play(false);
	}, [saveReadiness, checkSave, game, play]);
	const handleRestart = useCallback(() => play(true), [play]);
	const dismissUnsupported = useCallback(() => {
		setShowUnsupported(false);
		setTimeout(() => Spotlight.focus('game-play-btn'), 0);
	}, []);
	const openRelated = useCallback((g) => onSelectGame && onSelectGame(library, g), [onSelectGame, library]);

	if (loading) return <div className={css.center}><LoadingSpinner /></div>;
	if (!game) return <div className={css.center}><div>{$L('Game not found.')}</div></div>;

	const backdrop = gamesApi.gameThumbUrl(libraryId, game.id, 'snap');
	const poster = gamesApi.gameThumbUrl(libraryId, game.id);
	const title = gameDisplayTitle(game.title, game.fileName);
	const primary = primaryAction(saveReadiness);

	return (
		<div className={css.root}>
			<div
				className={css.backdrop}
				style={backdrop ? {backgroundImage: `url(${backdrop})`} : {background: gameFallbackColor(game.id)}}
			/>
			<div className={css.scrim} />
			<div className={css.content}>
				<div
					className={css.poster}
					style={poster ? {backgroundImage: `url(${poster})`} : {background: gameFallbackColor(game.id)}}
				/>
				<div className={css.info}>
					<h1 className={css.title}>{title}</h1>
					<div className={css.meta}>{metaLine(game)}</div>
					{game.overview ? <div className={css.overview}>{game.overview}</div> : null}
					<div className={css.actions}>
						<Button
							spotlightId="game-play-btn"
							className={css.actionButton}
							disabled={saveReadiness === 'checking'}
							onClick={handlePrimary}
						>
							<ButtonIcon path={primary.icon} />
							{primary.label}
						</Button>
						{saveReadiness === 'available' ? (
							<Button className={css.actionButton} onClick={handleRestart}>
								<ButtonIcon path={REFRESH_ICON} />
								{$L('Restart')}
							</Button>
						) : null}
					</div>
				</div>
			</div>
			{related.length ? (
				<div className={css.related}>
					<div className={css.relatedTitle}>{$L('More in {system}').replace('{system}', game.system)}</div>
					<div className={css.relatedRow}>
						{related.map((g) => (
							<GameCard key={g.id} game={g} artUrl={gamesApi.gameThumbUrl(libraryId, g.id)} width={150} onSelect={openRelated} />
						))}
					</div>
				</div>
			) : null}
			<AdminMessageDialog
				open={showUnsupported}
				title={$L('Games')}
				message={showUnsupported ? unsupportedMessage() : null}
				onDismiss={dismissUnsupported}
			/>
		</div>
	);
};

export default GameDetails;
