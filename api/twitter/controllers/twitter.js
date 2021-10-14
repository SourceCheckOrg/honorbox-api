"use strict";
const { TwitterApi } = require('twitter-api-v2');
const { ethers } = require("ethers");
const { sanitizeEntity } = require('strapi-utils');

// Setup Twitter API
const appKey = strapi.config.get('twitter.appKey');
const appSecret = strapi.config.get('twitter.appSecret');
const consumerClient = new TwitterApi({ appKey, appSecret });
let client;

async function getClient() {
  if (!client) {
    client = await consumerClient.appLogin();
  }
  return client;
}

function validateUrl(url) {
  var pattern = new RegExp('^(https?:\\/\\/)?'+ // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
    '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
  return !!pattern.test(url);
}

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/concepts/controllers.html#core-controllers)
 * to customize this controller
 */

module.exports = {

  async find(ctx) {
    let query = { 'owner.id': ctx.state.user.id }; 
    let twitter = await strapi.services.twitter.findOne(query)
    return sanitizeEntity(twitter, { model: strapi.models.twitter });
  },
  
  async verify(ctx) {
    const { user } = ctx.state
    const { eth_addr: ethAddr } = user;
    const { username, tweetUrl } = ctx.request.body;
    const message = `Attestation: this twitter handle @${username} is linked to ethereum acct ${ethAddr} for @sourcecheckorg`;
    
    // Validate url
    const validUrl = validateUrl(tweetUrl);
    if (!validUrl) {
      return ctx.badRequest("Invalid URL!");
    }
    
    // Fetch tweet
    const tweetUrlSplit = tweetUrl.split('/');
    const tweetId = tweetUrlSplit[tweetUrlSplit.length - 1];
    const client = await getClient();
    const tweet = await client.v2.singleTweet(tweetId, { expansions: ['author_id'] });

    // Validate tweet
    if (tweet.errors) {
      return ctx.badRequest(tweet.errors[0].detail);
    }
    
    // Verify twitter handle
    const twitterUsername = tweet.includes.users[0].username;
    if (twitterUsername !== username) {
      return ctx.badRequest("Twitter handle doesn't match!");
    }

    // Validate tweet structure (original message and signature should be separate by '\n\n')
    if (!tweet.data.text.includes('\n\n')) {
      return ctx.badRequest("Invalid tweet content!");
    }

    // Validate content
    const contentSplit = tweet.data.text.split('\n\n');
    const signedMsg = contentSplit[0];
    if (!signedMsg === `Attestation: this twitter handle @${username} is linked to ethereum acct ${ethAddr} for @sourcecheckorg`) {
      return ctx.badRequest("Invalid tweet content!");
    }
    
    // Verify signature
    const signature = tweet.data.text.split('\n\n')[1];
    const signerAddr = ethers.utils.verifyMessage(message, signature);
    if (ethAddr !== signerAddr) {
      return ctx.badRequest("Invalid signature!");
    }

    // Issue VC (Verifiable Credential)
    const credService = strapi.plugins['sourcecheck'].services.credential;
    const credential = await credService.issueTwitterVC({
      ethAddr: ethAddr,
      twitterUsername
    });

    // Save verification on database
    const data = {
      owner: user,
      username,
      signature,
      verification_tweet_id: tweetId,
      credential,
      date: new Date()
    }
    await strapi.services.twitter.create(data);
    
    return {
      result: 'ok',
      username: username
    };
  }
};
