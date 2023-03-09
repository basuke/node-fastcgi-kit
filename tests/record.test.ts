import { createEncoder } from '../src/encoder';
import { Type, makeRecord, setBody, encode } from '../src/record';
import { bytestr as B } from '../src/utils';

function b(...bytes: number[]): Buffer {
    return Buffer.from(bytes);
}

describe('encode record', () => {
    test('simple request', () => {
        const record = makeRecord(Type.FCGI_UNKNOWN_TYPE);
        expect(encode(record)).toEqual(B`01 0b 0000 0000 00 00`);
    });

    test('request with body', () => {
        const record = makeRecord(Type.FCGI_UNKNOWN_TYPE);
        record.requestId = 258;
        setBody(record, b(0, 1, 2));
        expect(encode(record)).toEqual(
            B`01 0B 0102 0003 05 00 00010200 00000000`
        );
    });

    test('request with string body', () => {
        const record = makeRecord(Type.FCGI_UNKNOWN_TYPE);
        record.requestId = 259;
        setBody(record, 'Hello');
        expect(encode(record)).toEqual(
            B`01 0b 0103 0005 03 00 ${'Hello'} 000000`
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
