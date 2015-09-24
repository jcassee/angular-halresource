'use strict';

angular.module('halresource')

  /**
   * @ngdoc constructor
   * @name HalContext
   * @description
   *
   * Context for creating linked HAL resources. The context acts as an identity map.
   */
  .factory('HalContext', ['$http', '$log', '$q', 'HalResource', function ($http, $log, $q, HalResource) {

    /**
     * Default resource factory creates HalResource instances.
     *
     * @type createResourceCallback
     */
    function defaultResourceFactory(uri, context) {
      return new HalResource(uri, context);
    }

    /**
     * HAL resource context.
     *
     * @constructor
     * @param {createResourceCallback} resourceFactory
     */
    function HalContext(resourceFactory) {
      this.resourceFactory = resourceFactory || defaultResourceFactory;
      this.resources = {};
    }

    HalContext.prototype = Object.create(Object.prototype, {
      constructor: {value: HalContext},

      /**
       * Get the HAL resource for an URI. Creates a new resource if not already in the context.
       *
       * @function
       * @param {string} uri
       * @param {createResourceCallback} [factory] optional resource creation function
       * @returns {HalResource}
       */
      get: {value: function (uri, factory) {
        var resource = this.resources[uri];
        if (!resource) {
          resource = this.resources[uri] = (factory || this.resourceFactory)(uri, this);
        }
        return resource;
      }},

      /**
       * Copy a resource (using angular.copy) into this context.
       *
       * @function
       * @param {HalResource} resource
       * @returns {HalResource} a copy of the resource in this context
       */
      copy: {value: function (resource) {
        var copy = this.get(resource.$uri);
        angular.copy(resource, copy);
        copy.$profile = resource.$profile;
        return copy;
      }},

      /**
       * Perform a HTTP GET request if the resource is not synchronized.
       *
       * @function
       * @param {HalResource} resource
       * @returns a promise that is resolved to the resource
       * @see Resource#$syncTime
       */
      load: {value: function (resource) {
        if (resource.$syncTime) {
          return $q.when(resource);
        } else {
          return this.httpGet(resource);
        }
      }},

      /**
       * Perform a HTTP GET request on a resource.
       *
       * @function
       * @param {HalResource} resource
       * @returns a promise that is resolved to the resource
       */
      httpGet: {value: function (resource) {
        return $http(resource.$getRequest()).then(function (response) {
            var updatedResources = resource.$update(response.data);
            return this.markSynced(updatedResources, Date.now());
          }).then(function () {
            return resource;
          });
      }},

      /**
       * Perform a HTTP PUT request with the resource state.
       *
       * @function
       * @param {HalResource} resource
       * @returns a promise that is resolved to the resource
       */
      httpPut: {value: function (resource) {
        return $http(resource.$putRequest()).then(function () {
          return this.markSynced(resource, Date.now());
        }).then(function () {
          return resource;
        });
      }},

      /**
       * Perform a HTTP DELETE request and mark the resource as not synchronized.
       *
       * @function
       * @param {HalResource} resource
       * @returns a promise that is resolved to the resource
       */
      httpDelete: {value: function (resource) {
        return $http(resource.$deleteRequest()).then(function () {
          return this.markSynced(resource, null);
        }).then(function () {
          return resource;
        });
      }},

      /**
       * Perform a HTTP POST request.
       *
       * @function
       * @param {HalResource} resource
       * @param {*} data request body
       * @param {object} [headers] request headers
       * @param {reqCallback} [callback] a function that changes the $http request config
       * @returns a promise that is resolved to the resource
       */
      httpPost: {value: function (resource, data, headers, callback) {
        return $http(resource.$postRequest(data, headers, callback));
      }},

      /**
       * Mark a resource as synchronized with the server.
       *
       * @function
       * @param {Resource|Resource[]} resources
       * @param {number} syncTime the timestamp of the last synchronization
       * @returns a promise that is resolved to the resource
       * @see Resource#syncTime
       */
      markSynced: {value: function (resources, syncTime) {
        resources = angular.isArray(resources) ? resources : [resources];

        resources.forEach(function (resource) {
          resource.$syncTime = syncTime;
        });

        return $q.when();
      }}
    });
  }])

/**
 * A callback function used by a context to create resources.
 *
 * @callback createResourceCallback
 * @returns {Resource} the created resource
 */

;
