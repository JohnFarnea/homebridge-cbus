'use strict';

let Service;
let Characteristic;
let CBusAccessory;
let uuid;

const cbusUtils = require('../lib/cbus-utils.js');
const CBusNetId = require('../lib/cbus-netid.js');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

const SHUTTER_OPEN = 100;
const SHUTTER_TOGGLE = 98;
const SHUTTER_OPEN_TOGGLE = 99;
const SHUTTER_DOWN = 0;
const SHUTTER_CLOSE_TOGGLE = 1;
const SHUTTER_STOP = 2;

const SPIN_TIME = 5000;
const LOOP_TIME = 100;

module.exports = function (_service, _characteristic, _accessory, _uuid) {
	Service = _service;
	Characteristic = _characteristic;
	CBusAccessory = _accessory;
	uuid = _uuid;

	return CBusShutterRelayAccessory;
};

function CBusShutterRelayAccessory(platform, accessoryData) {
	//--------------------------------------------------
	// initialize the parent
	CBusAccessory.call(this, platform, accessoryData);

	//--------------------------------------------------
	// state variables
	// handle inversion
	this.invert = accessoryData.invert || 'false';
	this.upNetId = new CBusNetId(this.netId.project, this.netId.network, this.netId.application, this.accessoryData.upRelayId);
	this.downNetId = new CBusNetId(this.netId.project, this.netId.network, this.netId.application, this.accessoryData.downRelayId);

	// prime the last known position of the blinds
	// assume the blinds were closed, but as soon as we can issue a receiveLightStatus to see
	// if we can infer the position from the shutter state
	this.cachedTargetPosition = 0;
	this.currentPosition = 0;
	this.currentPositionState = Characteristic.PositionState.STOPPED;
	this.isMoving = false;

	setTimeout(() => {
		this._log(FILE_ID, `construct`, `prime state`);
		this.client.receiveLevel(this.netId, message => {
			let translated = this.translateShutterToProportional(message.level);

			if (typeof translated === `undefined`) {
				// TODO be smarter here
				this._log(FILE_ID, `prime`, `position indeterminate (${message.level}%); defaulting to 0%`);
				this.cachedTargetPosition = 0;
			} else {
				this._log(FILE_ID, `prime`, `cachedTargetPosition = ${translated}%`);
				this.cachedTargetPosition = translated;
				this.currentPosition = translated;
			}
		});
	}, 5000);

	//--------------------------------------------------
	// register the Window Covering service
	this.service = this.addService(new Service.WindowCovering(this.name));

	// the current position (0-100%)
	// https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L3211
	this.service.getCharacteristic(Characteristic.CurrentPosition)
		.on('get', this.getCurrentPosition.bind(this));

	// the target position (0-100%)
	// https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L3212
	this.service.getCharacteristic(Characteristic.TargetPosition)
		.on('get', this.getTargetPosition.bind(this))
		.on('set', this.setTargetPosition.bind(this));

	// the position state
	// 0 = DECREASING; 1 = INCREASING; 2 = STOPPED;
	// https://github.com/KhaosT/HAP-NodeJS/blob/master/lib/gen/HomeKitTypes.js#L3213
	this.service.getCharacteristic(Characteristic.PositionState)
		.on('get', this.getPositionState.bind(this));
}

CBusShutterRelayAccessory.prototype._log = function (fileid, method, message) {
	var d = new Date();
	console.log(d.getSeconds() + '.' + d.getMilliseconds() + ' ' + method + ' - ' + message);
}


CBusShutterRelayAccessory.prototype.translateProportionalToShutter = function (level) {
	if ((level > 100) || (level < 0)) {
		this._log(FILE_ID, `translate`, `illegal level: ${level}`);
		return 0;
	}

	// invert if required
	if (this.invert === 'true') {
		const invertedLevel = 100 - level;
		this._log(FILE_ID, `translate`, `${level} inverted to ${invertedLevel}%`);
		level = invertedLevel;
	}

	// in level translation mode, the levels 1, 2, 98, 99 have special meanings and should
	// therefore be mapped out to the vales for open (100%) and closed (0%)
	let translated;

	switch (level) {
		case 0:
		case 1:
		case 2:
			translated = 0;
			break;

		case 98:
		case 99:
		case 100:
			translated = 100;
			break;

		default:
			translated = level;
			break;
	}

	return translated;
};

