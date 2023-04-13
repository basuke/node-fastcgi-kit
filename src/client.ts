import { Duplex, Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createConnection, NetConnectOpts } from 'node:net';
import path from 'node:path';
import { Reader } from './reader';
import {
    BeginRequestBody,
    EndRequestBody,
    FCGIRecord,
    makeRecord,
    Role,
    Type,
} from './record';
import { createWriter, Writer } from './writer';
import { Params } from './keyvalues';
import { MinBag, once } from './utils';

export interface ServerValues {
    maxConns: number;
    maxReqs: number;
    mpxsConns: boolean;
}

export function createClient(options: ClientOptions): Client {
    const client = new ClientImpl(options);
    return client;
}

export interface Client extends EventEmitter {
    get(url: string): Promise<Response>;
    get(url: string, params: Params): Promise<Response>;
    // post(url: string, body: string | Buffer | Readable): Promise<Response>;
    // post(
    //     url: string,
    //     body: string | Buffer | Readable,
    //     params: Params
    // ): Promise<Response>;

    on(event: 'ready', listener: () => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;

    // low level interface

    getServerValues(): Promise<ServerValues>;

    begin(): Promise<Request>;
    begin(role: Role): Promise<Request>;
    begin(keepConn: boolean): Promise<Request>;
    begin(role: Role, keepConn: boolean): Promise<Request>;

    getRequest(id: number): Request | undefined;
}

export interface Request extends EventEmitter {
    readonly id: number;
    readonly closed: boolean;

    sendParams(params: Params): this;

    send(body: string): this;
    send(body: Buffer): this;
    send(stream: Readable): this;
    done(): this;

    on(event: 'stdout', listener: (buffer: Buffer) => void): this;
    on(event: 'stderr', listener: (error: string) => void): this;
    on(event: 'end', listener: (appStatus: number) => void): this;
}

export interface Response {
    statusCode: number;
    headers: Params;
    text: string;
    json(): any;
}

export type Connector = (options: ConnectOptions) => Promise<Duplex>;

export interface Connection extends EventEmitter {
    send(record: FCGIRecord): void;
    end(): void;

    on(event: 'connect', listener: () => void): this;
    on(event: 'record', listener: (record: FCGIRecord) => void): this;
    on(event: 'close', listener: (status: number) => void): this;
}

export type ConnectOptions = {
    host?: string;
    port?: number;
    connector?: Connector;
    debug?: boolean;
};

export type ServerOptions = {
    skipServerValues?: boolean;
    params?: Params;
};

export type ClientOptions = ConnectOptions & ServerOptions;

const valuesToGet = ['FCGI_MAX_CONNS', 'FCGI_MAX_REQS', 'FCGI_MPXS_CONNS'];

const defaultParams: Params = {
    REMOTE_ADDR: '127.0.0.1',
    GATEWAY_PROTOCOL: 'CGI/1.1',
    SERVER_SOFTWARE: 'fastcgi-kit; node/' + process.version,
    DOCUMENT_ROOT: __dirname,
};

class ConnectionImpl extends EventEmitter implements Connection {
    stream: Duplex;
    reader: Reader;
    writer: Writer;
    debug: boolean;

    constructor(stream: Duplex, debug: boolean) {
        super();

        this.stream = stream;
        this.debug = debug;

        this.reader = new Reader();
        this.stream.pipe(this.reader);
        this.reader.on('record', (record: FCGIRecord) => {
            if (this.debug) console.log('received:', record);
            this.emit('record', record);
        });

        stream.on('end', () => {
            if (this.debug) console.log('Stream ended');
            this.emit('end');
        });
        this.writer = createWriter(this.stream);
    }

    send(record: FCGIRecord): void {
        this.writer.write(record);
        if (this.debug) console.log('sent:', record);
    }

    end(): void {
        this.stream.end();
    }
}

function connectToHost(options: ConnectOptions): Promise<Duplex> {
    const opts: NetConnectOpts = {
        port: options.port ?? 9000,
        host: options.host ?? 'localhost',
    };

    return new Promise((resolve, reject) => {
        const conn = createConnection(opts);
        conn.once('connect', () => {
            conn.removeAllListeners();
            resolve(conn);
        });
        conn.once('error', reject);
    });
}

class ClientImpl extends EventEmitter implements Client {
    readonly options: ClientOptions;
    keptConnection: Connection | undefined;
    requests: Map<number, RequestImpl> = new Map();
    idBag: MinBag = new MinBag();
    maxConns = 1;
    maxReqs = 1;
    mpxsConns = false;

