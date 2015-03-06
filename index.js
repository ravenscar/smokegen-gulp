'use strict';

/* jslint node: true */

module.exports = {
	addSubGeneratorTasks: function (gulp) {
		var sub = require('./sub.js');
		sub(gulp);
	}
}
