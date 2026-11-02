const mongoose = require('../database');

/**
 * Executes a callback within a MongoDB session/transaction if replica set is supported,
 * or runs directly if on standalone MongoDB (which does not support multi-document transactions).
 * 
 * @param {Function} callback - Async function (session) => Promise<result>
 * @returns {Promise<any>}
 */
async function runInTransaction(callback) {
    if (mongoose.connection.readyState !== 1) {
        // If not connected, run callback directly
        return callback(null);
    }

    let session = null;
    try {
        session = await mongoose.startSession();
        // Check if replica set is supported
        let result;
        await session.withTransaction(async () => {
            result = await callback(session);
        });
        return result;
    } catch (err) {
        // If the error is that transactions are not supported on this deployment (standalone Mongo),
        // fallback to running without session
        if (err.message && (
            err.message.includes('Transaction numbers are only allowed on a replica set') ||
            err.message.includes('standalone') ||
            err.message.includes('not supported')
        )) {
            return callback(null);
        }
        throw err;
    } finally {
        if (session) {
            try {
                await session.endSession();
            } catch {}
        }
    }
}

module.exports = {
    runInTransaction
};
