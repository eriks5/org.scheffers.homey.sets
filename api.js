"use strict";

const Homey = require('homey');

function callbackResult(fn){
  return (args, callback) => {
    fn(args).then(
      result => result ? callback(null, result) : callback(result, null)
    ).catch(
      err => callback(err, null)
    );
  }
}

// console.log('API loaded');

module.exports = [
  // Configuration
  {
    description: "Create new set",
    method: "POST",
    path: "/set/",
    role: "owner",
    fn: callbackResult(async args => {
      const setId = await Homey.app.getSetId(args.body.label);
      if (args.body.copyFrom){
        await Homey.app.copyStates(args.body.copyFrom, setId);
      }
      return setId;
    })
  },
  {
    description: "Delete set",
    method: "DELETE",
    path: "/set/:set",
    role: "owner",
    fn: callbackResult(args => Homey.app.deleteSet(args.params.set))
  },
  {
    description: "Add state to set",
    method: "POST",
    path: "/set/:set/state/",
    role: "owner",
    fn: callbackResult(async args => {
      const stateId = await Homey.app.getStateId(args.body.label);
      return stateId && await Homey.app.addState(args.params.set, stateId);
    })
  },
  {
    description: "Delete state from set",
    method: "DELETE",
    path: "/set/:set/state/:state",
    role: "owner",
    fn: callbackResult(args => Homey.app.deleteState(args.params.set, args.params.state))
  },

  // Access
  {
    description: "Get full state",
    method: "GET",
    path: "/",
    fn: (args, callback) => callback(null, Homey.app.getFullState())
  },

  // Control
  {
    description: "Toggle state",
    method: "POST",
    path: "/set/:set/state/:state",
    fn: callbackResult(args => Homey.app.setState(args.params.set, args.params.state, null))
  }
];
