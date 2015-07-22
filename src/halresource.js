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
    var registeredProfiles = {};

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
        prop.configurable = true;
      });
      registeredProfiles[profile] = props;
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
        var profile = null;
        var resource = Object.create(prototype, {

          /**
           * The resource context. Used to get related resources.
           * @property
           */
          $context: {value: context},

          /**
           * The resource profile URI. If profile properties have been registered for this URI (using
           * HalContextProvider.registerProfile or HalContext.registerProfile), the properties will be defined on the
           * resource.
           *
           * Setting the profile to 'undefined' or 'null' will remove the profile.
           *
           * @property {string}
           */
          $profile: {
            get: function () {
              return profile;
            },
            set: function (value) {
              // Remove old profiles
              var oldProfiles = angular.isArray(profile) ? profile : [profile];
              oldProfiles.forEach(function (profile) {
                var properties = profile ? registeredProfiles[profile] || {} : {};
                Object.keys(properties).forEach(function (key) {
                  delete prototype[key];
                });
              });


              Object.keys(prototype).forEach(function (prop) {
                delete prototype[prop];
              }, this);

              // Apply new profiles
              var newProfiles = angular.isArray(value) ? value : [value];
              newProfiles.forEach(function (profile) {
                var properties = profile ? registeredProfiles[profile] || {} : {};
                Object.defineProperties(prototype, properties);
              });

              profile = value;
            }
          }
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
         * Resolve the href of a relation. Returns hrefs from from links and embedded resources.
         *
         * @function
         * @param {string} rel
         * @param {object} [vars] URI template variables
         * @returns {string|string[]} the link href or hrefs
         */
        $href: {value: function (rel, vars) {
          var templated = false;
          var nonTemplated = false;
          var deprecation = {};

          var linkHrefs = forArray(this._links[rel], function (link) {
            if ('templated' in link) templated = true;
            if (!('templated' in link)) nonTemplated = true;
            if ('deprecation' in link) deprecation[link.deprecation] = true;

            var uri = link.href;
            if (vars) uri = new UriTemplate(uri).fillFromObject(vars);
            return uri;
          }, this);

          var embeddedHrefs = forArray((this._embedded || {})[rel], function (embedded) {
            nonTemplated = true;
            return embedded._links.self.href;
          }, this);

          if (templated && !vars) {
            $log.warn("Following templated link relation '" + rel + "' without variables");
          }
          if (nonTemplated && vars) {
            $log.warn("Following non-templated link relation '" + rel + "' with variables");
          }
          var deprecationUris = Object.keys(deprecation);
          if (deprecationUris.length > 0) {
            $log.warn("Following deprecated link relation '" + rel + "': " + deprecationUris.join(', '));
          }

          if (!embeddedHrefs) {
            return linkHrefs;
          } else if (!linkHrefs) {
            return embeddedHrefs;
          } else {
            if (!angular.isArray(linkHrefs)) linkHrefs = [linkHrefs];
            if (!angular.isArray(embeddedHrefs)) embeddedHrefs = [embeddedHrefs];
            return linkHrefs.concat(embeddedHrefs);
          }
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
         * @returns a promise that is resolved to the resource
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
              return self;
            } catch (e) {
              return $q.reject(e.message);
            }
          });
        }},

        /**
         * Call $get if the resource is not synchronized.
         *
         * @function
         * @returns a promise that is resolved to the resource
         * @see HalResource#$syncTime
         */
        $load: {value: function () {
          var self = this;
          if (this.$syncTime) {
            return $q.when(self);
          } else {
            return self.$get();
          }
        }},

        /**
         * Perform a HTTP PUT request with the resource representation and update the resource with the response data,
         * if any.
         *
         * @function
         * @returns a promise that is resolved to the resource
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
              return self;
            } catch (e) {
              return $q.reject(e.message);
            }
          });
        }},

        /**
         * Perform a HTTP PUT request with the resource state and update the resource with the response data, if any.
         *
         * @function
         * @returns a promise that is resolved to the resource
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
              return self;
            } catch (e) {
              return $q.reject(e.message);
            }
          });
        }},

        /**
         * Perform a HTTP DELETE request and mark the resource as unsychronized.
         *
         * @function
         * @returns a promise that is resolved to the resource
         */
        $delete: {value: function () {
          var self = this;
          return $http({
            method: 'delete',
            url: this.$uri,
            transformResponse: angular.identity
          }).then(function (response) {
            self.$syncTime = null;
            return self;
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
     * @param {HalContext} context
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
     * Update a resource from HTTP data. Will use _links.profile.href to set $profile, if present.
     *
     * @param {HalResource} resource
     * @param {object} data
     */
    function updateResource(resource, data) {
      // Optionally apply profile(s)
      var profileUris = forArray((data._links || {}).profile || {}, function (link) {
        return link.href;
      });
      if (profileUris) resource.$profile = profileUris;

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
