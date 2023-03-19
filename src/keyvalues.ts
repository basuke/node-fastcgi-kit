export type Pairs = { [name: string]: string };

function encodeLength(buffer: Buffer): Buffer {
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

function decodePair(
    buffer: Buffer,
    offset: number
): [string, string, number] | undefined {
    function decodeLength(): number | undefined {
        if (buffer.byteLength <= offset) return undefined;

        const length = buffer[offset];
        if (length < 0x80) {
            offset += 1;
            return length;
        }
        if (buffer.byteLength <= offset + 3) return undefined;
        const longLength =
            ((length & 0x7f) << 24) +
            (buffer[offset + 1] << 16) +
            (buffer[offset + 2] << 8) +
            buffer[offset + 3];
        offset += 4;
        return longLength;
    }

    const nameLength = decodeLength();
    if (nameLength === undefined) return undefined;
    const valueLength = decodeLength();
    if (valueLength === undefined) return undefined;
    if (buffer.byteLength < offset + nameLength + valueLength) return undefined;

    const nameStart = offset;
    const valueStart = nameStart + nameLength;
    const valueEnd = valueStart + valueLength;
    return [
        buffer.subarray(nameStart, valueStart).toString(),
        buffer.subarray(valueStart, valueEnd).toString(),
        valueEnd,
    ];
}

export function encode(pairs: Pairs): Buffer {
    const buffers: Buffer[] = [];

    for (const name in pairs) {
        const value = pairs[name];

        const nameBytes = Buffer.from(name);
        const valueBytes = Buffer.from(value);

        buffers.push(encodeLength(nameBytes));
        buffers.push(encodeLength(valueBytes));
        buffers.push(nameBytes);
        buffers.push(valueBytes);
    }
    return Buffer.concat(buffers);
}

export function decode(buffer: Buffer, pairs: Pairs): Buffer | null {
    let offset = 0;
    while (offset < buffer.byteLength) {
        const result = decodePair(buffer, offset);
        if (result === undefined) {
            return offset > 0 ? buffer.subarray(offset) : buffer;
        }

        const [name, value, newOffset] = result;
        pairs[name] = value;
        offset = newOffset;
    }
    return null;
}
