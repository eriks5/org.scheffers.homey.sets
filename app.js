"use strict";

const setManager = require('./lib/setsManager.js');
const flow = require('./lib/flow.js');

module.exports = {
  init() {
    setManager.init();
    flow.init(setManager);

    // console.log('App started')
  },

  setManager: setManager
};
