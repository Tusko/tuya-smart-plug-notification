const SmartPlug = require("./SmartPlug");
const fastify = require("fastify");
const app = fastify();
const serverless = require("serverless-http");

app.get("/", (_, reply) => {
  // const sm = SmartPlug();
  reply.send({hello: 'test'});
});

module.exports.handler = serverless(app);