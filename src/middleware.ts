import { RequestHandler, Request, Response, NextFunction } from 'express';
import { createClient } from './client';
import { requestToParams } from './options';

export type FastCGIOptions = {
    address: string;
    documentRoot: string;
    debug?: boolean;
};

export function fastcgi(options: FastCGIOptions): RequestHandler {
    const params = {};

    const client = createClient({ ...options, params });
    const documentRoot = options.documentRoot;

    const handler = async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        const params = requestToParams(req, documentRoot);
        const request = await client.begin();

        return new Promise((resolve, reject) => {
            let error = '';

            request.on('stdout', (buffer: Buffer) => res.write(buffer));
            request.on('stderr', (line: string) => (error += line));

            request.on('end', (appStatus) => {
                if (appStatus) {
                    reject(new Error(error));
                } else {
                    res.end();
                    resolve();
                }
            });

            request.sendParams(params);

            if (req.headers['content-length']) {
                request.send(req);
            } else {
                request.done();
            }
        });
    };

    return handler;
}
