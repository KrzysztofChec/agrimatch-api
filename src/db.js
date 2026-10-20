const mongoose = require('mongoose');
const config = require('./config');

const state = { supportsTransactions: false };

async function connectDb() {
  await mongoose.connect(config.mongoUri);
  // Transactions need a replica set (Atlas has one) or a mongos router.
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  state.supportsTransactions = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  // Make sure indexes (unique email etc.) exist before serving traffic.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

module.exports = { connectDb, state };
