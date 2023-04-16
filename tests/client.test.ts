import type { ClientOptions, ConnectOptions } from '../src/options';
import { createClient, Request } from '../src/client';
import { Reader } from '../src/reader';
import {
    BeginRequestBody,
    FCGIRecord,
    makeRecord,
    RecordBody,
    Role,
    Type,
} from '../src/record';
import { bytestr as B, once, StreamPair, tick } from '../src/utils';
import { createWriter } from '../src/writer';
import { Readable } from 'node:stream';
import { Params } from '../src/params';

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

    const options: ClientOptions = {
        address: 'localhost:9000',
        connector: async (options: ConnectOptions): Promise<StreamPair> =>
            stream,
        skipServerValues,
        debug: false,
    };

    const client = createClient(options);

    function sendToClient(type: Type, id: number, body: RecordBody) {
        writer.write(makeRecord(type, id, body));
    }

    return {
        client, // client
        stream, // our endpoint
        other, // their endpoint (Buffer)
        reader, // their endpoint via Reader (Record)
        writer, // their write endpoint using Record
        sentChunks, // chunks arrived to their end
        sentRecords, // records arrived to their end
        sendToClient,
    };
}

async function requestForTest({
    count = 1,
    skipServerValues = true,
    onRecord = (record: FCGIRecord) => {},
} = {}) {
    const result = clientForTest({ skipServerValues, onRecord });
    const { client, sendToClient } = result;

    let requests: Request[] = [];
    let error: any = undefined;

    try {
        await once(client, 'ready', 5000);
        for (let i = 0; i < count; i++) {
            requests.push(await client.begin());
        }
    } catch (e) {
        console.error(e);
        error = e;
    }

    const request = requests[0];
    function sendToRequest(type: Type, body: RecordBody) {
        sendToClient(type, request.id, body);
    }

    return { ...result, requests, request, error, sendToRequest };
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

            await tick();
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

            request.sendParams(headers);
            await tick();

            return { records: sentRecords.slice(1) };
        }

        const { records } = await doIt();
        expect(records.length).toBe(1);
        const record = records[0];
        const body = record.body as Params;
        expect(body.Hello).toEqual('world');
        expect(body.Foo).toEqual('bar');
    });

    test('can send empty params and receive one record', async () => {
        async function doIt() {
            const { sentRecords, request } = await requestForTest();

            request.sendParams({});
            await tick();

            return { records: sentRecords.slice(1) };
        }

        const { records } = await doIt();
        expect(records.length).toBe(1);
        expect(records[0].body).not.toBeFalsy();
        expect(records[0].body).not.toEqual({});
    });

    test('can send LARGE params over request', async () => {});

    test('can send stdin as string', async () => {
        async function doIt() {
            const { request, sentRecords } = await requestForTest();
            request.sendParams({}).send('Hello world');
            await tick();
            return sentRecords.slice(2);
        }

        const records = await doIt();
        expect(records.length).toBe(2);
        const body = records[0].body as Buffer;
        expect(body).toEqual(B`${'Hello world'}`);
    });

    test('can send stdin from stream', async () => {
        async function doIt() {
            const { request, sentRecords } = await requestForTest();
            const source = Readable.from(['Hello world\n', B`01 23 45 67 89`]);
            request.sendParams({}).send(source);

            await tick();
            return sentRecords.slice(2);
        }

        const records = await doIt();
        expect(records.length).toBe(3);
        const body1 = records[0].body as Buffer;
        expect(body1).toEqual(B`${'Hello world\n'}`);

        const body2 = records[1].body as Buffer;
        expect(body2).toEqual(B`0123456789`);
    });

    test('must receive stdout after sending params', async () => {
        const content = B`${'Hello back!'}`;
        async function doIt() {
            const { request, sendToRequest } = await requestForTest({
                onRecord: (record) => {
                    if (record.type !== Type.FCGI_PARAMS) return;

                    sendToRequest(Type.FCGI_STDOUT, content);
                },
            });

            const received: Buffer[] = [];
            request.on('stdout', (chunk: Buffer) => {
                received.push(chunk);
            });

            request.sendParams({});
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

    test('after receiving EndRequest, request must be closed and the id is available', async () => {
        const content = B`${'Hello'}`;
        async function doIt() {
            const { client, request, sendToRequest, other } =
                await requestForTest({
                    onRecord: (record) => {
                        if (record.type !== Type.FCGI_PARAMS) return;

                        sendToRequest(Type.FCGI_STDOUT, content);
                        sendToRequest(Type.FCGI_STDOUT, null);
                        sendToRequest(
                            Type.FCGI_END_REQUEST,
                            B`00000000 00 000000`
                        );
                        other.end();
                    },
                });

            let closed = false;
            request.on('end', () => {
                closed = true;
            });
            request.sendParams({ foo: 'bar' }).done();

            await tick();
            return { client, request, closed };
        }

        const { client, request, closed } = await doIt();
        expect(closed).toBeTruthy();

        expect(request.closed).toBeTruthy();
        expect(client.getRequest(request.id)).toBeUndefined();
    });

    test('when request is finished, the id is available to use', async () => {});

    test('error ending request before closing stdin', async () => {});
    test('error ending request before closing stdout', async () => {});
    test('error ending request before closing stderr', async () => {});

    test('aborting request', async () => {});
});
