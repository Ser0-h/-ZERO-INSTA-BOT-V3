'use strict';

async function resolveUserIDs(api, args) {
  const values = args
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim().replace(/^@/, ''))
    .filter(Boolean);
  const userIDs = [];

  for (const value of values) {
    if (/^\d+$/.test(value)) {
      userIDs.push(value);
      continue;
    }
    if (typeof api.getUserInfoByUsername !== 'function') {
      throw new Error(`Cannot resolve @${value} without username lookup support.`);
    }
    const user = await api.getUserInfoByUsername(value);
    const userID = user?.userID || user?.userId || user?.id;
    if (!userID) throw new Error(`Could not resolve @${value}.`);
    userIDs.push(String(userID));
  }

  return [...new Set(userIDs)];
}

module.exports = { resolveUserIDs };
