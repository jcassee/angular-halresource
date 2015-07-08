module.exports = function (config) {
  config.set({

    files: [
      'bower_components/angular/angular.js',
      'bower_components/angular-mocks/angular-mocks.js',
      'bower_components/uri-templates/uri-templates.js',
      'src/**/*.js'
    ],

    autoWatch: true,

    frameworks: ['jasmine'],

    browsers: ['Chrome'],

    preprocessors: {
      'src/**/!(*.spec)+(.js)': ['coverage']
    },

    reporters: ['progress', 'coverage'],

    coverageReporter: {
      reporters: [{type: 'text-summary'}]
    }
  });
};
