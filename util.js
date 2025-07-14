import { WidevineDevice } from "./device.js";
import { RemoteCdm } from "./remote_cdm.js";

export class AsyncSyncStorage {
    static async setStorage(items) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.set(items, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError));
                } else {
                    resolve();
                }
            });
        });
    }

    static async getStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError));
                } else {
                    resolve(result);
                }
            });
        });
    }

    static async removeStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.remove(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError));
                } else {
                    resolve(result);
                }
            });
        });
    }
}

export class AsyncLocalStorage {
    static async setStorage(items) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(items, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError));
                } else {
                    resolve();
                }
            });
        });
    }

    static async getStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError));
                } else {
                    resolve(result);
                }
            });
        });
    }

    static async removeStorage(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError));
                } else {
                    resolve(result);
                }
            });
        });
    }
}

export class DeviceManager {
    static async saveWidevineDevice(name, value) {
        const result = await AsyncSyncStorage.getStorage(['devices']);
        const array = result.devices === undefined ? [] : result.devices;
        array.push(name);
        await AsyncSyncStorage.setStorage({ devices: array });
        await AsyncSyncStorage.setStorage({ [name]: value });
    }

    static async loadWidevineDevice(name) {
        const result = await AsyncSyncStorage.getStorage([name]);
        return result[name] || "";
    }

    static setWidevineDevice(name, value){
        const wvd_combobox = document.getElementById('wvd-combobox');
        const wvd_element = document.createElement('option');

        wvd_element.text = name;
        wvd_element.value = value;

        wvd_combobox.appendChild(wvd_element);
    }

    static async loadSetAllWidevineDevices() {
        const result = await AsyncSyncStorage.getStorage(['devices']);
        const array = result.devices || [];
        for (const item of array) {
            this.setWidevineDevice(item, await this.loadWidevineDevice(item));
        }
    }

    static async saveSelectedWidevineDevice(name) {
        await AsyncSyncStorage.setStorage({ selected: name });
    }

    static async getSelectedWidevineDevice() {
        const result = await AsyncSyncStorage.getStorage(["selected"]);
        return result["selected"] || "";
    }

    static async selectWidevineDevice(name) {
        document.getElementById('wvd-combobox').value = await this.loadWidevineDevice(name);
    }

    static async removeSelectedWidevineDevice() {
        const selected_device_name = await DeviceManager.getSelectedWidevineDevice();

        const result = await AsyncSyncStorage.getStorage(['devices']);
        const array = result.devices === undefined ? [] : result.devices;

        const index = array.indexOf(selected_device_name);
        if (index > -1) {
            array.splice(index, 1);
        }

        await AsyncSyncStorage.setStorage({ devices: array });
        await AsyncSyncStorage.removeStorage([selected_device_name]);
    }

    static async removeSelectedWidevineDeviceKey() {
        await AsyncSyncStorage.removeStorage(["selected"]);
    }
}

export class PRDeviceManager {
    static async savePlayreadyDevice(name, value) {
        const result = await AsyncSyncStorage.getStorage(['prDevices']);
        const array = result.prDevices === undefined ? [] : result.prDevices;
        array.push(name);
        await AsyncSyncStorage.setStorage({ prDevices: array });
        await AsyncSyncStorage.setStorage({ [name]: value });
    }

    static async loadPlayreadyDevice(name) {
        const result = await AsyncSyncStorage.getStorage([name]);
        return result[name] || "";
    }

    static setPlayreadyDevice(name, value){
        const prd_combobox = document.getElementById('prd-combobox');
        const prd_element = document.createElement('option');

        prd_element.text = name;
        prd_element.value = value;

        prd_combobox.appendChild(prd_element);
    }

    static async loadSetAllPlayreadyDevices() {
        const result = await AsyncSyncStorage.getStorage(['prDevices']);
        const array = result.prDevices || [];
        for (const item of array) {
            this.setPlayreadyDevice(item, await this.loadPlayreadyDevice(item));
        }
    }

    static async saveSelectedPlayreadyDevice(name) {
        await AsyncSyncStorage.setStorage({ prSelected: name });
    }

