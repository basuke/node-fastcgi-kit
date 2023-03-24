import {
    alignedSize,
    bytestr as B,
    hiByte,
    loByte,
    StreamPair,
    word,
    tick,
    MinBag,
} from '../src/utils';

describe('alignedSize', () => {
    test('works with same size', () => {
        expect(alignedSize(8, 8)).toBe(8);
        expect(alignedSize(16, 16)).toBe(16);
        expect(alignedSize(32, 32)).toBe(32);
    });

    test('works with dividable size', () => {
        expect(alignedSize(8, 8)).toBe(8);
        expect(alignedSize(16, 8)).toBe(16);
        expect(alignedSize(32, 8)).toBe(32);
    });

    test('works with smaller size than alignment', () => {
        expect(alignedSize(7, 8)).toBe(8);
        expect(alignedSize(13, 16)).toBe(16);
    });

    test('works with larger size than alignment', () => {
        expect(alignedSize(9, 8)).toBe(16);
        expect(alignedSize(17, 16)).toBe(32);
    });
});

describe('hiByte', () => {
    test('small number', () => {
        expect(hiByte(10)).toBe(0);
        expect(hiByte(0)).toBe(0);
        expect(hiByte(255)).toBe(0);
    });

    test('big number', () => {
        expect(hiByte(256)).toBe(1);
        expect(hiByte(513)).toBe(2);
        expect(hiByte(1026)).toBe(4);
    });
});

describe('loByte', () => {
    test('small number', () => {
        expect(loByte(10)).toBe(10);
        expect(loByte(0)).toBe(0);
        expect(loByte(255)).toBe(255);
    });

    test('big number', () => {
        expect(loByte(256)).toBe(0);
        expect(loByte(513)).toBe(1);
        expect(loByte(1026)).toBe(2);
    });
});

describe('word', () => {
    test('basic', () => {
        expect(word(1, 1)).toBe(257);
    });
});

describe('bytestr', () => {
    test('basic', () => {
        expect(B`00`).toEqual(Buffer.alloc(1));
        expect(B`01`).toEqual(Buffer.from([1]));
        expect(B`000103`).toEqual(Buffer.from([0, 1, 3]));
    });

    test('allow space', () => {
        expect(B`00 01 03`).toEqual(Buffer.from([0, 1, 3]));
    });

    test('does not allow weird space', () => {
        expect(() => B`000 103`).toThrow();
    });

    test('does not allow odd digits', () => {
        expect(() => B`000`).toThrow();
    });

    test('allow expression', () => {
        expect(B`00${'Hello'}00`).toEqual(
            Buffer.from([0, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0])
        );
    });

    test('spaces between expression', () => {
        expect(B`00 ${[5]} ${'Hello'}`).toEqual(
            Buffer.from([0, 5, 0x48, 0x65, 0x6c, 0x6c, 0x6f])
        );
    });
});

describe('stream pair', () => {
    test('creation', async () => {
        const [a, b] = StreamPair.create();
        const receivedA: any[] = [];
        const receivedB: any[] = [];

        a.on('data', (chunk) => receivedA.push(chunk));
        b.on('data', (chunk) => receivedB.push(chunk));

        a.write(B`010203`);
        b.write(B`ABCDEF`);

        await tick();

        expect(receivedB).toEqual([B`010203`]);
        expect(receivedA).toEqual([B`ABCDEF`]);
    });
});

describe('MinBag', () => {
    test('basic', () => {
        const bag = new MinBag(true);

        expect(bag.issue()).toBe(1);
        expect(bag.issue()).toBe(2);
        bag.putBack(2);
        expect(bag.issue()).toBe(2);
        bag.putBack(1);
        expect(bag.issue()).toBe(1);
    });
});