    constructor(options: ClientOptions) {
        super();

        this.options = options;

        if (this.options.skipServerValues) {
            setImmediate(() => this.emit('ready'));
        } else {
            this.getServerValues()
                .then((values: ServerValues) => {
                    this.maxConns = values.maxConns;
                    this.maxReqs = values.maxReqs;
                    this.mpxsConns = values.mpxsConns;

                    this.emit('ready');
                })
                .catch((err: Error) => {
                    this.emitError(err);
                });
        }
    }

    async connect(keepConn: boolean): Promise<Connection> {
        if (keepConn && this.keptConnection) return this.keptConnection;

        const { connector = connectToHost, debug = false } = this.options;
        const connection = new ConnectionImpl(
            await connector(this.options),
            debug
        );

        connection.on('record', (record: FCGIRecord) =>
            this.handleRecord(record)
        );

        if (keepConn) {
            this.keptConnection = connection;
        }

        return connection;
    }

    urlToParams(url: URL, method: string): Params {
        const documentRoot = this.options?.params?.DOCUMENT_ROOT ?? __dirname;
        const scriptFile = url.pathname;

        return {
            DOCUMENT_ROOT: documentRoot,
            REQUEST_METHOD: method,
            REQUEST_URI: url.toString(),
            QUERY_STRING: url.search.substring(1),

            PHP_SELF: scriptFile,
            SCRIPT_NAME: scriptFile,
            SCRIPT_FILENAME: path.join(documentRoot, scriptFile),
        };
    }

    async get(url: string, params: Params = {}): Promise<Response> {
        return new Promise(async (resolve, reject) => {
            const request = await this.begin();
            const result: Buffer[] = [];
            let error: string = '';

            request.on('stdout', (buffer: Buffer) => result.push(buffer));
            request.on('stderr', (line: string) => (error += line));

            request.on('end', (appStatus) => {
                if (appStatus) {
                    reject(new Error(error));
                } else {
                    resolve(new ResponseImpl(200, result));
                }
            });

            request.sendParams({
                ...(this.options.params ?? {}),
                ...this.urlToParams(new URL(url), 'GET'),
                ...params,
            });
            request.done();
        });
    }

    async getServerValues(): Promise<ServerValues> {
        const connection = await this.connect(
            this.keptConnection !== undefined
        );

        const valuesToAsk = valuesToGet.reduce((result: Params, name) => {
            result[name] = '';
            return result;
        }, {});
        const record = makeRecord(Type.FCGI_GET_VALUES, 0, valuesToAsk);
        connection.send(record);

        const values = await once<ServerValues>(this, 'values', 3000);
        if (values.mpxsConns && !this.keptConnection) {
            this.keptConnection = connection;
        }

        return values;
    }

    async begin(arg1?: Role | boolean, arg2?: boolean): Promise<Request> {
        const detectRole = (): Role => {
            if (arguments.length === 2) {
                if (typeof arg1 === 'boolean')
                    throw new TypeError('invalid role arguments');
                return arg1 as Role;
            }
            if (arguments.length === 1) {
                if (typeof arg1 !== 'boolean') return arg1 as Role;
            }
            return Role.Responder;
        };

        const detectKeepConn = (): boolean => {
            if (arguments.length === 2) {
                if (typeof arg2 !== 'boolean')
                    throw new TypeError('invalid keepConn arguments');
                return arg2;
            }
            if (arguments.length === 1) {
                if (typeof arg1 === 'boolean') return arg1;
            }
            return this.mpxsConns;
        };

        const role = detectRole();
        const keepConn = detectKeepConn();

        const request = new RequestImpl(
            this,
            await this.connect(this.mpxsConns),
            this.issueRequestId(),
            role,
            keepConn
        );

        request.sendBegin(role, keepConn);
        if (this.options.debug) {
            request.on('stdout', (buffer: Buffer) => {
                console.log(buffer);
                console.log(buffer.toString());
            });
            request.on('stderr', (err: string) => {
                console.error(err);
            });
        }

        this.requests.set(request.id, request);
        return request;
    }

    getRequest(id: number): RequestImpl | undefined {
        return this.requests.get(id);
    }

    endRequest(id: number): void {
        const request = this.getRequest(id);
        if (request) {
            this.requests.delete(id);
            this.idBag.putBack(id);
        }
    }

    handleRecord(record: FCGIRecord): void {
        if (record.requestId) {
            const request = this.getRequest(record.requestId);
            if (!request) {
                this.emitError(`Invalid request id: ${record.requestId}`);
                return;
            }
            request.handleRecord(record);
            return;
        }

        switch (record.type) {
            case Type.FCGI_GET_VALUES_RESULT:
                this.handleGetValuesResult(record.body as Params);
                break;

            default:
                console.error('Client: unhandled record', record);
                this.emitError(`Client: unhandled record: ${record.type}`);
                break;
        }
    }

