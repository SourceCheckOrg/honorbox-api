module.exports = ({ env }) => ({
    email: {
      provider: 'nodemailer',
      providerOptions: {
        host: env("MAIL_HOST"),
        port: env.int("MAIL_PORT"),
        secure: env.bool("MAIL_SECURE"),
        auth: {
            user: env("MAIL_USER"),
            pass: env("MAIL_PASS"),
        }
      },
      settings: {
        defaultFrom: env("MAIL_FROM"),
        defaultReplyTo: env("MAIL_REPLY_TO"),
      },
    },
  });