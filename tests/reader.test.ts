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

describe('Reader', () => {
    test('simple read', async () => {
        expect(await readChunks([B``])).toEqual([]);
        expect(await readChunks([B`01`])).toEqual([]);

        expect(await readChunks([B`01 02 0000 0000 00 00`])).toEqual([
            makeRecord(Type.FCGI_ABORT_REQUEST),
        ]);

        expect(
            await readChunks([B`01 02 0000 0000 00 00 01 02 0000 0000 00 00`])
        ).toEqual([
            makeRecord(Type.FCGI_ABORT_REQUEST),
            makeRecord(Type.FCGI_ABORT_REQUEST),
        ]);

        expect(
            await readChunks([
                B`01 02 0000 0000 00 00`,
                B`01 02 0000 0000 00 00`,
            ])
        ).toEqual([
            makeRecord(Type.FCGI_ABORT_REQUEST),
            makeRecord(Type.FCGI_ABORT_REQUEST),
        ]);
    });
});
