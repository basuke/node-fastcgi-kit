import { createWriter } from '../src/writer';
import { Writable } from 'node:stream';
import { makeRecord, Type } from '../src/record';
import { bytestr as B } from '../src/utils';

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
});
