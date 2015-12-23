# smokegen-gulp

This project supports the yeoman smokegen generator with a base gulpfile which can be extended.

The project relies on an external configuration file

To also provide support for ionic style projects (based on their sample tabs project), the tasks are externally configured as a node module.

This gives the ability to specify the web root ('app' for yeoman, 'www' for ionic), as well as other runtime configuration.

All of the tasks should work for Yeoman, and probably ionic too, but this has been tested less.

The config file should be named 'smokegen.js' and be placed in the project root.

Yeoman config:

```
{
  webRoot: "app",
  tasks: {
    wiredepSrc: {
      ignorePath: "../bower_components/",
      exclude: [
        "bower_components/components-font-awesome/css/font-awesome.css",
        "mocks.js"
      ]
    }
  }
}
```

Ionic config:

```
module.exports = {
  webRoot: "www",
  tasks: {
    wiredepSrc: {
      ignorePath: "lib/",
      exclude: [
        "angular/angular.js"
      ],
      fileTypes: {
        html: {
          block: /(([ \t]*)<!--\s*bower:*(\S*)\s*-->)(\n|\r|.)*?(<!--\s*endbower\s*-->)/gi,
          detect: {
            js: /<script.*src=['"]([^'"]+)/gi,
            css: /<link.*href=['"]([^'"]+)/gi
          },
          replace: {
            js: '<script src="lib/{{filePath}}"></script>',
            css: '<link rel="stylesheet" href="{{filePath}}" />'
          }
        }
      }
    }
  }
};
```