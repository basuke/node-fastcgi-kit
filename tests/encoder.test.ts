import { createEncoder } from '../src/encoder';
import { Record } from '../src/record';

test('Encode begin request', () => {
    const buffers: Buffer[] = [];

    const encoder = createEncoder();
    encoder.on('data', (blob: Buffer): void => {
        buffers.push(blob);
    });

    const record = new Record(0, 0);
    encoder.feed(record);
    expect(buffers).toEqual(['hello']);
});