    issueRequestId(): number {
        return this.idBag.issue();
    }

    handleGetValuesResult(body: Params | null) {
        if (body) {
            const values = {
                maxConns: parseInt(body.FCGI_MAX_CONNS ?? '1'),
                maxReqs: parseInt(body.FCGI_MAX_REQS ?? '1'),
                mpxsConns: !!parseInt(body.FCGI_MPXS_CONNS ?? '0'),
            };

            this.emit('values', values);
        }
    }

    emitError(error: string | Error) {
        if (typeof error === 'string') {
            error = new Error(error);
        }
        this.emit('error', error);
    }
}

class RequestImpl extends EventEmitter implements Request {
    client: ClientImpl;
    connection: Connection;
    id: number;
    closed = false;
    role: Role;
    keepConnection: boolean;

    constructor(
        client: ClientImpl,
        connection: Connection,
        id: number,
        role: Role,
        keepConnection: boolean
    ) {
        super();

        this.client = client;
        this.connection = connection;
        this.id = id;
        this.role = role;
        this.keepConnection = keepConnection;
    }

    write(
        type: Type,
        body: Buffer | Params | BeginRequestBody | null = null
    ): this {
        const record = this.makeRecord(type, body);
        this.connection.send(record);
        return this;
    }

    makeRecord(
        type: Type,
        body: Buffer | Params | BeginRequestBody | null = null
    ): FCGIRecord {
        return makeRecord(type, this.id, body);
    }

    sendBegin(role: Role, keepConn: boolean): this {
        return this.write(
            Type.FCGI_BEGIN_REQUEST,
            new BeginRequestBody(role, keepConn)
        );
    }

    sendParams(params: Params): this {
        return this.write(Type.FCGI_PARAMS, {
            ...defaultParams,
            ...params,
        });
    }

    send(arg: string | Buffer | Readable): this {
        if (typeof arg === 'string') {
            return this.sendBuffer(Buffer.from(arg));
        } else if (arg instanceof Buffer) {
            return this.sendBuffer(arg);
        } else {
            return this.sendFromStream(arg);
        }
    }

    handleRecord(record: FCGIRecord): void {
        switch (record.type) {
            case Type.FCGI_STDOUT:
            case Type.FCGI_STDERR:
                if (record.body) {
                    if (record.body instanceof Buffer) {
                        this.handleOutput(
                            record.body,
                            record.type === Type.FCGI_STDERR
                        );
                    } else {
                        this.emitError(
                            'Invalid body for FCGI_STDOUT|FCGI_STDERR'
                        );
                    }
                }
                break;

            case Type.FCGI_END_REQUEST:
                if (record.body instanceof EndRequestBody) {
                    this.handleEndRequest(record.body);
                } else {
                    this.emitError('Invalid body for FCGI_END_REQUEST');
                }
                break;
        }
    }

    sendBuffer(buffer: Buffer): this {
        return this.write(Type.FCGI_STDIN, buffer);
    }

    sendFromStream(stream: Readable): this {
        stream.on('data', (chunk: Buffer) => {
            if (typeof chunk === 'string') {
                chunk = Buffer.from(chunk);
            }
            this.sendBuffer(chunk);
        });
        return this;
    }

    done(): this {
        return this.write(Type.FCGI_STDIN);
    }

    handleOutput(buffer: Buffer, stderr: boolean) {
        this.emit(stderr ? 'stderr' : 'stdout', buffer);
    }

    handleEndRequest(body: EndRequestBody): void {
        this.client.endRequest(this.id);
        if (this.keepConnection) {
            this.emit('end', body.appStatus);
        } else {
            this.connection.once('end', () => this.emit('end', body.appStatus));
        }
        this.close();
    }

    close(): void {
        if (!this.keepConnection) {
            this.connection.end();
        }
        this.closed = true;
    }

    emitError(error: string | Error) {
        this.close();
        this.client.emit('error', error);
    }
}

class ResponseImpl implements Response {
    statusCode: number;
    headers: Params;
    text: string;

    constructor(statusCode: number, stdout: Buffer[]) {
        this.statusCode = statusCode ?? 200;

        const [headers, body] = Buffer.concat(stdout)
            .toString()
            .split('\r\n\r\n', 2);
        this.headers = headers.split('\r\n').reduce((params, line) => {
            const [name, value] = line.split(':', 2);
            params[name.trim().toLowerCase()] = value.trim();
            return params;
        }, {} as Params);
        this.text = body;
    }

    get body(): Buffer {
        return Buffer.from(this.text);
    }

    json(): any {
        return JSON.parse(this.text);
    }
}
