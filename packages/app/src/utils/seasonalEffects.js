// The seasonal effects and densities, under the names Moonfin-Core and the plugin use.
export const SEASONAL_EFFECTS = ['none', 'snow', 'fireworks', 'confetti', 'leaves'];
export const SEASONAL_DENSITIES = ['light', 'normal', 'heavy'];

// This app had its own effects before it took Core's set, and pushed them into users'
// tv profiles. Spring, summer and halloween were dropped.
const LEGACY_EFFECTS = {
	winter: 'snow',
	fall: 'leaves',
	spring: 'none',
	summer: 'none',
	halloween: 'none'
};

// Undefined for a value this app doesn't know, so a sync leaves the local choice alone.
export const normalizeSeasonalTheme = (value) => {
	if (typeof value !== 'string') return undefined;
	const key = value.trim().toLowerCase();
	if (SEASONAL_EFFECTS.includes(key)) return key;
	return LEGACY_EFFECTS[key];
};

export const normalizeSeasonalDensity = (value) =>
	(SEASONAL_DENSITIES.includes(value) ? value : 'normal');
