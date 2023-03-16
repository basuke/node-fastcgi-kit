import {
    Type,
    makeRecord,
    setBody,
    encode,
    decodableSize,
    decode,
} from '../src/record';
import { bytestr as B } from '../src/utils';

function b(...bytes: number[]): Buffer {
    return Buffer.from(bytes);
}

describe('encoding record', () => {
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

describe('decoding record', () => {
    test('detect enogh data', () => {
        expect(decodableSize(B`01`)).toBeFalsy();
        expect(decodableSize(B`01 0b 0000 0000 00`)).toBeFalsy();

        expect(decodableSize(B`01 0b 0000 0000 00 00`)).toBe(8);
        expect(decodableSize(B`01 0b 0103 0005 03 00 ${'Hello'} 000000`)).toBe(
            16
        );
    });

    test('decode data', () => {
        expect(() => decode(B`01`)).toThrow();

        let record = decode(B`01 0b 0000 0000 00 00`);
        expect(record).not.toBeNull();
        expect(record.body).toBeNull();
        expect(record.type).toBe(Type.FCGI_UNKNOWN_TYPE);
        expect(record.requestId).toBe(0);

        record = decode(B`01 0b 0001 0003 05 00 0001 0203 04ff ffff`);
        expect(record).not.toBeNull();
        expect(record.body).toEqual(B`00 01 02`);
        expect(record.type).toBe(Type.FCGI_UNKNOWN_TYPE);
        expect(record.requestId).toBe(1);
    });
});
