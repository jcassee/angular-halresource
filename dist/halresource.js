'use strict';

/**
 * @ngdoc module
 * @name halresource
 * @description
 *
 * This module contains a HAL client.
 */
angular.module('halresource', ['netstatus']);

'use strict';

angular.module('halresource')

  /**
   * @ngdoc constructor
   * @name GenericResource
   * @description
   *
   * Generic resource.
   */
  .factory('GenericResource', ['Resource', function (Resource) {

    /**
     * Generic resource with a media type and some data.
     *
     * @constructor
     */
    function GenericResource(uri, mediaType, data) {
      angular.bind(this, Resource)(uri);

      this.mediaType = mediaType;
      this.data = data;
    }

    // Prototype properties
    GenericResource.prototype = Object.create(Resource.prototype, {
      constructor: {value: GenericResource},

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
          headers: {'Accept': this.mediaType}
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
          data: this.data,
          headers: {'Content-Type': this.mediaType}
        };
      }},

      /**
       * Update the resource with new data.
       *
       * @param {object} data
       * @returns the resource
       */
      $update: {value: function (data) {
        this.data = data;
        return this;
      }}
    });

    return GenericResource;
  }])

;

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

'use strict';

angular.module('halresource')

  /**
   * @ngdoc constructor
   * @name OfflineHalContext
   * @description
   *
   * Offline-capable context for creating linked HAL resources. The context acts as an identity map.
   */
  .factory('OfflineHalContext', ['$http', '$log', '$q', '$rootScope', 'HalContext', 'Netstatus',
      function ($http, $log, $q, $rootScope, HalContext, Netstatus) {

    var db = new Dexie('offlinecache');

    db.version(1).stores({
      resources: "",
      requests: "++,[url+method]"
    });

    db.on('error', function (msg) {
      $log.error('ResourcheCache: ' + msg);
      $rootScope.$broadcast('offlinecache:error', msg);
    });
    db.on('blocked', function () {
      $log.warn('ResourceCache: database is blocked');
      $rootScope.$broadcast('offlinecache:blocked');
    });

    db.open();


    /**
     * Offline-capable HAL resource context.
     *
     * @constructor
     */
    function OfflineHalContext() {
      angular.bind(this, HalContext)();
    }

    OfflineHalContext.prototype = Object.create(HalContext.prototype, {
      constructor: {value: OfflineHalContext},

      /**
       * Perform a HTTP GET request on a resource.
       *
       * @function
       * @param {HalResource} resource
       * @returns a promise that is resolved to the resource
       */
      httpGet: {value: function (resource) {
        if (Netstatus.offline) {
          return db.resources.get(resource.$uri).then(function (data) {
            return resource.$sync(data, false);
          });
        } else {
          return HalContext.prototype.httpGet(resource);
        }
      }},

      /**
       * Perform a HTTP PUT request with the resource state.
       *
       * @function
       * @param {HalResource} resource
       * @returns a promise that is resolved to the resource
       */
      httpPut: {value: function (resource) {
        if (Netstatus.offline) {
          return db.transaction('rw', db.resources, db.requests, function () {
            db.requests.add(resource.$putRequest());
            db.resources.put(resource, resource.$uri);
          }).then(function () {
            return resource;
          });
        } else {
          return HalContext.prototype.httpPut(resource);
        }
      }},

      /**
       * Perform a HTTP DELETE request and mark the resource as unsychronized.
       *
       * @function
       * @param {HalResource} resource
       * @returns a promise that is resolved to the resource
       */
      httpDelete: {value: function (resource) {
        if (Netstatus.offline) {
          return db.transaction('rw', db.resources, db.requests, function () {
            db.requests.add(resource.$deleteRequest());
            db.resources.delete(resource.$uri);
          }).then(function () {
            return resource;
          });
        } else {
          return HalContext.prototype.httpDelete(resource);
        }
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
        if (Netstatus.offline) {
          return db.requests.add(resource.$postRequest(data, headers, callback)).then(function () {
            return resource;
          });
        } else {
          return HalContext.prototype.httpPost(resource, data, headers, callback);
        }
      }},

      /**
       * Mark a resource as synchronized with the server and save it for offline use.
       *
       * @function
       * @param {Resource|Resource[]} resources
       * @param {number} syncTime the timestamp of the last synchronization
       * @returns a promise that is resolved to the resource
       */
      markSynced: {value: function (resources, syncTime) {
        resources = angular.isArray(resources) ? resources : [resources];

        return db.transaction('rw', db.resources, function () {
          resources.forEach(function (resource) {
            if (syncTime) {
              db.resources.put(resource, resource.$uri);
            } else {
              db.resources.delete(resource.$uri);
            }
          });
        }).then(function () {
          return HalContext.prototype.markSynced(resources);
        });
      }}
    });
  }])

;

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
