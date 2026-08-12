// ponytail: profile detection (NODE_ENV=production) needs the app's own
// env, but one-off `cf ssh` / `cf run-task` shells don't always have it.
// VCAP_SERVICES presence means we're on Cloud Foundry with real bindings,
// so force hana-cloud directly instead of trusting the profile.
async function connectDb(cds) {
  if (process.env.VCAP_SERVICES && JSON.parse(process.env.VCAP_SERVICES).hana) {
    cds.env.requires.db = { kind: 'hana-cloud' };
  }
  return cds.connect.to('db');
}

module.exports = { connectDb };
