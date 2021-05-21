import Parse from 'parse/node';
import { EnvelopError } from '@envelop/core';

export function enforceMasterKeyAccess(auth) {
  if (!auth.isMaster) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'unauthorized: master key is required');
  }
}

export function toGraphQLError(error) {
  let code, message;
  if (error instanceof Parse.Error) {
    code = error.code;
    message = error.message;
  } else {
    code = Parse.Error.INTERNAL_SERVER_ERROR;
    message = 'Internal server error';
  }
  return new EnvelopError(message, {
    code,
  });
}

export const extractKeysAndInclude = selectedFields => {
  selectedFields = selectedFields.filter(field => !field.includes('__typename'));
  // Handles "id" field for both current and included objects
  selectedFields = selectedFields.map(field => {
    if (field === 'id') return 'objectId';
    return field.endsWith('.id')
      ? `${field.substring(0, field.lastIndexOf('.id'))}.objectId`
      : field;
  });
  let keys = undefined;
  let include = undefined;

  if (selectedFields.length > 0) {
    keys = [...new Set(selectedFields)].join(',');
    // We can use this shortcut since optimization is handled
    // later on RestQuery, avoid overhead here.
    include = keys;
  }

  return {
    // If authData is detected keys will not work properly
    // since authData has a special storage behavior
    // so we need to skip keys currently
    keys: keys && keys.indexOf('authData') === -1 ? keys : undefined,
    include,
  };
};

export const getParseClassMutationConfig = function (parseClassConfig) {
  return (parseClassConfig && parseClassConfig.mutation) || {};
};
