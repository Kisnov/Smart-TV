import {useRef, useMemo, useState, useCallback} from 'react';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import {getImageUrl} from '../../../utils/helpers';
import {getApiForItem} from '../../../services/connectionPool';
import {api as jellyfinApi} from '../../../services/jellyfinApi';
import AddToPlaylistModal from '../../../components/AddToPlaylistModal';
import AmbientBackground from './AmbientBackground';
import AudioQualityBadge from './AudioQualityBadge';
import QueuePanel from './QueuePanel';
import LyricsPanel from './LyricsPanel';

import css from './AudioMode.module.less';

const PanelContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

const IconMusicNote = () => (
	<svg viewBox="0 -960 960 960" fill="currentColor" width="96" height="96">
		<path d="M400-120q-66 0-113-47t-47-113q0-66 47-113t113-47q23 0 42.5 5.5T480-418v-422h240v160H560v382q0 66-47 113t-113 47Z" />
	</svg>
);

const artUrlFor = (item, serverUrl) => {
	const base = item?._serverUrl || serverUrl;
	if (item?.ImageTags?.Primary) return getImageUrl(base, item.Id, 'Primary', {maxHeight: 600, quality: 90});
	if (item?.AlbumId && item?.AlbumPrimaryImageTag) {
		return getImageUrl(base, item.AlbumId, 'Primary', {maxHeight: 600, quality: 90, tag: item.AlbumPrimaryImageTag});
	}
	return null;
};

// Art and track details sit on the left, with lyrics or Up Next filling the
// right. The seekbar and the control dock come from PlayerControls.
const AudioMode = ({
	item,
	title,
	subtitle,
	serverUrl,
	focusRow,
	panel,
	audioPlaylist,
	onSelectTrack,
	lyrics,
	onSeekToLine,
	playlistOpen,
	onClosePlaylist
}) => {
	const queueScrollRef = useRef(null);
	const [toast, setToast] = useState(null);
	const artUrl = artUrlFor(item, serverUrl);
	const panelFocused = focusRow === 'panel';
	// The dialog reloads its playlists whenever its api changes, so the api has to stay the same between renders.
	const itemApi = useMemo(() => getApiForItem(item) || jellyfinApi, [item]);

	const showToast = useCallback((message) => setToast({message, key: Date.now()}), []);
	const clearToast = useCallback(() => setToast(null), []);

	return (
		<AmbientBackground artworkUrl={artUrl}>
			<div className={css.header}><AudioQualityBadge item={item} /></div>

			<div className={css.body}>
				<div className={css.nowPlaying}>
					<div className={css.art}>
						{artUrl
							? <img className={css.artImg} src={artUrl} alt={item?.Name} />
							: <div className={css.artPlaceholder}><IconMusicNote /></div>}
					</div>
					<h1 className={css.trackTitle}>{title}</h1>
					{subtitle && <p className={css.trackArtist}>{subtitle}</p>}
					{item?.Album && <p className={css.trackAlbum}>{item.Album}</p>}
				</div>

				<PanelContainer className={css.panel} spotlightId="audio-panel">
					{panel === 'lyrics' ? (
						<LyricsPanel
							lines={lyrics.lines}
							activeIndex={lyrics.activeIndex}
							isLoading={lyrics.isLoading}
							error={lyrics.error}
							isSynced={lyrics.isSynced}
							isFocusable={panelFocused}
							onSeekToLine={onSeekToLine}
						/>
					) : (
						<QueuePanel
							items={audioPlaylist}
							currentId={item?.Id}
							serverUrl={serverUrl}
							focusDisabled={!panelFocused}
							onSelectTrack={onSelectTrack}
							scrollerRef={queueScrollRef}
						/>
					)}
				</PanelContainer>
			</div>

			<AddToPlaylistModal
				open={playlistOpen}
				itemId={item?.Id}
				api={itemApi}
				onClose={onClosePlaylist}
				onSuccess={showToast}
			/>
			{toast && <div key={toast.key} className={css.toast} onAnimationEnd={clearToast}>{toast.message}</div>}
		</AmbientBackground>
	);
};

export default AudioMode;
