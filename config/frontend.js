module.exports = ({ env }) => ({
  url: env("FRONTEND_URL", "http://localhost:3000")
});
