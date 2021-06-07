'use strict';
const fs = require('fs');
const { parseMultipartData, sanitizeEntity } = require('strapi-utils');
const { v4: uuidv4 } = require('uuid');
const { buildRaw, attachData, reconstructRaw } = require('../lib/utils');

async function removeRawPDF(publication) {
  if (publication.pdf_raw) {
    const file = await strapi.plugins['upload'].services.upload.fetch({ id: publication.pdf_raw.id });
    await strapi.plugins['upload'].services.upload.remove(file);
  }
}

async function removeSignedPDF(publication) {
  if (publication.pdf_signed) {
    const file = await strapi.plugins['upload'].services.upload.fetch({ id: publication.pdf_signed.id });
    await strapi.plugins['upload'].services.upload.remove(file);
  }
}

function cleanUpCredentialsFields(data) {
  data.publisher_vc_issued = false;
  data.publisher_vp = null;
  data.pdf_signed = null;
  data.published = false;
}

module.exports = {
  /**
   * Create a publication
   */
  async create(ctx) {
    let entity;
    
    // Generate unique identifier for the publication
    const uuid = uuidv4();
    
    // Check if there is file attached
    if (ctx.is('multipart')) {
      const { data, files } = parseMultipartData(ctx);
      data.uuid = uuid;

      // Assign user as the owner of publication
      data.owner = ctx.state.user.id;

      // Build raw file based on original file
      const rawFile = await buildRaw(uuid, data.slug, files.pdf_raw.path);

      // Store hash of raw file
      data.pdf_raw_hash = rawFile.hash;
      delete rawFile.hash;

      // Replace uploaded file with generated raw file
      files.pdf_raw = rawFile;

      // Save publication
      entity = await strapi.services.publication.create(data, { files });

      // Delete temporary copy of raw file and temporary directory
      fs.unlinkSync(rawFile.path);
      fs.rmdirSync(`${process.cwd()}/public/uploads/${uuid}`);
    } else {
      const data = ctx.request.body;
      data.uuid = uuid;
      data.owner = ctx.state.user.id;
      entity = await strapi.services.publication.create(data);
    }
    return sanitizeEntity(entity, { model: strapi.models.publication });
  },

  /**
   * Update a publication
   */
  async update(ctx) {
    const { id } = ctx.params;

    // Check if the user is the owner of the publication
    const publication = await strapi.services.publication.findOne({ id, 'owner.id': ctx.state.user.id });
    if (!publication) return ctx.unauthorized("You can't update this publication!");

    let entity;
    await strapi.connections.default.transaction(async (transacting) => {
      // Check if there is attached file
      if (ctx.is('multipart')) {
        
        // Parse request
        const { data, files } = parseMultipartData(ctx);

        // Build raw file based on the original file
        const rawFile = await buildRaw(publication.uuid, publication.slug, files.pdf_raw.path);

        // If publication has already an attached file and the new file is different from the old one ...
        if (publication.pdf_raw && publication.pdf_raw_hash !== rawFile.hash) {
          
          // Remove the old file
          await removeRawPDF(publication);

          // Remove the old signed file, if it exists
          await removeSignedPDF(publication);

          // Clean up fields related to credentials
          cleanUpCredentialsFields(data);
        }

        // Store hash of raw file
        data.pdf_raw_hash = rawFile.hash;
        delete rawFile.hash;

        // Replace original file with raw file in publication
        files.pdf_raw = rawFile;

        // Perform update
        entity = await strapi.services.publication.update({ id }, data, { files });

        // Delete temporary copy of raw file and temporary dir
        fs.unlinkSync(rawFile.path);
        fs.rmdirSync(`${process.cwd()}/public/uploads/${publication.uuid}`);

      } else {
        const data = ctx.request.body;

        // If user is deleting the pdf file, pdf_raw is explicitly set to null (type 'object'), otherwise pdf_raw is not set in the request (type 'undefined')
        if (typeof data.pdf_raw === 'object') {
          removeRawPDF(publication);
          removeSignedPDF(publication);
          cleanUpCredentialsFields(data);
        }

        // Save publication
        entity = await strapi.services.publication.update({ id }, data );
      }
    });

    return sanitizeEntity(entity, { model: strapi.models.publication });
  },

  /**
   * Delete a publication
   */
  async delete(ctx) {
    const { id } = ctx.params;

    // Check if the user is the owner of the publication
    const publication = await strapi.services.publication.findOne({ id, 'owner.id': ctx.state.user.id });
    if (!publication) return ctx.unauthorized("You can't delete this publication!");

    // If the publication contains files attached, delete them as well
    await removeRawPDF(publication);
    await removeSignedPDF(publication);

    // Delete publication
    await strapi.services.publication.delete({ id });

    return {
      result: 'Success',
      message: 'Publication deleted successfully!'
    };
  },

  /**
   * Retrieve publications
   */
  async find(ctx) {
    let entities;
    let query;

    // Fetch publications
    if (ctx.query._q) {
      query = ctx.query;
      query['owner.id'] = ctx.state.user.id;
      entities = await strapi.services.publication.search(query);
    } else {
      query = { 'owner.id': ctx.state.user.id }; 
      entities = await strapi.services.publication.find(query);
    }

    return entities.map((entity) => sanitizeEntity(entity, { model: strapi.models.publication }));
  },

  /**
   * Retrieve a publication
   */
  async findOne(ctx) {
    const { id } = ctx.params;
    const entity = await strapi.services.publication.findOne({ id, 'owner.id': ctx.state.user.id });
    return sanitizeEntity(entity, { model: strapi.models.publication });
  },

  /**
   * Preview publication
   */
  async preview(ctx) {
    
    // Fetch publisher
    const publishersQuery =  { slug: ctx.query.publisher };
    const publisher = await strapi.services.publisher.findOne(publishersQuery);
    if (!publisher) {
      ctx.status = 404;
      return ctx.send ({ 
        result: 'Error',
        message: 'Publisher not found!',  
      });
    }
    
    // Fetch publication
    const publicationsQuery = { 'owner.id': publisher.owner.id, slug: ctx.query.title };
    const publication = await strapi.services.publication.findOne(publicationsQuery);
    if (!publication) {
      ctx.status = 404;
      return ctx.send ({
        result: 'Error',
        message: 'Publication not found!',
      });
    }

    // Check if publication has a PDF file, royalty structure and account
    const allowed = publication.pdf_signed && publication.royalty_structure && publication.royalty_structure.account;
    if (!allowed) {
      ctx.status = 404;
      return ctx.send ({
        result: 'Error',
        message: 'Publication not available of preview!',
      });
    }

    // Return data needed to preview publication
    return {
      title: publication.title,
      account: publication.royalty_structure.account,
      pdf_url: publication.pdf_signed.url
    }
  },

  /**
   * Publish publication
   */
  async publish(ctx) {
    const { id } = ctx.params;

    // Check if the user is the owner of the publication
    const publication = await strapi.services.publication.findOne({ id, 'owner.id': ctx.state.user.id });
    if (!publication) return ctx.unauthorized("You can't delete this publication!");

    // Publication is already published
    if (publication.published) return ctx.badRequest("Publication is already published!");

    // Publishing requires a verifiable presentation signed by the publisher
    if (!publication.publisher_vp) return ctx.badRequest("Publication is not in the proper state!");

    // Attach credential
    const signedFile = await attachData(publication);

    // Update published flag
    const data = { published: true };

    // Store signed PDF file in publication
    const files = { pdf_signed: signedFile };

    // Perform update
    await strapi.services.publication.update({ id }, data, { files });

    // Delete temporary copy of signed file and temporary dir
    fs.unlinkSync(signedFile.path);
    fs.rmdirSync(`${process.cwd()}/public/uploads/${publication.uuid}`);

    // Send response
    return {
      result: 'Success',
      message: `The publication was successfully published!`
    }
  },

  /*
   * Verify uploaded file
   */
  async verify(ctx) {
    // Parse uploaded file
    const { files } = parseMultipartData(ctx);
    const uploadedFile = files.upload;

    // Generate an unique identifier for this verification
    const uuid = uuidv4();

    try {
      // Extract verifiable credential from uploaded file and reconstruct raw file (hash)
      const { vp, hash } = await reconstructRaw(uuid, uploadedFile.name, uploadedFile.path);

      // TODO check VP signature using didkit
      
      // Check if file was not tempered
      const contentHash = vp.verifiableCredential.credentialSubject.content;
      if (hash !== contentHash) {
        return {
          result: 'Error',
          message: "PDF file tampered!"
        };
      }

      // Delete reconstructed file and temporary directory
      const dirPath = `${process.cwd()}/public/uploads/${uuid}`;
      const path = `${dirPath}/${uploadedFile.name}`;
      fs.unlinkSync(path);
      fs.rmdirSync(dirPath);

      return {
        result: 'Success',
        message: `The file signed by ${vp.verifiableCredential.credentialSubject.publisher} was successfully checked by Monetiza`
      }
    } catch (err) {
      return {
        result: 'Error',
        message: "PDF file doesn't contain valid verifiable credential!"
      };
    }
  }
};
