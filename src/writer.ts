import {
    encode,
    FCGIRecord,
    defaultAlignment,
    getStream,
    paddingSize,
} from './record';
import { Writable } from 'node:stream';

export interface Writer {
    alignment: number;
    write: (record: FCGIRecord) => void;
}

class WriterImpl implements Writer {
    writable: Writable;
    alignment: number;

    constructor(writable: Writable, alignment: number) {
        this.writable = writable;
        this.alignment = alignment;
    }

    write(record: FCGIRecord) {
        const header = encode(record, this.alignment);
        this.writable.write(header);

        const readable = getStream(record);
        if (readable) {
            const { stream, length: size } = readable;
            let readSize = 0;

            const processChunk = (chunk: Buffer) => {
                if (readSize + chunk.byteLength > size) {
                    stream.emit(
                        'error',
                        new Error(
                            'WriterImpl::write: More data is sent to stream'
                        )
                    );
                    return;
                }
                readSize += chunk.byteLength;
                this.writable.write(chunk);
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
                if (readSize != size) {
                    stream.emit(
                        'error',
                        new Error('WriterImpl::write: Not enough data is sent')
                    );
                }

                const padding = paddingSize(record, this.alignment);
                if (padding > 0) {
                    this.writable.write(Buffer.allocUnsafe(padding));
                }
            });
        }
    }
}

export function createWriter(
    writable: Writable,
    alignment: number = defaultAlignment
): Writer {
    return new WriterImpl(writable, alignment);
}
