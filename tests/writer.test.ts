import { createWriter } from '../src/writer';
import { Writable, Readable } from 'node:stream';
import { headerSize, makeRecord, maxContentLength, Type } from '../src/record';
import { bytestr as B, hiByte, loByte, tick } from '../src/utils';

class TestWritable extends Writable {
    received: Buffer = Buffer.alloc(0);

    sub(start?: number, end?: number) {
        return this.received.subarray(start, end);
    }

    _write(
        chunk: Buffer,
        _: BufferEncoding,
        callback: (error?: Error | null) => void
    ) {
        this.received = Buffer.concat([this.received, chunk]);
        callback();
    }
}

const prepare = () => {
    const writable = new TestWritable();
    const writer = createWriter(writable);
    return { writable, writer };
};

describe('Writer and simple record', () => {
    test('write simple record', () => {
        const { writable, writer } = prepare();

        writer.write(
            makeRecord(Type.FCGI_UNKNOWN_TYPE, 0, B`0000 0000 0000 0000`)
        );
        expect(writable.received).toEqual(
            B`01 0b 0000 0008 00 00 0000 0000 0000 0000`
        );
    });

    test('write record with padding', () => {
        const { writable, writer } = prepare();

        writer.write(makeRecord(Type.FCGI_UNKNOWN_TYPE, 0, B`0000 0000`));
        expect(writable.received.length).toBe(16);
        expect(writable.sub(0, 12)).toEqual(B`01 0b 0000 0004 04 00 0000 0000`);
    });

    test('write two records', () => {
        const { writable, writer } = prepare();
        const record = makeRecord(
            Type.FCGI_UNKNOWN_TYPE,
            0,
            B`0000 0000 0000 0000`
        );

        writer.write(record);
        writer.write(record);

        expect(writable.received).toEqual(
            B`
            01 0b 0000 0008 00 00 0000 0000 0000 0000
            01 0b 0000 0008 00 00 0000 0000 0000 0000
            `
        );
    });
});

describe('Writer and streamed record', () => {
    test('write record with stream', async () => {
        const { writable, writer } = prepare();
        const stream = Readable.from([B`0000 0000 0000 0001`]);

        writer.write(makeRecord(Type.FCGI_UNKNOWN_TYPE, 0), stream, 8);

        await tick();

        expect(writable.received).toEqual(
            B`01 0b 0000 0008 00 00 0000 0000 0000 0001`
        );
    });

    test('write record with stream and padding', async () => {
        const { writable, writer } = prepare();
        const stream = Readable.from([B`01 02 03 04 05`]);

        writer.write(makeRecord(Type.FCGI_UNKNOWN_TYPE, 1), stream, 5);

        await tick();

        expect(writable.received.length).toBe(16);
        expect(writable.sub(0, 13)).toEqual(
            B`01 0b 0001 0005 03 00 0102 0304 05`
        );
    });

    test('can write another record while writing streamed record', async () => {
        const { writable, writer } = prepare();
        const stream = Readable.from([B`0000 0000 0000 0123`]);

        writer.write(makeRecord(Type.FCGI_UNKNOWN_TYPE, 0), stream, 8);
        writer.write(
            makeRecord(Type.FCGI_UNKNOWN_TYPE, 1, B`0123 4567 89AB CDEF`)
        );

        await tick();

        // The order of bytes is not guaranteed.
        // In this case, because stream one is async,
        // the second write wins so that it comes first.
        expect(writable.received).toEqual(
            B`01 0b 0001 0008 00 00 0123 4567 89AB CDEF
              01 0b 0000 0008 00 00 0000 0000 0000 0123`
        );
    });

    test('stream with the size bigger than record limit', async () => {
        const seed = '0123456789ABCDEFabcdefghijklmnop';
        const data = seed.repeat(16 * 16 * 8);
        expect(data.length).toBeGreaterThan(maxContentLength);

        const { writable, writer } = prepare();
        const stream = Readable.from(data);
        writer.write(
            makeRecord(Type.FCGI_UNKNOWN_TYPE, 0),
            stream,
            data.length
        );
        await tick();

        const contentLength1 =
            Math.floor(maxContentLength / writer.alignment) * writer.alignment;
        expect(writable.received.length).toBe(
            headerSize + contentLength1 + headerSize + 8
        );
        expect(writable.sub(0, headerSize)).toEqual(
            B`01 0b 0000 ${[
                hiByte(contentLength1),
                loByte(contentLength1),
            ]} 00 00`
        );
        expect(
            writable.sub(
                headerSize + contentLength1,
                headerSize + contentLength1 + headerSize
            )
        ).toEqual(B`01 0b 0000 ${[0, data.length - contentLength1]} 00 00`);
    });
});
