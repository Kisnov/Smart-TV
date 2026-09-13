import $L from '@enact/i18n/$L';

import NouveauDirectPlay from './NouveauDirectPlay';
import {fileName, fileSizeLine, trackRows, videoLines} from '../nouveauFooterFields';

import css from './NouveauDetailsFooter.module.less';

const Group = ({title, children}) => (
	<div className={css.group}>
		<h3 className={css.groupTitle}>{title}</h3>
		{children}
	</div>
);

const Tracks = ({rows}) => (
	<>
		{rows.map((row, index) => (
			<div key={index} className={`${css.track} ${row.active ? css.trackActive : ''}`}>
				<span className={css.trackDot} />
				<span>
					<span className={css.trackLabel}>{row.label}</span>
					{row.detail && <div className={css.trackDetail}>{row.detail}</div>}
				</span>
			</div>
		))}
	</>
);

// What the page closes on: who made the title, and what the file behind it actually is. Every group
// is left out rather than shown empty, since a server is silent about different things per file.
const NouveauDetailsFooter = ({item, mediaSource, effectiveApi, selectedAudioIndex, selectedSubtitleIndex}) => {
	const streams = mediaSource?.MediaStreams || [];
	const video = streams.find((stream) => stream.Type === 'Video');
	const audio = streams.filter((stream) => stream.Type === 'Audio');
	const subtitles = streams.filter((stream) => stream.Type === 'Subtitle');

	// The stored choice is a place in these lists, while a track knows itself by its own index, so
	// the one is turned into the other before anything is marked as being in use.
	const activeAudio = audio[selectedAudioIndex]?.Index;
	const activeSubtitle = selectedSubtitleIndex >= 0 ? subtitles[selectedSubtitleIndex]?.Index : undefined;

	const studios = (item.Studios || []).map((studio) => studio?.Name).filter(Boolean);
	const name = fileName(mediaSource);
	const sizeLine = fileSizeLine(mediaSource);
	const videoDetails = videoLines(video);

	return (
		<div className={css.footer}>
			<h2 className={css.title}>{$L('Details')}</h2>
			<div className={css.groups}>
				{studios.length > 0 && (
					<Group title={$L('Studios')}>
						<div className={css.studios}>
							{studios.map((studio) => (
								<span key={studio} className={css.studio}>{studio}</span>
							))}
						</div>
					</Group>
				)}
				{mediaSource && (
					<Group title={$L('File Information')}>
						{name && <div className={css.fileName}>{name}</div>}
						{sizeLine && <div className={css.fileMeta}>{sizeLine}</div>}
						<NouveauDirectPlay
							api={effectiveApi}
							itemId={item.Id}
							serverType={item._serverType}
							mediaSourceId={mediaSource.Id}
							audioStreamIndex={activeAudio}
							subtitleStreamIndex={activeSubtitle}
						/>
					</Group>
				)}
				{videoDetails.length > 0 && (
					<Group title={$L('Video')}>
						{videoDetails.map((line) => <div key={line} className={css.line}>{line}</div>)}
					</Group>
				)}
				{audio.length > 0 && (
					<Group title={$L('Audio')}>
						<Tracks rows={trackRows(audio, activeAudio)} />
					</Group>
				)}
				{subtitles.length > 0 && (
					<Group title={$L('Subtitles')}>
						<Tracks rows={trackRows(subtitles, activeSubtitle, {includeForced: true})} />
					</Group>
				)}
			</div>
		</div>
	);
};

export default NouveauDetailsFooter;
