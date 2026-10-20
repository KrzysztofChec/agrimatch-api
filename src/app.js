const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const requireJson = require('./middleware/requireJson');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Render's proxy
app.use(helmet());
app.use(cors());
if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/v1', requireJson, express.json({ limit: '100kb' }), routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
