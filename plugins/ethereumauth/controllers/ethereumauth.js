'use strict';
const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const { sanitizeEntity } = require('strapi-utils');
const { ethers } = require("ethers");
const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

async function sendConfirmationEmail(user) {
  const confirmationToken = uuidv4();
  const userService = strapi.plugins["users-permissions"].services.user;
  await userService.edit({ id: user.id }, { confirmationToken });
  const profileUrl = strapi.config.get('profile.url');
  const url = `${profileUrl}/email-verification?confirmationToken=${confirmationToken}`;
  const from = strapi.config.get('mail.defaultFrom');
  const to = user.email;
  const replyTo = strapi.config.get('mail.defaultReplyTo');
  const subject = 'SourceCheck Profile - Email confirmation';
  const text = `Thank you for registering!\n` +  
               `You have to confirm your email address. Open the link below in your browser:\n` + 
               `${url}\n` + 
               `Thanks!` 
  const html = `<p>Thank you for registering!</p>` + 
               `<p>You have to confirm your email address. Please click on the link below:</p>` + 
               `<p><a href="${url}">${url}</a></p>`+ 
               `<p>Thanks!</p>`;
  await strapi.plugins["email"].services.email.send({ from, to, replyTo, subject, text, html });
}

/**
 * ethereumauth.js controller
 *
 * @description: A set of functions called "actions" of the `ethereumauth` plugin.
 */

