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

console.log('API loaded');

module.exports = [
  // Configuration
  {
    description: "Create new set",
    method: "POST",
    path: "/set/",
    role: "owner",
    fn: callbackResult(args => setManager.getSetId(args.body.label, true))
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
    fn: callbackResult(args => setManager.addState(
        args.params.set,
        setManager.getStateId(args.body.label, true)
      )
    )
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
