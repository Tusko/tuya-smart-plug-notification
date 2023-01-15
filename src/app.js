const SmartPlug = require("./SmartPlug");
const fastify = require("fastify")

function init() {
  const app = fastify();
  app.get("/", (_, reply) => {
    const smartPlug = SmartPlug();

    reply.send({
      hello: smartPlug,
    });
  });
  return app;
}

console.log(require.main === module)

if (require.main !== module) {
  // called directly i.e. "node app"
  init().listen(3000, (err) => {
    if (err) console.error(err);
    console.log("server listening on 3000");
  });
} else {
  // required as a module => executed on aws lambda
  module.exports = init;
}
