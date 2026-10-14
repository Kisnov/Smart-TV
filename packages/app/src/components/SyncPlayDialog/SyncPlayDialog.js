import {memo, useCallback, useEffect, useState, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {useSyncPlay} from '../../context/SyncPlayContext';
import {api} from '../../services/jellyfinApi';
import {MENU_ICON_PATHS} from '../ItemContextMenu/itemMenuActions';
import {isBackKey} from '../../utils/keys';
import {isTvKeyboardVisible} from '../TVKeyboard/keyboardBus';
import SpottableInput from '../SpottableInput/SpottableInput';

import css from './SyncPlayDialog.module.less';

const DialogContainer = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const GroupsContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

const QueueContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused'
}, 'div');

// Queue entries carry only an item id, so the names come from one lookup per queue. A queue
// that only moved around keeps the names it already has.
const useQueueTitles = (entries) => {
	const [titles, setTitles] = useState({});
	const idsKey = entries.map((entry) => entry.ItemId).filter(Boolean).join(',');
	useEffect(() => {
		if (!idsKey) return;
		let cancelled = false;
		api.getItems({Ids: idsKey, EnableImages: false, EnableUserData: false})
			.then((result) => {
				if (cancelled) return;
				const next = {};
				(result?.Items || []).forEach((item) => {
					if (item?.Id) next[String(item.Id).replace(/-/g, '').toLowerCase()] = item.Name;
				});
				setTitles(next);
			})
			.catch(() => {});
		return () => { cancelled = true; };
	}, [idsKey]);
	return titles;
};

const titleFor = (titles, itemId) => titles[String(itemId || '').replace(/-/g, '').toLowerCase()];

const QueueIcon = ({path}) => (
	<svg className={css.queueIcon} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
		<path d={path} />
	</svg>
);

const SpottableButton = Spottable('button');

const REPEAT_LABELS = {
	RepeatNone: $L('Off'),
	RepeatOne: $L('One'),
	RepeatAll: $L('All')
};

const REPEAT_CYCLE = ['RepeatNone', 'RepeatOne', 'RepeatAll'];

