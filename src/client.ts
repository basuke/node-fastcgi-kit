import { Duplex, Readable } from 'node:stream';
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
import { EventEmitter } from 'node:events';
import { Pairs } from './keyvalues';
import { MinBag, once } from './utils';

export interface ServerValues {
    maxConns: number;
    maxReqs: number;
    mpxsConns: boolean;
}

export interface Client extends EventEmitter {
    getServerValues(): Promise<ServerValues>;

    begin(): Request;
    begin(role: Role): Request;
    begin(keepConn: boolean): Request;
    begin(role: Role, keepConn: boolean): Request;

    getRequest(id: number): Request | undefined;

    on(event: 'ready', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
}

export interface Request extends EventEmitter {
    readonly id: number;
    readonly closed: boolean;

    params(pairs: Pairs): this;

    send(body: string): this;
    send(body: Buffer): this;
    send(stream: Readable): this;
    done(): this;

    on(event: 'stdout', listener: (buffer: Buffer) => void): this;
    on(event: 'stderr', listener: (error: string) => void): this;
    on(event: 'end', listener: () => void): this;
}

export function createClientWithStream(
    stream: Duplex,
    skipServerValues: boolean = true
): Client {
    const client = new ClientImpl(stream, skipServerValues);
    return client;
}

const valuesToGet = ['FCGI_MAX_CONNS', 'FCGI_MAX_REQS', 'FCGI_MPXS_CONNS'];

class ClientImpl extends EventEmitter implements Client {
    stream: Duplex;
    reader: Reader;
    writer: Writer;
    requests: Map<number, RequestImpl> = new Map();
    idBag: MinBag = new MinBag();
    maxConns: number = 1;
    maxReqs: number = 1;
    mpxsConns: boolean = false;

    constructor(stream: Duplex, skipServerValues: boolean = false) {
        super();

        this.stream = stream;

        this.reader = new Reader();
        this.stream.pipe(this.reader);
        this.reader.on('record', (record: FCGIRecord) =>
            this.handleRecord(record)
        );

        this.writer = createWriter(this.stream);

        if (skipServerValues) {
            setImmediate(() => this.emit('ready'));
        } else {
            this.getServerValues()
                .then((values: ServerValues) => {
                    this.maxConns = values.maxConns;
                    this.maxReqs = values.maxReqs;
                    this.mpxsConns = values.mpxsConns;

                    this.emit('ready');
                })
                .catch((err: any) => {
                    this.emitError(err);
                });
        }
    }

    send(record: FCGIRecord): void {
        this.writer.write(record);
    }

    async getServerValues(): Promise<ServerValues> {
        const valuesToAsk = valuesToGet.reduce((result: Pairs, name) => {
            result[name] = '';
            return result;
        }, {});
        const record = makeRecord(Type.FCGI_GET_VALUES, 0, valuesToAsk);
        this.send(record);

        return once<ServerValues>(this, 'values', 3000);
    }

    begin(arg1?: Role | boolean, arg2?: boolean): Request {
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

        const request = new RequestImpl(this);

        this.requests.set(request.id, request);
        request.sendBegin(role, keepConn);
        return request;
    }

    getRequest(id: number): RequestImpl | undefined {
        return this.requests.get(id);
    }

    endRequest(id: number): void {
        this.requests.delete(id);
        this.idBag.putBack(id);
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
                this.handleGetValuesResult(record.body as Pairs);
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

    handleGetValuesResult(body: Pairs | null) {
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
    id: number;
    closed: boolean = false;

    constructor(client: ClientImpl) {
        super();

        this.client = client;
        this.id = client.issueRequestId();
    }

    write(
        type: Type,
        body: Buffer | Pairs | BeginRequestBody | null = null
    ): this {
        const record = this.makeRecord(type, body);
        // console.log('Request:send', record);
        this.client.writer.write(record);
        return this;
    }

    makeRecord(
        type: Type,
        body: Buffer | Pairs | BeginRequestBody | null = null
    ): FCGIRecord {
        return makeRecord(type, this.id, body);
    }

    sendBegin(role: Role, keepConn: boolean): this {
        return this.write(
            Type.FCGI_BEGIN_REQUEST,
            new BeginRequestBody(role, keepConn)
        );
    }

    params(pairs: Pairs): this {
        return this.write(Type.FCGI_PARAMS, pairs);
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
        this.closed = true;
        this.client.endRequest(this.id);
        this.emit('end');
    }

    emitError(error: string | Error) {
        this.client.emit('error', error);
    }
}
