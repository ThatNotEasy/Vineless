import "./protobuf.min.js";
import "./license_protocol.js";
import "./forge.min.js";

import { Session } from "./license.js";
import {
    DeviceManager,
    base64toUint8Array,
    uint8ArrayToBase64,
    uint8ArrayToHex,
    getWvPsshFromConcatPssh,
    makeCkInitData,
    setIcon,
    SettingsManager,
    AsyncLocalStorage,
    RemoteCDMManager,
    PRDeviceManager
} from "./util.js";
import { WidevineDevice } from "./device.js";
import { RemoteCdm } from "./remote_cdm.js";

const { LicenseType, SignedMessage, LicenseRequest, License } = protobuf.roots.default.license_protocol;

import { Cdm } from './jsplayready/cdm.js';
import { Device } from "./jsplayready/device.js";
import { Utils } from "./jsplayready/utils.js";
import { utils } from "./jsplayready/noble-curves.min.js";

let manifests = new Map();
let requests = new Map();
let sessions = new Map();
let sessionCnt = {};
let logs = [];

chrome.webRequest.onBeforeSendHeaders.addListener(
    function(details) {
        if (details.method === "GET") {
            if (!requests.has(details.url)) {
                const headers = details.requestHeaders
                    .filter(item => !(
                        item.name.startsWith('sec-ch-ua') ||
                        item.name.startsWith('Sec-Fetch') ||
                        item.name.startsWith('Accept-') ||
                        item.name.startsWith('Host') ||
                        item.name === "Connection"
                    )).reduce((acc, item) => {
                        acc[item.name] = item.value;
                        return acc;
                    }, {});
                console.debug(headers);
                requests.set(details.url, headers);
            }
        }
    },
    {urls: ["<all_urls>"]},
    ['requestHeaders', chrome.webRequest.OnSendHeadersOptions.EXTRA_HEADERS].filter(Boolean)
);

async function parseClearKey(body, sendResponse, tab_url) {
    const clearkey = JSON.parse(atob(body));

    const formatted_keys = clearkey["keys"].map(key => ({
        ...key,
        kid: uint8ArrayToHex(base64toUint8Array(key.kid.replace(/-/g, "+").replace(/_/g, "/") + "==")),
        k: uint8ArrayToHex(base64toUint8Array(key.k.replace(/-/g, "+").replace(/_/g, "/") + "=="))
    }));
    const pssh_data = btoa(JSON.stringify({kids: clearkey["keys"].map(key => key.k)}));

    console.log("[Vineless]", "CLEARKEY KEYS", formatted_keys, tab_url);
    const log = {
        type: "CLEARKEY",
        pssh_data: pssh_data,
        keys: formatted_keys,
        url: tab_url,
        timestamp: Math.floor(Date.now() / 1000),
        manifests: manifests.has(tab_url) ? manifests.get(tab_url) : []
    }
    logs.push(log);

    await AsyncLocalStorage.setStorage({[pssh_data]: log});
    sendResponse(JSON.stringify({pssh: pssh_data, keys : formatted_keys}));
}

async function generateChallenge(body, sendResponse) {
    const pssh_data = getWvPsshFromConcatPssh(body);

    if (!pssh_data) {
        console.log("[Vineless]", "NO_PSSH_DATA_IN_CHALLENGE");
        sendResponse(body);
        return;
    }

    const selected_device_name = await DeviceManager.getSelectedWidevineDevice();
    if (!selected_device_name) {
        sendResponse(body);
        return;
    }

    const device_b64 = await DeviceManager.loadWidevineDevice(selected_device_name);
    const widevine_device = new WidevineDevice(base64toUint8Array(device_b64).buffer);

    const private_key = `-----BEGIN RSA PRIVATE KEY-----${uint8ArrayToBase64(widevine_device.private_key)}-----END RSA PRIVATE KEY-----`;
    const session = new Session(
        {
            privateKey: private_key,
            identifierBlob: widevine_device.client_id_bytes
        },
        pssh_data
    );

    const [challenge, request_id] = session.createLicenseRequest(LicenseType.STREAMING, widevine_device.type === 2);
    sessions.set(uint8ArrayToBase64(request_id), session);

    sendResponse(uint8ArrayToBase64(challenge));
}

