import { Duplex } from 'node:stream';
import { Reader } from './reader';
import { FCGIRecord, makeRecord, Type } from './record';
import { createWriter, Writer } from './writer';
import { EventEmitter } from 'node:events';
import { Pairs } from './keyvalues';
import { once } from './utils';

export interface ServerValues {
    maxConns: number;
    maxReqs: number;
    mpxsConns: boolean;
}

interface Client {
    getServerValues(): Promise<ServerValues>;
}

export function createClientWithStream(stream: Duplex): Client {
    const client = new ClientImpl(stream);
    return client;
}

const valuesToGet = ['FCGI_MAX_CONNS', 'FCGI_MAX_REQS', 'FCGI_MPXS_CONNS'];

class ClientImpl extends EventEmitter implements Client {
    stream: Duplex;
    reader: Reader;
    writer: Writer;

    constructor(stream: Duplex) {
        super();

        this.stream = stream;

        this.reader = new Reader();
        this.stream.pipe(this.reader);
        this.reader.on('record', (record: FCGIRecord) =>
            this.handleRecord(record)
        );

        this.writer = createWriter(this.stream);
    }

    async getServerValues(): Promise<ServerValues> {
        const valuesToAsk = valuesToGet.reduce((result: Pairs, name) => {
            result[name] = '';
            return result;
        }, {});
        const record = makeRecord(Type.FCGI_GET_VALUES, 0, valuesToAsk);
        this.writer.write(record);

        return once<ServerValues>(this, 'values', 3000);
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
}
