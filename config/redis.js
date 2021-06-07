module.exports = ({ env }) => ({
  host: env("REDIS_HOST", "127.0.0.1"),
  port: env.int("REDIS_PORT", 6379),
});