async function parseLicense(body, sendResponse, tab_url) {
    const license = base64toUint8Array(body);
    const signed_license_message = SignedMessage.decode(license);

    if (signed_license_message.type !== SignedMessage.MessageType.LICENSE) {
        console.log("[Vineless]", "INVALID_MESSAGE_TYPE", signed_license_message.type.toString());
        sendResponse(body);
        return;
    }

    const license_obj = License.decode(signed_license_message.msg);
    const loaded_request_id = uint8ArrayToBase64(license_obj.id.requestId);

    if (!sessions.has(loaded_request_id)) {
        sendResponse(body);
        return;
    }

    const loadedSession = sessions.get(loaded_request_id);
    const keys = await loadedSession.parseLicense(license);
    const pssh = loadedSession.getPSSH();

    console.log("[Vineless]", "KEYS", JSON.stringify(keys), tab_url);
    const log = {
        type: "WIDEVINE",
        pssh_data: pssh,
        keys: keys,
        url: tab_url,
        timestamp: Math.floor(Date.now() / 1000),
        manifests: manifests.has(tab_url) ? manifests.get(tab_url) : []
    }
    logs.push(log);
    await AsyncLocalStorage.setStorage({[pssh]: log});

    sessions.delete(loaded_request_id);
    sendResponse(JSON.stringify({pssh, keys}));
}

async function generateChallengeRemote(body, sendResponse) {
    const pssh_data = getWvPsshFromConcatPssh(body);

    if (!pssh_data) {
        console.log("[Vineless]", "NO_PSSH_DATA_IN_CHALLENGE");
        sendResponse(body);
        return;
    }

    const pssh = Session.psshDataToPsshBoxB64(pssh_data);

    const selected_remote_cdm_name = await RemoteCDMManager.getSelectedRemoteCDM();
    if (!selected_remote_cdm_name) {
        sendResponse(body);
        return;
    }

    const selected_remote_cdm = JSON.parse(await RemoteCDMManager.loadRemoteCDM(selected_remote_cdm_name));
    const remote_cdm = RemoteCdm.from_object(selected_remote_cdm);

    const session_id = await remote_cdm.open();
    const challenge_b64 = await remote_cdm.get_license_challenge(session_id, pssh, true);

    const signed_challenge_message = SignedMessage.decode(base64toUint8Array(challenge_b64));
    const challenge_message = LicenseRequest.decode(signed_challenge_message.msg);

    sessions.set(uint8ArrayToBase64(challenge_message.contentId.widevinePsshData.requestId), {
        id: session_id,
        pssh: pssh
    });
    sendResponse(challenge_b64);
}

async function parseLicenseRemote(body, sendResponse, tab_url) {
    const license = base64toUint8Array(body);
    const signed_license_message = SignedMessage.decode(license);

    if (signed_license_message.type !== SignedMessage.MessageType.LICENSE) {
        console.log("[Vineless]", "INVALID_MESSAGE_TYPE", signed_license_message.type.toString());
        sendResponse();
        return;
    }

    const license_obj = License.decode(signed_license_message.msg);
    const loaded_request_id = uint8ArrayToBase64(license_obj.id.requestId);

    if (!sessions.has(loaded_request_id)) {
        sendResponse(body);
        return;
    }

    const session_id = sessions.get(loaded_request_id);

    const selected_remote_cdm_name = await RemoteCDMManager.getSelectedRemoteCDM();
    if (!selected_remote_cdm_name) {
        sendResponse(body);
        return;
    }

    const selected_remote_cdm = JSON.parse(await RemoteCDMManager.loadRemoteCDM(selected_remote_cdm_name));
    const remote_cdm = RemoteCdm.from_object(selected_remote_cdm);

    await remote_cdm.parse_license(session_id.id, body);
    const returned_keys = await remote_cdm.get_keys(session_id.id, "CONTENT");
    await remote_cdm.close(session_id.id);

    if (returned_keys.length === 0) {
        sendResponse(body);
        return;
    }

    const keys = returned_keys.map(({ key, key_id }) => ({ k: key, kid: key_id }));

    console.log("[Vineless]", "KEYS", JSON.stringify(keys), tab_url);
    const log = {
        type: "WIDEVINE",
        pssh_data: session_id.pssh,
        keys: keys,
        url: tab_url,
        timestamp: Math.floor(Date.now() / 1000),
        manifests: manifests.has(tab_url) ? manifests.get(tab_url) : []
    }
    logs.push(log);
    await AsyncLocalStorage.setStorage({[session_id.pssh]: log});

    sessions.delete(loaded_request_id);
    sendResponse(JSON.stringify({pssh, keys}));
}

