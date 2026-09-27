jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (s) => s}));
jest.mock('../services/serverLogger', () => ({
	__esModule: true,
	default: {debug: jest.fn(), error: jest.fn(), LOG_CATEGORIES: {APP: 'app'}}
}));

let startEmulator;
let destroyEmulator;

// Stands in for the class loader.js builds, so a second launch goes through the cached path.
class FakeEmulator {
	constructor (selector, config) {
		this.config = config;
		FakeEmulator.configs.push(config);
	}

	on (event, cb) {
		if (event === 'ready') setTimeout(cb, 0);
	}
}

const launch = (opts) => startEmulator({selector: '#game', core: 'nes', gameUrl: 'blob:rom', ...opts});

// jsdom never runs the appended loader.js, so this does what it would: build the emulator from
// the EJS_ globals and fire ready.
const launchThroughLoader = async (opts) => {
	const started = launch(opts);
	window.EJS_emulator = new FakeEmulator('#game', {gameUrl: window.EJS_gameUrl, loadState: window.EJS_loadStateURL});
	window.EJS_ready();
	await started;
};

describe('startEmulator save state', () => {
	beforeEach(() => {
		jest.resetModules();
		({startEmulator, destroyEmulator} = require('./emulatorjs'));
		FakeEmulator.configs = [];
	});

	afterEach(() => {
		destroyEmulator();
	});

	test('hands the save to EmulatorJS through the loader', async () => {
		const save = new Uint8Array([1, 2, 3]);

		await launchThroughLoader({stateBytes: save});

		expect(FakeEmulator.configs[0].loadState).toBe(save);
	});

	test('leaves no save behind for the next launch', async () => {
		await launchThroughLoader({stateBytes: new Uint8Array([1])});

		destroyEmulator();

		expect(window.EJS_loadStateURL).toBeUndefined();
	});

	test('hands the save to a cached emulator', async () => {
		const save = new Uint8Array([4, 5]);
		await launchThroughLoader();
		destroyEmulator();

		await launch({stateBytes: save});

		expect(FakeEmulator.configs[1].loadState).toBe(save);
	});

	test('a cached emulator never loads the previous launch\'s save', async () => {
		await launchThroughLoader({stateBytes: new Uint8Array([6])});
		destroyEmulator();

		await launch();

		expect(FakeEmulator.configs[1].loadState).toBeUndefined();
	});
});

// A stand-in for the control screen EmulatorJS builds: player tabs, a gamepad picker, one row per
// button with a gamepad and a keyboard box, the Reset, Clear and Close footer, and the popup it
// shows while waiting for a button.
const buildControlScreen = () => {
	const el = (tag, className) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		return node;
	};
	const emu = {
		controls: {0: {0: {value: 88, value2: 'BUTTON_2'}, 1: {value: 90, value2: 'BUTTON_1'}}, 1: {}},
		checkGamepadInputs: jest.fn(),
		saveSettings: jest.fn()
	};
	const menu = el('div');
	const tabs = el('ul', 'ejs_control_player_bar');
	['Player 1', 'Player 2'].forEach((name, i) => {
		const tab = el('li', i === 0 ? 'ejs_control_selected' : '');
		const link = el('a');
		link.textContent = name;
		link.addEventListener('click', () => {
			tabs.querySelectorAll('li').forEach((t) => t.classList.remove('ejs_control_selected'));
			tab.classList.add('ejs_control_selected');
		});
		tab.appendChild(link);
		tabs.appendChild(tab);
	});
	menu.appendChild(tabs);
	const picker = el('select', 'ejs_gamepad_dropdown');
	['notconnected', 'pad'].forEach((value) => {
		const option = el('option');
		option.value = value;
		picker.appendChild(option);
	});
	menu.appendChild(picker);
	const popup = el('div');
	popup.setAttribute('hidden', '');
	const box = el('div');
	emu.controlPopup = el('div');
	box.appendChild(emu.controlPopup);
	popup.appendChild(box);
	['B', 'A'].forEach((label, button) => {
		const row = el('div', 'ejs_control_bar');
		row.setAttribute('data-label', label);
		row.appendChild(el('input'));
		row.appendChild(el('input'));
		row.getClientRects = () => [{}];
		row.addEventListener('mousedown', () => {
			popup.removeAttribute('hidden');
			emu.controlPopup.setAttribute('button-num', String(button));
			emu.controlPopup.setAttribute('player-num', '0');
		});
		menu.appendChild(row);
	});
	['Reset', 'Clear', 'Close'].forEach((name) => {
		const button = el('div', 'ejs_button');
		button.textContent = name;
		if (name === 'Close') button.addEventListener('click', () => { menu.style.display = 'none'; });
		menu.appendChild(button);
	});
	menu.appendChild(popup);
	menu.style.display = 'none';
	document.body.appendChild(menu);
	emu.controlMenu = menu;
	return {emu, popup, picker, tabs};
};

