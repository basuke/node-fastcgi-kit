import {
    Express,
    RequestHandler,
    Request,
    Response,
    NextFunction,
} from 'express';

export type FastCGIOptions = {
    address: string;
    debug?: boolean;
};

export function fastcgi(options: FastCGIOptions): RequestHandler {
    const handler = (req: Request, res: Response, next: NextFunction): void => {
        next();
    };

    return handler;
}
