import { Reader } from '../src/reader';
import { Readable } from 'node:stream';
import { bytestr as B, tick } from '../src/utils';
import { FCGIRecord, makeRecord, Type } from '../src/record';

async function readChunks(chunks: Buffer[]) {
    const reader = new Reader();

    const decoded: FCGIRecord[] = [];
    reader.on('record', (record: FCGIRecord) => {
        decoded.push(record);
    });

    const source = Readable.from(chunks);
    source.pipe(reader);
    await tick();
    return decoded;
}

// 01 02 0000 0000 00 00
const abortRecord = makeRecord(Type.FCGI_ABORT_REQUEST);

// 01 0b 0000 0008 00 00 0000 0000 0000 0000
const unknownRecord = makeRecord(Type.FCGI_UNKNOWN_TYPE, 0, Buffer.alloc(8));
const eor = B`01 04 0001 0000 00 00`;

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

    test('cannot receive other record while handling params steam', async () => {
        const reader = new Reader();
        let error: Error | null = null;

        const decoded: FCGIRecord[] = [];
        reader.on('record', (record: FCGIRecord) => {
            decoded.push(record);
        });
        reader.on('error', (err) => {
            error = err;
        });

        const chunks = [
            B`01 04 0001 000c 00 00 05 05 ${'helloworld'}`,
            B`01 0B 0001 0008 00 00 03 03 ${'foobar'}`,
            eor,
        ];

        const source = Readable.from(chunks);
        source.pipe(reader);

        await tick();

        expect(error).toBeInstanceOf(Error);
        expect(decoded).toEqual([]);
    });

    test('param streams with multiple request id', () => {});
});
