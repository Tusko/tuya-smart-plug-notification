'use strict';
const express = require('express');
const path = require('path');
const serverless = require('serverless-http');
const app = express();
const bodyParser = require('body-parser');
const smartPlug = require('../smart-plug');

const router = express.Router();
router.get('/', async (req, res) => {
  res.writeHead(200, {'Content-Type': 'text/html'});
  try {
    const {
      notify,
      latestStatus
    } = await smartPlug(false);

    res.write('<h2>Hello from Tuya Smart Plug!</h2><br>' + notify + '<br>' + JSON.stringify(latestStatus));
  } catch (err) {
    res.write('<h2>Hello from Tuya Smart Plug!</h2><br>' + err);
  }

  res.end();
});

app.use(bodyParser.json());
app.use('/.netlify/functions/server', router);  // path must route to lambda
app.use('/', (req, res) => res.sendFile(path.join(__dirname, '../index.html')));

module.exports = app;
module.exports.handler = serverless(app);
