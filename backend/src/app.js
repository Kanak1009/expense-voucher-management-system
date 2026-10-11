const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// crossOriginResourcePolicy relaxed so the React app (another origin) can display uploaded signatures
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientUrl }));
if (config.env !== 'test') app.use(morgan('dev'));
app.use(express.json({ limit: '100kb' }));

app.use('/uploads', express.static(config.uploadDir, { fallthrough: false, index: false }));
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
