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