module.exports = {

  /**
   * Default action.
   *
   * @return {Object}
   */

  index: async (ctx) => {
    // Send 200 `ok`
    ctx.send({
      message: 'ok'
    });
  },

  signInNonce: async (ctx) => {
    const { ethAddr } = ctx.request.body;

    // Check if user is registered
    const user = await strapi.query('user', 'users-permissions').findOne({ eth_addr: ethAddr });
    if (!user) {
      return ctx.badRequest('User is not registered!');
    }

    // Generate nonce to be signed by the user
    const nonce = uuidv4();

    // Associate nonce to username and store in redis. Expires in 10min
    await strapi.redis.set(`SIGNIN_${user.username}`, nonce, { EX: 600 });

    ctx.send({
      message: 'ok',
      nonce,
    });
  },

  signIn: async (ctx) => {
    const { ethAddr, signature } = ctx.request.body;

    // Check if user is registered
    const user = await strapi.query('user', 'users-permissions').findOne({ eth_addr: ethAddr });
    if (!user) {
      return ctx.badRequest('User is not registered!');
    }

    // Get nonce created for this user
    const nonce = await strapi.redis.get(`SIGNIN_${user.username}`);
    if (!nonce) {
      return ctx.badRequest('Session ID was expired or not found!');
    }

    // Verify signed message
    const message = `Welcome to SourceCheck!\n\nSign in using ethereum account ${ethAddr} on Polygon Mainnet\n\nSession ID: ${nonce}`;
    const signerAddr = await ethers.utils.verifyMessage(message, signature);
    if (signerAddr != ethAddr) {
      return ctx.badRequest('Invalid signature!');
    }

    // Generate a jwt token for authentication
    const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));
    
    // Sanitize user and send on response
    const sanitizedUser = sanitizeEntity(user, {
      model: strapi.query('user', 'users-permissions').model,
    });
    
    ctx.send({
      message: 'ok',
      jwt,
      user: sanitizedUser,
    });
  },

  signUp: async (ctx) => {
    const { username, email, eth_addr, signature } = ctx.request.body;

    // Get nonce created for this user
    const nonce = await strapi.redis.get(`SIGNUP_${username}`);
    if (!nonce) {
      return ctx.badRequest('Session ID was expired or not found!');
    }

    // Verify signed message
    const message = `Welcome to SourceCheck!\n\nSign up using ethereum account ${eth_addr} on Polygon\n\nSession ID: ${nonce}`;
    const signerAddr = await ethers.utils.verifyMessage(message, signature);
    if (signerAddr != eth_addr) {
      return ctx.badRequest('Invalid signature!');
    }

    // Create deactivated user
    const pluginStore = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    const settings = await pluginStore.get({ key: 'advanced' });

    if (!settings.allow_register) {
      return ctx.badRequest('Sign up is currently disabled!');
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local', // TODO check if 'ethereumauth' should be used instead of 'local'
    };

    // Email is required.
    if (!params.email) {
      return ctx.badRequest('Email address was not provided!');
    }

    // Define which role should be assigned to users not confirmed
    const role = await strapi.query('role', 'users-permissions').findOne({ type: settings.default_role }, []);
    if (!role) {
      return ctx.badRequest('Impossible to find the default role for new users!');
    }
    params.role = role.id;

    // Check if the provided email is valid or not
    const validEmailAddress = emailRegExp.test(params.email);
    if (validEmailAddress) {
      params.email = params.email.toLowerCase();
    } else {
      return ctx.badRequest('Invalid email address!');
    }

    // Check if there is already an user with the provided email
    const user = await strapi.query('user', 'users-permissions').findOne({ email: params.email });
    if (user && user.provider === params.provider && settings.unique_email) {
      return ctx.badRequest('Email address is already taken!');
    }

    try {
      params.confirmed = false;

      // Create user 
      const user = await strapi.query('user', 'users-permissions').create(params);
      const sanitizedUser = sanitizeEntity(user, { model: strapi.query('user', 'users-permissions').model });

      // Send confirmation email
      try {
        await sendConfirmationEmail(user);
      } catch (err) {
        return ctx.badRequest(null, err);
      }

      return ctx.send({ user: sanitizedUser });
    } catch (err) {
      const adminError = _.includes(err.message, 'username')
        ? {
            id: 'Auth.form.error.username.taken',
            message: 'Username already taken',
          }
        : { 
            id: 'Auth.form.error.email.taken', 
            message: 'Email already taken' 
        };

      ctx.badRequest(null, formatError(adminError));
    }
  },

  signUpEmailVerification: async (ctx) => {
    const { confirmationToken } = ctx.request.body;
    const userService = strapi.plugins['users-permissions'].services.user;

    // Check if there is a pending user associated with the confirmation token
    const user = await strapi.query('user', 'users-permissions').findOne({ confirmed: false, confirmationToken });
    if (!user) {
      return ctx.badRequest("No user found associated with this confirmation token");
    }

    // Activate user
    await userService.edit({ id: user.id }, { 
      confirmed: true,
      confirmationToken: '', 
    });

    // Generate a jwt token for authentication
    const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));
    
    const sanitizedUser = sanitizeEntity(user, {
      model: strapi.query('user', 'users-permissions').model,
    });
    
    ctx.send({
      message: 'ok',
      jwt,
      user: sanitizedUser,
    });
  },

  signUpNonce: async (ctx) => {
    const { username, email } = ctx.request.body;

    // Check if username is available
    let user = await strapi.query('user', 'users-permissions').findOne({ username });
    if (user) {
      return ctx.badRequest('Username was already taken!');
    }

    // Check if email is available
    user = await strapi.query('user', 'users-permissions').findOne({ email });
    if (user) {
      return ctx.badRequest('Email was already taken!');
    }

    // Generate nonce to be signed by the user
    const nonce = uuidv4();

    // Associate nonce to username and store in redis. Expires in 10min
    await strapi.redis.set(`SIGNUP_${username}`, nonce, { EX: 600 });

    ctx.send({
      message: 'ok',
      nonce,
    });
  },

  updateUser: async (ctx) => {
    // Check if data was sent to update
    const { displayName, ethAddr, ethProfileAddr } = ctx.request.body;
    if (!displayName && !ethAddr && !ethProfileAddr) {
      return ctx.badRequest('No data sent to update!');
    }

    // Update user
    const id = ctx.state.user.id;
    const data = {}
    if (displayName) {
      data.displayName = displayName;
    }
    if (ethAddr) {
      data.eth_addr = ethAddr;
    }
    if (ethProfileAddr) {
      data.eth_profile_addr = ethProfileAddr;
    }
    await strapi.query('user', 'users-permissions').update({ id }, data); 

    ctx.send({
      message: 'ok',
    });
  }

};