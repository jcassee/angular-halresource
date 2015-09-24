'use strict';

angular.module('halresource')

  /**
   * @ngdoc constructor
   * @name Resource
   * @description
   *
   * Abstract resource base class.
   */
  .factory('Resource', [function () {

    /**
     * Resource.
     *
     * @constructor
     */
    function Resource(uri) {
      Object.defineProperties(this,  {

        /**
         * The resource URI.
         *
         * @property {string} Resource.$uri
         */
        $uri: {value: uri},

        /**
         * The timestamp of the last successful GET or PUT request.
         *
         * @property {number} Resource.syncTime
         * @see HalContext#markSynced
         */
        $syncTime: {
          value: null,
          writable: true
        }
      });
    }

    // Prototype properties
    Resource.prototype = Object.create(Object.prototype, {
      constructor: {value: Resource},

      /**
       * Create a $http GET request configuration object.
       *
       * @function
       * @abstract
       * @returns {object}
       */
      $getRequest: {value: function () {
        throw new Error('Abstract method');
      }},

      /**
       * Perform an HTTP GET request.
       *
       * @function
       * @returns a promise that is resolved to the resource
       */
      $get: {value: function () {
        return this.$context.httpGet(this);
      }},

      /**
       * Perform an HTTP GET request if the resource is not synchronized.
       *
       * @function
       * @returns a promise that is resolved to the resource
       * @see Resource#$syncTime
       */
      $load: {value: function () {
        return this.$context.load(this);
      }},

      /**
       * Create a $http PUT request configuration object.
       *
       * @function
       * @abstract
       * @returns {object}
       */
      $putRequest: {value: function () {
        throw new Error('Abstract method');
      }},

      /**
       * Perform an HTTP PUT request with the resource state.
       *
       * @function
       * @returns a promise that is resolved to the resource
       */
      $put: {value: function () {
        return this.$context.httpPut(this);
      }},

      /**
       * Create a $http DELETE request configuration object.
       *
       * @function
       * @returns {object}
       */
      $deleteRequest: {value: function () {
        return {
          method: 'delete',
          url: this.$uri
        };
      }},

      /**
       * Perform an HTTP DELETE request.
       *
       * @function
       * @returns a promise that is resolved to the resource
       */
      $delete: {value: function () {
        return this.$context.httpDelete(this);
      }},

      /**
       * Create a $http POST request configuration object.
       *
       * @function
       * @param {*} data request body
       * @param {object} [headers] request headers
       * @param {reqCallback} [callback] a function that changes the $http request config
       * @returns {object}
       */
      $postRequest: {value: function (data, headers, callback) {
        callback = callback || angular.identity;
        return callback({
          method: 'post',
          url: this.$uri,
          data: data,
          headers: headers || {}
        });
      }},

      /**
       * Perform an HTTP POST request.
       *
       * @function
       * @param {*} data request body
       * @param {object} [headers] request headers
       * @param {reqCallback} [callback] a function that changes the $http request config
       * @returns a promise that is resolved to the response
       */
      $post: {value: function (data, headers, callback) {
        return this.$context.httpPost(this, data, headers, callback);
      }},

      /**
       * Update the resource with new data.
       *
       * @function
       * @abstract
       * @param {object} data
       * @returns the resource(s) that were changed
       */
      $update: {value: function (data) {
        throw new Error('Abstract method');
      }}
    });

    return Resource;
  }])

/**
 * A callback function used to change a $http config object.
 *
 * @callback reqCallback
 * @param {object} req the $http config object
 * @returns {object} the $http config object
 */

;
