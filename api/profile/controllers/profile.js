'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/concepts/controllers.html#core-controllers)
 * to customize this controller
 */

module.exports = {

  async fetch(ctx) {
    const { eth_profile_addr } = ctx.request.query;
    console.log('eth_profile_addr', eth_profile_addr)
    const user = await strapi.query('user', 'users-permissions').findOne({ eth_profile_addr });

    const data = {
      profileAddr: user.eth_profile_addr,
      displayName: user.displayName,
      username: user.username,
    }

    if (user.twitters.length > 0) {
      data.twitterHandle = user.twitters[0].username;
      data.twitterCred = user.twitters[0].credential;
    }

    if (user.domains.length > 0) {
      data.domainName = user.domains[0].domain;
      data.domainCred = user.domains[0].credential;
    }

    ctx.send(data);
  }
};
