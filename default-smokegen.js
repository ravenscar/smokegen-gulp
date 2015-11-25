var app = 'app';

module.exports = {
  webRoot: app,
  tasks: {
    lint: {
      gulpSrc: [
        'gulpfile.js',
        'app/**/*.js',
        '!app/**/*spec.js',
        '!app/**/*mock.js'
      ]
    },
    runCompass: {
      importPath: 'bower_components'
    },
    wireappScss: {
      globPattern: app + '/**/_*.{scss,sass}'
    },
    wiredepSrc: {
      ignorePath: "../bower_components/",
      exclude: [
        "bower_components/components-font-awesome/css/font-awesome.css",
        "mocks.js"
      ]
    }
  }
};
