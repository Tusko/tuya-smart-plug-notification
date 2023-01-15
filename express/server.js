'use strict';
const express = require('express');
const path = require('path');
const serverless = require('serverless-http');
const app = express();
const bodyParser = require('body-parser');
const smartPlug = require('../smart-plug');

const router = express.Router();
router.get('/', async (req, res) => {
  let spData;
  try {
    spData = await smartPlug();
  } catch (err) {
    spData = err;
  }

  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write('<h2>Hello from Tuya Smart Plug!</h2><br>' + spData);
  res.end();
});

app.use(bodyParser.json());
app.use('/.netlify/functions/server', router);  // path must route to lambda
app.use('/', (req, res) => res.sendFile(path.join(__dirname, '../index.html')));

module.exports = app;
module.exports.handler = serverless(app);
