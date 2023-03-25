import { Duplex } from 'node:stream';
import { Reader } from './reader';
import { BeginRequestBody, FCGIRecord, makeRecord, Role, Type } from './record';
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
}

export interface Request {
    id: number;
    sendParams(pairs: Pairs): void;
}

export function createClientWithStream(
    stream: Duplex,
    skipServerValues: boolean = true
): Client {
    const client = new ClientImpl(stream, true);
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
                    this.emit('error', err);
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

    handleRecord(record: FCGIRecord): void {
        switch (record.type) {
            case Type.FCGI_GET_VALUES_RESULT:
                this.emit(
                    'values',
                    this.recognizeServerValues(record.body as Pairs)
                );
                break;

            default:
                console.error('unhandled record', record);
                break;
        }
    }

    recognizeServerValues(pairs: Pairs): ServerValues {
        return {
            maxConns: parseInt(pairs.FCGI_MAX_CONNS ?? '1'),
            maxReqs: parseInt(pairs.FCGI_MAX_REQS ?? '1'),
            mpxsConns: !!parseInt(pairs.FCGI_MPXS_CONNS ?? '0'),
        };
    }

    issueRequestId(): number {
        return this.idBag.issue();
    }
}

class RequestImpl implements Request {
    client: ClientImpl;
    id: number;

    constructor(client: ClientImpl) {
        this.client = client;
        this.id = client.issueRequestId();
    }

    send(
        type: Type,
        body: Buffer | Pairs | BeginRequestBody | null = null
    ): void {
        const record = this.makeRecord(type, body);
        console.log('Request:send', record);
        this.client.writer.write(record);
    }

    makeRecord(
        type: Type,
        body: Buffer | Pairs | BeginRequestBody | null = null
    ): FCGIRecord {
        return makeRecord(type, this.id, body);
    }

    sendBegin(role: Role, keepConn: boolean): void {
        this.send(
            Type.FCGI_BEGIN_REQUEST,
            new BeginRequestBody(role, keepConn)
        );
    }

    sendParams(pairs: Pairs): void {
        this.send(Type.FCGI_PARAMS, pairs);
    }
}
