module.exports = ({ env }) => ({
  host: env("MAIL_HOST"),
  port: env.int("MAIL_PORT"),
  secure: env.bool("MAIL_SECURE"),
  user: env("MAIL_USER"),
  pass: env("MAIL_PASS"),
  defaultFrom: env("MAIL_FROM"),
  defaultReplyTo: env("MAIL_REPLY_TO"),
});
