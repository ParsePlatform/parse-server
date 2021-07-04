export const ErrorMessage = {
  READ_ONLY_MASTER_KEY: () => 'Cannot perform a write operation when using readOnlyMasterKey.',
  MISSING_OBJECT_ID: () => 'objectId must not be empty, null or undefined.',
  INVALID_KEY_NAME: value => value + ' is an invalid field name.',
  USER_NO_ACCESS_CLASS: className =>
    'This user is not allowed to access ' + 'non-existent class: ' + className,
  OBJECT_NOT_FOUND: () => 'Object not found.',
  FIELD_IS_REQUIRED: fieldName =>
    'A value for the ' + fieldName + ' test is required to save/update the object.',
  USERNAME_MISSING: () => 'bad or missing username',
  PASSWORD_MISSING: () => 'password is required',
  UNSUPPORTED_SERVICE: () => 'This authentication method is unsupported.',
  ACCOUNT_LINKED: () => 'this auth is already used',
  CLIENT_EMAIL_VERIFICATION: () => "Clients aren't allowed to manually update email verification.",
  USERNAME_TAKEN: () => 'Account already exists for this username.',
  INVALID_EMAIL_ADDRESS_FORMAT: () => 'Email address format is invalid.',
  EMAIL_TAKEN: () => 'Account already exists for this email address.',
  PASSWORD_POLICY: () => 'Password does not meet the Password Policy requirements.',
  USERNAME_IN_PASSWORD: () => 'Password cannot contain your username.',
  PASSWORD_MATCHES_EXISTING_PASSWORD: maxPasswordHistory =>
    'New password should not be the same as last ' + maxPasswordHistory + ' passwords.',
  INVALID_SESSION_TOKEN: () => 'Session token required.',
  ACL_SESSION: () => 'Cannot set ' + 'ACL on a Session.',
  SESSION_ERROR: () => 'Error creating session.',
  MIN_ONE_ID_FIELD: () =>
    'at least one ID field (deviceToken, installationId) must be specified in this operation',
  UNKNOWN_OBJECT_UPDATE: () => 'Object not found for update.',
  NO_OP: field => field + ' may not be changed in this operation',
  REQ_OP: field => field + ' must be specified in this operation',
  INSTALLATION_ID_WITH_DEVICE_TOKEN: () =>
    'Must specify installationId when deviceToken matches multiple Installation objects',
  USER_NO_MODIFY: field => 'Cannot modify user' + field + '.',
  INVALID_ACL: () => 'Invalid ACL.',
  DUPLICATE_VALUE: () => 'A duplicate value for a field with unique values was provided',
};