const SyncPlayDialog = ({open, onClose, playingItemId, onWatch}) => {
	const {
		group,
		groups,
		isInGroup,
		createGroup,
		joinGroup,
		leaveGroup,
		refreshGroups,
		playQueue,
		playQueueItem,
		setRepeatMode,
		setShuffleMode,
		ignoreWait,
		setIgnoreWait,
		setPlaylistItem,
		movePlaylistItem,
		removeFromPlaylist
	} = useSyncPlay();

	const [groupName, setGroupName] = useState('');
	const [isCreating, setIsCreating] = useState(false);
	const [isJoining, setIsJoining] = useState(null);
	const [isLeaving, setIsLeaving] = useState(false);
	const refreshIntervalRef = useRef(null);

	useEffect(() => {
		if (open) {
			const t = setTimeout(() => {
				if (isInGroup) {
					if (!Spotlight.focus('syncplay-watch-btn')) Spotlight.focus('syncplay-leave-btn');
				} else {
					Spotlight.focus('syncplay-input');
				}
			}, 100);
			return () => clearTimeout(t);
		}
	}, [open, isInGroup]);

	useEffect(() => {
		if (open && !isInGroup) {
			refreshGroups();
			refreshIntervalRef.current = setInterval(() => {
				refreshGroups();
			}, 5000);
		}
		return () => {
			if (refreshIntervalRef.current) {
				clearInterval(refreshIntervalRef.current);
				refreshIntervalRef.current = null;
			}
		};
	}, [open, isInGroup, refreshGroups]);

	useEffect(() => {
		if (!open) return;
		const handleKey = (e) => {
			if (isTvKeyboardVisible()) return;
			if (isBackKey(e)) {
				e.preventDefault();
				e.stopPropagation();
				onClose?.();
			}
		};
		window.addEventListener('keydown', handleKey, true);
		return () => window.removeEventListener('keydown', handleKey, true);
	}, [open, onClose]);

	const handleCreate = useCallback(async () => {
		const name = groupName.trim();
		if (!name || isCreating) return;
		setIsCreating(true);
		await createGroup(name, playingItemId ? [playingItemId] : undefined);
		setGroupName('');
		setIsCreating(false);
	}, [groupName, isCreating, createGroup, playingItemId]);

	const handleJoin = useCallback(async (groupId) => {
		if (isJoining) return;
		setIsJoining(groupId);
		await joinGroup(groupId);
		setIsJoining(null);
	}, [isJoining, joinGroup]);

	const handleLeave = useCallback(async () => {
		if (isLeaving) return;
		setIsLeaving(true);
		await leaveGroup();
		setIsLeaving(false);
	}, [isLeaving, leaveGroup]);

	const handleInputChange = useCallback((e) => {
		setGroupName(e.target.value);
	}, []);

	const handleInputKeyDown = useCallback((e) => {
		if (e.key === 'Enter') {
			handleCreate();
		}
	}, [handleCreate]);

	const handleWatch = useCallback(() => onWatch?.(playQueueItem), [playQueueItem, onWatch]);

	const handleToggleRepeat = useCallback(() => {
		const current = playQueue?.RepeatMode || 'RepeatNone';
		const idx = REPEAT_CYCLE.indexOf(current);
		const next = REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length];
		setRepeatMode(next);
	}, [playQueue?.RepeatMode, setRepeatMode]);

	const handleToggleShuffle = useCallback(() => {
		const current = playQueue?.ShuffleMode || 'Sorted';
		setShuffleMode(current === 'Sorted' ? 'Shuffle' : 'Sorted');
	}, [playQueue?.ShuffleMode, setShuffleMode]);

	const handleToggleIgnoreWait = useCallback(() => setIgnoreWait(!ignoreWait), [ignoreWait, setIgnoreWait]);

	const handleRemoveFromQueue = useCallback((playlistItemId) => removeFromPlaylist([playlistItemId]), [removeFromPlaylist]);

	if (!open) return null;

	return (
		<div className={css.overlay} onClick={onClose}>
			<DialogContainer
				className={css.dialog}
				spotlightId="syncplay-dialog"
				onClick={(e) => e.stopPropagation()} // eslint-disable-line react/jsx-no-bind
			>
				<div className={css.header}>
					<h2 className={css.title}>{$L('SyncPlay')}</h2>
					<SpottableButton
						className={css.closeBtn}
						onClick={onClose}
						spotlightId="syncplay-close-btn"
					>
						&times;
					</SpottableButton>
				</div>

				<div className={css.content}>
					{isInGroup ? (
						<GroupView
							group={group}
							isLeaving={isLeaving}
							onLeave={handleLeave}
							playQueue={playQueue}
							playQueueItem={playQueueItem}
							playingItemId={playingItemId}
							onWatch={handleWatch}
							onToggleRepeat={handleToggleRepeat}
							onToggleShuffle={handleToggleShuffle}
							ignoreWait={ignoreWait}
							onToggleIgnoreWait={handleToggleIgnoreWait}
							onPlayQueueItem={setPlaylistItem}
							onMoveQueueItem={movePlaylistItem}
							onRemoveQueueItem={handleRemoveFromQueue}
						/>
					) : (
						<LobbyView
							groups={groups}
							groupName={groupName}
							isCreating={isCreating}
							isJoining={isJoining}
							onInputChange={handleInputChange}
							onInputKeyDown={handleInputKeyDown}
							onCreate={handleCreate}
							onJoin={handleJoin}
						/>
					)}
				</div>
			</DialogContainer>
		</div>
	);
};

