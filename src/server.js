const config = require('./config');
const { connectDb } = require('./db');
const app = require('./app');

(async () => {
  await connectDb();
  app.listen(config.port, () => console.log(`AgriMatch API listening on :${config.port}`));
})().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
