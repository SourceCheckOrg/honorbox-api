module.exports = ({ env }) => ({
  url: env("PROFILE_URL", "http://localhost")
});