module.exports = ({ env }) => ({
  host: env("FRONTEND_HOST", "http://localhost"),
  port: env.int("FRONTEND_PORT", 3000),
  url: env("FRONTEND_URL", "http://localhost:3000")
});
