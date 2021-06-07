'use strict';

/**
 * SourceCheck Publisher Credentials controller (PublisherCredentials.js)
 *
 * @description: Contains several actions used to issue Verifiable Credentials and request Verifiable Presentations for Publisher
 */

const { DateTime } = require('luxon');
const DIDKit = require('@spruceid/didkit');

module.exports = {

  /**
   * Offer Verifiable Credential to publisher
   */
  publisherCredentialOffer: async (ctx) => {
    const { uuid } = ctx.request.query;

    const publication = await strapi.services.publication.findOne({ uuid });
    if (!publication) return ctx.notFound("Publication not found!");
    if (!publication.pdf_raw_hash) return ctx.badRequest("Publication has no PDF file!");

    const key = strapi.config.get('ssi.issuerKey');
    const issuer = DIDKit.keyToDID('key', JSON.parse(key));
    
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
          {
            content: "https://schema.org/identifier",
            publisher: "https://schema.org/publisher",
          }
        ],
        type: ['VerifiableCredential'],
        issuer,
        issuanceDate,
        expirationDate,
        credentialSubject: {
          content: publication.pdf_raw_hash
        },
      },
      expires,
    };
    ctx.body = JSON.stringify(cred);
    ctx.type = 'application/ld+json';
  },

  /**
   * Issue Verifiable Credential to publisher
   */
  publisherCredentialIssuance: async (ctx) => {
    const subjectId = ctx.request.body.subject_id;
    const { uuid } = ctx.request.query;
    
    const publication = await strapi.services.publication.findOne({ uuid });
    if (!publication) return ctx.notFound("Publication not found!");
    if (!publication.pdf_raw_hash) return ctx.badRequest("Publication has no PDF file!");
        
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
        {
          content: "https://schema.org/identifier",
          publisher: "https://schema.org/publisher",
        },
      ],
      type: ['VerifiableCredential'],
      issuer,
      issuanceDate,
      expirationDate,
      credentialSubject: {
        publisher: subjectId,
        content: publication.pdf_raw_hash
      }
    };
    let signedCred = DIDKit.issueCredential(unsignedCred, { proofPurpose, verificationMethod }, key);
    await strapi.services.publication.update({ id: publication.id }, { publisher_vc_issued: true } );

    // Get socket id and send result to user web app
    strapi.redis.get(uuid, (err, socketId) => {
      if (!err) strapi.io.to(socketId).emit('publisher-cred-offer-done', {});
    });
    
    ctx.body = JSON.stringify(signedCred);
    ctx.type = 'application/ld+json';
  },

  /**
   * Request Verifiable Presentation to Publisher 
   */
  publisherPresentationRequest: async (ctx) => {
    const { uuid } = ctx.request.query
    let vpRequest = {
      'type': 'VerifiablePresentationRequest',
      'query': [
        {
          'type': 'QueryByExample',
          'credentialQuery': [
            {
              'reason': 'Share Publisher Verifiable Presentation',
              'example': {
                '@context': [
                  'https://www.w3.org/2018/credentials/v1', 
                  {
                    content: "https://schema.org/identifier",
                    publisher: "https://schema.org/publisher",
                  },
                ],
                'type': 'VerifiableCredential'
              }
            }
          ]
        }
      ],
      challenge: uuid,
      domain: strapi.config.get('server.url')
    };
    ctx.body = JSON.stringify(vpRequest);
    ctx.type = 'application/ld+json';
  },

  /**
   * Process Verifiable Presentation from publisher
   */
  publisherPresentationProcessing: async (ctx) => {
    const { uuid } = ctx.request.query;

    // Get publication
    let publication = await strapi.services.publication.findOne({ uuid });
    if (!publication) return ctx.notFound("Publication not found!");
    
    // Store verifiable presentation in publication
    const { presentation } = ctx.request.body;
    const publisher_vp = JSON.parse(presentation);
    // TODO handle verification errors
    const res = DIDKit.verifyPresentation(publisher_vp, { challenge: uuid });
    publication = await strapi.services.publication.update({ id: publication.id }, { publisher_vp } );

    // Notify frontend that the verifiable presentation was received
    strapi.redis.get(uuid, (err, socketId) => {
      if (!err) strapi.io.to(socketId).emit('publisher-pres-req-done', {});
    });

    return ctx.send({ result: 'Ok' });
  },

};
