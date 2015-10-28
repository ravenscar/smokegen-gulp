# smokegen-gulp

This project supports the yeoman smokegen generator with a base gulpfile which can be extended.

The project relies on an external configuration file

To also provide support for ionic style projects (based on their sample tabs project), the tasks are externally configured.

This gives the ability to specify the web root ('app' for yeoman, 'www' for ionic), as well as other runtime configuration.

All of the tasks should work for Yeoman, and probably ionic too, but this has been tested less.

The config file should be named 'smokegen.json' and be placed in the project root.

Yeoman config:

```
{
  "webRoot": "app",
  "tasks": {
    "wiredepSrc": {
      "ignorePath": "../bower_components/",
      "exclude": [
        "bower_components/components-font-awesome/css/font-awesome.css",
        "mocks.js"
      ]
    }
  }
}
```

Ionic config:

```
{
  "webRoot": "www",
  "tasks": {
    "wiredepSrc": {
      "ignorePath": "lib/",
      "exclude": [
        "angular/angular.js"
      ]
    }
  }
}
```