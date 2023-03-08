export const version = 1;

export enum FCGIRecord {
    FCGI_BEGIN,
    FCGI_ABORT,
    FCGI_END,
    FCGI_PARAMS,
    FCGI_STDIN,
    FCGI_STDOUT,
    FCGI_STDERR,
    FCGI_DATA,
    FCGI_GET_VALUES,
    FCGI_GET_VALUES_RESULT,
    FCGI_UNKNOWN_TYPE,
}

export enum KeepAlive {
    OFF = 0,
    ON,
}

export const FCGIHeaderLength = 8;
export const FCGIMaxBody = Math.pow(2, 16);

// "errors": {
//     "BUFFER_OVERFLOW": {
//         "err": 1,
//         "description": "buffer overflow"
//     },
//     "MAX_BODY_EXCEEDED": {
//         "err": 2,
//         "description": "a body greater than maximum body size was read/written"
//     }
// },
// "role": {
//     "FCGI_RESPONDER": 1,
//     "FCGI_AUTHORIZER": 2,
//     "FCGI_FILTER": 3
// },
// "protocol": {
//     "status": {
//         "FCGI_REQUEST_COMPLETE": 0,
//         "FCGI_CANT_MPX_CONN": 1,
//         "FCGI_OVERLOADED": 2,
//         "FCGI_UNKNOWN_ROLE": 3
//     }
// },
// "values": {
//     "FCGI_MAX_CONNS": "FCGI_MAX_CONNS",
//     "FCGI_MAX_REQS": "FCGI_MAX_REQS",
//     "FCGI_MPXS_CONNS": "FCGI_MPXS_CONNS"
// }
