export class RemoteCdm {
    /**
     * @param {string} cdmType - 'PLAYREADY' or 'WIDEVINE'
     * @param {string} deviceType - Device type (e.g., 'CHROME')
     * @param {string} systemId - System ID
     * @param {number} securityLevel - Security level
     * @param {string} host - API host URL
     * @param {string} secret - API secret key
     * @param {string} deviceName - Device name
     */
    constructor(cdmType, deviceType, systemId, securityLevel, host, secret, deviceName) {
        if (!['PLAYREADY', 'WIDEVINE'].includes(cdmType)) {
            throw new Error('CDM type must be either PLAYREADY or WIDEVINE');
        }

        this.cdmType = cdmType;
        this.deviceType = deviceType;
        this.systemId = systemId;
        this.securityLevel = securityLevel;
        this.host = host;
        this.secret = secret;
        this.deviceName = deviceName;
        this._sessionHeaders = {
            "X-Secret-Key": secret,
            "Content-Type": "application/json"
        };
    }

    static fromObject(obj) {
        return new RemoteCdm(
            obj.cdmType || 'WIDEVINE', // Default to WIDEVINE for backward compatibility
            obj.device_type,
            obj.system_id,
            obj.security_level,
            obj.host,
            obj.secret,
            obj.device_name ?? obj.name
        );
    }

    getName() {
        const type = this.deviceType === "CHROME" ? "CHROME" : `L${this.securityLevel}`;
        return `[${this.cdmType}:${type}] ${this.host}/${this.deviceName} (${this.systemId})`;
    }

    async testConnection() {
        try {
            const response = await fetch(this.host, {
                method: 'HEAD',
                headers: this._sessionHeaders
            });

            if (response.status !== 200) {
                console.warn(`Could not test Remote API version [${response.status}]`);
            }

            if (this.cdmType === 'PLAYREADY') {
                const server = response.headers.get("Server");
                if (!server || !server.toLowerCase().includes("playready serve")) {
                    console.warn(`This Remote CDM API does not seem to be a playready serve API (${server}).`);
                }
            }
        } catch (error) {
            console.error("Error testing API connection:", error);
            throw error;
        }
    }

