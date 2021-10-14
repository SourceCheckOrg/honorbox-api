module.exports = ({ env }) => ({
  appKey: env("TWITTER_APP_KEY"),
  appSecret: env("TWITTER_APP_SECRET"),
});