async function generatePRChallenge(body, sendResponse, sessionId) {
    const selected_device_name = await PRDeviceManager.getSelectedPlayreadyDevice();
    if (!selected_device_name) {
        sendResponse(body);
        return;
    }

    const device_b64 = await PRDeviceManager.loadPlayreadyDevice(selected_device_name);
    const playready_device = new Device(Utils.base64ToBytes(device_b64));
    const cdm = Cdm.fromDevice(playready_device);

    const challengeData = base64toUint8Array(body);
    const challenge = new TextDecoder("utf-16le").decode(challengeData);

    /*
    * arbitrary data could be formatted in a special way and parsing it with the spec-compliant xmldom could remove
    * required end tags (e.g. '</KID>')
    * */
    const wrmHeader = challenge.match(/<WRMHEADER.*?WRMHEADER>/gm)[0];
    const version = "10.0.16384.10011";

    const licenseChallenge = cdm.getLicenseChallenge(wrmHeader, "", version);
    const newChallenge = btoa(licenseChallenge);
    console.log("[Vineless]", "REPLACING", challenge, licenseChallenge, sessionId);

    const newXmlDoc = `<PlayReadyKeyMessage type="LicenseAcquisition">
        <LicenseAcquisition Version="1">
            <Challenge encoding="base64encoded">${newChallenge}</Challenge>
            <HttpHeaders>
                <HttpHeader>
                    <name>Content-Type</name>
                    <value>text/xml; charset=utf-8</value>
                </HttpHeader>
                <HttpHeader>
                    <name>SOAPAction</name>
                    <value>"http://schemas.microsoft.com/DRM/2007/03/protocols/AcquireLicense"</value>
                </HttpHeader>
            </HttpHeaders>
        </LicenseAcquisition>
    </PlayReadyKeyMessage>`.replace(/  |\n/g, '');

    const utf8KeyMessage = new TextEncoder().encode(newXmlDoc);
    const newKeyMessage = new Uint8Array(utf8KeyMessage.length * 2);

    for (let i = 0; i < utf8KeyMessage.length; i++) {
        newKeyMessage[i * 2] = utf8KeyMessage[i];
        newKeyMessage[i * 2 + 1] = 0;
    }

    sessions.set(sessionId, wrmHeader);
    sendResponse(uint8ArrayToBase64(newKeyMessage));
}

