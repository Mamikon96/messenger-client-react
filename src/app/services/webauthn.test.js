import {
    creationOptionsFromJSON,
    credentialToJSON,
    isPasskeySupported,
    requestOptionsFromJSON,
} from "./webauthn";

const bytes = (buffer) => Array.from(new Uint8Array(buffer));
const buf = (...values) => Uint8Array.from(values).buffer;

// 0xfb 0xff 0xbf в base64 — "+/+/", в base64url — "-_-_"; 0xff (один байт) — "/w==" → "_w"
const URL_SAFE = "-_-_";
const URL_SAFE_BYTES = [0xfb, 0xff, 0xbf];

const creationJSON = {
    rp: { id: "localhost", name: "Messenger" },
    user: { id: "_w", name: "ann", displayName: "Ann" },
    challenge: URL_SAFE,
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    excludeCredentials: [{ type: "public-key", id: "AQID", transports: ["internal"] }],
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    timeout: 60000,
};

const requestJSON = {
    challenge: URL_SAFE,
    rpId: "localhost",
    allowCredentials: [{ type: "public-key", id: "AQID" }],
    userVerification: "preferred",
};

describe("webauthn", () => {
    afterEach(() => {
        delete global.PublicKeyCredential;
    });

    describe("isPasskeySupported", () => {
        it("false без window.PublicKeyCredential", () => {
            expect(isPasskeySupported()).toBe(false);
        });

        it("true, если window.PublicKeyCredential есть", () => {
            global.PublicKeyCredential = function PublicKeyCredential() {};
            expect(isPasskeySupported()).toBe(true);
        });
    });

    describe("creationOptionsFromJSON без нативного метода", () => {
        it("декодирует challenge, user.id и excludeCredentials[].id из base64url, остальное не трогает", () => {
            const options = creationOptionsFromJSON(creationJSON);

            expect(bytes(options.challenge)).toEqual(URL_SAFE_BYTES);
            expect(bytes(options.user.id)).toEqual([0xff]);
            expect(options.user.name).toBe("ann");
            expect(options.user.displayName).toBe("Ann");
            expect(bytes(options.excludeCredentials[0].id)).toEqual([1, 2, 3]);
            expect(options.excludeCredentials[0].transports).toEqual(["internal"]);
            expect(options.rp).toEqual(creationJSON.rp);
            expect(options.pubKeyCredParams).toEqual(creationJSON.pubKeyCredParams);
            expect(options.authenticatorSelection).toEqual(creationJSON.authenticatorSelection);
            expect(options.timeout).toBe(60000);
        });

        it("без excludeCredentials даёт пустой список", () => {
            const { excludeCredentials, ...rest } = creationJSON;
            expect(creationOptionsFromJSON(rest).excludeCredentials).toEqual([]);
        });

        it("не меняет входной объект", () => {
            const copy = JSON.parse(JSON.stringify(creationJSON));
            creationOptionsFromJSON(creationJSON);
            expect(creationJSON).toEqual(copy);
        });
    });

    describe("requestOptionsFromJSON без нативного метода", () => {
        it("декодирует challenge и allowCredentials[].id, остальное не трогает", () => {
            const options = requestOptionsFromJSON(requestJSON);

            expect(bytes(options.challenge)).toEqual(URL_SAFE_BYTES);
            expect(bytes(options.allowCredentials[0].id)).toEqual([1, 2, 3]);
            expect(options.rpId).toBe("localhost");
            expect(options.userVerification).toBe("preferred");
        });

        it("без allowCredentials (discoverable-вход) даёт пустой список", () => {
            const { allowCredentials, ...rest } = requestJSON;
            expect(requestOptionsFromJSON(rest).allowCredentials).toEqual([]);
        });
    });

    describe("нативные parse*FromJSON", () => {
        it("используются, если браузер их поддерживает", () => {
            const parsedCreation = { native: "creation" };
            const parsedRequest = { native: "request" };
            global.PublicKeyCredential = {
                parseCreationOptionsFromJSON: jest.fn(() => parsedCreation),
                parseRequestOptionsFromJSON: jest.fn(() => parsedRequest),
            };

            expect(creationOptionsFromJSON(creationJSON)).toBe(parsedCreation);
            expect(global.PublicKeyCredential.parseCreationOptionsFromJSON).toHaveBeenCalledWith(creationJSON);
            expect(requestOptionsFromJSON(requestJSON)).toBe(parsedRequest);
            expect(global.PublicKeyCredential.parseRequestOptionsFromJSON).toHaveBeenCalledWith(requestJSON);
        });

        it("каждый проверяется отдельно: нет parseRequestOptionsFromJSON — запасной путь для входа", () => {
            global.PublicKeyCredential = { parseCreationOptionsFromJSON: jest.fn() };

            const options = requestOptionsFromJSON(requestJSON);

            expect(bytes(options.challenge)).toEqual(URL_SAFE_BYTES);
        });
    });

    describe("credentialToJSON", () => {
        it("использует нативный toJSON(), если он есть", () => {
            const json = { id: "x", native: true };
            const credential = { toJSON: jest.fn(() => json) };

            expect(credentialToJSON(credential)).toBe(json);
        });

        it("регистрация: base64url без padding, transports и clientExtensionResults", () => {
            const credential = {
                id: "AQID",
                rawId: buf(1, 2, 3),
                type: "public-key",
                authenticatorAttachment: "platform",
                getClientExtensionResults: () => ({ credProps: { rk: true } }),
                response: {
                    clientDataJSON: buf(0xfb, 0xff, 0xbf),
                    attestationObject: buf(0xff),
                    getTransports: () => ["internal", "hybrid"],
                },
            };

            expect(credentialToJSON(credential)).toEqual({
                id: "AQID",
                rawId: "AQID",
                type: "public-key",
                authenticatorAttachment: "platform",
                clientExtensionResults: { credProps: { rk: true } },
                response: {
                    clientDataJSON: URL_SAFE,
                    attestationObject: "_w",
                    transports: ["internal", "hybrid"],
                },
            });
        });

        it("регистрация без getTransports даёт пустой transports", () => {
            const credential = {
                id: "AQID",
                rawId: buf(1, 2, 3),
                type: "public-key",
                getClientExtensionResults: () => ({}),
                response: { clientDataJSON: buf(1), attestationObject: buf(2) },
            };

            const json = credentialToJSON(credential);

            expect(json.response.transports).toEqual([]);
            expect(json.clientExtensionResults).toEqual({});
            expect(json).not.toHaveProperty("authenticatorAttachment");
        });

        it("вход: authenticatorData, signature, userHandle и clientExtensionResults", () => {
            const credential = {
                id: "AQID",
                rawId: buf(1, 2, 3),
                type: "public-key",
                authenticatorAttachment: null,
                getClientExtensionResults: () => ({}),
                response: {
                    clientDataJSON: buf(0xff),
                    authenticatorData: buf(1, 2, 3),
                    signature: buf(0xfb, 0xff, 0xbf),
                    userHandle: buf(0xff),
                },
            };

            expect(credentialToJSON(credential)).toEqual({
                id: "AQID",
                rawId: "AQID",
                type: "public-key",
                clientExtensionResults: {},
                response: {
                    clientDataJSON: "_w",
                    authenticatorData: "AQID",
                    signature: URL_SAFE,
                    userHandle: "_w",
                },
            });
        });

        it("вход без userHandle даёт userHandle: null", () => {
            const credential = {
                id: "AQID",
                rawId: buf(1, 2, 3),
                type: "public-key",
                getClientExtensionResults: () => ({}),
                response: {
                    clientDataJSON: buf(1),
                    authenticatorData: buf(2),
                    signature: buf(3),
                    userHandle: null,
                },
            };

            expect(credentialToJSON(credential).response.userHandle).toBeNull();
        });

        it("кодирует большие буферы (без переполнения стека) и обратно декодирует их без потерь", () => {
            const big = new Uint8Array(200000).map((_, i) => i % 256);
            const credential = {
                id: "x",
                rawId: big.buffer,
                type: "public-key",
                getClientExtensionResults: () => ({}),
                response: { clientDataJSON: buf(1), attestationObject: big.buffer },
            };

            const json = credentialToJSON(credential);
            const roundTrip = requestOptionsFromJSON({ challenge: json.rawId });

            expect(json.rawId).not.toMatch(/[+/=]/);
            expect(bytes(roundTrip.challenge)).toEqual(Array.from(big));
        });
    });
});
