import { Duplex } from 'node:stream';
import { Params } from './params';
import dns from 'node:dns';
import path from 'node:path';
import { Request } from 'express';

export type SocketConnectOptions = {
    host: string;
    port: number;
    hosts?: string[];
};

export type IPCConnectOptions = {
    path: string;
};

export type UniversalConnectOptions = {
    address: string;
};

export type ConnectOptions = (
    | SocketConnectOptions
    | IPCConnectOptions
    | UniversalConnectOptions
) & {
    connector?: Connector;
    debug?: boolean;
};

export type Connector = (options: ConnectOptions) => Promise<Duplex>;

export type ServerOptions = {
    skipServerValues?: boolean;
    params?: Params;
};

export type ClientOptions = ConnectOptions & ServerOptions;

export type ParseAddressOptions = {
    ipv6?: boolean;
};

async function resolveHost(
    host: string,
    ipv6: boolean = false
): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const type = ipv6 ? 'AAAA' : 'A';
        dns.resolve(host, type, (err, addresses) => {
            if (err) reject(err);

            if (Array.isArray(addresses)) {
                resolve(addresses.map((host) => host as string));
            } else {
                reject(new Error('Invalid dns resole'));
            }
        });
    });
}

export async function parseConnectOptions(
    options: ConnectOptions,
    parseOptions: ParseAddressOptions = {}
): Promise<SocketConnectOptions | IPCConnectOptions> {
    if ('path' in options) return options;
    if ('host' in options) {
        const hosts = await resolveHost(options.host, parseOptions.ipv6);
        return {
            host: hosts[0],
            port: options.port,
            hosts,
        };
    }
    return parseAddress(
        (options as UniversalConnectOptions).address,
        parseOptions
    );
}

export async function parseAddress(
    address: string,
    options: ParseAddressOptions = {}
): Promise<SocketConnectOptions | IPCConnectOptions> {
    const [host, port] = address.split(':', 2);

    if (host === 'unit') {
        return {
            path: port,
        };
    } else {
        const hosts = await resolveHost(host, options.ipv6);
        return {
            host: hosts[0],
            port: parseInt(port),
            hosts,
        };
    }
}

export function scriptPathToParams(
    script: string,
    method: string,
    documentRoot: string
): Params {
    const scriptFile = path.isAbsolute(script)
        ? script
        : path.join(documentRoot, script);

    return {
        DOCUMENT_ROOT: documentRoot,
        REQUEST_METHOD: method,
        REQUEST_URI: scriptFile,
        QUERY_STRING: '',

        SCRIPT_NAME: scriptFile,
        SCRIPT_FILENAME: scriptFile,
    };
}

export function urlToParams(
    url: URL,
    method: string,
    documentRoot: string
): Params {
    const scriptFile = url.pathname;

    return {
        DOCUMENT_ROOT: documentRoot,
        REQUEST_METHOD: method,
        REQUEST_URI: url.toString(),
        QUERY_STRING: url.search.substring(1),

        SCRIPT_NAME: scriptFile,
        SCRIPT_FILENAME: path.join(documentRoot, scriptFile),
    };
}

export function requestToParams(req: Request, documentRoot: string): Params {
    const params = urlToParams(new URL(req.url), req.method, documentRoot);
    for (const header in req.headers) {
        const value = req.headers[header];
        if (value === undefined) continue;

        const name = header.toLowerCase().replaceAll('-', '_');
        params[name] = Array.isArray(value) ? value.join('\n') : value;
    }
    return params;
}
