// Everything the media bar reads to decide what it holds. Two draws under the
// same key differ only in which random items came back, so one can wait for the
// next visit rather than replacing a bar the viewer is turning through. Under
// different keys they are different bars and the new one has to land now.
//
// A setting that changes what the bar shows belongs here. Leaving one out means
// changing it leaves the old bar up until the cache expires.
export const featuredConfigKey = (settings = {}) => JSON.stringify([
	settings.useMoonfinPlugin === true,
	settings.mediaBarSourceType || 'library',
	settings.featuredContentType ?? null,
	settings.featuredItemCount ?? null,
	settings.mediaBarLibraryIds || [],
	settings.mediaBarCollectionIds || [],
	settings.excludedGenres || []
]);
