'use strict';

/* jslint node: true */

module.exports = function (gulp) {
	var os = require('os');
	var fs = require('fs');
	var path = require('path');
	try {
	  var bowerJson = JSON.parse(fs.readFileSync(path.join('bower.json')));
	} catch (err) {
	  console.error('Unable to parse bower.json');
	  throw err;
	}

	var PROJECT_NAME = bowerJson.name || 'unknown-project';
	var MODULE_NAME = bowerJson.angularModule || (PROJECT_NAME + '-module');

	// used in tasks
	var _ = require('lodash');
	var glob = require('glob');
	var deferred = require('deferred');
	var del = require('del');
	var wiredep = require('wiredep').stream;
	var streamqueue = require('streamqueue');
	var runSequence = require('run-sequence').use(gulp);
	var stylish = require('jshint-stylish');

	// gulp + plugins
	var plugins = require('gulp-load-plugins')();

	// required for connect, for the webserver
	var http = require('http');
	var connect = require('connect');
	var logger = require('morgan');
	var serveStatic = require('serve-static');
	var connectLivereload = require('connect-livereload');

	// required to run the compass and karma tasks
	var exec = require('child_process').exec;

	/**
	 * Launches a webserver which statically listens to the components
	 *
	 * @param callback called after server is set up, or if it errors
	 * @param options options for the webserver:
	 *      --port: port for the webserver (else connect will use a random port)
	 *      --roots: filesystem folder for root, or array of root folders
	 *      --livereload: will start livereload daemon and inject scripts into html calls
	 */
	function server(callback, options) {
	  var devApp, devServer, devAddress, devHost, url, log=plugins.util.log, colors=plugins.util.colors;

	  options = options || {};

	  devApp = connect()
		.use(logger('dev'));

	  if (options.livereload) {
		plugins.livereload.listen();
		devApp.use(connectLivereload({
		  port: 35729
		}));
	  }

	  if (options.roots) {
		if (_.isString(options.roots)) {
		  devApp.use(serveStatic(options.roots));
		} else {
		  _.each(options.roots, function (root) {
			devApp.use(serveStatic(root));
		  });
		}
	  }

	  // change port and hostname to something static if you prefer
	  devServer = http.createServer(devApp).listen(options.port);

	  devServer.on('error', function(error) {
		log(colors.underline(colors.red('ERROR'))+' Unable to start server!');
		callback(error); // we couldn't start the server, so report it and quit gulp
	  });

	  devServer.on('listening', function() {
		devAddress = devServer.address();
		devHost = devAddress.address === '0.0.0.0' ? 'localhost' : devAddress.address;
		url = 'http://' + devHost + ':' + devAddress.port + '/index.html';

		log('Started dev server at ', colors.magenta(url));
		plugins.open(url);
		callback(); // we're done with this task for now
	  });
	}

	// cleans up the build directories
	gulp.task('clean-dist', function (cb) { del(['dist'], cb); });
	gulp.task('clean-dev', function (cb) { del(['.tmp'], cb); });
	gulp.task('clean', ['clean-dist', 'clean-dev']);

	gulp.task('lint', function() {
	  return gulp.src(['gulpfile.js', 'app/**/*.js', '!app/**/*spec.js'])
		.pipe(plugins.jshint())
		.pipe(plugins.jshint.reporter(stylish))
		.pipe(plugins.jshint.reporter('fail'));
	});

	// wires up index.html and main.scss with the bower dependencies, modifies the files in-place (in app/)
	gulp.task('wiredep-src', function () {
	  return gulp.src(['app/index.html', 'app/main.scss'])
		.pipe(wiredep({ignorePath: '../bower_components/', exclude: 'bower_components/components-font-awesome/css/font-awesome.css'}))
		.pipe(gulp.dest('app'));
	});

	// autowires up test config with bower dependencies, modifies in-place.
	gulp.task('wiredep-test', function () {
	  return gulp.src('karma.conf.js')
		.pipe(wiredep())
		.pipe(gulp.dest('./'));
	});

	function wireSrc(files, key) {
	  var defer = deferred(), scriptString,
		block = new RegExp('(.*' + key + '.*)[\\s\\S]*?(.*end' + key + '.*)');

	  scriptString = _.map(files, function (filename) {
		return '    <script src="' + filename.replace(/app\//, '') + '"></script>';
	  }).join(os.EOL);

	  defer.resolve(gulp.src('app/index.html')
		.pipe(plugins.replace(block, '$1' + os.EOL + scriptString + os.EOL + '$2'))
		.pipe(gulp.dest('app')));

	  return defer.promise;
	}

	// wire all angular *.js files in the app (except *spec.js, and *demo-controller.js)
	gulp.task('wireapp-ng', function () {
	  var defer = deferred();

	  glob('app/**/*.js', {ignore: ['**/*spec.js', '**/*demo-controller.js', 'app/demo.js']}, function (er, files) {
		if (er) {
		  defer.reject(er);
		} else {
		  defer.resolve(wireSrc(files, 'findng'));
		}
	  });

	  return defer.promise;
	});

	// wire all angular demo.js and *demo-controller.js files
	gulp.task('wireapp-demo', function () {
	  var defer = deferred();

	  glob('app/{demo.js,**/*demo-controller.js}', function (er, files) {
		if (er) {
		  defer.reject(er);
		} else {
		  defer.resolve(wireSrc(files, 'finddemo'));
		}
	  });

	  return defer.promise;
	});

	// wire all _*.scss/sass files in the app, note the file *must* be prefixed with an underscore to be autowired
	gulp.task('wireapp-scss', function (callback) {
	  var defer = deferred();

	  glob('app/**/_*.{scss,sass}', function (er, files) {
		var scriptString;

		if (er) {
		  callback(er);
		  defer.reject(er);
		} else {

		  scriptString = _.map(files, function (filename) {
			return '@import "' + filename.replace(/app\//, '') + '";';
		  }).join(os.EOL);

		  defer.resolve(gulp.src('app/main.scss')
			.pipe(plugins.replace(/(.*findcss.*)[\s\S]*?(.*endfindcss.*)/, '$1' + os.EOL+ scriptString + os.EOL + '$2'))
			.pipe(gulp.dest('app')));
		}
	  });

	  return defer.promise;
	});

	gulp.task('wireall', function(callback) {
		runSequence('wiredep-src', 'wiredep-test', 'wireapp-ng', 'wireapp-demo', 'wireapp-scss', callback);
	});

	gulp.task('test', ['wireall'], function(callback) {
	  exec('karma start --singleRun=true', function (error, stdout, stderr) {
		if (stdout) {
		  plugins.util.log(plugins.util.colors.gray(stdout));
		}
		if (stderr) {
		  plugins.util.log(plugins.util.colors.red(stderr));
		}
		callback(error);
	  });
	});

	// concats the js and css files as defined by the build:<> blocks in the index.html
	gulp.task('useref', ['wireall'], function () {
	  var assets = plugins.useref.assets();
	  return gulp.src('app/index.html')
		.pipe(assets)
		.pipe(assets.restore())
		.pipe(plugins.useref())
		.pipe(gulp.dest('dist'));
	});

	// inlines all non *demo.html html in any (sub)directory WITHIN app/ into angular templates, appends to dist/scripts/scripts.js
	gulp.task('inline-src-templates', ['useref'], function () {
	  return streamqueue({objectMode: true},
		gulp.src('dist/scripts/scripts.js'),
		gulp.src(['app/*/**/*.html', '!**/*demo.html'])
		  .pipe(plugins.angularTemplatecache({module: MODULE_NAME})))
		.pipe(plugins.concat('scripts.js'))
		.pipe(gulp.dest('dist/scripts'));
	});

	// inlines all *demo.html in any (sub)directory WITHIN app/ into angular templates, appends to dist/scripts/demo.js
	gulp.task('inline-demo-templates', ['useref'], function () {
	  return streamqueue({objectMode: true},
		gulp.src('dist/scripts/demo.js'),
		gulp.src(['app/*/**/*demo.html'])
		  .pipe(plugins.angularTemplatecache({module: MODULE_NAME})))
		.pipe(plugins.concat('demo.js'))
		.pipe(gulp.dest('dist/scripts'));
	});

	gulp.task('inline-templates', ['inline-src-templates', 'inline-demo-templates']);

	// annotates all angular methods in dist/scripts/scripts.js with text versions of the DI attributes, to protect them when minifying.
	gulp.task('ng-annotate', ['inline-templates'], function () {
	  return gulp.src('dist/scripts/scripts.js')
		.pipe(plugins.ngAnnotate())
		.pipe(gulp.dest('dist/scripts'));
	});

	// run the compass task on app/main.scss
	function runCompass(cssDir, callback) {
	  if (!cssDir) {
		callback(new Error('no cssDir supplied to runCompass'));
		return;
	  }
	  exec('compass compile app/main.scss --css-dir ' + cssDir + ' --sass-dir app --import-path bower_components', function (error, stdout, stderr) {
		if (stdout) {
		  plugins.util.log(plugins.util.colors.gray(stdout));
		}
		if (stdout) {
		  plugins.util.log(plugins.util.colors.red(stderr));
		}
		callback(error);
	  });
	}

	gulp.task('compass-dist', function (callback) { runCompass('dist/styles', callback); });
	gulp.task('compass-dev', function (callback) { runCompass('.tmp/styles', callback); });

	/**
	 * copy the font awesome fonts from the bower_components, for use in serve/serve-dist
	 */
	function copyFonts(where) {
	  return gulp.src('bower_components/**/*.{ttf,otf,woff,woff2}')
		.pipe(plugins.flatten())
		.pipe(gulp.dest(where));
	}

	gulp.task('copy-fonts-dist', function () { return copyFonts('dist/fonts'); });
	gulp.task('copy-fonts-dev', function () { return copyFonts('.tmp/fonts'); });

	/**
	 * Copy the source sass (scss) files from app/ to dist/
	 * Will rename main.scss to PROJECT_NAME.scss
	 *
	 * This way modules using this one can use the scss sources rather than the MUCH larger dist/styles/main.css
	 */
	gulp.task('copy-sass', function () {
	  gulp.src('app/*/**/*.scss')
		.pipe(gulp.dest('dist/sass'));
	  gulp.src('app/main.scss')
		.pipe(plugins.replace(/.*strip-in-dist:start[\s\S]*?strip-in-dist:end.*/, ''))
		.pipe(plugins.rename(function (path) { path.basename = '_' + PROJECT_NAME; }))
		.pipe(gulp.dest('dist/sass'));
	});

	// This uses the name and version from the projects bower.json to build a new bower.json for the dist.
	gulp.task('dist-bower-json', function (callback) {
	  var distBower = {}, name = PROJECT_NAME, version = bowerJson.version;

	  if (name === undefined || version === undefined) {
		callback(new Error('bower.json needs a name and version'));
	  } else {
		if (bowerJson.private) {
		  distBower.private = true;
		}
		distBower.name = name + '-dist';
		distBower.version = version;
		distBower.dependencies = bowerJson.dependencies;
		distBower.ignore = [];
		distBower.main = [
		  'scripts/scripts.js',
		  'sass/_' + name +'.scss'
		];

		if(!fs.existsSync('dist')) {
		  fs.mkdirSync(path.join('dist'));
		}
		fs.writeFile(path.join('dist', 'bower.json'), JSON.stringify(distBower, null, 2), callback);
	  }
	});

	gulp.task('watch', function() {
	  var sass, src;

	  sass = gulp.watch('app/**/*.scss', ['compass-dev']);
	  sass.on('change', function(event) {
		plugins.util.log('Sass file changed ' + event.path + ' was ' + event.type + ', running compass');
	  });

	  // watch all html/css/js files in the app and .tmp dirs
	  src = gulp.watch('{app,.tmp}/**/*.{html,css,js}');
	  src.on('change', function(event) {
		plugins.util.log('Source file changed ' + event.path + ' was ' + event.type);
		plugins.livereload.reload();
	  });

	});

	// tasks so that the dev env is ready to be served, for testing
	gulp.task('build', ['wireall', 'compass-dev', 'copy-fonts-dev']);

	// build the distribution, but clean first
	gulp.task('dist', function(callback) {
	  runSequence('lint', 'test', 'clean-dist', 'useref', 'inline-templates', 'ng-annotate', 'compass-dist', 'copy-fonts-dist', 'copy-sass', 'dist-bower-json', callback);
	});

	// boot a webserver for the dev env, without building or watching
	gulp.task('serve-dev-internal', function(callback) {
	  server(callback, {livereload: true, port: 9001, roots: ['app', '.tmp', 'bower_components']});
	});

	// boot a webserver for the dev env
	gulp.task('serve', function(callback) {
	  runSequence('build', 'watch', 'serve-dev-internal', callback);
	});

	// boot a webserver for the built distribution
	gulp.task('serve-dist', ['dist'], function(callback) {
	  server(callback, {roots: 'dist', port: 9001});
	});

	gulp.task('default', ['build']);
};