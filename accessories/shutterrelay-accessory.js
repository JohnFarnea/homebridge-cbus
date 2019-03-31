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
	this.spinTime = accessoryData.spintime || 20000;
	this.extraSpinTime = accessoryData.extraSpinTime || 2000;
	this.loopTime = this.spinTime / 100;

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
		}

		// set up move to new shutter level
		let shutterLevel = this.translateProportionalToShutter(newPosition);

		// in this framework, the shutter relay position just looks like the brightness of a light
		this.client.setLevel(this.netId, shutterLevel, () => {
			this._log(FILE_ID, `setTargetPosition`, 'sent to client: shutter = ' + shutterLevel);

			callback();
		});
	}
};

CBusShutterRelayAccessory.prototype.setRelays = function (direction, callback) {
	if (direction == Characteristic.PositionState.STOPPED) {
		this.client.setLevel(this.upNetId, 0, () => {
			this.client.setLevel(this.downNetId, 0, () => {
				callback();
			});
		});
	}
	if (direction == Characteristic.PositionState.INCREASING) {
		this.client.setLevel(this.upNetId, 100, () => {
			this.client.setLevel(this.downNetId, 0, () => {
				callback();
			});
		});
	}
	if (direction == Characteristic.PositionState.DECREASING) {
		this.client.setLevel(this.upNetId, 0, () => {
			this.client.setLevel(this.downNetId, 100, () => {
				callback();
			});
		});
	}
};


CBusShutterRelayAccessory.prototype.moveToPosition = function () {
	let requiredDirection = Characteristic.PositionState.STOPPED;
	// determine required direction
	if (this.cachedTargetPosition > this.currentPosition) {
		requiredDirection = Characteristic.PositionState.INCREASING;
	}
	if (this.cachedTargetPosition < this.currentPosition) {
		requiredDirection = Characteristic.PositionState.DECREASING;
	}
	if (requiredDirection != this.currentPositionState && requiredDirection != Characteristic.PositionState.STOPPED) {
		if (this.currentPositionState != Characteristic.PositionState.STOPPED) {
			// STOP, then move in correct direction
			this._log(FILE_ID, 'setTargetPosition', 'STOPPING');
			this.currentPositionState = Characteristic.PositionState.STOPPED;
			this.setRelays(this.currentPositionState,() => {});
			setTimeout(() => {
				this._log(FILE_ID, 'setTargetPosition', 'STARTING in Direction ' + requiredDirection);
				this.currentPositionState = requiredDirection;
				this.setRelays(this.currentPositionState,() => {});
				// wait another 2 seconds before calling move again - as we may have just started in 1 direction and 
				// call to move will stop if the user had changed direction twice in quick succession
				setTimeout(() => {
					// as we're moving - adjust the current position based on the 2s delay relative to the spin time
					if (requiredDirection == Characteristic.PositionState.INCREASING) {
						var newPos = this.currentPosition + Math.round(200000 / this.spinTime);
						if (newPos > 100) newPos = 100;
						this.currentPosition = newPos
					}
					if (requiredDirection == Characteristic.PositionState.DECREASING) {
						var newPos = this.currentPosition - Math.round(200000 / this.spinTime);
						if (newPos < 0) newPos = 0;
						this.currentPosition = newPos
					}
					this._log(FILE_ID, 'setTargetPosition', `adjusted currentPosition to ${this.currentPosition} after delay`);
					this.moveToPosition();
				}, 2000)
			}, 2000);
		}
		else {
			this._log(FILE_ID, 'setTargetPosition', 'STARTING in Direction ' + requiredDirection);
			this.currentPositionState = requiredDirection;
			this.setRelays(this.currentPositionState,() => {});
		}
	}
	if (this.currentPositionState == Characteristic.PositionState.INCREASING && this.currentPosition < 100) {
		this.currentPosition = this.currentPosition + 1;
	}
	if (this.currentPositionState == Characteristic.PositionState.DECREASING && this.currentPosition > 0) {
		this.currentPosition = this.currentPosition - 1;
	}
	this._log(FILE_ID, 'setTargetPosition', 'setting currentPosition to ' + this.currentPosition);
	this.service.setCharacteristic(Characteristic.CurrentPosition, this.currentPosition);

	if (this.currentPosition != this.cachedTargetPosition) {
		if (this.currentPositionState != Characteristic.PositionState.STOPPED) {
			setTimeout(() => {
				this.moveToPosition();
			}, this.loopTime);
		}
	} else {
		var timeOut = 1;
		var cachedTargetBeforeDelay = this.cachedTargetPosition;
		if (this.cachedTargetPosition == 0 || this.cachedTargetPosition == 100) {
			timeOut = this.extraSpinTime;
			this._log(FILE_ID, 'setTargetPosition', `delying for ${timeOut}ms before stopping`);
		}
		setTimeout(() => {
			this._log(FILE_ID, 'setTargetPosition', 'STOPPING .. setting isMoving = false');
			this._log(FILE_ID, 'setTargetPosition', 'Setting current position to ' + this.cachedTargetPosition);
			requiredDirection = Characteristic.PositionState.STOPPED;
			this.currentPositionState = requiredDirection;
			this.setRelays(this.currentPositionState,() => {});
			this.service.setCharacteristic(Characteristic.PositionState, requiredDirection);
			this.service.setCharacteristic(Characteristic.CurrentPosition, this.cachedTargetPosition);
			this.isMoving = false;
			// did the user chagne the target position while we were in extended time?
			// if so wait 2 seconds (after stop), then move
			if (this.cachedTargetPosition != cachedTargetBeforeDelay) {
				setTimeout(() => {
					this.moveToPosition();
				}, 2000)
			}
		}, timeOut);
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
				this.cachedTargetPosition = translated;
				// move the blind
				if (!this.isMoving) {
					this.isMoving = true;
					this.moveToPosition();
				}
		
			}
		}
	}
};