const LobbyView = memo(({groups, groupName, isCreating, isJoining, onInputChange, onInputKeyDown, onCreate, onJoin}) => {
	return (
		<>
			<div className={css.createSection}>
				<SpottableInput
					className={css.input}
					type="text"
					value={groupName}
					onChange={onInputChange}
					onKeyDown={onInputKeyDown}
					placeholder={$L('Group name')}
					maxLength={64}
					spotlightId="syncplay-input"
				/>
				<SpottableButton
					className={`${css.btn} ${css.createBtn}`}
					onClick={onCreate}
					disabled={!groupName.trim() || isCreating}
					spotlightId="syncplay-create-btn"
				>
					{isCreating ? $L('Creating...') : $L('Create')}
				</SpottableButton>
			</div>

			<div className={css.divider}>
				<span>{$L('or join an existing group')}</span>
			</div>

			<GroupsContainer className={css.groupsList} spotlightId="syncplay-groups">
				{groups.length === 0 ? (
					<div className={css.emptyState}>{$L('No active groups found')}</div>
				) : (
					groups.map((g) => (
						<SpottableButton
							key={g.GroupId}
							className={`${css.groupCard} ${isJoining === g.GroupId ? css.joining : ''}`}
							onClick={() => onJoin(g.GroupId)} // eslint-disable-line react/jsx-no-bind
							disabled={isJoining === g.GroupId}
						>
							<div className={css.groupInfo}>
								<span className={css.groupName}>{g.GroupName || $L('Unnamed Group')}</span>
								<span className={css.groupMeta}>
									{`${g.Participants?.length || 0} ${(g.Participants?.length || 0) === 1 ? $L('member') : $L('members')}`}
									{' \u00B7 '}
									{g.State || $L('Idle')}
								</span>
							</div>
							<span className={css.joinLabel}>{$L('Join')}</span>
						</SpottableButton>
					))
				)}
			</GroupsContainer>
		</>
	);
});

const GroupView = memo(({
	group, isLeaving, onLeave, playQueue, playQueueItem, playingItemId, onWatch, onToggleRepeat, onToggleShuffle,
	ignoreWait, onToggleIgnoreWait, onPlayQueueItem, onMoveQueueItem, onRemoveQueueItem
}) => {
	if (!group) return null;
	const participants = group.Participants || [];
	const stateLabel = group.State || $L('Idle');
	const repeatMode = playQueue?.RepeatMode || 'RepeatNone';
	const shuffleMode = playQueue?.ShuffleMode || 'Sorted';
	const queueLength = playQueue?.Playlist?.length || 0;
	const queueIndex = playQueue?.PlayingItemIndex ?? -1;

	return (
		<div className={css.groupView}>
			<div className={css.groupHeader}>
				<h3 className={css.groupTitle}>{group.GroupName || $L('Group')}</h3>
				<span className={`${css.stateBadge} ${css['state' + stateLabel]}`}>
					{stateLabel}
				</span>
			</div>

			{playQueueItem && (
				<div className={css.nowPlaying}>
					<h4 className={css.sectionTitle}>{$L('Now Playing')}</h4>
					<div className={css.nowPlayingInfo}>
						<span className={css.nowPlayingTitle}>{playQueueItem.Name || $L('Unknown')}</span>
						{queueLength > 1 && (
							<span className={css.nowPlayingMeta}>
								{queueIndex + 1} of {queueLength}
							</span>
						)}
					</div>
					{playQueueItem.Id !== playingItemId && (
						<SpottableButton
							className={`${css.btn} ${css.createBtn} ${css.watchBtn}`}
							onClick={onWatch}
							spotlightId="syncplay-watch-btn"
						>
							{$L('Watch now')}
						</SpottableButton>
					)}
				</div>
			)}

			<div className={css.queueControls}>
				<SpottableButton
					className={`${css.controlBtn} ${ignoreWait ? css.controlActive : ''}`}
					onClick={onToggleIgnoreWait}
					spotlightId="syncplay-ignore-wait-btn"
				>
					{$L('Ignore wait')}: {ignoreWait ? $L('On') : $L('Off')}
				</SpottableButton>
			</div>

			{queueLength > 0 && (
				<div className={css.queueControls}>
					<SpottableButton
						className={`${css.controlBtn} ${shuffleMode === 'Shuffle' ? css.controlActive : ''}`}
						onClick={onToggleShuffle}
						spotlightId="syncplay-shuffle-btn"
					>
						{$L('Shuffle')}: {shuffleMode === 'Shuffle' ? $L('On') : $L('Off')}
					</SpottableButton>
					<SpottableButton
						className={`${css.controlBtn} ${repeatMode !== 'RepeatNone' ? css.controlActive : ''}`}
						onClick={onToggleRepeat}
						spotlightId="syncplay-repeat-btn"
					>
						{$L('Repeat')}: {REPEAT_LABELS[repeatMode] || $L('Off')}
					</SpottableButton>
				</div>
			)}

			{queueLength > 1 && (
				<QueueList
					entries={playQueue.Playlist}
					currentIndex={queueIndex}
					onPlay={onPlayQueueItem}
					onMove={onMoveQueueItem}
					onRemove={onRemoveQueueItem}
				/>
			)}

			<div>
				<h4 className={css.sectionTitle}>{$L('Members ({count})').replace('{count}', String(participants.length))}</h4>
				<ul className={css.membersList}>
					{participants.map((name, i) => (
						<li key={i} className={css.member}>{name}</li>
					))}
					{participants.length === 0 && (
						<li className={css.member}>{$L('Waiting for members...')}</li>
					)}
				</ul>
			</div>

			<div className={css.controls}>
				<SpottableButton
					className={`${css.btn} ${css.leaveBtn}`}
					onClick={onLeave}
					disabled={isLeaving}
					spotlightId="syncplay-leave-btn"
				>
					{isLeaving ? $L('Leaving...') : $L('Leave group')}
				</SpottableButton>
			</div>
		</div>
	);
});

