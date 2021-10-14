'use strict';
const { ethers } = require("ethers");
const { sanitizeEntity } = require('strapi-utils');
const dns = require('dns')
const dnsPromises = dns.promises;

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/concepts/controllers.html#core-controllers)
 * to customize this controller
 */
module.exports = {

   async find(ctx) {
    let query = { 'owner.id': ctx.state.user.id }; 
    let domain = await strapi.services.domain.findOne(query)
    return sanitizeEntity(domain, { model: strapi.models.domain });
  },

  async verify(ctx) {
    const { user } = ctx.state;
    const { eth_addr: ethAddr } = user;
    const { domainName } = ctx.request.body;
    const message = `Ethereum Signed Message: ${domainName} is linked to ${ethAddr}`
    
    let signature;
    let verified = false;
    let errorMsg = 'DNS TXT record not found!';
    
    const txtRecords = await dnsPromises.resolve(domainName, 'TXT');
    txtRecords.forEach(subRecords => {
      subRecords.forEach(async txtRecord => {
        if (txtRecord.startsWith('sc-profile-verification')) {
          signature = txtRecord.substring(24);
          const signerAddr = ethers.utils.verifyMessage(message, signature);
          if (ethAddr === signerAddr) {
            verified = true;
          } else {
            errorMsg = 'Invalid signature found on DNS TXT record!';
          }
          return;
        }
      });
    });

    if (!verified) {
      return ctx.badRequest(errorMsg);
    }

    // Issue VC (Verifiable Credential)
    const credService = strapi.plugins['sourcecheck'].services.credential;
    const credential = await credService.issueDomainVC({
      ethAddr: ethAddr,
      domainName
    });

    // Save verification on database
    const data = {
      owner: user,
      domain: domainName,
      signature,
      credential,
      date: new Date()
    }
    await strapi.services.domain.create(data);

    return {
      result: 'ok',
      domainName: domainName
    };
  }
};
