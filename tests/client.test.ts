import { createClientWithStream } from '../src/client';
import { encode, makeRecord, Type } from '../src/record';
import { bytestr as B, StreamPair } from '../src/utils';

describe('Client', () => {
    test('send getValues', async () => {
        const [stream, other] = StreamPair.create();
        other.on('data', (chunk: Buffer) => {
            const record = makeRecord(Type.FCGI_GET_VALUES_RESULT, 0, {
                FCGI_MAX_CONNS: '100',
                FCGI_MAX_REQS: '100',
                FCGI_MPXS_CONNS: '1',
            });
            other.write(encode(record));
        });

        const client = createClientWithStream(stream);
        const values = await client.getServerValues();
        expect(values).toEqual({
            maxConns: 100,
            maxReqs: 100,
            mpxsConns: true,
        });
    });
});