CBusShutterRelayAccessory.prototype.translateShutterToProportional = function (level) {
	if (typeof level === undefined) {
		return undefined;
	}

	if ((level > 100) || (level < 0)) {
		this._log(FILE_ID, `translate`, `illegal network level = ${level}`);
		return undefined;
	}

	let translated;
	switch (level) {
		case SHUTTER_OPEN:
			translated = 100;
			break;

		case SHUTTER_DOWN:
			translated = 0;
			break;

		case SHUTTER_TOGGLE:
		case SHUTTER_OPEN_TOGGLE:
		case SHUTTER_CLOSE_TOGGLE:
		case SHUTTER_STOP:
			// could be a bit smarter here
			translated = undefined;
			break;

		default:
			translated = level;
			break;
	}

	// invert if required
	if ((typeof translated !== `undefined`) && (this.invert === true)) {
		let invertedLevel = 100 - level;
		this._log(FILE_ID, `translate`, `${level}% inverted to ${invertedLevel}%`);
		translated = invertedLevel;
	}

	return translated;
};

CBusShutterRelayAccessory.prototype.getCurrentPosition = function (callback) {
	//this._log(FILE_ID, `getCurrentPosition`, this.cachedTargetPosition);
	//callback(false, /* value */ this.cachedTargetPosition);
	this._log(FILE_ID, `getCurrentPosition`, this.currentPosition);
	callback(false, /* value */ this.currentPosition);
};

CBusShutterRelayAccessory.prototype.getPositionState = function (callback) {
	this._log(FILE_ID, `getPositionState`, this.currentPositionState);
	callback(false, this.currentPositionState);
};

CBusShutterRelayAccessory.prototype.getTargetPosition = function (callback) {
	this.client.receiveLevel(this.netId, result => {
		let proportion = this.translateShutterToProportional(result.level);
		this._log(FILE_ID, `getTargetPosition`, proportion);

		if (typeof proportion === `undefined`) {
			// TODO be smarter here
			this._log(FILE_ID, `getTargetPosition`, `indeterminate; defaulting to 0%`);
			callback(false, 0);
		} else {
			// cache a copy
			this.cachedTargetPosition = proportion;
			callback(false, proportion);
		}
	});
};

// Set the target position
// set the direction between current and target
// open relay based on direction
// any future updates change the target
// if direction changes - how do we stop both and ensure no re-starting?
// every 100ms, update current, see if it matches target - then stop

CBusShutterRelayAccessory.prototype.setTargetPosition = function (newPosition, callback, context) {
	// context helps us avoid a never-ending loop
	if (context === `event`) {
		// this._log(FILE_ID, 'suppressing remote setTargetPosition');
		callback();
	} else {
		this._log(FILE_ID, `setTargetPosition`, `${newPosition} (was ${this.cachedTargetPosition})`);

		// tell homekit that the window covering is moving
		// determine direction of movement and a next position that's not the final position

		this.cachedTargetPosition = newPosition;
		if (!this.isMoving) {
			this.isMoving = true;
			this.moveToPosition();
			this.isMoving = false;
		}

		/*
		if (newPosition > this.cachedTargetPosition) {
			this._log(FILE_ID, `setTargetPosition`, `moving up`);
			requiredDirection = Characteristic.PositionState.INCREASING;
		} else if (newPosition < this.cachedTargetPosition) {
			this._log(FILE_ID, `setTargetPosition`, `moving down`);
			requiredDirection = Characteristic.PositionState.DECREASING;
		} else {
			this._log(FILE_ID, `setTargetPosition`, `moving nowhere`);
			requiredDirection = Characteristic.PositionState.STOPPED;
		}
		if (requiredDirection !== Characteristic.PositionState.STOPPED) {
			// immediately set the state to look like we're almost there
			this._log(FILE_ID, `setTargetPosition`, `interim position = ${interimPosition} (was ${this.cachedTargetPosition})`);
			this.cachedTargetPosition = interimPosition;
			this.service.setCharacteristic(Characteristic.PositionState, requiredDirection);
			this.service.setCharacteristic(Characteristic.CurrentPosition, interimPosition);
		}
		*/

		// set up move to new shutter level
		let shutterLevel = this.translateProportionalToShutter(newPosition);

		// in this framework, the shutter relay position just looks like the brightness of a light
		this.client.setLevel(this.netId, shutterLevel, () => {
			this._log(FILE_ID, `setTargetPosition`, 'sent to client: shutter = ' + shutterLevel);

			// keep the spinner moving for a little while to give the sense of movement
			//			setTimeout(() => {
			//				this.cachedTargetPosition = newPosition;
			//				this._log(FILE_ID, `setTargetPosition`, `finishing movement; signalling stopping at ${this.cachedTargetPosition}`);
			//				this.service.setCharacteristic(Characteristic.CurrentPosition, this.cachedTargetPosition);
			//				this.service.setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
			//			}, SPIN_TIME);

			callback();
		});
	}
};

