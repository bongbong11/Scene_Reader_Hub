const MiB = 1048576;
const LIMITS = Object.freeze({pageBytes:256*1024, partBytes:MiB, requestBytes:2*MiB, documentBytes:128*MiB, batchBytes:4*MiB, cacheBytes:16*MiB});
function failure(code, message, status=400) { return Object.assign(new Error(message), {code,status}); }
module.exports={LIMITS,failure};
