"use strict";
const redis = require("redis");

/**
 * An asynchronous bootstrap function that runs before
 * your application gets started.
 *
 * This gives you an opportunity to set up your data model,
 * run jobs, or perform some special logic.
 *
 * See more details here: https://strapi.io/documentation/developer-docs/latest/concepts/configurations.html#bootstrap
 */

module.exports = async () => {
  process.nextTick(() => {
    // Setup redis client and register it in strapi main object to use it globally
    const redisHost = strapi.config.get("redis.host");
    const redisPort = strapi.config.get("redis.port");
    const url = `redis://${redisHost}:${redisPort}`;
    console.log("Initializing Redis at: ", url);
    const client = redis.createClient({ url });
    client.connect()
    strapi.redis = client;
  });
};

