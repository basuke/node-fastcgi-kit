import { encode, FCGIRecord, defaultAlignment, setBody } from './record';
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
            const size = length ?? 0;

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

                setBody(record, chunk);
                this.stream.write(encode(record, this.alignment));

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
                if (readSize != size) {
                    stream.emit(
                        'error',
                        new Error('WriterImpl::write: Not enough data is sent')
                    );
                }
            });
        } else {
            const header = encode(record, this.alignment);
            this.stream.write(header);
        }
    }
}

export function createWriter(
    stream: Writable,
    alignment: number = defaultAlignment
): Writer {
    return new WriterImpl(stream, alignment);
}
