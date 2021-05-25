/**
 * The deprecations.
 *
 * Add deprecations to the array using the following keys:
 * - `optionKey` {String}: The option key incl. its path, e.g. `security.enableCheck`.
 * - `envKey` {String}: The environment key, e.g. `PARSE_SERVER_SECURITY`.
 * - `changeNewKey` {String}: Set the new key name if the current key will be replaced,
 * or set to an empty string if the current key will be removed without replacement.
 * - `changeNewDefault` {String}: Set the new default value if the key's default value
 * will change in a future version.
 * - `solution`: The instruction to resolve this deprecation warning. Optional. This
 * instruction must not include the deprecation warning which is auto-generated.
 * It should only contain additional instruction regarding the deprecation if
 * necessary.
 *
 * If there are no deprecations, this must return an empty array.
 */
module.exports = [
  {
    optionKey: 'directAccess',
    changeNewDefault: 'true',
    solution:
      "Additionally, the environment variable 'PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS' will be deprecated and renamed to 'PARSE_SERVER_DIRECT_ACCESS' in a future version; it is currently possible to use either one.",
  },
  { optionKey: 'enforcePrivateUsers', changeNewDefault: 'true' },
];
