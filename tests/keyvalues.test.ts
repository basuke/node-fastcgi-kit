import { decode, encode, Pairs } from '../src/keyvalues';
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
        const values: Pairs = {};
        values[name] = 'hello';
        expect(encode(values)).toEqual(
            B`${[128, 0, 0, 130]}05${name}${'hello'}`
        );
    });

    test('name.length == 260', () => {
        const name = '0123456789'.repeat(26);
        const values: Pairs = {};
        values[name] = 'hello';
        expect(encode(values)).toEqual(B`${[128, 0, 1, 4]}05${name}${'hello'}`);
    });

    test('name.length == 260', () => {
        const name = '0123456789'.repeat(26);
        const values: Pairs = {};
        values[name] = 'hello';
        expect(encode(values)).toEqual(B`${[128, 0, 1, 4]}05${name}${'hello'}`);
    });
});

describe('Decoding key-value pairs', () => {
    test('simple pair', () => {
        const pairs = {};
        const remainings = decode(B`${[5, 5]} ${'hello'} ${'world'}`, pairs);
        expect(pairs).toEqual({ hello: 'world' });
        expect(remainings).toBeNull();
    });

    test('multiple pairs', () => {
        const pairs = {};
        decode(B`${[5, 5]} ${'helloworld'} ${[3, 3]} ${'foobar'}`, pairs);
        expect(pairs).toEqual({ hello: 'world', foo: 'bar' });
    });

    test('extra data in buffer', () => {
        const pairs = {};
        const remainings = decode(
            B`${[5, 5]} ${'helloworld'} ${[3, 3]}`,
            pairs
        );
        expect(pairs).toEqual({ hello: 'world' });
        expect(remainings).toEqual(Buffer.from([3, 3]));
    });

    test('not enough data', () => {
        const pairs = {};
        decode(B``, pairs);
        expect(pairs).toEqual({});

        decode(B`${[5, 5]}`, pairs);
        expect(pairs).toEqual({});

        decode(B`${[5, 5]} ${'Hello'}`, pairs);
        expect(pairs).toEqual({});
    });
});
