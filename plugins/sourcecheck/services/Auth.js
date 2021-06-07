"use strict";

/**
 * Auth.js service
 *
 * @description: A set of functions similar to controller's actions to avoid code duplication.
 */

const uuidv4 = require('uuid').v4;
const { sanitizeEntity } = require('strapi-utils');

module.exports = {

  sendConfirmationEmail: async (user) => {
    const userService = strapi.plugins["users-permissions"].services.user;
    const userPermissionService = strapi.plugins["users-permissions"].services.userspermissions;
    
    const pluginStore = await strapi.store({
      environment: "",
      type: "plugin",
      name: "users-permissions",
    });

    const settings = await pluginStore
      .get({ key: "email" })
      .then((storeEmail) => storeEmail["email_confirmation"].options);

    const userInfo = sanitizeEntity(user, {
      model: strapi.query("user", "users-permissions").model,
    });

    const confirmationToken = uuidv4();

    await userService.edit({ id: user.id }, { confirmationToken });

    const host = strapi.config.get('frontend.host', 'http://localhost');
    let port = strapi.config.get('frontend.port', 4000);
    port = (port !== 80) ? `:${port}` : ''; 
    const url = `${host}${port}/email-confirmation`;
    console.log('Auth.sendConfirmationEmail - url: ', url);

    settings.message = await userPermissionService.template(settings.message, {
      URL: url,
      USER: userInfo,
      CODE: confirmationToken,
    });

    settings.object = await userPermissionService.template(settings.object, {
      USER: userInfo,
    });

    // Send an email to the user.
    await strapi.plugins["email"].services.email.send({
      to: user.email,
      from:
        settings.from.email && settings.from.name
          ? `${settings.from.name} <${settings.from.email}>`
          : undefined,
      replyTo: settings.response_email,
      subject: settings.object,
      text: settings.message,
      html: settings.message,
    });
  },
};
