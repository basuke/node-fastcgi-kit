import { createClientWithStream, Request } from '../src/client';
import { Reader } from '../src/reader';
import {
    BeginRequestBody,
    FCGIRecord,
    makeRecord,
    Role,
    Type,
} from '../src/record';
import { bytestr as B, once, StreamPair, tick } from '../src/utils';
import { createWriter, Writer } from '../src/writer';
import { Readable } from 'node:stream';

function clientForTest({
    skipServerValues = true,
    onRecord = (record: FCGIRecord) => {},
} = {}) {
    const [stream, other] = StreamPair.create();

    const sentChunks: Buffer[] = [];
    other.on('data', (chunk: Buffer) => {
        sentChunks.push(chunk);
    });

    const sentRecords: FCGIRecord[] = [];
    const reader = new Reader();

    reader.on('record', (record: FCGIRecord) => {
        sentRecords.push(record);
        onRecord(record);
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

async function requestForTest({
    count = 1,
    skipServerValues = true,
    onRecord = (record: FCGIRecord) => {},
} = {}) {
    const result = clientForTest({ skipServerValues, onRecord });
    const { client } = result;

    let requests: Request[] = [];
    let error: any = undefined;

    try {
        await once(client, 'ready', 5000);
        for (let i = 0; i < count; i++) {
            requests.push(client.begin());
        }
    } catch (e) {
        console.error(e);
        error = e;
    }
    return { ...result, requests, request: requests[0], error };
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
            const { request } = await requestForTest();
            return request;
        }

        const request = await diIt();
        expect(request).not.toBeFalsy();
        expect(request.id).not.toBe(0);
    });

    test('request id must be unique', async () => {
        async function diIt() {
            const { requests } = await requestForTest({ count: 2 });
            return requests;
        }

        const [request1, request2] = await diIt();
        expect(request1.id).not.toBe(0);
        expect(request1.id).not.toBe(request2.id);
    });

    test('beginRequest record must be sent', async () => {
        async function doIt() {
            const { request, sentRecords } = await requestForTest();
            await tick();
            return { request, record: sentRecords[0] };
        }

        const { request, record } = await doIt();

        expect(record.type).toBe(Type.FCGI_BEGIN_REQUEST);
        expect(record.requestId).toBe(request.id);
        expect(record.body).toBeInstanceOf(BeginRequestBody);

        const body = record.body as BeginRequestBody;
        expect(body.role).toBe(Role.Responder);
        expect(body.keepConnection).toBeFalsy();
    });

    test('can send params over request', async () => {
        const headers = {
            Hello: 'world',
            Foo: 'bar',
        };

        async function doIt() {
            const { sentRecords, request } = await requestForTest();

            request.params(headers);
            await tick();

            return { records: sentRecords.slice(1) };
        }

        const { records } = await doIt();
        expect(records.length).toBe(1);
        expect(records[0].body).toEqual(headers);
        expect(records[0].body).not.toBe(headers);
    });

    test('can send empty params and receive one record', async () => {
        async function doIt() {
            const { sentRecords, request } = await requestForTest();

            request.params({});
            await tick();

            return { records: sentRecords.slice(1) };
        }

        const { records } = await doIt();
        expect(records.length).toBe(1);
        expect(records[0].body).toEqual({});
    });

    test('can send LARGE params over request', async () => {});

    test('can send stdin as string', async () => {
        async function doIt() {
            const { request, sentRecords } = await requestForTest();
            request.params({}).send('Hello world');
            await tick();
            return sentRecords.slice(2);
        }

        const records = await doIt();
        expect(records.length).toBe(1);
        const body = records[0].body as Buffer;
        expect(body).toEqual(B`${'Hello world'}`);
    });

    test('can send stdin from stream', async () => {
        async function doIt() {
            const { request, sentRecords } = await requestForTest();
            const source = Readable.from(['Hello world\n', B`01 23 45 67 89`]);
            request.params({}).send(source);

            await tick();
            return sentRecords.slice(2);
        }

        const records = await doIt();
        expect(records.length).toBe(2);
        const body1 = records[0].body as Buffer;
        expect(body1).toEqual(B`${'Hello world\n'}`);

        const body2 = records[1].body as Buffer;
        expect(body2).toEqual(B`0123456789`);
    });

    test('must receive stdout after sending params', async () => {
        const content = B`${'Hello back!'}`;
        async function doIt() {
            const { request, writer } = await requestForTest({
                onRecord: (record) => {
                    if (record.type === Type.FCGI_PARAMS) {
                        writer.write(
                            makeRecord(
                                Type.FCGI_STDOUT,
                                record.requestId,
                                content
                            )
                        );
                    }
                },
            });

            const received: Buffer[] = [];
            request.on('data', (chunk: Buffer) => {
                received.push(chunk);
            });

            request.params({});
            request.done();

            await tick();
            return received;
        }

        const received = await doIt();
        expect(received.length).toBe(1);

        const body = received[0];
        expect(body).toEqual(content);
        expect(body).not.toBe(content);
    });

    test('might receive stderr', async () => {});
    test('error when getting stdout before sending params', async () => {});

    test('after receiving EndRequest, request must be closed', async () => {});
    test('when request is finished, the id is available to use', async () => {});
    test('error when getting stdout before sending params', async () => {});
    test('error ending before closing stdin', async () => {});

    test('aborting request', async () => {});
});
