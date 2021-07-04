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
// * handleFileStream(filename, req, res, contentType)
//
// Default is GridFSBucketAdapter, which requires mongo
// and for the API server to be using the DatabaseController with Mongo
// database adapter.

import type { Config } from '../../Config';
import Parse from 'parse/node';
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
   * @param {object} options - (Optional) options to be passed to file adapter (S3 File Adapter Only)
   * - tags: object containing key value pairs that will be stored with file
   * - metadata: object containing key value pairs that will be sotred with file (https://docs.aws.amazon.com/AmazonS3/latest/user-guide/add-object-metadata.html)
   * @discussion options are not supported by all file adapters. Check the your adapter's documentation for compatibility
   *
   * @return {Promise} a promise that should fail if the storage didn't succeed
   */
  createFile(filename: string, data, contentType: string, options: Object): Promise {}

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
  getFileData(filename: string, query: object | null): Promise<any> {}

  /** Returns an absolute URL where the file can be accessed
   *
   * @param {Config} config - server configuration
   * @param {string} filename
   *
   * @return {string} Absolute URL
   */
  getFileLocation(config: Config, filename: string): string {}

  /** Validate a filename for this adapter type
   *
   * @param {string} filename
   *
   * @returns {null|Parse.Error} null if there are no errors
   */
  // validateFilename(filename: string): ?Parse.Error {}

  /** Handles Byte-Range Requests for Streaming
   *
   * @param {string} filename
   * @param {object} req
   * @param {object} res
   * @param {string} contentType
   *
   * @returns {Promise} Data for byte range
   */
  // handleFileStream(filename: string, res: any, req: any, contentType: string): Promise

  /** Responsible for retrieving metadata and tags
   *
   * @param {string} filename - the filename to retrieve metadata
   *
   * @return {Promise} a promise that should pass with metadata
   */
  // getMetadata(filename: string): Promise<any> {}
}

/**
 * Simple filename validation
 *
 * @param filename
 * @returns {null|Parse.Error}
 */
export function validateFilename(filename): ?Parse.Error {
  if (filename.length > 128) {
    return new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename too long.');
  }

  const regx = /^[_a-zA-Z0-9][a-zA-Z0-9@. ~_-]*$/;
  if (!filename.match(regx)) {
    return new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.');
  }
  return null;
}

export default FilesAdapter;
