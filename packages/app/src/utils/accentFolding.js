// Accented Latin letters folded onto the letter behind them, so that a search
// for "canco" or "canço" still turns up "Cançó".
//
// The server folds accents for the searches it answers itself, so anything the
// set matches on its own has to fold too, or the same term gives different
// results depending on which box it was typed into.
//
// Spelled out rather than reached through String.normalize('NFD'): the legacy
// build targets engines without it, and the \p{Diacritic} escape that usually
// pairs with it is a syntax error on those rather than something core-js can
// polyfill. The same table is kept in Moonfin-Core's util/accent_folding.dart.
//
// Keyed on the uppercase form, so lowercase accented input matches once the
// character is uppercased below.
const ACCENT_FOLDS = {
	'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A', 'Ā': 'A', 'Ă': 'A', 'Ą': 'A', 'Æ': 'A',
	'Ç': 'C', 'Ć': 'C', 'Č': 'C',
	'Ð': 'D', 'Ď': 'D', 'Đ': 'D',
	'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E', 'Ē': 'E', 'Ė': 'E', 'Ę': 'E', 'Ě': 'E',
	'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I', 'Ī': 'I', 'Į': 'I',
	'Ł': 'L',
	'Ñ': 'N', 'Ń': 'N', 'Ň': 'N',
	'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O', 'Ō': 'O', 'Ő': 'O',
	'Ś': 'S', 'Š': 'S', 'Ş': 'S',
	'Þ': 'T',
	'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U', 'Ū': 'U', 'Ů': 'U', 'Ű': 'U',
	'Ý': 'Y', 'Ÿ': 'Y',
	'Ź': 'Z', 'Ž': 'Z', 'Ż': 'Z',
};

// The folded letters come back uppercase and anything unknown is left alone,
// so case fold the result before comparing. foldForSearch does both.
export const foldAccents = (value) => {
	let result = '';
	for (const character of String(value == null ? '' : value)) {
		result += ACCENT_FOLDS[character.toUpperCase()] || character;
	}
	return result;
};

// A string folded and lowercased, ready to compare against other search text.
export const foldForSearch = (value) => foldAccents(value).toLowerCase();
