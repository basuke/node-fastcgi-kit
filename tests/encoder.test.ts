import { createEncoder } from '../src/encoder';
import { Type, makeRecord, setBody, encode } from '../src/record';

function b(...bytes: number[]): Buffer {
    return Buffer.from(bytes);
}

describe('record.encode', () => {
    test('encode simple request', () => {
        const record = makeRecord(Type.FCGI_UNKNOWN_TYPE);
        expect(encode(record)).toEqual(b(1, 11, 0, 0, 0, 0, 0, 0));
    });

    test('encode request with body', () => {
        const record = makeRecord(Type.FCGI_UNKNOWN_TYPE);
        record.requestId = 258;
        setBody(record, b(0, 1, 2));
        expect(encode(record)).toEqual(
            b(1, 11, 1, 2, 0, 3, 5, 0, 0, 1, 2, 0, 0, 0, 0, 0)
        );
    });

    test('encode request with string body', () => {
        const record = makeRecord(Type.FCGI_UNKNOWN_TYPE);
        record.requestId = 259;
        setBody(record, 'Hello');
        expect(encode(record)).toEqual(
            b(1, 11, 1, 3, 0, 5, 3, 0, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0, 0, 0)
        );
    });
});

// test('Encode begin request', () => {
//     const buffers: Buffer[] = [];

//     const encoder = createEncoder();
//     encoder.on('data', (blob: Buffer): void => {
//         buffers.push(blob);
//     });

//     const record = makeRecord(Type.FCGI_UNKNOWN_TYPE);
//     encoder.feed(record);
//     expect(buffers).toEqual([b(0, 11, 0, 0, 0, 0, 0, 0)]);
// });
