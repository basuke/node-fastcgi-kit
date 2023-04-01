import { createClient } from '../src/client';
import { findExec, tick } from '../src/utils';
import { join } from 'node:path';

const describeIf = (condition: boolean) =>
    condition ? describe : describe.skip;

const phpFpm = 'php-fpm';

function params() {
    const script_dir = join(__dirname, 'php');
    const script_file = '/hello.php';
    const script_path = join(script_dir, script_file);

    return {
        GATEWAY_PROTOCOL: 'CGI/1.1',
        SERVER_SOFTWARE: 'fastcgi-kit; node/' + process.version,
        REMOTE_ADDR: '192.0.1.23',
        QUERY_STRING: '',
        REQUEST_METHOD: 'GET',
        REQUEST_URI: 'http://localhost/hello/world',

        SCRIPT_FILENAME: script_path,
        SCRIPT_NAME: script_file,
        PATH_INFO: script_file,
        DOCUMENT_URI: script_file,
        DOCUMENT_ROOT: script_dir,
        PHP_SELF: script_file,
    };
}

describeIf(findExec(phpFpm))('Test with php-fpm', () => {
    test('connect to php-fpm', (done) => {
        const client = createClient({
            host: 'localhost',
            // host: 'sakadana.local',
            port: 9000,
            debug: true,
            // skipServerValues: true,
        });

        client.on('ready', async () => {
            console.log('client', client);

            const request = await client.begin(false);

            request.params(params());

            request.on('stdout', (buffer: Buffer) => {
                console.log(buffer);
                console.log(buffer.toString());
            });
            request.on('stderr', (err: string) => {
                console.error(err);
            });
            request.on('end', done);

            request.done();
        });
    });
});
