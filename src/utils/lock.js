const mongoose = require('mongoose');
const { state } = require('../db');
const Machine = require('../models/Machine');

/**
 * Serialises every schedule change for one machine so two concurrent approvals
 * can never both pass the conflict check.
 *  - in-process mutex: always on (covers a single Render instance / local MongoDB)
 *  - MongoDB transaction + write to the machine document: when the server
 *    supports it (Atlas / replica set) - covers multiple instances.
 * `fn` receives a session (or null) and must pass it to every query it makes.
 */
const tails = new Map();

async function withMutex(key, fn) {
  const prev = tails.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((r) => { release = r; });
  const tail = prev.then(() => gate);
  tails.set(key, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

async function runLocked(machineId, fn) {
  return withMutex(String(machineId), async () => {
    if (!state.supportsTransactions) return fn(null);
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        await Machine.updateOne({ _id: machineId }, { $inc: { lock_version: 1 } }, { session });
        result = await fn(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  });
}

module.exports = { runLocked };
