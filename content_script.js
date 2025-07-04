function uint8ArrayToBase64(uint8array) {   
    return btoa(String.fromCharCode.apply(null, uint8array));
}

function uint8ArrayToString(uint8array) {
    return String.fromCharCode.apply(null, uint8array)
}

function base64toUint8Array(base64_string){
    return Uint8Array.from(atob(base64_string), c => c.charCodeAt(0))   
}

function compareUint8Arrays(arr1, arr2) {
    if (arr1.length !== arr2.length)
        return false;
    return Array.from(arr1).every((value, index) => value === arr2[index]);
}

function base64ToBase64Url(b64) {
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hexToBase64(hexstring) {
    return btoa(hexstring.match(/\w{2}/g).map(function(a) {
        return String.fromCharCode(parseInt(a, 16));
    }).join(""));
}

function hexToUint8Array(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0)
        throw new Error("Invalid hex string");

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

function generateClearKeyLicense(keys) {
    return JSON.stringify({
        keys: keys.map(({ k, kid }) => ({
            kty: "oct",
            alg: "A128KW",
            k: base64ToBase64Url(hexToBase64(k)),
            kid: base64ToBase64Url(hexToBase64(kid))
        })),
        type: "temporary"
    });
}

function makeCkInitData(keys) {
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

function emitAndWaitForResponse(type, data) {
    return new Promise((resolve) => {
        const requestId = Math.random().toString(16).substring(2, 9);
        const responseHandler = (event) => {
            const { detail } = event;
            if (detail.substring(0, 7) === requestId) {
                document.removeEventListener('responseReceived', responseHandler);
                resolve(detail.substring(7));
            }
        };
        document.addEventListener('responseReceived', responseHandler);
        const requestEvent = new CustomEvent('response', {
            detail: {
                type: type, 
                body: data,
                requestId: requestId,
            }
        });
        document.dispatchEvent(requestEvent);
    });
}

const fnproxy = (object, func) => new Proxy(object, { apply: func });
const proxy = (object, key, func) => Object.hasOwnProperty.call(object, key) && Object.defineProperty(object, key, {
    value: fnproxy(object[key], func)
});

function getEventListeners(type) {
    if (this == null) return [];
    const store = this[Symbol.for(getEventListeners)];
    if (store == null || store[type] == null) return [];
    return store[type];
}

class Evaluator {
    static isDASH(text) {
        return text.includes('<mpd') && text.includes('</mpd>');
    }

    static isHLS(text) {
        return text.includes('#extm3u');
    }

    static isHLSMaster(text) {
        return text.includes('#ext-x-stream-inf');
    }

    static isMSS(text) {
        return text.includes('<smoothstreamingmedia') && text.includes('</smoothstreamingmedia>');
    }

    static getManifestType(text) {
        const lower = text.toLowerCase();
        if (this.isDASH(lower)) {
            return "DASH";
        } else if (this.isHLS(lower)) {
            if (this.isHLSMaster(lower)) {
                return "HLS_MASTER";
            } else {
                return "HLS_PLAYLIST";
            }
        } else if (this.isMSS(lower)) {
            return "MSS";
        }
    }
}

function sanitizeConfigForClearKey(config) {
    const sanitizeCapabilities = (caps, fallbackType) => {
        if (!Array.isArray(caps) || caps.length === 0) {
            return [{
                contentType: fallbackType,
                robustness: ""
            }];
        }
        return caps.map(c => ({
            contentType: c.contentType,
            robustness: "" // ClearKey only works with empty robustness
        }));
    };

    return {
        initDataTypes: config.initDataTypes || ["cenc"],
        audioCapabilities: sanitizeCapabilities(config.audioCapabilities, "audio/mp4; codecs=\"mp4a.40.2\""),
        videoCapabilities: sanitizeCapabilities(config.videoCapabilities, "video/mp4; codecs=\"avc1.42E01E\""),
        distinctiveIdentifier: "not-allowed",
        persistentState: "optional",
        sessionTypes: ["temporary"]
    };
}

function hookKeySystem(interface) {
    const origKeySystemDescriptor = Object.getOwnPropertyDescriptor(interface.prototype, 'keySystem');
    const origKeySystemGetter = origKeySystemDescriptor?.get;

    if (typeof origKeySystemGetter !== 'undefined') {
        Object.defineProperty(interface.prototype, 'keySystem', {
            get() {
                if (this._emeShim?.origKeySystem) {
                    console.log("[Vineless] Shimmed keySystem");
                    return this._emeShim.origKeySystem;
                }
                return origKeySystemGetter.call(this);
            }
        });
    }
}

(async () => {
    const requestMediaKeySystemAccessUnaltered = navigator.requestMediaKeySystemAccess;

    if (typeof Navigator !== 'undefined') {
        proxy(Navigator.prototype, 'requestMediaKeySystemAccess', async (_target, _this, _args) => {
            console.log("[Vineless] requestMediaKeySystemAccess", _args);
            const enabledData = JSON.parse(await emitAndWaitForResponse("GET_ENABLED"));
            const origKeySystem = _args[0];
            if (enabledData &&
                (enabledData.wv && origKeySystem === "com.widevine.alpha") ||
                (enabledData.pr && origKeySystem.startsWith("com.microsoft.playready"))
            ) {
                _args[0] = "org.w3.clearkey";
                _args[1] = [sanitizeConfigForClearKey(_args[1])];
            }
            const systemAccess = await _target.apply(_this, _args);
            systemAccess._emeShim = {
                origKeySystem
            };
            console.log("[Vineless] requestMediaKeySystemAccess SUCCESS", systemAccess);
            return systemAccess;
        });
    }

    if (typeof MediaCapabilities !== 'undefined') {
        proxy(MediaCapabilities.prototype, 'decodingInfo', async (_target, _this, _args) => {
            const enabledData = JSON.parse(await emitAndWaitForResponse("GET_ENABLED"));
            const [config] = _args;
            const origKeySystem = config?.keySystemConfiguration?.keySystem;

            if (enabledData &&
                (enabledData.wv && origKeySystem === "com.widevine.alpha") ||
                (enabledData.pr && origKeySystem.startsWith("com.microsoft.playready"))
            ) {
                console.log("[Vineless] Intercepted decodingInfo for", origKeySystem);

                const ckConfig = structuredClone(config);
                ckConfig.keySystemConfiguration = sanitizeConfigForClearKey(ckConfig.keySystemConfiguration);
                ckConfig.keySystemConfiguration.keySystem = "org.w3.clearkey";

                try {
                    const ckResult = await _target.call(_this, ckConfig);

                    // Generate a real MediaKeySystemAccess to attach
                    const access = await requestMediaKeySystemAccessUnaltered.call(navigator, "org.w3.clearkey", [ckConfig.keySystemConfiguration]);

                    // Shim .keySystem and .getConfiguration()
                    access._emeShim = { origKeySystem };

                    // Optionally also patch `getConfiguration()` to reflect original input
                    const originalGetConfig = access.getConfiguration.bind(access);
                    access.getConfiguration = () => ({
                        ...originalGetConfig(),
                        videoCapabilities: config.keySystemConfiguration.videoCapabilities,
                        audioCapabilities: config.keySystemConfiguration.audioCapabilities,
                        sessionTypes: config.keySystemConfiguration.sessionTypes,
                        initDataTypes: config.keySystemConfiguration.initDataTypes
                    });

                    return {
                        ...ckResult,
                        supported: true,
                        smooth: true,
                        powerEfficient: true,
                        keySystemAccess: access
                    };
                } catch (e) {
                    console.warn("[Vineless] decodingInfo fallback failed:", e);
                    return {
                        supported: true,
                        smooth: true,
                        powerEfficient: false,
                        keySystemAccess: null
                    };
                }
            }

            return _target.apply(_this, _args);
        });
    }

    if (typeof HTMLMediaElement !== 'undefined') {
        proxy(HTMLMediaElement.prototype, 'setMediaKeys', async (_target, _this, _args) => {
            console.log("[Vineless] setMediaKeys", _args);
            const enabledData = JSON.parse(await emitAndWaitForResponse("GET_ENABLED"));
            const keys = _args[0];
            const keySystem = keys?._emeShim?.origKeySystem;
            if (!enabledData || !keys || !keySystem) {
                return await _target.apply(_this, _args);
            }
            if (keySystem === "com.widevine.alpha") {
                if (!enabledData.wv) {
                    return await _target.apply(_this, _args);
                }
            } else if (keySystem.startsWith("com.microsoft.playready")) {
                if (!enabledData.pr) {
                    return await _target.apply(_this, _args);
                }
            } else if (keySystem !== "org.w3.clearkey") {
                console.error("[Vineless] Unsupported keySystem!");
                return await _target.apply(_this, _args);
            }

            // Replace with our own ClearKey MediaKeys
            if (keys._ckConfig) {
                const ckAccess = await requestMediaKeySystemAccessUnaltered.call(navigator, 'org.w3.clearkey', [keys._ckConfig]);
                keys._ckKeys = await ckAccess.createMediaKeys();
                keys._ckKeys._emeShim = {
                    origMediaKeys: keys
                };

                console.log("[Vineless] Replaced mediaKeys with ClearKey one");

                return _target.call(_this, keys._ckKeys);
            }

            return _target.apply(_this, _args);
        });

        const origMediaKeysDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'mediaKeys');
        const origMediaKeysGetter = origMediaKeysDescriptor?.get;

        if (typeof origMediaKeysGetter !== 'undefined') {
            Object.defineProperty(HTMLMediaElement.prototype, 'mediaKeys', {
                get() {
                    const result = origMediaKeysGetter.call(this);
                    console.log(result);
                    if (result?._emeShim?.origMediaKeys) {
                        console.log("[Vineless] Shimmed HTMLMediaElement.mediaKeys");
                        return result._emeShim.origMediaKeys;
                    }
                    return result;
                }
            });
        }
    }

    if (typeof MediaKeySystemAccess !== 'undefined') {
        proxy(MediaKeySystemAccess.prototype, 'createMediaKeys', async (_target, _this, _args) => {
            console.log("[Vineless] createMediaKeys");

            const realKeys = _target.apply(_this, _args);
            realKeys.then(res => {
                const config = _this.getConfiguration();
                res._ckConfig = sanitizeConfigForClearKey(config);
                res._emeShim = _this._emeShim;
            });

            return realKeys;
        });

        hookKeySystem(MediaKeySystemAccess);
    }

    if (typeof MediaKeys !== 'undefined') {
        proxy(MediaKeys.prototype, 'createSession', (_target, _this, _args) => {
            console.log("[Vineless] createSession");
            const session = _target.apply(_this, _args);
            session._mediaKeys = _this;
            return session;
        });

        hookKeySystem(MediaKeys);
    }

    if (typeof MediaKeySession !== 'undefined') {
        proxy(MediaKeySession.prototype, 'generateRequest', async (_target, _this, _args) => {
            const enabledData = JSON.parse(await emitAndWaitForResponse("GET_ENABLED"));
            const keySystem = _this._mediaKeys?._emeShim?.origKeySystem;
            if (!enabledData || _this._ck || !keySystem) {
                return await _target.apply(_this, _args);
            }
            if (keySystem === "com.widevine.alpha") {
                if (!enabledData.wv) {
                    return await _target.apply(_this, _args);
                }
            } else if (keySystem.startsWith("com.microsoft.playready")) {
                if (!enabledData.pr) {
                    return await _target.apply(_this, _args);
                }
            } else if (keySystem !== "org.w3.clearkey") {
                console.error("[Vineless] Unsupported keySystem!");
                return await _target.apply(_this, _args);
            }

            console.log("[Vineless] generateRequest", _args);

            try {
                _this.sessionId = "vl-" + Math.random().toString(36);

                const base64Pssh = uint8ArrayToBase64(new Uint8Array(_args[1]));
                const data = keySystem.startsWith("com.microsoft.playready") ? `pr:${_this.sessionId}:${base64Pssh}` : base64Pssh;
                const challenge = await emitAndWaitForResponse("REQUEST", data);
                const challengeBytes = base64toUint8Array(challenge);

                const evt = new MediaKeyMessageEvent("message", {
                    message: challengeBytes.buffer,
                    messageType: "license-request"
                });
                _this.dispatchEvent(evt);
            } catch (e) {
                console.error("[Vineless] generateRequest FAILED,", e);
                throw e;
            }

            return;
        });
        proxy(MediaKeySession.prototype, 'update', async (_target, _this, _args) => {
            const enabledData = JSON.parse(await emitAndWaitForResponse("GET_ENABLED"));
            const keySystem = _this._mediaKeys?._emeShim?.origKeySystem;
            if (!enabledData || _this._ck || !keySystem) {
                return await _target.apply(_this, _args);
            }
            if (keySystem === "com.widevine.alpha") {
                if (!enabledData.wv) {
                    return await _target.apply(_this, _args);
                }
            } else if (keySystem.startsWith("com.microsoft.playready")) {
                if (!enabledData.pr) {
                    return await _target.apply(_this, _args);
                }
            } else if (keySystem !== "org.w3.clearkey") {
                console.error("[Vineless] Unsupported keySystem!");
                return await _target.apply(_this, _args);
            }

            const [response] = _args;
            console.log("[Vineless] update");
            const base64Response = uint8ArrayToBase64(new Uint8Array(response));
            const data = keySystem.startsWith("com.microsoft.playready") ? `pr:${_this.sessionId}:${base64Response}` : base64Response;
            const bgResponse = await emitAndWaitForResponse("RESPONSE", data);

            try {
                const parsed = JSON.parse(bgResponse);
                console.log(parsed, _this);
                if (parsed && _this._mediaKeys._ckKeys) {
                    const ckLicense = generateClearKeyLicense(parsed.keys);

                    const ckSession = _this._mediaKeys._ckKeys.createSession();
                    ckSession._ck = true;

                    try {
                        await ckSession.generateRequest('cenc', parsed.pssh);
                    } catch {
                        const pssh = makeCkInitData(parsed.keys);
                        await ckSession.generateRequest('cenc', pssh);
                    }

                    const encoder = new TextEncoder();
                    const encodedLicense = encoder.encode(ckLicense);
                    await ckSession.update(encodedLicense);

                    // DSNP Fix
                    const fakeKeyId = parsed.keys[0].kid;
                    const keyIdBuffer = base64toUint8Array(hexToBase64(fakeKeyId)).buffer;

                    Object.defineProperty(_this, "keyStatuses", {
                        value: new Map([[keyIdBuffer, "usable"]]),
                        writable: false
                    });

                    const keyStatusEvent = new Event("keystatuseschange");
                    _this.dispatchEvent(keyStatusEvent);

                    return;
                }
            } catch (e) {
                console.error("[Vineless] update FAILED,", e);
                // If parsing failed, fall through to original Widevine path
            }

            return await _target.apply(_this, _args);
        });
    }
})();

const originalFetch = window.fetch;
window.fetch = function() {
    return new Promise(async (resolve, reject) => {
        originalFetch.apply(this, arguments).then((response) => {
            if (response) {
                response.clone().text().then((text) => {
                    const manifest_type = Evaluator.getManifestType(text);
                    if (manifest_type) {
                        if (arguments.length === 1) {
                            emitAndWaitForResponse("MANIFEST", JSON.stringify({
                                "url": arguments[0].url,
                                "type": manifest_type,
                            }));
                        } else if (arguments.length === 2) {
                            emitAndWaitForResponse("MANIFEST", JSON.stringify({
                                "url": arguments[0],
                                "type": manifest_type,
                            }));
                        }
                    }
                    resolve(response);
                }).catch(() => {
                    resolve(response);
                })
            } else {
                resolve(response);
            }
        }).catch(() => {
            resolve();
        })
    })
}

const open = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url) {
    this._method = method;
    return open.apply(this, arguments);
};

const send = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(postData) {
    this.addEventListener('load', async function() {
        if (this._method === "GET") {
            let body = void 0;
            switch (this.responseType) {
                case "":
                case "text":
                    body = this.responseText ?? this.response;
                    break;
                case "json":
                    // TODO: untested
                    body = JSON.stringify(this.response);
                    break;
                case "arraybuffer":
                    // TODO: untested
                    if (this.response.byteLength) {
                        const response = new Uint8Array(this.response);
                        body = uint8ArrayToString(new Uint8Array([...response.slice(0, 2000), ...response.slice(-2000)]));
                    }
                    break;
                case "document":
                    // todo
                    break;
                case "blob":
                    body = await this.response.text();
                    break;
            }
            if (body) {
                const manifest_type = Evaluator.getManifestType(body);
                if (manifest_type) {
                    emitAndWaitForResponse("MANIFEST", JSON.stringify({
                        "url": this.responseURL,
                        "type": manifest_type,
                    }));
                }
            }
        }
    });
    return send.apply(this, arguments);
};
