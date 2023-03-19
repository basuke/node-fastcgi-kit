import {
    encode,
    FCGIRecord,
    defaultAlignment,
    setBody,
    paddingSize,
    maxContentLength,
} from './record';
import { Readable, Writable } from 'node:stream';

export interface Writer {
    readonly alignment: number;
    write: (record: FCGIRecord, stream?: Readable, length?: number) => void;
}

class WriterImpl implements Writer {
    stream: Writable;
    alignment: number;

    constructor(stream: Writable, alignment: number) {
        this.stream = stream;
        this.alignment = alignment;
    }

    write(record: FCGIRecord, stream?: Readable, length?: number) {
        if (stream) {
            const originalSize = length ?? 0;
            let readSize = 0;

            const processChunk = (chunk: Buffer) => {
                const limit = this.safeMaxContentSize();

                let offset = 0;
                while (offset < chunk.byteLength) {
                    const body = chunk.subarray(offset, offset + limit);
                    setBody(record, body);

                    this.stream.write(encode(record, this.alignment, true));
                    this.stream.write(record.body);

                    const padding = paddingSize(
                        body.byteLength,
                        this.alignment
                    );
                    if (padding > 0) {
                        this.stream.write(Buffer.allocUnsafe(padding));
                    }
                    offset += body.byteLength;
                }

                readSize += chunk.byteLength;
            };

            stream.on('data', (chunk: any) => {
                if (chunk instanceof Buffer) {
                    processChunk(chunk);
                } else if (typeof chunk === 'string') {
                    processChunk(Buffer.from(chunk));
                } else {
                    stream.emit(
                        'error',
                        new TypeError(
                            'WriterImpl::write: Only Buffer or string in Readable'
                        )
                    );
                }
            });

            stream.on('end', () => {
                if (readSize !== originalSize) {
                    stream.emit(
                        'error',
                        new Error(
                            `WriterImpl::write: Invalid size of data is sent. content-length: ${originalSize} readSize: ${readSize}`
                        )
                    );
                }
            });
        } else {
            const header = encode(record, this.alignment);
            this.stream.write(header);
        }
    }

    safeMaxContentSize() {
        const padding = paddingSize(maxContentLength, this.alignment);
        if (padding === 0) return maxContentLength;
        return maxContentLength + padding - this.alignment;
    }
}

export function createWriter(
    stream: Writable,
    alignment: number = defaultAlignment
): Writer {
    return new WriterImpl(stream, alignment);
}
