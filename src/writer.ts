import {
    encode,
    FCGIRecord,
    defaultAlignment,
    setBody,
    paddingSize,
    maxContentLength,
    Type,
} from './record';
import { Readable, Writable } from 'node:stream';
import { Params } from './keyvalues';

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
                    const record2 = setBody(record, body);

                    this.stream.write(encode(record2, this.alignment, true));
                    this.stream.write(record2.body);

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

            stream.on('data', (chunk: string | Buffer) => {
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
        } else if (record.type === Type.FCGI_PARAMS) {
            const body = record.body as Params;
            if (typeof body === 'object' && Object.keys(body).length > 0) {
                this.stream.write(encode(record, this.alignment));
            }
            this.stream.write(encode(setBody(record, null), this.alignment));
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
