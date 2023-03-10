import { decodableSize, decode, FCGIRecord } from './record';
import { Writable, TransformCallback } from 'node:stream';

export class Reader extends Writable {
    remaining: Buffer | null = null;

    _write(
        chunk: Buffer,
        _: BufferEncoding,
        callback: (error?: Error | null | undefined) => void
    ): void {
        if (this.remaining) {
            chunk = Buffer.concat([this.remaining, chunk]);
            this.remaining = null;
        }

        while (chunk.byteLength > 0) {
            const length = decodableSize(chunk);
            if (!length || length > chunk.byteLength) {
                this.remaining = chunk;
                break;
            }
            const record = decode(chunk);
            chunk = chunk.subarray(length);
            this.emit('record', record);
        }
        callback();
    }
}
