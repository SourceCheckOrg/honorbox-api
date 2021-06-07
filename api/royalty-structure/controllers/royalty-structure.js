'use strict';
const { sanitizeEntity } = require('strapi-utils');
const MODEL = 'royalty-structure';

module.exports = {

  /**
   * Create a royalty structure
   */
  async create(ctx) {
    const data = ctx.request.body;
    data.owner = ctx.state.user.id;
    let entity = await strapi.services[MODEL].create(data);
    return sanitizeEntity(entity, { model: strapi.models[MODEL] });
  },

  /**
   * Update a royalty structure
   */
  async update(ctx) {
    const { id } = ctx.params;

    // Check if the user is the owner of the royalty structure
    const royaltyStructure = await strapi.services[MODEL].findOne({ id, 'owner.id': ctx.state.user.id });
    if (!royaltyStructure) return ctx.unauthorized("You can't update this royalty structure!");

    // Update royalty structure
    const entity = await strapi.services[MODEL].update({id}, ctx.request.body);
    return sanitizeEntity(entity, { model: strapi.models[MODEL] });
  },

  /**
   * Delete a royalty structure
   */
  async delete(ctx) {
    const { id } = ctx.params;
    
    // Check if the user is the owner of the royalty structure
    const royaltyStructure = await strapi.services[MODEL].findOne({ id, 'owner.id': ctx.state.user.id });
    if (!royaltyStructure) return ctx.unauthorized("You can't delete this royalty structure!");

    // Delete royalty structure
    await strapi.services[MODEL].delete({ id });

    return {
      result: 'Success',
      message: 'Royalty Structure deleted successfully!'
    }
  },

  /**
   * Retrieve royalty structures
   */
  async find(ctx) {
    let entities;
    let query;

    if (ctx.query._q) {
      query = ctx.query;
      query['owner.id'] = ctx.state.user.id;
      entities = await strapi.services[MODEL].search(query);
    } else {
      query = { 'owner.id': ctx.state.user.id }; 
      entities = await strapi.services[MODEL].find(query);
    }

    return entities.map((entity) =>
      sanitizeEntity(entity, { model: strapi.models[MODEL] })
    );
  },

  /**
   * Retrieve a royalty structure
   */
  async findOne(ctx) {
    const { id } = ctx.params;
    const entity = await strapi.services[MODEL].findOne({ id, 'owner.id': ctx.state.user.id });
    return sanitizeEntity(entity, { model: strapi.models[MODEL] });
  }

};