describe('controller screen', () => {
	let emulatorjs;

	beforeEach(() => {
		jest.resetModules();
		emulatorjs = require('./emulatorjs');
		window.HTMLElement.prototype.scrollIntoView = jest.fn();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		delete window.EJS_emulator;
	});

	test('does not open without an emulator', () => {
		expect(emulatorjs.openControls()).toBe(false);
	});

	test('opens on the first row', () => {
		const {emu} = buildControlScreen();
		window.EJS_emulator = emu;

		expect(emulatorjs.openControls()).toBe(true);

		expect(emu.controlMenu.style.display).toBe('');
		expect(emu.controlMenu.querySelector('.ejs_control_bar').style.outline).not.toBe('');
	});

	test('the d-pad walks the tabs, the gamepad picker, the rows, and the footer', () => {
		const {emu, picker, tabs} = buildControlScreen();
		window.EJS_emulator = emu;
		emulatorjs.openControls();
		const change = jest.fn();
		picker.addEventListener('change', change);

		emulatorjs.controlInput('DPAD_UP');
		emulatorjs.controlInput('DPAD_RIGHT');
		expect(picker.selectedIndex).toBe(1);
		expect(change).toHaveBeenCalled();

		emulatorjs.controlInput('DPAD_UP');
		emulatorjs.controlInput('DPAD_RIGHT');
		expect(tabs.querySelectorAll('li')[1].classList.contains('ejs_control_selected')).toBe(true);

		emulatorjs.controlInput('DPAD_DOWN');
		emulatorjs.controlInput('DPAD_DOWN');
		emulatorjs.controlInput('DPAD_DOWN');
		emulatorjs.controlInput('DPAD_DOWN');
		const footer = emu.controlMenu.querySelectorAll('.ejs_button');
		expect(footer[0].style.outline).not.toBe('');
	});

	test('OK on a row asks for a gamepad button, or a keyboard key in the second column', () => {
		const {emu, popup} = buildControlScreen();
		window.EJS_emulator = emu;
		emulatorjs.openControls();

		emulatorjs.controlInput('BUTTON_2');
		expect(popup.getAttribute('hidden')).toBeNull();
		expect(emu.controlPopup.innerText).toBe('[ B ]\nPress Gamepad');

		emulatorjs.controlInput('BACK');
		emulatorjs.controlInput('DPAD_RIGHT');
		emulatorjs.controlInput('BUTTON_2');
		expect(emu.controlPopup.innerText).toBe('[ B ]\nPress a physical keyboard key');
	});

	test('OK while the popup waits clears the gamepad binding', () => {
		const {emu, popup} = buildControlScreen();
		const save = emu.saveSettings;
		window.EJS_emulator = emu;
		emulatorjs.openControls();
		emulatorjs.controlInput('BUTTON_2');

		emulatorjs.controlInput('BUTTON_2');

		expect(emu.controls[0][0].value2).toBe('');
		expect(popup.getAttribute('hidden')).toBe('');
		expect(save).toHaveBeenCalled();
	});

	test('back closes the popup first, then the screen', () => {
		const {emu, popup} = buildControlScreen();
		window.EJS_emulator = emu;
		emulatorjs.openControls();
		emulatorjs.controlInput('BUTTON_2');

		expect(emulatorjs.controlInput('BACK')).toBeNull();
		expect(popup.getAttribute('hidden')).toBe('');

		expect(emulatorjs.controlInput('BACK')).toBe('back');
		expect(emu.controlMenu.style.display).toBe('none');
	});

	test('Close in the footer reports the screen closed', () => {
		const {emu} = buildControlScreen();
		window.EJS_emulator = emu;
		emulatorjs.openControls();
		emulatorjs.controlInput('DPAD_DOWN');
		emulatorjs.controlInput('DPAD_DOWN');
		emulatorjs.controlInput('DPAD_LEFT');

		expect(emulatorjs.controlInput('BUTTON_2')).toBe('close');
	});

	test('a new gamepad binding comes off every other row', () => {
		const {emu, popup} = buildControlScreen();
		window.EJS_emulator = emu;
		emulatorjs.openControls();
		emulatorjs.controlInput('BUTTON_2');

		// What EmulatorJS does when a gamepad button arrives for the waiting row.
		emu.controls[0][0].value2 = 'BUTTON_1';
		popup.setAttribute('hidden', '');
		emu.saveSettings();

		expect(emu.controls[0][1].value2).toBe('');
		expect(emu.controls[0][0].value2).toBe('BUTTON_1');
	});
});
