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

    return CBusAirZoneTempAccessory;
};

function CBusAirZoneTempAccessory(platform, accessoryData) {
    // initialize the parent
    CBusAccessory.call(this, platform, accessoryData);

    // TODO do we need to prime this?
    this.currentTemp = 20.0;
    this.zone = this.accessoryData.zone;

    setTimeout(() => {
        this.airApi(`zone/${this.zone}`, (resp) => {
            var temp = JSON.parse(resp).currentTemp;
            this._log(FILE_ID, 'init', `API Response Temp Zone ${this.zone} = ${temp}`);
            this.currentTemp = temp;
            this.service.getCharacteristic(Characteristic.CurrentTemperature).setValue(this.currentTemp, undefined, `event`);
        });

    }, 200);

    this.service = this.addService(new Service.TemperatureSensor(this.name));
    this.service.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getTemp.bind(this));
}

CBusAirZoneTempAccessory.prototype.getTemp = function (callback) {
    // get the level from the AirconAPI, then set the netId
    this.airApi(`zone/${this.zone}`, (resp) => {
        var temp = JSON.parse(resp).currentTemp;
        this._log(FILE_ID, 'getTemp', `API Response Temp Zone ${this.zone} = ${temp}`);
        this.currentTemp = temp;
        callback(false, this.currentTemp);
    });
};


CBusAirZoneTempAccessory.prototype.processClientData = function (err, message) {
    if (!err) {
        console.assert(typeof message.level !== `undefined`, `message.level must be defined`);
        const level = message.level;
        this._log(FILE_ID, 'processClientData', `processing level = ${level}`);
    }
};

CBusAirZoneTempAccessory.prototype._log = function (fileid, method, message) {
    var d = new Date();
    console.log(d.getSeconds() + '.' + d.getMilliseconds() + ' ' + method + ' - ' + message);
}

CBusAirZoneTempAccessory.prototype.airApi = function(method, callback) {
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

