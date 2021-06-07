'use strict';

/**
 * SourceCheck Authentication controller (Auth.js)
 *
 * @description: Contains several actions used to sign up and sign in users using SSI
 */

const _ = require('lodash');
const { DateTime } = require('luxon');
const { sanitizeEntity } = require('strapi-utils');
const DIDKit = require('@spruceid/didkit');

const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const formatError = error => [{ messages: [{ id: error.id, message: error.message, field: error.field }]}];

module.exports = {

  // TODO implement this action
  signOut: async(ctx) => {
    ctx.send({
      result: 'Success',
      message: 'Sign out!',
    });
  },

  /**
   * Action used to process a sign up request
   * Receives the username and email from the user, creates an inactive user and sends a confirmation token to user via email
   */
  signUp: async (ctx) => {

    const scAuthService = strapi.plugins['sourcecheck'].services.auth;
    
    const pluginStore = await strapi.store({
      environment: '',
      type: 'plugin',
      name: 'users-permissions',
    });

    const settings = await pluginStore.get({ key: 'advanced' });

    if (!settings.allow_register) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.advanced.allow_register',
          message: 'Register action is currently disabled.',
        })
      );
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local', // TODO check if 'sourcecheck' should be used instead of 'local'
    };

    // Email is required.
    if (!params.email) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.provide',
          message: 'Please provide your email.',
        })
      );
    }

    // TODO define which role should be assigned to users not confirmed
    const role = await strapi
      .query('role', 'users-permissions')
      .findOne({ type: settings.default_role }, []);

    if (!role) {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.role.notFound',
          message: 'Impossible to find the default role.',
        })
      );
    }

    params.role = role.id;

    // Check if the provided email is valid or not.
    const isEmail = emailRegExp.test(params.email);

    if (isEmail) {
      params.email = params.email.toLowerCase();
    } else {
      return ctx.badRequest(
        null,
        formatError({
          id: 'Auth.form.error.email.format',
          message: 'Please provide valid email address.',
        })
      );
    }

    // Check if there is already an user with the provided email
    const user = await strapi.query('user', 'users-permissions').findOne({
      email: params.email,
    });

    if (user && user.provider === params.provider && settings.unique_email) {
      return ctx.badRequest( 
        null,
        formatError({
          id: 'Auth.form.error.email.taken',
          message: 'Email is already taken.',
        })
      );
    }

    try {
      params.confirmed = false;

      // Create user 
      const user = await strapi.query('user', 'users-permissions').create(params);

      const sanitizedUser = sanitizeEntity(user, {
        model: strapi.query('user', 'users-permissions').model,
      });

      try {
        await scAuthService.sendConfirmationEmail(user);
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

  /**
   * Returns a Verifiable Credential offer so the user can use it later to sign in
   */
  ssiSignUpRequest: async (ctx) => {
    const { confirmationToken } = ctx.request.query
    const key = strapi.config.get('ssi.issuerKey');
    const issuer = DIDKit.keyToDID('key', JSON.parse(key));
    
    // TODO check if there is a pending user with the given confirmation token
    const user = await strapi.query('user', 'users-permissions').findOne({ confirmationToken });

    // Generate issuance and expiration dates
    const now = DateTime.now();
    const issuanceDate = now.toUTC()
    const expirationDate = now.plus({ years: 1 }).toUTC();
    const expires = now.plus({ days: 1 }).toUTC();

    let cred = {
      type: 'CredentialOffer',
      credentialPreview: {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://www.w3.org/2018/credentials/examples/v1',
        ],
        type: ['VerifiableCredential', 'Person'],
        issuer,
        issuanceDate,
        expirationDate,
        credentialSubject: {},
      },
      expires,
    };
    ctx.body = JSON.stringify(cred);
    ctx.type = 'application/ld+json';
  },

  /**
   * Get confirmation token from request param
   * Get did of user from request body
   * If confirmation token is associated with a pending user:
   * - Update user in the database: set proper did and activate user (set confirmed=true)
   * - Returns a verifiable credential signed by SourceCheck
   */
  ssiSignUp: async (ctx) => {
    const { confirmationToken } = ctx.request.query
    const subjectId = ctx.request.body.subject_id;
    const userService = strapi.plugins['users-permissions'].services.user;
        
    // Check if there is pending user associated with the confirmation token
    const user = await strapi.query('user', 'users-permissions').findOne({ 
      confirmed: false,
      confirmationToken 
    });

    // TODO if there is no pending user, send error to user

    let jwt;

    if (user) {
      // Update user (attach DID and update confirmation fields)
      await userService.edit({ id: user.id }, { 
        did: subjectId,
        confirmed: true,
        confirmationToken: '', 
      });

      // Generate a jwt token for authentication
      jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));
    }

    // Get socket id and send result to user's web app
    strapi.redis.get(confirmationToken, (err, socketId) => {
      if (!err && jwt) {
        strapi.io.to(socketId).emit('jwt', jwt);
      }
    });

    const key = JSON.parse(strapi.config.get('ssi.issuerKey'));
    const issuer = DIDKit.keyToDID('key', key);
    const verificationMethod = DIDKit.keyToVerificationMethod('key', key);
    
    const now = DateTime.now();
    const issuanceDate = now.toISO()
    const expirationDate = now.plus({ years: 1 }).toISO();
    const proofPurpose = 'assertionMethod';

    let unsignedCred = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://www.w3.org/2018/credentials/examples/v1',
      ],
      type: ['VerifiableCredential', 'Person'],
      issuer,
      issuanceDate,
      expirationDate,
      credentialSubject: { id: subjectId },
    };
    let signedCred = DIDKit.issueCredential(unsignedCred, { proofPurpose, verificationMethod }, key);
    
    ctx.body = JSON.stringify(signedCred);
    ctx.type = 'application/ld+json';
  },

  /**
   * Sign-in request using a Verifiable Credential
   * This action returns a Verifiable Presentation request to be 
   */
  ssiSignInRequest: async (ctx) => {
    const { challenge } = ctx.request.query
    let vpRequest = {
      'type': 'VerifiablePresentationRequest',
      'query': [
        {
          'type': 'QueryByExample',
          'credentialQuery': [
            {
              'reason': 'Sign-up to SourceCheck.org',
              'example': {
                '@context': [
                  'https://www.w3.org/2018/credentials/v1', 
                  'https://www.w3.org/2018/credentials/examples/v1'
                ],
                'type': 'Person'
              }
            }
          ]
        }
      ],
      challenge,
      domain: strapi.config.get('server.url')
    };
    ctx.body = JSON.stringify(vpRequest);
    ctx.type = 'application/ld+json';
  },

  /**
   * Process the Verifiable Presentation provided by the user
   * If the VP is valid and the DID is already associated with an active user, sends a JWT token to the user's web app 
   */
  ssiSignIn: async (ctx) => {
    const { challenge } = ctx.request.query;
    const presentation = JSON.parse(ctx.request.body.presentation);
    
    // TODO Check result of verification
    const res = DIDKit.verifyPresentation(presentation, { challenge });
    const did = presentation.verifiableCredential.credentialSubject.id
    
    const query = { 
      did,
      confirmed: true
    };
    const user = await strapi.query('user', 'users-permissions').findOne(query);

    // Check if user is registered
    if (!user) {
      // TODO send error message through socket.it
      return ctx.badRequest(
        null,
        formatError({
          id: 'vp-auth.error.not_registered',
          message: 'User not registered!',
        })
      );
    }

    const sanitizedUser = sanitizeEntity(user, {
      model: strapi.query('user', 'users-permissions').model,
    });

    const jwt = strapi.plugins['users-permissions'].services.jwt.issue(_.pick(user, ['id']));

    // Get socket id and send result to user web app
    strapi.redis.get(challenge, (err, socketId) => {
      if (!err) {
        strapi.io.to(socketId).emit('auth', { 
          jwt, 
          user: sanitizedUser 
        });
      }
    });

    return ctx.send({
      jwt,
      user: sanitizedUser,
    });
  },

  protectedRoute: async (ctx) => {
    ctx.send({
      message: 'Protected Route!'
    });
  },

  unprotectedRoute: async (ctx) => {
    ctx.send({
      message: 'Unprotected Route!',
    });
  }
};
