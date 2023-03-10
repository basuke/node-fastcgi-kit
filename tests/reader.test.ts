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

        expect(
            await readChunks([
                B`01 02 0000 0000 00 00 01 02`,
                B`0000 0000 00 00`,
            ])
        ).toEqual([abortRecord, abortRecord]);

        expect(
            await readChunks([B`01 0b 0000 0008 00 00`, B`0000000000000000`])
        ).toEqual([unknownRecord]);

        // header is separated
        expect(
            await readChunks([B`01 0b 0000 0008 00`, B`00 0000000000000000`])
        ).toEqual([unknownRecord]);

        // content part is splitted
        expect(
            await readChunks([B`01 0b 0000 0008 00 00 00`, B`00000000000000`])
        ).toEqual([unknownRecord]);

        // randomly separated
        expect(
            await readChunks([
                B`01`,
                B`0b 0000 0008 00 00 00`,
                B`000000000000`,
                B`00`,
            ])
        ).toEqual([unknownRecord]);
    });
});
