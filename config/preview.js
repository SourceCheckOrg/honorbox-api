module.exports = ({ env }) => ({
  host: env("PREVIEW_HOST", "http://localhost"),
  port: env.int("PREVIEW_PORT", 3001),
});