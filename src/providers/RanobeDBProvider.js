const { createClient, ProviderError } = require('../utils/providerClient');
const client = createClient({ name: 'RanobeDB', url: 'https://ranobedb.org/api/v0', interval: 350, ttl: 6 * 3600000 });
async function getBookById(id, requestType = 'book') {
  if (!Number.isSafeInteger(id) || id <= 0 || !['book', 'series'].includes(requestType)) throw new ProviderError('Invalid RanobeDB request.', 400);
  return client.cached(`${requestType}:${id}`, async () => {
    const payload = await client.request(`/${requestType}/${id}`);
    const item = payload?.[requestType];
    if (!item || item.id !== id) throw new ProviderError('RanobeDB returned an unexpected data response.');
    return item;
  });
}
module.exports = { getBookById };
