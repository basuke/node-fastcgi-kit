export class Header {
    version: number = 0;
    type: number = 0;
    recordId: number = 0;
    contentLength: number = 0;
    paddingLength: number = 0;
}

export type Body = string | Buffer | null;

export class Record {
    requestId: number;
    type: number;
    body: Body;

    constructor(requestId: number, type: number, body: Body = null) {
        this.requestId = requestId;
        this.type = type;
        this.body = body;
    }
}
