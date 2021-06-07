module.exports = ({ env }) => ({
  issuerDid: env("ISSUER_DID"),
  issuerKey: env("ISSUER_KEY")
});
