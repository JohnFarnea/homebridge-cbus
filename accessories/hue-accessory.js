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

    return CBusHueAccessory;
};

function CBusHueAccessory(platform, accessoryData) {
    // initialize the parent
    CBusAccessory.call(this, platform, accessoryData);

    // TODO do we need to prime this?
    this.isOn = false;
    this.lightNumber = this.accessoryData.lightNumber;

    setTimeout(() => {
        this.hueApi(this.lightNumber, (resp) => {
            var state = JSON.parse(resp).state.on;
            this._log(FILE_ID, 'init', `HUE API Response Light ${this.lightNumber} Power ON = ${state}`);
            this.isOn = state;
            this.service.getCharacteristic(Characteristic.On).setValue(this.isOn ? 1 : 0, undefined, `event`);
        });
    }, 1000);

    // register the on-off service
    this.service = this.addService(new Service.Switch(this.name));
    this.service.getCharacteristic(Characteristic.On)
        .on('get', this.getOn.bind(this))
        .on('set', this.setOn.bind(this));
}

CBusHueAccessory.prototype.getOn = function (callback) {
    // get the level from the AirconAPI, then set the netId
    this.client.receiveLevel(this.netId, message => {
        this.isOn = message.level > 0;
        this._log(FILE_ID, `getOn`, `status = '${this.isOn ? `on` : `off`}'`);
        callback(false, this.isOn ? 1 : 0);
    }, `getOn`);
};

CBusHueAccessory.prototype.setOn = function (turnOn, callback, context) {
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

CBusHueAccessory.prototype.processClientData = function (err, message) {
    if (!err) {
        console.assert(typeof message.level !== `undefined`, `message.level must be defined`);
        const level = message.level;

        this.service.getCharacteristic(Characteristic.On).setValue((level > 0) ? 1 : 0, undefined, `event`);
        this._log(FILE_ID, 'processClientData', `processing level = ${level}`);
        if (level == 0) {
            this.hueApi(this.lightNumber, (resp) => {
                this._log(FILE_ID, 'processClientData', `API Response = ${resp}`);
            }, false);
        } else {
            this.hueApi(this.lightNumber, (resp) => {
                this._log(FILE_ID, 'processClientData', `API Response = ${resp}`);
            }, true);
        }
    }
};

CBusHueAccessory.prototype._log = function (fileid, method, message) {
    var d = new Date();
    console.log(d.getSeconds() + '.' + d.getMilliseconds() + ' ' + method + ' - ' + message);
}

CBusHueAccessory.prototype.hueApi = function (lightNumber, callback, state) {
    var url = `http://192.168.4.30/api/sjA-83GgBWGQsHHnYJgrL3A57PuGF73Z88RzHOIO/lights/${lightNumber}`;
    if (state == undefined) {
        this._log(FILE_ID, 'HueAPI', `Calling GET at URL ${url}`);
        // get the status
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
        }).on("error", (err) => {
            this._log(FILE_ID, 'HueAPI', `API ERROR = ${err.message}`);
        });
    } else {
        this._log(FILE_ID, 'HueAPI', `Calling PUT at URL ${url}`);
        var options = {
            host: '192.168.4.30',
            port: 80,
            path: `/api/sjA-83GgBWGQsHHnYJgrL3A57PuGF73Z88RzHOIO/lights/${lightNumber}/state`,
            method: 'PUT'
        };

        var req = http.request(options, function (resp) {
            let data = '';
            resp.setEncoding('utf8');
            resp.on('data', (chunk) => {
                data += chunk;
            });
            // The whole response has been received. return the result.
            resp.on('end', () => {
                callback(data);
            });
        });

        req.on('error', function (e) {
            this._log(FILE_ID, 'HueAPI', `API ERROR = ${err.message}`);
        });
        // write data to request body
        if (state) {
            req.write('{ "on" : true }\n');
        } else {
            req.write('{ "on" : false }\n');
        }
        req.end();
    }
};

