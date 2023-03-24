import { createClientWithStream, Request } from '../src/client';
import { Reader } from '../src/reader';
import { FCGIRecord, makeRecord, Type } from '../src/record';
import { bytestr as B, StreamPair, tick } from '../src/utils';
import { createWriter } from '../src/writer';

function clientForTest({ skipServerValues = true } = {}) {
    const [stream, other] = StreamPair.create();

    const sentChunks: Buffer[] = [];
    other.on('data', (chunk: Buffer) => {
        sentChunks.push(chunk);
    });

    const sentRecords: FCGIRecord[] = [];
    const reader = new Reader();

    reader.on('record', (record: FCGIRecord) => {
        sentRecords.push(record);
    });

    other.pipe(reader);

    const writer = createWriter(other);

    const client = createClientWithStream(stream, skipServerValues);
    return {
        client, // client
        stream, // our endpoint
        other, // their endpoint (Buffer)
        reader, // their endpoint via Reader (Record)
        writer, // their write endpoint using Record
        sentChunks, // chunks arrived to their end
        sentRecords, // records arrived to their end
    };
}

function serverValuesResult({
    maxConns = 100,
    maxReqs = 100,
    mpxsConns = true,
} = {}) {
    return makeRecord(Type.FCGI_GET_VALUES_RESULT, 0, {
        FCGI_MAX_CONNS: maxConns.toString(),
        FCGI_MAX_REQS: maxReqs.toString(),
        FCGI_MPXS_CONNS: mpxsConns ? '1' : '0',
    });
}

describe('Client', () => {
    test('request and receive server value', async () => {
        async function doIt() {
            const { other, client, writer } = clientForTest();

            other.on('data', (_: any) => writer.write(serverValuesResult()));

            return client.getServerValues();
        }
        const values = await doIt();

        expect(values).toEqual({
            maxConns: 100,
            maxReqs: 100,
            mpxsConns: true,
        });
    });

    test('request must have id', async () => {
        async function diIt() {
            const { client } = clientForTest();

            let request: unknown;
            client.once('ready', () => {
                request = client.begin();
            });
            await tick();
            return request as Request;
        }

        const request = await diIt();
        expect(request).not.toBeFalsy();
        expect(request.id).not.toBe(0);
    });

    test('request id must be unique', async () => {
        async function diIt() {
            const { client } = clientForTest();

            let requests: unknown[] = [];
            client.once('ready', () => {
                requests.push(client.begin());
                requests.push(client.begin());
            });
            await tick();
            return requests.map((r) => r as Request);
        }

        const [request1, request2] = await diIt();
        expect(request1.id).not.toBe(0);
        expect(request1.id).not.toBe(request2.id);
    });
});
