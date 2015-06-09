'use strict';

/* jslint node: true */

module.exports = function (gulp) {
	var smokegenApi = Object.create(null);

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
  var vinylPaths = require('vinyl-paths');

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

	var distLocation = (process.env.ANGULAR_DIST_FOLDER && path.join(process.env.ANGULAR_DIST_FOLDER, MODULE_NAME)) || 'dist';

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
		var devApp, devServer, devAddress, devHost, url, log = plugins.util.log, colors = plugins.util.colors;

		options = options || {};

		devApp = connect()
			.use(logger('dev'));

		if (options.livereload) {
			plugins.livereload.listen();
			devApp.use(connectLivereload({
				port: 35729
			}));
		}

		if (options.gzip) {
			devApp.use(function (req, res, next) {
				res.setHeader("Content-Encoding", "gzip");
				next();
			});
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
		devServer = http.createServer(devApp).listen(options.port, '0.0.0.0');

		devServer.on('error', function (error) {
			log(colors.underline(colors.red('ERROR')) + ' Unable to start server!');
			callback(error); // we couldn't start the server, so report it and quit gulp
		});

		devServer.on('listening', function () {
			devAddress = devServer.address();
			devHost = devAddress.address === '0.0.0.0' ? 'localhost' : devAddress.address;
			url = 'http://' + devHost + ':' + devAddress.port + '/index.html';

			log('Started dev server at ', colors.magenta(url));
            gulp.src('app/index.html')
                .pipe(plugins.open('', {url: url}));
			callback(); // we're done with this task for now
		});
	}

	function wireSrc(files, key) {
		var scriptString,
			block = new RegExp('(.*' + key + '.*)[\\s\\S]*?(.*end' + key + '.*)');

		scriptString = _.map(files, function (filename) {
			return '    <script src="' + filename.replace(/app\//, '') + '"></script>';
		}).join(os.EOL);

		return gulp.src('app/index.html')
			.pipe(plugins.replace(block, '$1' + os.EOL + scriptString + os.EOL + '$2'))
			.pipe(gulp.dest('app'));
	}

	smokegenApi.common = function () {
		// cleans up the build directories
		gulp.task('clean-dist', function (cb) {
			del([distLocation], {force: true}, cb);
		});
		gulp.task('clean-dev', function (cb) {
			del(['.tmp'], cb);
		});
		gulp.task('clean', ['clean-dist', 'clean-dev']);

		gulp.task('lint', function () {
			return gulp.src(['gulpfile.js', 'app/**/*.js', '!app/**/*spec.js'])
				.pipe(plugins.jshint())
				.pipe(plugins.jshint.reporter(stylish))
				.pipe(plugins.jshint.reporter('fail'));
		});

    // wires up index.html and main.scss with the bower dependencies, modifies the files in-place (in app/)
		gulp.task('wiredep-src', function () {
			return gulp.src(['app/index.html', 'app/main.scss'])
				.pipe(wiredep({
					ignorePath: '../bower_components/',
					exclude: ['bower_components/components-font-awesome/css/font-awesome.css', 'mocks.js']
				}))
				.pipe(gulp.dest('app'));
		});

		// autowires up test config with bower dependencies, modifies in-place.
		gulp.task('wiredep-test', function () {
			return gulp.src('karma.conf.js')
				.pipe(wiredep())
				.pipe(gulp.dest('./'));
		});

		// wire all angular *.js files in the app (except *spec.js, and *demo-controller.js)
		gulp.task('wireapp-ng', function () {
			var files = glob.sync('app/**/*.js', {ignore: ['**/*spec.js', '**/*demo-controller.js', '**/*mock.js', 'app/demo.js']});
      return wireSrc(files, 'findng');
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
						.pipe(plugins.replace(/(.*findcss.*)[\s\S]*?(.*endfindcss.*)/, '$1' + os.EOL + scriptString + os.EOL + '$2'))
						.pipe(gulp.dest('app')));
				}
			});

			return defer.promise;
		});

		gulp.task('test', function (callback) {
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
		gulp.task('useref', function () {
			var assets = plugins.useref.assets();
			return gulp.src('app/index.html')
				.pipe(assets)
				.pipe(assets.restore())
				.pipe(plugins.useref())
				.pipe(gulp.dest(distLocation));
		});

		// inlines all non *demo.html html in any (sub)directory WITHIN app/ into angular templates, appends to dist/scripts/scripts.js
		gulp.task('inline-src-templates', function () {
			return streamqueue({objectMode: true},
				gulp.src(distLocation + '/scripts/scripts.js'),
				gulp.src(['app/*/**/*.html', '!**/*demo.html'])
					.pipe(plugins.angularTemplatecache({module: MODULE_NAME})))
				.pipe(plugins.concat('scripts.js'))
				.pipe(gulp.dest(path.join(distLocation, 'scripts')));
		});

		// annotates all angular methods in dist/scripts/scripts.js with text versions of the DI attributes, to protect them when minifying.
		gulp.task('ng-annotate', function () {
			return gulp.src(distLocation + '/scripts/scripts.js')
				.pipe(plugins.ngAnnotate())
				.pipe(gulp.dest(path.join(distLocation, 'scripts')));
		});

		// run the compass task on app/main.scss
		function runCompass(cssDir, callback) {
			if (!cssDir) {
				callback(new Error('no cssDir supplied to runCompass'));
				return;
			}
			exec('compass compile app/main.scss --css-dir ' + cssDir + ' --sass-dir app --import-path bower_components', function (error, stdout, stderr) {
				if (stdout) {
					plugins.util.log(plugins.util.colors.red(stdout));
				}
				if (stderr) {
					plugins.util.log(plugins.util.colors.red(stderr));
				}
				callback(error);
			});
		}

		gulp.task('compass-dist', function (callback) {
			runCompass(path.join(distLocation, 'styles'), callback);
		});
		gulp.task('compass-dev', function (callback) {
			runCompass('.tmp/styles', callback);
		});

		/**
		 * copy the font awesome fonts from the bower_components, for use in serve/serve-dist
		 */
		function copyFonts(where) {
			return gulp.src('bower_components/**/*.{ttf,otf,woff,woff2}')
				.pipe(plugins.flatten())
				.pipe(gulp.dest(where));
		}

		gulp.task('copy-fonts-dist', function () {
			return copyFonts(path.join(distLocation, 'fonts'));
		});
		gulp.task('copy-fonts-dev', function () {
			return copyFonts('.tmp/fonts');
		});

		/**
		 * Copy the source sass (scss) files from app/ to dist/
		 * Will rename main.scss to PROJECT_NAME.scss
		 *
		 * This way modules using this one can use the scss sources rather than the MUCH larger dist/styles/main.css
		 */
		gulp.task('copy-sass', function () {
			gulp.src('app/*/**/*.scss')
				.pipe(gulp.dest(path.join(distLocation, 'sass')));
			gulp.src('app/main.scss')
				.pipe(plugins.replace(/.*strip-in-dist:start[\s\S]*?strip-in-dist:end.*/, ''))
				.pipe(plugins.rename(function (path) {
					path.basename = '_' + PROJECT_NAME;
				}))
				.pipe(gulp.dest(path.join(distLocation, 'sass')));
		});

    /**
     * Copy the source assets/ files from app/ to dist/
     */
    gulp.task('copy-assets', function () {
      gulp.src('app/assets/**/*')
        .pipe(gulp.dest(path.join(distLocation, 'assets')));
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
					'scripts/mocks.js',
					'sass/_' + name + '.scss'
				];

				if (!fs.existsSync(distLocation)) {
					fs.mkdirSync(path.join(distLocation));
				}
				fs.writeFile(path.join(distLocation, 'bower.json'), JSON.stringify(distBower, null, 2), callback);
			}
		});

		gulp.task('watch', function () {
			var sass, src;

			sass = gulp.watch('app/**/*.scss', ['compass-dev']);
			sass.on('change', function (event) {
				plugins.util.log('Sass file changed ' + event.path + ' was ' + event.type + ', running compass');
			});

			// watch all html/css/js files in the app and .tmp dirs
			src = gulp.watch('{app,.tmp}/**/*.{html,css,js}');
			src.on('change', function (event) {
				plugins.util.log('Source file changed ' + event.path + ' was ' + event.type);
				plugins.livereload.reload();
			});

		});
	};

	smokegenApi.subTasks = function () {
		smokegenApi.common();

    // wire all angular demo.js and *demo-controller.js files
    gulp.task('wireapp-demo', function () {
      var files = glob.sync('app/{demo.js,**/*demo-controller.js}');
      return wireSrc(files, 'finddemo');
    });

    // wire all angular mock.js and *mock.js files
    gulp.task('wireapp-mock', function () {
      var files = glob.sync('app/{**/*mock.js}');
      return wireSrc(files, 'findmock');
    });

    gulp.task('wireall', function (callback) {
			runSequence('wiredep-src', 'wiredep-test', 'wireapp-ng', 'wireapp-demo', 'wireapp-mock', 'wireapp-scss', callback);
		});

		// inlines all *demo.html in any (sub)directory WITHIN app/ into angular templates, appends to dist/scripts/demo.js
		gulp.task('inline-demo-templates', function () {
			return streamqueue({objectMode: true},
				gulp.src(path.join(distLocation, 'scripts', 'demo.js')),
				gulp.src(['app/*/**/*demo.html'])
					.pipe(plugins.angularTemplatecache({module: MODULE_NAME})))
				.pipe(plugins.concat('demo.js'))
				.pipe(gulp.dest(path.join(distLocation, 'scripts')));
		});

		gulp.task('inline-templates', ['inline-src-templates', 'inline-demo-templates']);

		// tasks so that the dev env is ready to be served, for testing
		gulp.task('build', ['wireall', 'compass-dev', 'copy-fonts-dev']);

		// build the distribution, but clean first
		gulp.task('dist', function (callback) {
			runSequence('wireall', 'lint', 'test', 'clean-dist', 'useref', 'inline-templates', 'ng-annotate', 'compass-dist', 'copy-fonts-dist', 'copy-sass', 'dist-bower-json', callback);
		});

		// boot a webserver for the dev env, without building or watching
		gulp.task('serve-dev-internal', function (callback) {
			server(callback, {livereload: true, port: 9001, roots: ['app', '.tmp', 'bower_components']});
		});

		// boot a webserver for the dev env
		gulp.task('serve', function (callback) {
			runSequence('build', 'watch', 'serve-dev-internal', callback);
		});

		// boot a webserver for the built distribution
		gulp.task('serve-dist', ['dist'], function (callback) {
			server(callback, {roots: distLocation, port: 9001});
		});

		gulp.task('default', ['build']);
	};

	smokegenApi.topTasks = function () {
		smokegenApi.common();

    gulp.task('wireall', function (callback) {
			runSequence('wiredep-src', 'wiredep-test', 'wireapp-ng', 'wireapp-scss', callback);
		});

    function rm(paths, cb) {
      del(paths, {force: true}, cb);
    }

    gulp.task('rev-assets', function (cb) {
      var oldPaths = vinylPaths();

      gulp.src(path.join(distLocation, '{assets,fonts}', '**/*'))
        .pipe(oldPaths)
        .pipe(plugins.rev())
        .pipe(gulp.dest(distLocation))
        .pipe(plugins.rev.manifest())
        .pipe(gulp.dest(distLocation))
        .on('end', function () {
          rm(oldPaths.paths, cb);
        });
    });

    gulp.task('rev-cssjs', function (cb) {
      var oldPaths = vinylPaths(),
        manifest = gulp.src(path.join(distLocation, "rev-manifest.json"));

      gulp.src(path.join(distLocation, '{styles,scripts}', '**/*'))
        .pipe(oldPaths)
        .pipe(plugins.revReplace( { manifest: manifest } ))
        .pipe(plugins.rev())
        .pipe(gulp.dest(distLocation))
        .pipe(plugins.rev.manifest(path.join(distLocation, "rev-manifest.json"), { merge: true} ))
        .pipe(gulp.dest(''))
        .on('end', function () {
          rm(oldPaths.paths, cb);
        });
    });

    gulp.task('rev-index', function () {
      var manifest = gulp.src(path.join(distLocation, "rev-manifest.json"));

      return gulp.src(path.join(distLocation, 'index.html'))
        .pipe(plugins.revReplace( { manifest: manifest } ))
        .pipe(gulp.dest(distLocation));
    });

    gulp.task('rev', function (callback) {
      runSequence('rev-assets', 'rev-cssjs', 'rev-index', callback);
    });

    gulp.task('uglify', function () {
			return gulp.src(distLocation + '/scripts/**/*.js')
				.pipe(plugins.uglify())
				.pipe(gulp.dest(path.join(distLocation, 'scripts')));
		});

		gulp.task('minify-css', function () {
			return gulp.src(distLocation + '/styles/**/*.css')
				.pipe(plugins.minifyCss())
				.pipe(gulp.dest(path.join(distLocation, 'styles')));
		});

		gulp.task('gzip', function() {
			return gulp.src([distLocation + '/**/*'])
				.pipe(plugins.gzip())
				.pipe(plugins.rename( {
					extname: "" // strip .gz ext
				} ))
				.pipe(gulp.dest(distLocation));
		});

		gulp.task('compress', function (callback) {
			runSequence('uglify', 'minify-css', 'gzip', callback);
		});

    var awspublish = plugins.awspublish;

    gulp.task('publish', function() {
      var credentials = process.env.AWS_CREDENTIALS, publisher, headers;

      if (!credentials) {
        throw new Error("No AWS_CREDENTIALS env variable")
      }

      credentials = JSON.parse(credentials);
      publisher = awspublish.create(credentials);
      headers = { 'Content-Encoding': 'gzip' };

      return gulp.src(path.join(distLocation, '**/*'))
        .pipe(publisher.publish(headers))
        .pipe(awspublish.reporter());
    });

    // tasks so that the dev env is ready to be served, for testing
		gulp.task('build', ['wireall', 'compass-dev', 'copy-fonts-dev']);

		// build the distribution, but clean first
		gulp.task('dist', function (callback) {
			runSequence('wireall', 'lint', 'test', 'clean-dist', 'useref', 'inline-src-templates', 'ng-annotate', 'compass-dist', 'copy-assets', 'copy-fonts-dist', 'rev', 'compress', callback);
		});

		// boot a webserver for the dev env, without building or watching
		gulp.task('serve-dev-internal', function (callback) {
			server(callback, {livereload: true, port: 9001, roots: ['app', '.tmp', 'bower_components']});
		});

		// boot a webserver for the dev env
		gulp.task('serve', function (callback) {
			runSequence('build', 'watch', 'serve-dev-internal', callback);
		});

		// build the distribution and boot a webserver for it
		gulp.task('serve-dist', ['dist'], function (callback) {
			server(callback, {roots: distLocation, port: 9001, gzip: true});
		});

		// boot a webserver for the distribution, without re-building it
		gulp.task('serve-dist-nobuild', function (callback) {
			server(callback, {roots: distLocation, port: 9001, gzip: true});
		});

		gulp.task('default', ['build']);
	};

	return smokegenApi;
};