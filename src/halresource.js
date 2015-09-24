'use strict';

angular.module('halresource')

  /**
   * @ngdoc constructor
   * @name HalResource
   * @description
   *
   * HAL resource.
   */
  .factory('HalResource', ['$log', 'Resource', function ($log, Resource) {

    var registeredProfiles = {};

    /**
     * HAL resource.
     *
     * @constructor
     */
    function HalResource(uri, context) {
      // This constructor does not use the automatically created object but instantiate from a subclass instead

      // Intermediate prototype to add profile-specific properties to
      var prototype = Object.create(HalResource.prototype);

      // Current profile(s)
      var profile = null;

      // Instantiated object
      var object = Object.create(prototype, {

        /**
         * The resource context. Used to get related resources.
         *
         * @property {HalContext}
         */
        $context: {value: context},

        /**
         * The resource profile URI(s). If profile properties have been registered for this URI (using
         * HalContextProvider.registerProfile or HalContext.registerProfile), the properties will be defined on the
         * resource.
         *
         * Setting the profile to 'undefined' or 'null' will remove the profile.
         *
         * @property {string|string[]}
         */
        $profile: {
          get: function () {
            return profile;
          },
          set: function (value) {
            // Remove old profiles
            if (profile) {
              var oldProfiles = angular.isArray(profile) ? profile : [profile];
              oldProfiles.forEach(function (profile) {
                var properties = registeredProfiles[profile] || {};
                Object.keys(properties).forEach(function (key) {
                  delete prototype[key];
                });
              });
            }

            // Apply new profile prototype properties
            if (value) {
              var newProfiles = angular.isArray(value) ? value : [value];
              newProfiles.forEach(function (profile) {
                var properties = registeredProfiles[profile] || {};
                Object.defineProperties(prototype, properties);
              });
            }

            profile = value;
          }
        }
      });

      // Initialize the HAL resource self link
      object._links = {
        self: {
          href: uri
        }
      };

      angular.bind(object, Resource)(uri);
      return object;
    }

    // Prototype properties
    HalResource.prototype = Object.create(Resource.prototype, {
      constructor: {value: HalResource},

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
       * Follow a property to another HAL resource.
       *
       * @function
       * @param {string} prop the property name
       * @returns {HalResource|HalResource[]} the linked resource or resources
       */
      $prop: {value: function (prop) {
        return forArray(this[prop], function (uri) {
          return this.$context.get(uri);
        }, this);
      }},

      /**
       * Create a $http GET request configuration object.
       *
       * @function
       * @returns {object}
       */
      $getRequest: {value: function () {
        return {
          method: 'get',
          url: this.$uri,
          data: this,
          headers: {'Accept': 'application/hal+json'}
        };
      }},

      /**
       * Create a $http PUT request configuration object.
       *
       * @function
       * @returns {object}
       */
      $putRequest: {value: function () {
        return {
          method: 'put',
          url: this.$uri,
          data: this.$toState(),
          headers: {'Content-Type': 'application/json'}
        };
      }},

      /**
       * Update the resource with new data.
       *
       * @param {object} data
       * @returns all updated resources
       */
      $update: {value: function (data) {
        var selfHref = ((data._links || {}).self || {}).href;
        if (selfHref != this.$uri) {
          throw new Error("Self link href differs: expected '" + this.$uri + "', was '" + selfHref + "'");
        }

        return extractAndUpdateResources(data, this.$context);
      }}
    });

    // Class properties
    Object.defineProperties(HalResource, {

      /**
       * Register a profile.
       *
       * @param {string} profile the profile URI
       * @param {object} properties a properties object as used in 'Object.defineProperties()'
       */
      registerProfile: {value: function (profile, properties) {
        // Make sure properties can be removed when applying a different profile
        var props = angular.copy(properties);
        angular.forEach(props, function (prop) {
          prop.configurable = true;
        });
        registeredProfiles[profile] = props;
      }},

      /**
       * Register profiles.
       *
       * @param {object} profiles an object mapping profile URIs to properties objects as used in
       *                          'Object.defineProperties()'
       */
      registerProfiles: {value: function (profiles) {
        angular.forEach(profiles, function (properties, profile) {
          HalResource.registerProfile(profile, properties);
        });
      }}
    });

    return HalResource;


    /**
     * Recursively extract embedded resources and update them in the context, then update the resource itself.
     *
     * @param {object} data
     * @param {HalContext} context
     */
    function extractAndUpdateResources(data, context) {
      var resources = [];
      Object.keys(data._embedded || []).forEach(function (rel) {
        var embeds = data._embedded[rel];

        // Recurse into embedded resources
        forArray(embeds, function (embed) {
          resources = resources.concat(extractAndUpdateResources(embed, context));
        });
      });

      resources.push(updateResource(data, context));
      return resources;
    }

    /**
     * Update a resource from HTTP data. Will use _links.profile.href to set $profile, if present.
     *
     * @param {object} data
     * @param {HalContext} context
     */
    function updateResource(data, context) {
      var resource = context.get(data._links.self.href);

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

      return resource;
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
  }])

/**
 * A callback function used to change a $http config object.
 *
 * @callback reqCallback
 * @param {object} req the $http config object
 * @returns {object} the $http config object
 */

;
