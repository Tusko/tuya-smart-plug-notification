const mysql = require('mysql2');
const {Client} = require('ssh2');
const sshClient = new Client();
const dotenv = require("dotenv");
dotenv.config();

const dbServer = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
}

const tunnelConfig = {
  host: process.env.DB_SSH_HOST,
  port: process.env.DB_SSH_PORT,
  username: process.env.DB_SSH_USER,
  password: process.env.DB_SSH_PASSWORD
}
const forwardConfig = {
  srcHost: '127.0.0.1',
  srcPort: 3306,
  dstHost: dbServer.host,
  dstPort: dbServer.port
};
const SSHConnection = new Promise((resolve, reject) => {
  sshClient.on('ready', () => {
    sshClient.forwardOut(
      forwardConfig.srcHost,
      forwardConfig.srcPort,
      forwardConfig.dstHost,
      forwardConfig.dstPort,
      (err, stream) => {
        if (err) reject(err);
        const updatedDbServer = {
          ...dbServer,
          stream
        };
        const connection = mysql.createConnection(updatedDbServer);
        connection.connect((error) => {
          if (error) {
            reject(error);
          }
          resolve(connection);
        });
      });
  }).connect(tunnelConfig);
});

const getLatestStatus = () => {
  return new Promise((resolve, reject) => {
    SSHConnection.then((connection) => {
      connection.query('SELECT (status, datetime) FROM de_svitlo WHERE id=(SELECT max(id) FROM de_svitlo)', function (_, results) {
        const [result] = results;
        resolve(result);
      });

      connection.end();
    }).catch((error) => {
      reject(error);
    });
  });
}

const insertStatus = (status, datetime) => {
  return new Promise((resolve, reject) => {
    SSHConnection.then((connection) => {
      connection.query(
        'INSERT INTO de_svitlo (status, datetime) VALUES (?,?)',
        [status, datetime], (error, results) => {
          if (error) reject(error);
          resolve(results);
        });

      connection.end();
    }).catch((error) => {
      reject(error);
    });
  });
}

module.exports = {
  getLatestStatus,
  insertStatus
}