// Перевод опций и ответов WebAuthn между JSON сервера (бинарные поля в base64url)
// и форматом navigator.credentials (FE-D30). Нативные методы браузера — где есть,
// иначе ручная конвертация (docs/client-passkeys-guide.md §4).

const CHUNK = 0x8000;

const toBase64url = (buffer) => {
    const view = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < view.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, view.subarray(i, i + CHUNK));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64url = (value) => {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)).buffer;
};

export function isPasskeySupported() {
    return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

const nativeParser = (name) => {
    const api = isPasskeySupported() ? window.PublicKeyCredential : null;
    return api && typeof api[name] === "function" ? api[name].bind(api) : null;
};

const decodeCredentialIds = (list) => (list || []).map((c) => ({ ...c, id: fromBase64url(c.id) }));

export function creationOptionsFromJSON(options) {
    const parse = nativeParser("parseCreationOptionsFromJSON");
    if (parse) return parse(options);
    return {
        ...options,
        challenge: fromBase64url(options.challenge),
        user: { ...options.user, id: fromBase64url(options.user.id) },
        excludeCredentials: decodeCredentialIds(options.excludeCredentials),
    };
}

export function requestOptionsFromJSON(options) {
    const parse = nativeParser("parseRequestOptionsFromJSON");
    if (parse) return parse(options);
    return {
        ...options,
        challenge: fromBase64url(options.challenge),
        allowCredentials: decodeCredentialIds(options.allowCredentials),
    };
}

export function credentialToJSON(credential) {
    if (typeof credential.toJSON === "function") return credential.toJSON();
    const r = credential.response;
    const base = {
        id: credential.id,
        rawId: toBase64url(credential.rawId),
        type: credential.type,
        // сервер отклоняет credential без clientExtensionResults (400 validation_failed)
        clientExtensionResults: credential.getClientExtensionResults(),
    };
    if (credential.authenticatorAttachment) base.authenticatorAttachment = credential.authenticatorAttachment;
    if (r.attestationObject) {
        return {
            ...base,
            response: {
                clientDataJSON: toBase64url(r.clientDataJSON),
                attestationObject: toBase64url(r.attestationObject),
                transports: typeof r.getTransports === "function" ? r.getTransports() : [],
            },
        };
    }
    return {
        ...base,
        response: {
            clientDataJSON: toBase64url(r.clientDataJSON),
            authenticatorData: toBase64url(r.authenticatorData),
            signature: toBase64url(r.signature),
            userHandle: r.userHandle ? toBase64url(r.userHandle) : null,
        },
    };
}