    async open() {
        const url = `${this.host}/${this.deviceName}/open`;
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this._sessionHeaders
            });

            console.log(`[RemoteCDM:${this.cdmType}]`, "OPEN", response.status);
            const responseJson = await response.json();

            if (response.status !== 200) {
                throw new Error(`Cannot Open CDM Session, ${responseJson.message} [${response.status}]`);
            }

            if (this.cdmType === 'PLAYREADY') {
                if (parseInt(responseJson.data.device.security_level) !== this.securityLevel) {
                    throw new Error("DeviceMismatch: The Security Level specified does not match the API response.");
                }
                return this._hexToBytes(responseJson.data.session_id);
            } else {
                // WIDEVINE
                return responseJson.data.session_id;
            }
        } catch (error) {
            console.error("Error opening CDM session:", error);
            throw error;
        }
    }

    async close(sessionId) {
        const sessionIdStr = this.cdmType === 'PLAYREADY' ? this._bytesToHex(sessionId) : sessionId;
        const url = `${this.host}/${this.deviceName}/close/${sessionIdStr}`;
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this._sessionHeaders
            });

            console.log(`[RemoteCDM:${this.cdmType}]`, "CLOSE", response.status);
            
            if (response.status !== 200) {
                const responseJson = await response.json();
                throw new Error(`Cannot Close CDM Session, ${responseJson.message} [${response.status}]`);
            }
        } catch (error) {
            console.error("Error closing CDM session:", error);
            throw error;
        }
    }

    async getLicenseChallenge(sessionId, initData, privacyMode = false) {
        const sessionIdStr = this.cdmType === 'PLAYREADY' ? this._bytesToHex(sessionId) : sessionId;
        let url, body;

        if (this.cdmType === 'PLAYREADY') {
            if (!initData) throw new Error("InvalidInitData: A wrm_header must be provided.");
            
            let wrmHeader;
            if (typeof initData === 'object' && initData.dumps) {
                wrmHeader = initData.dumps();
            } else if (typeof initData === 'string') {
                wrmHeader = initData;
            } else {
                throw new Error(`Expected WRMHeader to be a string or object with dumps method not ${typeof initData}`);
            }

            url = `${this.host}/${this.deviceName}/get_license_challenge`;
            body = {
                session_id: sessionIdStr,
                init_data: wrmHeader
            };
        } else {
            // WIDEVINE
            url = `${this.host}/${this.deviceName}/get_license_challenge/STREAMING`;
            body = {
                session_id: sessionIdStr,
                init_data: initData,
                privacy_mode: privacyMode
            };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this._sessionHeaders,
                body: JSON.stringify(body)
            });

            console.log(`[RemoteCDM:${this.cdmType}]`, "GET_LICENSE_CHALLENGE", response.status);
            const responseJson = await response.json();

            if (response.status !== 200) {
                throw new Error(`Cannot get Challenge, ${responseJson.message} [${response.status}]`);
            }

            return this.cdmType === 'PLAYREADY' 
                ? responseJson.data.challenge 
                : responseJson.data.challenge_b64;
        } catch (error) {
            console.error("Error getting license challenge:", error);
            throw error;
        }
    }

    async parseLicense(sessionId, licenseMessage) {
        if (!licenseMessage) {
            throw new Error("InvalidLicense: Cannot parse an empty license_message");
        }

        const sessionIdStr = this.cdmType === 'PLAYREADY' ? this._bytesToHex(sessionId) : sessionId;
        const url = `${this.host}/${this.deviceName}/parse_license`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this._sessionHeaders,
                body: JSON.stringify({
                    session_id: sessionIdStr,
                    license_message: licenseMessage
                })
            });

            console.log(`[RemoteCDM:${this.cdmType}]`, "PARSE_LICENSE", response.status);
            const responseJson = await response.json();

            if (response.status !== 200) {
                throw new Error(`Cannot parse License, ${responseJson.message} [${response.status}]`);
            }
        } catch (error) {
            console.error("Error parsing license:", error);
            throw error;
        }
    }

    async getKeys(sessionId, type = '') {
        const sessionIdStr = this.cdmType === 'PLAYREADY' ? this._bytesToHex(sessionId) : sessionId;
        const url = `${this.host}/${this.deviceName}/get_keys${type ? `/${type}` : ''}`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this._sessionHeaders,
                body: JSON.stringify({
                    session_id: sessionIdStr
                })
            });

            console.log(`[RemoteCDM:${this.cdmType}]`, "GET_KEYS", response.status);
            const responseJson = await response.json();

            if (response.status !== 200) {
                throw new Error(`Could not get Keys, ${responseJson.message} [${response.status}]`);
            }

            if (this.cdmType === 'PLAYREADY') {
                return responseJson.data.keys.map(key => ({
                    key_type: key.type,
                    key_id: this._kidToUuid(this._hexToBytes(key.key_id)),
                    key: this._hexToBytes(key.key),
                    cipher_type: key.cipher_type,
                    key_length: key.key_length
                }));
            } else {
                // WIDEVINE
                return responseJson.data.keys;
            }
        } catch (error) {
            console.error("Error getting keys:", error);
            throw error;
        }
    }

    // Utility methods
    _hexToBytes(hexString) {
        if (hexString.length % 2 !== 0) {
            throw new Error("Hex string must have an even length");
        }
        const bytes = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            const byte = parseInt(hexString.substr(i * 2, 2), 16);
            if (isNaN(byte)) {
                throw new Error("Invalid hex string");
            }
            bytes[i] = byte;
        }
        return bytes;
    }

    _bytesToHex(bytes) {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    _kidToUuid(kid) {
        if (kid.length !== 16) {
            throw new Error("KID must be 16 bytes long");
        }
        
        const hex = this._bytesToHex(kid);
        return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20)}`;
    }
}