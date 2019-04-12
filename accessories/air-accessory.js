'use strict';

let Service;
let Characteristic;
let CBusAccessory;
let uuid;

const cbusUtils = require('../lib/cbus-utils.js');
const CBusNetId = require('../lib/cbus-netid.js');

const chalk = require('chalk'); // does not alter string prototype

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

const SPIN_TIME = 3000;

module.exports = function (_service, _characteristic, _accessory, _uuid) {
    Service = _service;
    Characteristic = _characteristic;
    CBusAccessory = _accessory;
    uuid = _uuid;

    return CBusAirAccessory;
};

function CBusAirAccessory(platform, accessoryData) {
    //--------------------------------------------------
    // initialize the parent
    CBusAccessory.call(this, platform, accessoryData);

    //--------------------------------------------------
    // register the service
    this.service = this.addService(new Service.Thermostat(this.name));
    this.service.addCharacteristic(Characteristic.On);

    this.currentTemperature = 20;
    this.targetTemperature = 24;
    this.currentState = Characteristic.CurrentHeatingCoolingState.OFF;
    this.targetState = Characteristic.TargetHeatingCoolingState.OFF;
    this.isOn = false;

	this.service.getCharacteristic(Characteristic.CurrentTemperature)
		.on('get', this.getCurrentTemperature.bind(this));

    this.service.getCharacteristic(Characteristic.TargetTemperature)
        .on('get', this.getTargetTemperature.bind(this))
        .on('set', this.setTargetTemperature.bind(this));
        
    this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
		.on('get', this.getCurrentState.bind(this));

    this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .on('get', this.getTargetState.bind(this))
        .on('set', this.setTargetState.bind(this));

    this.service.getCharacteristic(Characteristic.On)
		.on('get', this.getOn.bind(this))
		.on('set', this.setOn.bind(this));



    //--------------------------------------------------
    // prime the air state

    // TODO work out whether we really do need to prime
    // it seems that the Home app kicks off an update only when activating the app,
    // but not automatically if homekit is restarted.
}

CBusAirAccessory.prototype.getCurrentTemperature = function (callback) {
	this._log(FILE_ID, `getCurrentTemperature`, this.currentTemperature);
	callback(false, /* value */ this.currentTemperature);
};

CBusAirAccessory.prototype.getTargetTemperature = function (callback) {
	this._log(FILE_ID, `getTargetTemperature`, this.targetTemperature);
	callback(false, /* value */ this.targetTemperature);
};

CBusAirAccessory.prototype.setTargetTemperature = function (newTemp, callback, context) {
	if (context === `event`) {
		callback();
	} else {
        this._log(FILE_ID, `setTargetTemperature`, `${newTemp} (was ${this.targetTemperature})`);
        this.targetTemperature = newTemp;
        callback();
    }
};

CBusAirAccessory.prototype.getCurrentState = function (callback) {
	this._log(FILE_ID, `getCurrentState`, this.currentState);
	callback(false, /* value */ this.currentState);
};

CBusAirAccessory.prototype.getTargetState = function (callback) {
	this._log(FILE_ID, `getTargetState`, this.targetState);
	callback(false, /* value */ this.targetState);
};

CBusAirAccessory.prototype.setTargetState = function (newState, callback, context) {
	if (context === `event`) {
		callback();
	} else {
        this._log(FILE_ID, `setTargetState`, `${newState} (was ${this.targetState})`);
        this.targetState = newState;
        callback();
    }
};

CBusAirAccessory.prototype.getOn = function (callback) {
	this._log(FILE_ID, `getOn`, this.isOn);
	callback(false, /* value */ this.isOn);
};

CBusAirAccessory.prototype.setOn = function (newOn, callback, context) {
	if (context === `event`) {
		callback();
	} else {
        this._log(FILE_ID, `setOn`, `${newOn} (was ${this.isOn})`);
        this.isOn = newOn;
        callback();
    }
};


CBusAirAccessory.prototype._log = function (fileid, method, message) {
	var d = new Date();
	console.log(d.getSeconds() + '.' + d.getMilliseconds() + ' ' + method + ' - ' + message);
}

// received an event over the network
// could have been in response to one of our commands, or someone else
CBusAirAccessory.prototype.processClientData = function (err, message) {
    if (!err) {
        console.assert(typeof message.level !== `undefined`, `CBusAirAccessory.processClientData must receive message.level`);
        const speed = message.level;

        // update isOn

    }
};
