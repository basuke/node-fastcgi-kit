import { decode, encode, Params } from '../src/keyvalues';
import { bytestr as B } from '../src/utils';

describe('Key-Value paire encoding', () => {
    test('simple', () => {
        expect(encode({})).toEqual(Buffer.alloc(0));
        expect(encode({ hello: '' })).toEqual(B`0500${'hello'}`);
        expect(encode({ hello: 'world' })).toEqual(B`0505${'hello'}${'world'}`);
        expect(encode({ hello: 'world', foo: 'bar' })).toEqual(
            B`0505${'hello'}${'world'} 0303${'foo'}${'bar'}`
        );
    });

    test('name.length == 130', () => {
        const name = '0123456789'.repeat(13);
        const values: Params = {};
        values[name] = 'hello';
        expect(encode(values)).toEqual(
            B`${[128, 0, 0, 130]}05${name}${'hello'}`
        );
    });

    test('name.length == 260', () => {
        const name = '0123456789'.repeat(26);
        const values: Params = {};
        values[name] = 'hello';
        expect(encode(values)).toEqual(B`${[128, 0, 1, 4]}05${name}${'hello'}`);
    });

    test('name.length == 260', () => {
        const name = '0123456789'.repeat(26);
        const values: Params = {};
        values[name] = 'hello';
        expect(encode(values)).toEqual(B`${[128, 0, 1, 4]}05${name}${'hello'}`);
    });
});

describe('Decoding key-value params', () => {
    test('simple pair', () => {
        const params = {};
        const remainings = decode(B`${[5, 5]} ${'hello'} ${'world'}`, params);
        expect(params).toEqual({ hello: 'world' });
        expect(remainings).toBeNull();
    });

    test('multiple params', () => {
        const params = {};
        decode(B`${[5, 5]} ${'helloworld'} ${[3, 3]} ${'foobar'}`, params);
        expect(params).toEqual({ hello: 'world', foo: 'bar' });
    });

    test('extra data in buffer', () => {
        const params = {};
        const remainings = decode(
            B`${[5, 5]} ${'helloworld'} ${[3, 3]}`,
            params
        );
        expect(params).toEqual({ hello: 'world' });
        expect(remainings).toEqual(Buffer.from([3, 3]));
    });

    test('not enough data', () => {
        const params = {};
        decode(B``, params);
        expect(params).toEqual({});

        decode(B`${[5, 5]}`, params);
        expect(params).toEqual({});

        decode(B`${[5, 5]} ${'Hello'}`, params);
        expect(params).toEqual({});
    });
});