// The group's queue, so anyone in it can jump to an entry, move it or take it out. OK on an
// entry plays it for everyone, and the arrows and the cross beside it act on that entry alone.
const QueueList = memo(({entries, currentIndex, onPlay, onMove, onRemove}) => {
	const titles = useQueueTitles(entries);
	return (
		<div>
			<h4 className={css.sectionTitle}>{$L('Group queue')}</h4>
			<QueueContainer className={css.queueList} spotlightId="syncplay-queue">
				{entries.map((entry, index) => (
					<QueueRow
						key={entry.PlaylistItemId || index}
						entry={entry}
						index={index}
						isCurrent={index === currentIndex}
						isFirst={index === 0}
						isLast={index === entries.length - 1}
						title={titleFor(titles, entry.ItemId)}
						onPlay={onPlay}
						onMove={onMove}
						onRemove={onRemove}
					/>
				))}
			</QueueContainer>
		</div>
	);
});

const QueueRow = memo(({entry, index, isCurrent, isFirst, isLast, title, onPlay, onMove, onRemove}) => {
	const id = entry.PlaylistItemId;
	const handlePlay = useCallback(() => {
		if (!isCurrent) onPlay(id);
	}, [isCurrent, onPlay, id]);
	const handleUp = useCallback(() => onMove(id, index - 1), [onMove, id, index]);
	const handleDown = useCallback(() => onMove(id, index + 1), [onMove, id, index]);
	const handleRemove = useCallback(() => onRemove(id), [onRemove, id]);

	return (
		<div className={css.queueRow}>
			<SpottableButton
				className={`${css.queueEntry} ${isCurrent ? css.queueCurrent : ''}`}
				onClick={handlePlay}
				aria-label={isCurrent ? `${title || $L('Unknown')}, ${$L('Now Playing')}` : `${$L('Watch now')}: ${title || $L('Unknown')}`}
			>
				<span className={css.queueNumber}>{index + 1}</span>
				<span className={css.queueTitle}>{title || $L('Unknown')}</span>
			</SpottableButton>
			{!isFirst && (
				<SpottableButton className={css.queueAction} onClick={handleUp} aria-label={$L('Move Up')}>
					<QueueIcon path={MENU_ICON_PATHS.arrowUpward} />
				</SpottableButton>
			)}
			{!isLast && (
				<SpottableButton className={css.queueAction} onClick={handleDown} aria-label={$L('Move Down')}>
					<QueueIcon path={MENU_ICON_PATHS.arrowDownward} />
				</SpottableButton>
			)}
			<SpottableButton className={css.queueAction} onClick={handleRemove} aria-label={$L('Remove')}>
				&times;
			</SpottableButton>
		</div>
	);
});

export default memo(SyncPlayDialog);
