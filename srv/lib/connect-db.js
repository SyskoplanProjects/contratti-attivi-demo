// ponytail: profile detection (NODE_ENV=production) needs the app's own
// env, but one-off `cf ssh` / `cf run-task` shells don't always have it.
// VCAP_SERVICES presence means we're on Cloud Foundry with real bindings,
// so pull hana credentials straight out of it instead of trusting the profile.
async function connectDb(cds) {
  const vcap = process.env.VCAP_SERVICES && JSON.parse(process.env.VCAP_SERVICES);
  const hana = vcap?.hana?.[0];
  if (hana) {
    cds.env.requires.db = { kind: 'hana-cloud', dialect: 'hana', credentials: hana.credentials };
  }
  return cds.connect.to('db');
}

module.exports = { connectDb };
