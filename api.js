"use strict";

const setManager = Homey.app.setManager;

function callbackResult(fn){
  return (callback, args) => {
    const result = fn(args);
    if (result){
      callback(null, result);
    }
    else {
      callback(result, null);
    }
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
    fn: callbackResult(args => {
      const setId = setManager.getSetId(args.body.label);
      if (args.body.copyFrom){
        setManager.copyStates(args.body.copyFrom, setId);
      }
      return setId;
    })
  },
  {
    description: "Delete set",
    method: "DELETE",
    path: "/set/:set",
    role: "owner",
    fn: callbackResult(args => setManager.deleteSet(args.params.set))
  },
  {
    description: "Add state to set",
    method: "POST",
    path: "/set/:set/state/",
    role: "owner",
    fn: callbackResult(args => {
      const stateId = setManager.getStateId(args.body.label);
      return stateId && setManager.addState(args.params.set, stateId);
    })
  },
  {
    description: "Delete state from set",
    method: "DELETE",
    path: "/set/:set/state/:state",
    role: "owner",
    fn: callbackResult(args => setManager.deleteState(args.params.set, args.params.state))
  },

  // Access
  {
    description: "Get full state",
    method: "GET",
    path: "/",
    fn: callbackResult(setManager.getFullState)
  },

  // Control
  {
    description: "Toggle state",
    method: "PUT",
    path: "/set/:set/state/:state",
    fn: callbackResult(args => setManager.setState(args.params.set, args.params.state, null))
  }
];
