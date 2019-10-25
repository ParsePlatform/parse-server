/*eslint no-unused-vars: "off"*/
// Files Adapter
//
// Allows you to change the file storage mechanism.
//
// Adapter classes must implement the following functions:
// * createFile(filename, data, contentType)
// * deleteFile(filename)
// * getFileData(filename)
// * getFileLocation(config, filename)
// Adapter classes should implement the following functions:
// * validateFilename(filename)
//
// Default is GridFSBucketAdapter, which requires mongo
// and for the API server to be using the DatabaseController with Mongo
// database adapter.

import type { Config } from '../../Config';
import Parse from 'parse/lib/node/Parse';
/**
 * @module Adapters
 */
/**
 * @interface FilesAdapter
 */
export class FilesAdapter {
  /** Responsible for storing the file in order to be retrieved later by its filename
   *
   * @param {string} filename - the filename to save
   * @param {*} data - the buffer of data from the file
   * @param {string} contentType - the supposed contentType
   * @discussion the contentType can be undefined if the controller was not able to determine it
   *
   * @return {Promise} a promise that should fail if the storage didn't succeed
   */
  createFile(filename: string, data, contentType: string): Promise {}

  /** Responsible for deleting the specified file
   *
   * @param {string} filename - the filename to delete
   *
   * @return {Promise} a promise that should fail if the deletion didn't succeed
   */
  deleteFile(filename: string): Promise {}

  /** Responsible for retrieving the data of the specified file
   *
   * @param {string} filename - the name of file to retrieve
   *
   * @return {Promise} a promise that should pass with the file data or fail on error
   */
  getFileData(filename: string): Promise<any> {}

  /** Returns an absolute URL where the file can be accessed
   *
   * @param {Config} config - server configuration
   * @param {string} filename
   *
   * @return {string} Absolute URL
   */
  getFileLocation(config: Config, filename: string): string {}

  /** Validate a filename for this adaptor type (optional)1G
   *
   * @param {string} filename
   *
   * @returns {null|*|Parse.Error} null if there are no errors
   */
  // TODO: Make this required once enough people have updated their adaptors
  // validateFilename(filename): ?Parse.Error {}
}

/**
 * Default filename validate pulled out of FilesRouter.  Mostly used for Mongo storage
 *
 * @param filename
 * @returns {null|*|Parse.Error|Parse.ParseError|ParseError|ParseError|Parse.ParseError}
 */
export function validateFilename(filename): ?Parse.Error {
  if (filename.length > 128) {
    return new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename too long.');
  }

  // US/ASCII centric default
  const regx = /^[_a-zA-Z0-9][a-zA-Z0-9@. ~_-]*$/;
  if (!filename.match(regx)) {
    return new Parse.Error(
      Parse.Error.INVALID_FILE_NAME,
      'Filename contains invalid characters.'
    );
  }
  return null; // No errors
}

export default FilesAdapter;
