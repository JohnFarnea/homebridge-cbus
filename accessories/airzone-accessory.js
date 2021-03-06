'use strict';

let Service;
let Characteristic;
let CBusAccessory;
let uuid;

const ms = require('ms');

const cbusUtils = require('../lib/cbus-utils.js');
const http = require('http');

const FILE_ID = cbusUtils.extractIdentifierFromFileName(__filename);

module.exports = function (_service, _characteristic, _accessory, _uuid) {
    Service = _service;
    Characteristic = _characteristic;
    CBusAccessory = _accessory;
    uuid = _uuid;

    return CBusAirZoneAccessory;
};

function CBusAirZoneAccessory(platform, accessoryData) {
    // initialize the parent
    CBusAccessory.call(this, platform, accessoryData);

    // TODO do we need to prime this?
    this.isOn = false;
    this.zone = this.accessoryData.zone;

    setTimeout(() => {
        this.airApi(`zone/${this.zone}`, (resp) => {
            var state = JSON.parse(resp).stateString;
            this._log(FILE_ID, 'init', `API Response State Zone ${this.zone} = ${state}`);
            this.isOn = (state == "Open");
            this.service.getCharacteristic(Characteristic.On).setValue(this.isOn ? 1 : 0, undefined, `event`);
        });

    }, 1000);

    // register the on-off service
    this.service = this.addService(new Service.Switch(this.name));
    this.service.getCharacteristic(Characteristic.On)
        .on('get', this.getOn.bind(this))
        .on('set', this.setOn.bind(this));
}

CBusAirZoneAccessory.prototype.getOn = function (callback) {
    // get the level from the AirconAPI, then set the netId
    this.airApi(`zone/${this.zone}`, (resp) => {
        var state = JSON.parse(resp).stateString;
        this._log(FILE_ID, 'getOn', `API Response State Zone ${this.zone} = ${state}`);
        this.isOn = (state == "Open");
        callback(false, this.isOn ? 1 : 0);
    });
};

CBusAirZoneAccessory.prototype.setOn = function (turnOn, callback, context) {
    if (context === `event`) {
        // context helps us avoid a never-ending loop
        callback();
    } else {
        console.assert((turnOn === 1) || (turnOn === 0) || (turnOn === true) || (turnOn === false));
        const wasOn = this.isOn;
        this.isOn = (turnOn === 1) || (turnOn === true);

        if (wasOn === this.isOn) {
            this._log(FILE_ID, `setOn`, `no state change from ${turnOn}`);
            callback();
        } else if (turnOn) {
            this._log(FILE_ID, `setOn(true)`, `changing to 'on'`);
            this.client.turnOn(this.netId, () => {
                callback();
            });
        } else {
            // turnOn === false, ie. turn off
            this._log(FILE_ID, `setOn(false)`, `changing to 'off'`);
            this.client.turnOff(this.netId, () => {
                callback();
            });
        }
    }
};

CBusAirZoneAccessory.prototype.processClientData = function (err, message) {
    if (!err) {
        console.assert(typeof message.level !== `undefined`, `message.level must be defined`);
        const level = message.level;

        this.service.getCharacteristic(Characteristic.On).setValue((level > 0) ? 1 : 0, undefined, `event`);
        this._log(FILE_ID, 'processClientData', `processing level = ${level}`);
        if (level == 0) {
            this.airApi(`setZoneState/${this.zone}/Closed`, (resp) => {
                this._log(FILE_ID, 'processClientData', `API Response = ${resp}`);
            });
        } else {
            this.airApi(`setZoneState/${this.zone}/Open`, (resp) => {
                this._log(FILE_ID, 'processClientData', `API Response = ${resp}`);
            });
        }
    }
};

CBusAirZoneAccessory.prototype._log = function (fileid, method, message) {
    var d = new Date();
    console.log(d.getSeconds() + '.' + d.getMilliseconds() + ' ' + method + ' - ' + message);
}

CBusAirZoneAccessory.prototype.airApi = function(method, callback) {
    var url = `http://192.168.4.3:50010/api/air/${method}`;
    this._log(FILE_ID, 'AirAPI', `Calling  ${url}`);
    http.get(url, (resp) => {
        let data = '';
        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });
        // The whole response has been received. return the result.
        resp.on('end', () => {
            callback(data);
        });
    }).on("error",(err) => {
        this._log(FILE_ID, 'AirAPI', `API ERROR = ${err.message}`);
    });
};

