'use strict';

/* jslint node: true */

module.exports = {
	addSubGeneratorTasks: function (gulp) {
		var sub = require('./tasks.js');
		sub(gulp).subTasks();
	},
	addTopGeneratorTasks: function (gulp) {
		var sub = require('./tasks.js');
		sub(gulp).topTasks();
	}
};
