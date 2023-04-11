import { createClient } from '../src/client';
import { findExec, tick } from '../src/utils';
import { join } from 'node:path';

const describeIf = (condition: boolean) =>
    condition ? describe : describe.skip;

const phpFpm = 'php-fpm';
const phpFpmExists = findExec(phpFpm);

function params(script_file: string = '/hello.php') {
    const script_dir = join(__dirname, 'php');
    const script_path = join(script_dir, script_file);

    return {
        QUERY_STRING: '',
        REQUEST_METHOD: 'GET',
        REQUEST_URI: 'http://localhost/hello/world',

        SCRIPT_FILENAME: script_path,
        SCRIPT_NAME: script_file,
        PATH_INFO: script_file,
        DOCUMENT_URI: script_file,
        PHP_SELF: script_file,
    };
}

describeIf(phpFpmExists)('Test with php-fpm', () => {
    test('connect to php-fpm', (done) => {
        const client = createClient({
            host: 'localhost',
            port: 9000,
            debug: false,
            params: {
                DOCUMENT_ROOT: __dirname,
            },
        });

        client.on('ready', async () => {
            const response = await client.get('http://localhost/php/hello.php');

            expect(response.statusCode).toBe(200);
            expect(response.text).toContain('Hello world from PHP');
            done();
        });
    });

    test('connect to php-fpm: low-level', (done) => {
        const client = createClient({
            host: 'localhost',
            port: 9000,
            debug: false,
            params: {
                REMOTE_ADDR: '127.0.0.1',
                GATEWAY_PROTOCOL: 'CGI/1.1',
                SERVER_SOFTWARE: 'fastcgi-kit; node/' + process.version,
                DOCUMENT_ROOT: __dirname,
            },
        });

        client.on('ready', async () => {
            const request = await client.begin(false);

            let body: string = '';
            let stderr: string = '';

            request.params(params());

            request.on('stdout', (buffer: Buffer) => {
                body += buffer.toString();
            });
            request.on('stderr', (err: string) => {
                stderr += err;
            });
            request.on('end', (appStatus: number) => {
                expect(appStatus).toBe(0);
                expect(body).toContain('Hello world from PHP');
                expect(stderr.length).toBe(0);
                done();
            });

            request.done();
        });
    });
});
