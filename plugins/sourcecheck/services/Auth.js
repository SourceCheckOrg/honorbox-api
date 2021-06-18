"use strict";

/**
 * Auth.js service
 *
 * @description: A set of functions similar to controller's actions to avoid code duplication.
 */

const uuidv4 = require('uuid').v4;

module.exports = {

  sendConfirmationEmail: async (user) => {
    const confirmationToken = uuidv4();
    const userService = strapi.plugins["users-permissions"].services.user;
    await userService.edit({ id: user.id }, { confirmationToken });
    const host = strapi.config.get('frontend.host', 'http://localhost');
    const port = strapi.config.get('frontend.port', 4000);
    const url = `${host}${port != 80 ? `:${port}` : ``}/email-confirmation?confirmation=${confirmationToken}`;
    const from = strapi.config.get('mail.defaultFrom');
    const to = user.email;
    const replyTo = strapi.config.get('mail.defaultReplyTo');
    const subject = 'HonorBox - Email confirmation';
    const text = `Thank you for registering!\n` +  
                 `You have to confirm your email address. Open the link below in your browser:\n` + 
                 `${url}\n` + 
                 `Thanks!` 
    const html = `<p>Thank you for registering!</p>` + 
                 `<p>You have to confirm your email address. Please click on the link below:</p>` + 
                 `<p><a href="${url}">${url}</a></p>`+ 
                 `<p>Thanks!</p>`;
    await strapi.plugins["email"].services.email.send({ from, to, replyTo, subject, text, html });
  },
};
