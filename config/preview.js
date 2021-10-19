module.exports = ({ env }) => ({
  url: env("PREVIEW_URL", "http://localhost:3002")
});