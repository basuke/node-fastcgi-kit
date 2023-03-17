import { createWriter } from '../src/writer';
import { Writable, Readable } from 'node:stream';
import { makeRecord, Type } from '../src/record';
import { bytestr as B, tick } from '../src/utils';

class TestWritable extends Writable {
    data: Buffer = Buffer.alloc(0);

    _write(
        chunk: Buffer,
        _: BufferEncoding,
        callback: (error?: Error | null) => void
    ) {
        this.data = Buffer.concat([this.data, chunk]);
        callback();
    }
}

describe('Writer', () => {
    test('write simple record', () => {
        const writable = new TestWritable();
        const writer = createWriter(writable);
        writer.write(
            makeRecord(Type.FCGI_UNKNOWN_TYPE, 0, B`0000 0000 0000 0000`)
        );
        expect(writable.data).toEqual(
            B`01 0b 0000 0008 00 00 0000 0000 0000 0000`
        );
    });

    test('write record with stream', async () => {
        const writable = new TestWritable();
        const stream = Readable.from([B`0000 0000 0000 0001`]);

        const writer = createWriter(writable);
        writer.write(
            makeRecord(Type.FCGI_UNKNOWN_TYPE, 0, { length: 8, stream })
        );

        await tick();

        expect(writable.data).toEqual(
            B`01 0b 0000 0008 00 00 0000 0000 0000 0001`
        );
    });
});
