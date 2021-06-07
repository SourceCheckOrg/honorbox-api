'use strict';
const { sanitizeEntity } = require('strapi-utils');

module.exports = {

  /**
   * Create a publisher
   */
  async create(ctx) {
    let entity;
    if (ctx.is('multipart')) {
      const { data, files } = parseMultipartData(ctx);
      data.owner = ctx.state.user.id;
      entity = await strapi.services.publisher.create(data, { files });
    } else {
      const data = ctx.request.body;
      data.owner = ctx.state.user.id;
      entity = await strapi.services.publisher.create(data);
    }
    return sanitizeEntity(entity, { model: strapi.models.publisher });
  },

  /**
   * Update a publisher
   */
  async update(ctx) {
    const { id } = ctx.params;

    // Check if the user is the owner of the publisher
    const publisher = await strapi.services.publisher.findOne({id, 'owner.id': ctx.state.user.id });
    if (!publisher) return ctx.unauthorized("You can't update this publisher!");

    // Update publisher
    let entity;
    if (ctx.is('multipart')) {
      const { data, files } = parseMultipartData(ctx);
      entity = await strapi.services.publisher.update({ id }, data, { files });
    } else {
      entity = await strapi.services.publisher.update({ id }, ctx.request.body );
    }

    return sanitizeEntity(entity, { model: strapi.models.publisher });
  },

  /**
   * Delete a publisher
   */
     async delete(ctx) {
      const { id } = ctx.params;
  
      // Check if the user is the owner of the publisher
      const publisher = await strapi.services.publisher.findOne({ id, 'owner.id': ctx.state.user.id });
      if (!publisher) return ctx.unauthorized("You can't delete this publisher!");
  
      // Delete publisher
      await strapi.services.publisher.delete({ id });
  
      return {
        result: 'Success',
        message: 'Publisher deleted successfully!'
      };
    },

  /**
   * Retrieve publishers
   */
  async find(ctx) {
    const query = { 'owner.id': ctx.state.user.id };
    let entities = await strapi.services.publisher.find(query);
    if (entities.length > 0) {
      return sanitizeEntity(entities[0], { model: strapi.models.publisher });
    } 
    return {};
  },

  /**
   * Retrieve a publisher
   */
  async findOne(ctx) {
    const { id } = ctx.params;
    const entity = await strapi.services.publisher.findOne({ id, 'owner.id': ctx.state.user.id });
    return sanitizeEntity(entity, { model: strapi.models.publisher });
  }
};