    static async getSelectedPlayreadyDevice() {
        const result = await AsyncSyncStorage.getStorage(["prSelected"]);
        return result["prSelected"] || "";
    }

    static async selectPlayreadyDevice(name) {
        document.getElementById('prd-combobox').value = await this.loadPlayreadyDevice(name);
    }

    static async removeSelectedPlayreadyDevice() {
        const selected_device_name = await PRDeviceManager.getSelectedPlayreadyDevice();

        const result = await AsyncSyncStorage.getStorage(['prDevices']);
        const array = result.prDevices === undefined ? [] : result.prDevices;

        const index = array.indexOf(selected_device_name);
        if (index > -1) {
            array.splice(index, 1);
        }

        await AsyncSyncStorage.setStorage({ prDevices: array });
        await AsyncSyncStorage.removeStorage([selected_device_name]);
    }

    static async removeSelectedPlayreadyDeviceKey() {
        await AsyncSyncStorage.removeStorage(["prSelected"]);
    }
}

export class RemoteCDMManager {
    static async saveRemoteCDM(name, obj) {
        const result = await AsyncSyncStorage.getStorage(['remote_cdms']);
        const array = result.remote_cdms === undefined ? [] : result.remote_cdms;
        array.push(name);
        await AsyncSyncStorage.setStorage({ remote_cdms: array });
        await AsyncSyncStorage.setStorage({ [name]: obj });
    }

    static async loadRemoteCDM(name) {
        const result = await AsyncSyncStorage.getStorage([name]);
        return JSON.stringify(result[name] || {});
    }

    static setRemoteCDM(name, value){
        const remote_combobox = document.getElementById('remote-combobox');
        const remote_element = document.createElement('option');

        remote_element.text = name;
        remote_element.value = value;

        remote_combobox.appendChild(remote_element);
    }

    static async loadSetAllRemoteCDMs() {
        const result = await AsyncSyncStorage.getStorage(['remote_cdms']);
        const array = result.remote_cdms || [];
        for (const item of array) {
            this.setRemoteCDM(item, await this.loadRemoteCDM(item));
        }
    }

    static async saveSelectedRemoteCDM(name) {
        await AsyncSyncStorage.setStorage({ selected_remote_cdm: name });
    }

    static async getSelectedRemoteCDM() {
        const result = await AsyncSyncStorage.getStorage(["selected_remote_cdm"]);
        return result["selected_remote_cdm"] || "";
    }

    static async selectRemoteCDM(name) {
        document.getElementById('remote-combobox').value = await this.loadRemoteCDM(name);
    }

    static async removeSelectedRemoteCDM() {
        const selected_remote_cdm_name = await RemoteCDMManager.getSelectedRemoteCDM();

        const result = await AsyncSyncStorage.getStorage(['remote_cdms']);
        const array = result.remote_cdms === undefined ? [] : result.remote_cdms;

        const index = array.indexOf(selected_remote_cdm_name);
        if (index > -1) {
            array.splice(index, 1);
        }

        await AsyncSyncStorage.setStorage({ remote_cdms: array });
        await AsyncSyncStorage.removeStorage([selected_remote_cdm_name]);
    }

    static async removeSelectedRemoteCDMKey() {
        await AsyncSyncStorage.removeStorage(["selected_remote_cdm"]);
    }
}

export class SettingsManager {
    static async setEnabled(enabled) {
        await AsyncSyncStorage.setStorage({ enabled: enabled });
        setIcon(`images/icon${enabled ? '' : '-disabled'}.png`);
    }

    static async getEnabled() {
        const result = await AsyncSyncStorage.getStorage(["enabled"]);
        return result["enabled"] === undefined ? true : result["enabled"];
    }

    static async setWVEnabled(wvEnabled) {
        await AsyncSyncStorage.setStorage({ wvEnabled: wvEnabled });
    }

    static async getWVEnabled(real) {
        const result = await AsyncSyncStorage.getStorage(["wvEnabled"]);
        const enabled = result["wvEnabled"] === undefined ? true : result["wvEnabled"];
        if (enabled) {
            if (real) {
                return true;
            }
            if (await SettingsManager.getSelectedDeviceType() === "WVD") {
                return !!await DeviceManager.getSelectedWidevineDevice()
            } else {
                return !!await RemoteCDMManager.getSelectedRemoteCDM();
            }
        }
        return false;
    }

