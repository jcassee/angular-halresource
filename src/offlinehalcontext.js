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
