function log(severity, message, metadata = {}) {
    console.log(JSON.stringify({
        severity,
        message,
        timestamp: new Date().toISOString(),
        ...metadata
    }));
}

module.exports = { log };