    static async setPREnabled(prEnabled) {
        await AsyncSyncStorage.setStorage({ prEnabled: prEnabled });
    }

    static async getPREnabled(real) {
        const result = await AsyncSyncStorage.getStorage(["prEnabled"]);
        const enabled = result["prEnabled"] === undefined ? true : result["prEnabled"];
        if (enabled) {
            if (real) {
                return true;
            }
            return !!await PRDeviceManager.getSelectedPlayreadyDevice();
        }
        return false;
    }

    static downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    static async saveDarkMode(dark_mode) {
        await AsyncSyncStorage.setStorage({ dark_mode: dark_mode });
    }

    static async getDarkMode() {
        const result = await AsyncSyncStorage.getStorage(["dark_mode"]);
        return result["dark_mode"] || false;
    }

    static setDarkMode(dark_mode) {
        const toggle = document.getElementById('darkModeToggle');
        toggle.checked = dark_mode;
        document.body.classList.toggle('dark-mode', dark_mode);
    }

    static async importDevice(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function (loaded) {
                const result = loaded.target.result;

                const widevine_device = new WidevineDevice(result);
                const b64_device = uint8ArrayToBase64(new Uint8Array(result));
                const device_name = widevine_device.get_name();

                if (!await DeviceManager.loadWidevineDevice(device_name)) {
                    await DeviceManager.saveWidevineDevice(device_name, b64_device);
                }

                await DeviceManager.saveSelectedWidevineDevice(device_name);
                resolve();
            };
            reader.readAsArrayBuffer(file);
        });
    }

    static async loadRemoteCDM(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function (loaded) {
                const result = loaded.target.result;

                let json_file = void 0;
                try {
                    json_file = JSON.parse(result);
                } catch {
                    resolve();
                    return;
                }

                console.log("LOADED DEVICE:", json_file);
                const remote_cdm = new RemoteCdm(
                    json_file.device_type,
                    json_file.system_id,
                    json_file.security_level,
                    json_file.host,
                    json_file.secret,
                    json_file.device_name ?? json_file.name,

                );
                const device_name = remote_cdm.get_name();
                console.log("NAME:", device_name);

                if (await RemoteCDMManager.loadRemoteCDM(device_name) === "{}") {
                    await RemoteCDMManager.saveRemoteCDM(device_name, json_file);
                }

                await RemoteCDMManager.saveSelectedRemoteCDM(device_name);
                resolve();
            };
            reader.readAsText(file);
        });
    }
    
    static async importPRDevice(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function (loaded) {
                const result = loaded.target.result;

                const b64_device = uint8ArrayToBase64(new Uint8Array(result));
                const device_name = file.name.slice(0, -4);

                if (!await PRDeviceManager.loadPlayreadyDevice(device_name)) {
                    await PRDeviceManager.savePlayreadyDevice(device_name, b64_device);
                }

                await PRDeviceManager.saveSelectedPlayreadyDevice(device_name);
                resolve();
            };
            reader.readAsArrayBuffer(file);
        });
    }

    static async saveSelectedDeviceType(selected_type) {
        await AsyncSyncStorage.setStorage({ device_type: selected_type });
    }

    static async getSelectedDeviceType() {
        const result = await AsyncSyncStorage.getStorage(["device_type"]);
        return result["device_type"] || "WVD";
    }

    static setSelectedDeviceType(device_type) {
        switch (device_type) {
            case "WVD":
                const wvd_select = document.getElementById('wvd_select');
                wvd_select.checked = true;
                break;
            case "REMOTE":
                const remote_select = document.getElementById('remote_select');
                remote_select.checked = true;
                break;
        }
    }

    static async saveUseShakaPackager(use_shaka) {
        await AsyncSyncStorage.setStorage({ use_shaka: use_shaka });
    }

    static async getUseShakaPackager() {
        const result = await AsyncSyncStorage.getStorage(["use_shaka"]);
        return result["use_shaka"] ?? true;
    }

    static async saveExecutableName(exe_name) {
        await AsyncSyncStorage.setStorage({ exe_name: exe_name });
    }

    static async getExecutableName() {
        const result = await AsyncSyncStorage.getStorage(["exe_name"]);
        return result["exe_name"] ?? "N_m3u8DL-RE";
    }
}

