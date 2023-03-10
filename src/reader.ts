import { decodableSize, decode, FCGIRecord } from './record';
import { Writable, TransformCallback } from 'node:stream';

export class Reader extends Writable {
    _write(
        chunk: Buffer,
        _: BufferEncoding,
        callback: (error?: Error | null | undefined) => void
    ): void {
        while (chunk.byteLength > 0) {
            const length = decodableSize(chunk);
            if (!length || length > chunk.byteLength) {
                break;
            }
            const record = decode(chunk);
            chunk = chunk.subarray(length);
            this.emit('record', record);
        }
        callback();
    }
}
