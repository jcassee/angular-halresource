'use strict';

/**
 * @ngdoc module
 * @name halresource
 * @description
 *
 * This module contains a HAL client.
 */
angular.module('halresource', [])

  /**
   * @ngdoc constructor
   * @name HalContext
   * @description
   *
   * Context for creating linked HAL resources. The context acts as an identity map.
   */
  .provider('HalContext', function () {
    var profiles = {};

    /**
     * Register a profile.
     *
     * @function
     * @param {string} profile the profile URI
     * @param {object} properties a properties object as used in 'Object.defineProperties()'
     */
    this.registerProfile = function (profile, properties) {
      // Make sure properties can be removed when applying a different profile
      var props = angular.copy(properties);
      angular.forEach(props, function (prop) {
        prop.enumerable = true;
        prop.configurable = true;
      });
      profiles[profile] = props;
    };
    var registerProfile = this.registerProfile;

    this.$get = ['$http', '$log', '$q', function ($http, $log, $q) {

      /**
       * HAL resource context.
       *
       * @constructor
       */
      function HalContext() {
        this.resources = {};
      }
      HalContext.prototype = Object.create(Object.prototype, {
        constructor: {value: HalContext},

        /**
         * Get the HAL resource for an URI. Creates a new resource if not already in the context.
         *
         * @function
         * @param {string} uri
         * @returns {HalResource}
         */
        get: {value: function (uri) {
          var resource = this.resources[uri];
          if (!resource) {
            resource = this.resources[uri] = createHalResource(uri, this);
          }
          return resource;
        }}
      });
      Object.defineProperties(HalContext, {
        /**
         * @type registerProfile
         */
        registerProfile: {value: registerProfile}
      });

      function createHalResource(uri, context) {
        // Create the resource with an intermediate prototype to add profile-specific properties to
        var prototype = Object.create(HalResource.prototype);
        var resource = Object.create(prototype, {

          /**
           * The resource context. Used to get related resources.
           * @property
           */
          $context: {value: context},

          /**
           * The prototype that contains the profile-specific properties.
           * @property
           */
          $profilePrototype: {value: prototype}
        });

        // Initialize the HAL resource self link
        resource._links = {
          self: {
            href: uri
          }
        };

        return resource;
      }

      /**
       * HAL resource.
       *
       * @constructor
       */
      function HalResource() {}

      HalResource.prototype = Object.create(Object.prototype, {
        constructor: {value: HalResource},

        /**
         * The resource URI.
         *
         * @property {string}
         */
        $uri: {get: function () {
          return this._links.self.href;
        }},

        /**
         * The resource profile.
         *
         * @property {string}
         */
        $profile: {get: function () {
          return (this._links.profile || {}).href;
        }},

        /**
         * Apply a profile to the resource by setting the registered properties on '$profilePrototype'.
         *
         * @function
         * @param {string} [profile] the profile to apply; if absent, uses '$profile'
         */
        $applyProfile: {value: function (profile) {
          profile = profile || this.$profile;
          var properties = profiles[profile] || {};

          Object.keys(this.$profilePrototype).forEach(function (prop) {
            delete this.$profilePrototype[prop];
          }, this);
          Object.defineProperties(this.$profilePrototype, properties);
        }},

        /**
         * Create a shallow copy of the resource state (i.e. without '_links' and '_embedded' properties).
         *
         * @function
         * @returns {object}
         */
        $toState: {value: function () {
          var state = angular.extend({}, this);
          delete state._links;
          delete state._embedded;
          return state;
        }},

        /**
         * Resolve the href of a relation.
         *
         * @function
         * @param {string} rel
         * @param {object} [vars] URI template variables
         * @returns {string|string[]} the link href or hrefs
         */
        $href: {value: function (rel, vars) {
          return forArray(this._links[rel], function (link) {
            if ('templated' in link && !vars) {
              $log.warn("Following templated link relation '" + rel + "' without variables");
            }
            if ('deprecation' in link) {
              $log.warn("Following deprecated link relation '" + rel + "': " + link.deprecation);
            }

            var uri = link.href;
            if (vars) uri = new UriTemplate(uri).fillFromObject(vars);
            return uri;
          }, this);
        }},

        /**
         * Follow a relation to another HAL resource.
         *
         * @function
         * @param {string} rel
         * @param {object} [vars] URI template variables
         * @returns {HalResource|HalResource[]} the linked resource or resources
         */
        $rel: {value: function (rel, vars) {
          return forArray(this.$href(rel, vars), function (uri) {
            return this.$context.get(uri);
          }, this);
        }},

        /**
         * The timestamp of the last successful $get or $put request.
         *
         * @property
         * @type {number}
         */
        $syncTime: {value: null, writable: true},

        /**
         * Perform a HTTP GET request and update the resource with the response data.
         *
         * @function
         * @returns a promise that is resolved to the response
         */
        $get: {value: function () {
          var self = this;
          return $http({
            method: 'get',
            url: self.$uri,
            data: self,
            headers: {'Accept': 'application/hal+json'},
            transformResponse: angular.identity
          }).then(function (response) {
            try {
              updateResources(response, self.$context);
              return response;
            } catch (e) {
              return $q.reject(e.message);
            }
          });
        }},

        /**
         * Call $get if the resource is not synchronized.
         *
         * @function
         * @returns a promise that is either resolved to the response or 'null' if the resource was already synced
         * @see HalResource#$syncTime
         */
        $load: {value: function () {
          if (this.$syncTime) {
            return $q.when();
          } else {
            return this.$get();
          }
        }},

        /**
         * Perform a HTTP PUT request with the resource representation and update the resource with the response data,
         * if any.
         *
         * @function
         * @returns a promise that is resolved to the response
         */
        $put: {value: function () {
          var self = this;
          return $http({
            method: 'put',
            url: self.$uri,
            data: self,
            headers: {'Accept': 'application/hal+json', 'Content-Type': 'application/hal+json'},
            transformResponse: angular.identity
          }).then(function (response) {
            self.$syncTime = Date.now();
            try {
              updateResources(response, self.$context);
              return response;
            } catch (e) {
              return $q.reject(e.message);
            }
          });
        }},

        /**
         * Perform a HTTP PUT request with the resource state and update the resource with the response data, if any.
         *
         * @function
         * @returns a promise that is resolved to the response
         */
        $putState: {value: function () {
          var self = this;
          return $http({
            method: 'put',
            url: self.$uri,
            data: self.$toState(),
            headers: {'Accept': 'application/hal+json', 'Content-Type': 'application/json'},
            transformResponse: angular.identity
          }).then(function (response) {
            self.$syncTime = Date.now();
            try {
              updateResources(response, self.$context);
              return response;
            } catch (e) {
              return $q.reject(e.message);
            }
          });
        }},

        /**
         * Perform a HTTP DELETE request and mark the resource as unsychronized.
         *
         * @function
         * @returns a promise that is resolved to the response
         */
        $delete: {value: function () {
          var self = this;
          return $http({
            method: 'delete',
            url: this.$uri,
            transformResponse: angular.identity
          }).then(function (response) {
            self.$syncTime = null;
            return response;
          });
        }},

        /**
         * A callback function used to change a $http config object.
         *
         * @callback reqCallback
         * @param {object} req the $http config object
         * @returns {object} the $http config object
         */

        /**
         * Perform a HTTP POST request.
         *
         * @function
         * @param {*} data request body
         * @param {object} [headers] request headers
         * @param {reqCallback} [callback] a function that changes the $http request config
         * @returns a promise that is resolved to the response
         */
        $post: {value: function (data, headers, callback) {
          callback = callback || function (req) { return req; };
          return $http(callback({
            method: 'post',
            url: this.$uri,
            data: data,
            headers: headers || {},
            transformResponse: angular.identity
          }));
        }}
      });

      return HalContext;
    }];

    /**
     * Update resources from a HTTP response.
     *
     * @param {object} response
     * @param {HalContex} context
     */
    function updateResources(response, context) {
      if (response.status == 204) return;
      if (response.headers('Content-Type') != 'application/hal+json') throw new Error("Not application/hal+json");
      if (!response.data) throw new Error("No data");

      var data = angular.fromJson(response.data);

      var selfHref = ((data._links || {}).self || {}).href;
      if (selfHref != response.config.url) {
        throw new Error("Self link href differs: expected '" + response.config.url + "', was '" + selfHref + "'");
      }

      extractResources(data, context);
    }

    /**
     * Recursively extract embedded resources and add them to the context, then add the resource itself.
     *
     * @param {object} data
     * @param {HalContext} context
     */
    function extractResources(data, context) {
      Object.keys(data._embedded || []).forEach(function (rel) {
        var embeds = data._embedded[rel];

        // Add links to embedded resources if missing
        if (!(rel in data._links)) {
          data._links[rel] = forArray(embeds, function (embed) {
            return {href: embed._links.self.href};
          });
        }

        // Recurse into embedded resources
        forArray(embeds, function (embed) {
          extractResources(embed, context);
        });
      });

      var resource = context.get(data._links.self.href);
      updateResource(resource, data);
      resource.$syncTime = Date.now();
    }

    /**
     * Update a resource from HTTP data.
     *
     * @param {HalResource} resource
     * @param {object} data
     */
    function updateResource(resource, data) {
      var selfHref = ((data._links || {}).self || {}).href;
      if (selfHref != resource.$uri) {
        throw new Error("Self link href differs: expected '" + resource.$uri + "', was '" + selfHref + "'");
      }

      // Optionally apply profile
      var profileUri = ((data._links || {}).profile || {}).href;
      if (profileUri) resource.$applyProfile(profileUri);

      // Copy properties
      Object.keys(resource).forEach(function (key) {
        delete resource[key];
      });
      Object.keys(data).forEach(function (key) {
        resource[key] = data[key];
      });
    }

    /**
     * Call a function on an argument or every element of an array.
     *
     * @param {Array|*|undefined} arg the variable or array of variables to apply 'func' to
     * @param {function} func the function
     * @param {object} [context] object to bind 'this' to when applying 'func'
     * @returns {Array|*|undefined} the result of applying 'func' to 'arg'; undefined if 'arg' is undefined
     */
    function forArray(arg, func, context) {
      if (!angular.isDefined(arg)) return undefined;
      if (Array.isArray(arg)) {
        return arg.map(function (elem) {
          return angular.bind(context, func)(elem);
        });
      } else {
        return angular.bind(context, func)(arg);
      }
    }
  })
;