CBusShutterRelayAccessory.prototype.moveToPosition = function () {
	let requiredDirection;
	// determine required direction
	if (this.cachedTargetPosition > this.currentPosition) {
		requiredDirection = Characteristic.PositionState.INCREASING;
	}
	if (this.cachedTargetPosition < this.currentPosition) {
		requiredDirection = Characteristic.PositionState.DECREASING;
	}
	if (requiredDirection != this.currentPositionState) {
		if (this.currentPositionState != Characteristic.PositionState.STOPPED) {
			// STOP, then move in correct direction
			this._log(FILE_ID, 'setTargetPosition', 'STOPPING');
			this.currentPositionState = Characteristic.PositionState.STOPPED;
			setTimeout(() => {
				this._log(FILE_ID, 'setTargetPosition', 'STARTING in Direction ' + requiredDirection);
				this.currentPositionState = requiredDirection;
			}, 1000);
		}
		else {
			this._log(FILE_ID, 'setTargetPosition', 'STARTING in Direction ' + requiredDirection);
			this.currentPositionState = requiredDirection;
		}
	}
	if (this.currentPositionState == Characteristic.PositionState.INCREASING) {
		this.currentPosition = this.currentPosition + 1;
	}
	if (this.currentPositionState == Characteristic.PositionState.DECREASING) {
		this.currentPosition = this.currentPosition - 1;
	}
	this._log(FILE_ID, 'setTargetPosition', 'setting currentPosition to ' + this.currentPosition);
	this.service.setCharacteristic(Characteristic.CurrentPosition, this.currentPosition);

	if (this.currentPosition != this.cachedTargetPosition) {
		setTimeout(() => {
			this.moveToPosition();
		}, LOOP_TIME);
	} else {
		this._log(FILE_ID, 'setTargetPosition', 'STOPPING');
		this._log(FILE_ID, 'setTargetPosition', 'Setting current position to ' + this.cachedTargetPosition);
		requiredDirection = Characteristic.PositionState.STOPPED;
		this.currentPositionState = requiredDirection;
		this.service.setCharacteristic(Characteristic.PositionState, requiredDirection);
		this.service.setCharacteristic(Characteristic.CurrentPosition, this.cachedTargetPosition);
	}
}

CBusShutterRelayAccessory.prototype.processClientData = function (err, message) {
	if (!err) {
		const level = message.level;
		const translated = this.translateShutterToProportional(level);

		if (typeof translated === `undefined`) {
			this._log(FILE_ID, `processClientData`, `indeterminate`);

			// could be a bit smarter here
			this.cachedTargetPosition = 0;
		} else {
			this._log(FILE_ID, `processClientData`, `received ${translated}%`);

			if (this.cachedTargetPosition !== translated) {
				this.service.getCharacteristic(Characteristic.TargetPosition).setValue(translated, undefined, `event`);

				//  move over 2 seconds
				setTimeout(() => {
					this.cachedTargetPosition = translated;
					console.log(`processClientData - setting cachedTargetPosition to ${translated}% and state to STOPPED`);

					// in many cases the shutter will still be travelling for a while, but unless/until we
					// simulate the shutter relay, we won't know when it has stopped.
					// so just assume it gets there immediately.
					this.service.getCharacteristic(Characteristic.CurrentPosition)
						.setValue(this.cachedTargetPosition, undefined, `event`);
					this.service.getCharacteristic(Characteristic.PositionState)
						.setValue(Characteristic.PositionState.STOPPED, undefined, `event`);
				}, SPIN_TIME);
			}
		}
	}
};
