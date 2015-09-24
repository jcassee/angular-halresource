'use strict';

var gulp = require('gulp'),
  concat = require('gulp-concat'),
  ignore = require('gulp-ignore'),
  rename = require('gulp-rename'),
  uglify = require('gulp-uglify');

gulp.task('default', function(){
  return gulp.src('src/*.js')
    .pipe(ignore.exclude('*.spec.js'))
    .pipe(concat('halresource.js'))
    .pipe(gulp.dest('dist'))
    .pipe(uglify())
    .pipe(rename({extname: '.min.js'}))
    .pipe(gulp.dest('dist'));
});
