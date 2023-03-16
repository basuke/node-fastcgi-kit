export type Pairs = { [name: string]: string };

function encodeLengthOf(buffer: Buffer): Buffer {
    const len = buffer.byteLength;
    return Buffer.from(
        len >= 128
            ? [
                  0x80 | (len >> 24),
                  (len >> 16) & 0xff,
                  (len >> 8) & 0xff,
                  len & 0xff,
              ]
            : [len]
    );
}

export function encode(pairs: Pairs): Buffer {
    const buffers: Buffer[] = [];

    for (const name in pairs) {
        const value = pairs[name];

        const nameBytes = Buffer.from(name);
        const valueBytes = Buffer.from(value);

        buffers.push(encodeLengthOf(nameBytes));
        buffers.push(encodeLengthOf(valueBytes));
        buffers.push(nameBytes);
        buffers.push(valueBytes);
    }
    return Buffer.concat(buffers);
}
