import { Reader } from '../src/reader';
import { Readable } from 'node:stream';
import { bytestr as B, hiByte, loByte, tick } from '../src/utils';
import { FCGIRecord, makeRecord, Type } from '../src/record';

interface TestController {
    reader: Reader;
    decoded: FCGIRecord[];
    error?: Error;
}

function createReader(chunks: Buffer[]): TestController {
    const reader = new Reader();

    const decoded: FCGIRecord[] = [];
    const controller: TestController = { reader, decoded };

    reader.on('record', (record: FCGIRecord) => {
        decoded.push(record);
    });
    reader.on('error', (err) => {
        controller.error = err;
    });

    const source = Readable.from(chunks);
    source.pipe(reader);
    return controller;
}

async function readChunks(chunks: Buffer[]) {
    const test = createReader(chunks);
    await tick();
    return test.decoded;
}

// 01 02 0000 0000 00 00
const abortRecord = makeRecord(Type.FCGI_ABORT_REQUEST);

// 01 0b 0000 0008 00 00 0000 0000 0000 0000
const unknownRecord = makeRecord(Type.FCGI_UNKNOWN_TYPE, 0, Buffer.alloc(8));
const eor = B`01 04 0001 0000 00 00`;
const eorWithRequestId = (id: number) => {
    const buffer = Buffer.from(eor);
    buffer[2] = hiByte(id);
    buffer[3] = loByte(id);
    return buffer;
};

describe('Reader', () => {
    test('simple read', async () => {
        expect(await readChunks([B``])).toEqual([]);
        expect(await readChunks([B`01`])).toEqual([]);

        expect(await readChunks([B`01 02 0000 0000 00 00`])).toEqual([
            abortRecord,
        ]);

        expect(
            await readChunks([B`01 02 0000 0000 00 00 01 02 0000 0000 00 00`])
        ).toEqual([abortRecord, abortRecord]);

        expect(
            await readChunks([
                B`01 02 0000 0000 00 00`,
                B`01 02 0000 0000 00 00`,
            ])
        ).toEqual([abortRecord, abortRecord]);
    });

    test('record with content', async () => {
        expect(
            await readChunks([B`01 0b 0000 0008 00 00 0000000000000000`])
        ).toEqual([unknownRecord]);
    });

    test('separated chunk', async () => {
        expect(await readChunks([B`01 02 0000 0000`, B`00 00`])).toEqual([
            abortRecord,
        ]);
    });
});

describe('Reader for key-value pairs', () => {
    test('no EOR', async () => {
        const record = B`01 04 0001 000c 00 00 05 05 ${'helloworld'}`;

        // without EOR, it won't return record
        expect(await readChunks([record])).toEqual([]);
    });

    test('empty key-value pairs', async () => {
        expect(await readChunks([eor])).toEqual([
            makeRecord(Type.FCGI_PARAMS, 1, {}),
        ]);
    });

    test('simple key-value pairs', async () => {
        const record = B`01 04 0001 000c 00 00 05 05 ${'helloworld'}`;
        expect(await readChunks([record, eor])).toEqual([
            makeRecord(Type.FCGI_PARAMS, 1, { hello: 'world' }),
        ]);
    });

    test('key-value pairs with 1 chunk', async () => {
        const record = B`01 04 0001 000c 00 00 05 05 ${'helloworld'}`;
        // 1 chunk
        expect(await readChunks([Buffer.concat([record, eor])])).toEqual([
            makeRecord(Type.FCGI_PARAMS, 1, { hello: 'world' }),
        ]);
    });

    test('two pairs of key-value', async () => {
        const record = B`01 04 0001 000c 00 00 05 05 ${'helloworld'}`;
        expect(
            await readChunks([
                record,
                B`01 04 0001 0008 00 00 03 03 ${'foobar'}`,
                eor,
            ])
        ).toEqual([
            makeRecord(Type.FCGI_PARAMS, 1, { hello: 'world', foo: 'bar' }),
        ]);
    });

    test('key-value pairs stream', async () => {
        expect(
            await readChunks([
                Buffer.concat([
                    B`01 04 0001 0007 00 00 05 05 ${'hello'}`,
                    B`01 04 0001 0005 00 00 ${'world'}`,
                    eor,
                ]),
            ])
        ).toEqual([makeRecord(Type.FCGI_PARAMS, 1, { hello: 'world' })]);
    });

    test('incomplete pairs', async () => {
        const test = createReader([
            B`01 04 0001 0007 00 00 05 05 ${'hello'}`, // value is missing
            eor,
        ]);

        await tick();

        expect(test.error).toBeInstanceOf(Error);
        expect(test.decoded).toEqual([]);
    });

    test('cannot receive other record while handling params steam', async () => {
        const test = createReader([
            B`01 04 0001 000c 00 00 05 05 ${'helloworld'}`,
            B`01 0B 0001 0008 00 00 03 03 ${'foobar'}`,
            eor,
        ]);

        await tick();

        expect(test.error).toBeInstanceOf(Error);
        expect(test.decoded).toEqual([]);
    });

    test('param streams with multiple request id', async () => {
        const test = createReader([
            B`01 04 0001 000c 00 00 05 05 ${'helloworld'}`,
            B`01 04 0002 0008 00 00 03 03 ${'foobar'}`,
            eor,
            eorWithRequestId(2),
        ]);

        await tick();

        expect(test.decoded).toEqual([
            makeRecord(Type.FCGI_PARAMS, 1, { hello: 'world' }),
            makeRecord(Type.FCGI_PARAMS, 2, { foo: 'bar' }),
        ]);
    });
});
