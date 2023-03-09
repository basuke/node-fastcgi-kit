import { createEncoder } from '../src/encoder';
import { Record, Type } from '../src/record';

function b(...bytes: number[]): Buffer {
    return Buffer.from(bytes);
}

describe('record.encode', () => {
    test('encode simple request', () => {
        const record = new Record(Type.FCGI_UNKNOWN_TYPE);
        expect(record.encode(8)).toEqual(b(1, 11, 0, 0, 0, 0, 0, 0));
    });

    test('encode request with body', () => {
        const record = new Record(Type.FCGI_UNKNOWN_TYPE);
        record.requestId = 258;
        record.body = b(0, 1, 2);
        expect(record.encode(8)).toEqual(
            b(1, 11, 1, 2, 0, 3, 5, 0, 0, 1, 2, 0, 0, 0, 0, 0)
        );
    });
});

// test('Encode begin request', () => {
//     const buffers: Buffer[] = [];

//     const encoder = createEncoder();
//     encoder.on('data', (blob: Buffer): void => {
//         buffers.push(blob);
//     });

//     const record = new Record(Type.FCGI_UNKNOWN_TYPE);
//     encoder.feed(record);
//     expect(buffers).toEqual([b(0, 11, 0, 0, 0, 0, 0, 0)]);
// });