async function parsePRLicense(decodedLicense, sendResponse, sessionId, tab_url) {
    if (!sessions.has(sessionId)) {
        sendResponse(btoa(decodedLicense));
        return;
    }

    const selected_device_name = await PRDeviceManager.getSelectedPlayreadyDevice();
    if (!selected_device_name) {
        sendResponse(btoa(decodedLicense));
        return;
    }

    const device_b64 = await PRDeviceManager.loadPlayreadyDevice(selected_device_name);
    const playready_device = new Device(Utils.base64ToBytes(device_b64));
    const cdm = Cdm.fromDevice(playready_device);

    const returned_keys = cdm.parseLicense(decodedLicense);
    const keys = returned_keys.map(key => ({ k: utils.bytesToHex(key.key), kid: utils.bytesToHex(key.key_id) }));

    const wrmHeader = sessions.get(sessionId);
    console.log("[Vineless]", "KEYS", JSON.stringify(keys), sessionId);

    const log = {
        type: "PLAYREADY",
        wrm_header: wrmHeader,
        keys: keys,
        url: tab_url,
        timestamp: Math.floor(Date.now() / 1000),
        manifests: manifests.has(tab_url) ? manifests.get(tab_url) : []
    }
    logs.push(log);
    await AsyncLocalStorage.setStorage({[wrmHeader]: log});

    sendResponse(JSON.stringify({pssh: wrmHeader, keys}));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        const tab_url = sender.tab ? sender.tab.url : null;
        console.log(message.type, message.body);

        switch (message.type) {
            case "REQUEST":
                if (!await SettingsManager.getEnabled()) {
                    sendResponse();
                    manifests.clear();
                    return;
                }

                if (!sessionCnt[sender.tab.id]) {
                    sessionCnt[sender.tab.id] = 1;
                    setIcon("images/icon-active.png", sender.tab.id);
                } else {
                    sessionCnt[sender.tab.id]++;
                }

                try {
                    JSON.parse(atob(message.body));
                    sendResponse(message.body);
                    return;
                } catch {
                    if (message.body) {
                        if (message.body.startsWith("lookup:")) {
                            const split = message.body.split(":");
                            // Find first log that contains the requested KID
                            const log = logs.find(log =>
                                log.keys.some(k => k.kid.toLowerCase() === split[2].toLowerCase())
                            );
                            if (!log) {
                                console.warn("[Vineless] Lookup failed: no log found for KID", kidHex);
                                sendResponse();
                                return;
                            }
                            switch (log.type) {
                                case "CLEARKEY": // UNTESTED
                                    const ckInitData = makeCkInitData(log.keys);
                                    sendResponse(uint8ArrayToBase64(ckInitData));
                                    break;
                                case "WIDEVINE":
                                    const device_type = await SettingsManager.getSelectedDeviceType();
                                    switch (device_type) {
                                        case "WVD":
                                            await generateChallenge(log.pssh_data, sendResponse);
                                            break;
                                        case "REMOTE":
                                            await generateChallengeRemote(log.pssh_data, sendResponse);
                                            break;
                                    }
                                    break;
                                case "PLAYREADY": // UNTESTED
                                    await generatePRChallenge(log.pssh_data, sendResponse, split[1]);
                                    break;
                            }
                        } else if (message.body.startsWith("pr:")) {
                            if (!await SettingsManager.getPREnabled()) {
                                sendResponse();
                                manifests.clear();
                                return;
                            }
                            const split = message.body.split(':');
                            await generatePRChallenge(split[2], sendResponse, split[1]);
                        } else {
                            if (!await SettingsManager.getWVEnabled()) {
                                sendResponse();
                                manifests.clear();
                                return;
                            }
                            const device_type = await SettingsManager.getSelectedDeviceType();
                            switch (device_type) {
                                case "WVD":
                                    await generateChallenge(message.body, sendResponse);
                                    break;
                                case "REMOTE":
                                    await generateChallengeRemote(message.body, sendResponse);
                                    break;
                            }
                        }
                    }
                }
                break;

            case "RESPONSE":
                if (!await SettingsManager.getEnabled()) {
                    sendResponse(message.body);
                    manifests.clear();
                    return;
                }

                try {
                    await parseClearKey(message.body, sendResponse, tab_url);
                    return;
                } catch (e) {
                    if (message.body.startsWith("pr:")) {
                        if (!await SettingsManager.getPREnabled()) {
                            sendResponse();
                            manifests.clear();
                            return;
                        }
                        const split = message.body.split(':');
                        const decodedLicense = atob(split[2]);
                        await parsePRLicense(decodedLicense, sendResponse, split[1], tab_url);
                    } else {
                            if (!await SettingsManager.getWVEnabled()) {
                                sendResponse();
                                manifests.clear();
                                return;
                            }
                            const device_type = await SettingsManager.getSelectedDeviceType();
                            switch (device_type) {
                                case "WVD":
                                    await parseLicense(message.body, sendResponse, tab_url);
                                    break;
                                case "REMOTE":
                                    await parseLicenseRemote(message.body, sendResponse, tab_url);
                                    break;
                            }
                    }
                    return;
                }
            case "CLOSE":
                if (sessionCnt[sender.tab.id]) {
                    if (--sessionCnt[sender.tab.id] === 0) {
                        setIcon("images/icon.png", sender.tab.id);
                    }
                }
                break;
            case "GET_ENABLED":
                if (await SettingsManager.getEnabled()) {
                    sendResponse(JSON.stringify({
                        wv: await SettingsManager.getWVEnabled(),
                        pr: await SettingsManager.getPREnabled()
                    }));
                } else {
                    sendResponse(false);
                }
                break;
            case "GET_LOGS":
                sendResponse(logs);
                break;
            case "OPEN_PICKER_WVD":
                chrome.windows.create({
                    url: 'picker/wvd/filePicker.html',
                    type: 'popup',
                    width: 300,
                    height: 200,
                });
                break;
            case "OPEN_PICKER_REMOTE":
                chrome.windows.create({
                    url: 'picker/remote/filePicker.html',
                    type: 'popup',
                    width: 300,
                    height: 200,
                });
                break;
            case "OPEN_PICKER_PRD":
                chrome.windows.create({
                    url: 'picker/prd/filePicker.html',
                    type: 'popup',
                    width: 300,
                    height: 200,
                });
                break;
            case "CLEAR":
                logs = [];
                manifests.clear()
                break;
            case "MANIFEST":
                const parsed = JSON.parse(message.body);
                const element = {
                    type: parsed.type,
                    url: parsed.url,
                    headers: requests.has(parsed.url) ? requests.get(parsed.url) : [],
                };

                if (!manifests.has(tab_url)) {
                    manifests.set(tab_url, [element]);
                } else {
                    let elements = manifests.get(tab_url);
                    if (!elements.some(e => e.url === parsed.url)) {
                        elements.push(element);
                        manifests.set(tab_url, elements);
                    }
                }
                sendResponse();
        }
    })();
    return true;
});

chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) { // main frame only
        delete sessionCnt[details.tabId];
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    delete sessionCnt[tabId];
});

(async () => {
    if (!await SettingsManager.getEnabled()) {
        setIcon("images/icon-disabled.png");
    }
})();