export function intToUint8Array(num) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, num, false);
    return new Uint8Array(buffer);
}

export function compareUint8Arrays(arr1, arr2) {
    if (arr1.length !== arr2.length)
        return false;
    return Array.from(arr1).every((value, index) => value === arr2[index]);
}

export function uint8ArrayToHex(buffer) {
    return Array.prototype.map.call(buffer, x => x.toString(16).padStart(2, '0')).join('');
}

export function uint8ArrayToString(uint8array) {
    return String.fromCharCode.apply(null, uint8array)
}

export function uint8ArrayToBase64(uint8array) {
    return btoa(String.fromCharCode.apply(null, uint8array));
}

export function base64toUint8Array(base64_string){
    return Uint8Array.from(atob(base64_string), c => c.charCodeAt(0))
}

export function stringToUint8Array(string) {
    return Uint8Array.from(string.split("").map(x => x.charCodeAt()))
}

export function stringToHex(string){
    return string.split("").map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

// Some services send WV+PR concatenated PSSH to generateRequest
export function getWvPsshFromConcatPssh(psshBase64) {
    const raw = base64toUint8Array(psshBase64);

    // Detect PlayReady PSSH by presence of "WRMHEADER" in UTF-16LE
    const text = new TextDecoder('utf-16le').decode(raw);
    if (!text.includes('WRMHEADER')) {
        return psshBase64; // Keep as-is if PlayReady not mixed in
    }

    let offset = 0;
    while (offset + 8 <= raw.length) {
        const size = new DataView(raw.buffer, raw.byteOffset + offset).getUint32(0);
        if (size === 0 || offset + size > raw.length) break;

        const box = raw.slice(offset, offset + size);
        const boxType = String.fromCharCode(...box.slice(4, 8));
        const systemId = [...box.slice(12, 28)]
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        if (boxType === 'pssh' && systemId === 'edef8ba979d64acea3c827dcd51d21ed') {
            return uint8ArrayToBase64(box);
        }

        offset += size;
    }

    return psshBase64;
}

export function makeCkInitData(keys) {
    const systemId = new Uint8Array([
        0x10, 0x77, 0xef, 0xec,
        0xc0, 0xb2,
        0x4d, 0x02,
        0xac, 0xe3,
        0x3c, 0x1e, 0x52, 0xe2, 0xfb, 0x4b
    ]);

    const kidCount = keys.length;
    const kidDataLength = kidCount * 16;
    const dataSize = 0;

    const size = 4 + 4 + 4 + 16 + 4 + kidDataLength + 4 + dataSize;
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);

    let offset = 0;

    view.setUint32(offset, size); offset += 4;
    view.setUint32(offset, 0x70737368); offset += 4; // 'pssh'
    view.setUint8(offset++, 0x01); // version 1
    view.setUint8(offset++, 0x00); // flags (3 bytes)
    view.setUint8(offset++, 0x00);
    view.setUint8(offset++, 0x00);

    new Uint8Array(buffer, offset, 16).set(systemId); offset += 16;

    view.setUint32(offset, kidCount); offset += 4;

    for (const key of keys) {
        const kidBytes = hexToUint8Array(key.kid);
        if (kidBytes.length !== 16) throw new Error("Invalid KID length");
        new Uint8Array(buffer, offset, 16).set(kidBytes);
        offset += 16;
    }

    view.setUint32(offset, dataSize); offset += 4;

    return new Uint8Array(buffer);
}

export async function setIcon(filename, tabId = undefined) {
    const isMV3 = typeof chrome.action !== "undefined";
    if (!isMV3) {
        chrome.browserAction.setIcon({
            path: {
                128: filename
            },
            tabId
        });
        return;
    }

    const url = chrome.runtime.getURL(filename);
    const res = await fetch(url);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

    chrome.action.setIcon({
        imageData: {
            [bitmap.width]: imageData
        },
        ...(tabId ? { tabId } : {})
    });
}