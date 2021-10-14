"use strict";
const DIDKit = require('@spruceid/didkit');
const uuidv4 = require('uuid').v4;
const { DateTime } = require('luxon');

/**
 * credential.js service
 *
 * @description: Service that handles verifiable credentials
 */

module.exports = {

  issueDomainVC: async ({ethAddr, domainName}) => {
    const key = JSON.parse(strapi.config.get('ssi.issuerKey'));
    const issuer = strapi.config.get('ssi.issuerDid', 'did:web:verification.sourcecheck.org');
    const verificationMethod = strapi.config.get('ssi.verificationMethod', 'did:web:verification.sourcecheck.org#owner');

    const id = `urn:uuid:${uuidv4()}`;
    const type = ['VerifiableCredential', "DnsVerification"];
    const now = DateTime.now();
    const issuanceDate = now.toISO();
    const expirationDate = now.plus({ years: 1 }).toISO();
    const credentialSubject = {
      id: `did:pkh:eip155:137:${ethAddr}`,
      sameAs: `dns:${domainName}`,
    };
    const proofPurpose = 'assertionMethod';

    let unsignedCred = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        {
          sameAs: "http://schema.org/sameAs",
          DnsVerification: "https://tzprofiles.com/DnsVerification",
          DnsVerificationMessage: {
            "@id": "https://tzprofiles.com/DnsVerificationMessage",
            "@context": {
              "@version": 1.1,
              "@protected": true,
              timestamp: {
                  "@id": "https://tzprofiles.com/timestamp",
                  "@type": "http://www.w3.org/2001/XMLSchema#dateTime"
              },
              dnsServer: "https://tzprofiles.com/dnsServer",
            }
          }
        },
      ],
      id,
      type,
      issuer,
      issuanceDate,
      expirationDate,
      credentialSubject
    };

    const credential = await DIDKit.issueCredential(unsignedCred, { proofPurpose, verificationMethod }, key);
    return credential;
  },

  issueTwitterVC: async ({ethAddr, twitterUsername}) => {
    const key = JSON.parse(strapi.config.get('ssi.issuerKey'));
    const issuer = strapi.config.get('ssi.issuerDid', 'did:web:verification.sourcecheck.org');
    const verificationMethod = strapi.config.get('ssi.verificationMethod', 'did:web:verification.sourcecheck.org#owner');

    const id = `urn:uuid:${uuidv4()}`;
    const type = ['VerifiableCredential', "TwitterVerification"];
    const now = DateTime.now();
    const issuanceDate = now.toISO();
    const expirationDate = now.plus({ years: 1 }).toISO();
    const credentialSubject = {
      id: `did:pkh:eip155:137:${ethAddr}`,
      sameAs: `https://twitter.com/${twitterUsername}`
    };
    const proofPurpose = 'assertionMethod';

    let unsignedCred = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        {
          sameAs: "http://schema.org/sameAs",
          TwitterVerification: "https://tzprofiles.com/TwitterVerification",
          TwitterVerificationPublicTweet: {
            "@id": "https://tzprofiles.com/TwitterVerificationPublicTweet",
            "@context": {
              "@version": 1.1,
              "@protected": true,
              handle: "https://tzprofiles.com/handle",
              timestamp: {
                "@id": "https://tzprofiles.com/timestamp",
                "@type": "http://www.w3.org/2001/XMLSchema#dateTime"
              },
              tweetId: "https://tzprofiles.com/tweetId"
            }
          }
        },
      ],
      id,
      type,
      issuer,
      issuanceDate,
      expirationDate,
      credentialSubject
    };

    const credential = await DIDKit.issueCredential(unsignedCred, { proofPurpose, verificationMethod }, key);
    return credential;
  }
};
