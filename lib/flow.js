"use strict";

function matchCondition(name, matchFn){
  return (callback, args) => {
    const result = matchFn(args);
    console.log(`matchCondition "${name}":`, args, '=>', result);
    callback(null, result);
  }
}

function executeAction(name, actionFn){
  return (callback, args) => {
    const result = actionFn(args);
    console.log(`executeAction "${name}":`, args, '=>', result);
    callback(null, result);
  }
}

//noinspection JSUnresolvedVariable
module.exports = {
  init(setManager) {
    //noinspection JSUnresolvedVariable,JSUnresolvedFunction
    const flow = Homey.manager('flow');

    function getSetId(args){
      return args.set && setManager.getSetId(args.set.name, args.set.id);
    }

    function getStateId(args){
      return args.state && setManager.getStateId(args.state.name, args.state.id);
    }

    //noinspection JSUnresolvedVariable
    const autoCompleteSet = (callback, args) => callback(
      null, setManager.autoCompleteSet(args.query)
    );

    //noinspection JSUnresolvedVariable
    const autoCompleteState = (callback, args) => callback(
      null, setManager.autoCompleteState(getSetId(args.args), args.query)
    );

    function matchTrigger(name){
      return (callback, args, state) => {
        const setId = getSetId(args);
        const stateId = getStateId(args);
        setId && stateId && setManager.addState(setId, stateId);

        let result = setId === state.setId;

        if (result && stateId && state.stateId){
          result = stateId === state.stateId;
        }

        if (result && state.trigger){
          result = args.trigger === state.trigger;
        }

        console.log(`matchTrigger "${name}":`, args,'==', state, '=>', result);
        callback(null, result);
      }
    }

    // Triggers

    flow.on('trigger.none_active', matchTrigger('none_active'));
    flow.on('trigger.not_none_active', matchTrigger('not_none_active'));
    flow.on('trigger.none_active_changed', matchTrigger('none_active_changed'));
    flow.on('trigger.all_active', matchTrigger('all_active'));
    flow.on('trigger.not_all_active', matchTrigger('not_all_active'));
    flow.on('trigger.all_active_changed', matchTrigger('all_active_changed'));
    flow.on('trigger.state_set', matchTrigger('state_set'));
    flow.on('trigger.state_reset', matchTrigger('state_reset'));
    flow.on('trigger.change', matchTrigger('change'));

    // Triggers auto completion

    flow.on('trigger.none_active.set.autocomplete', autoCompleteSet);
    flow.on('trigger.not_none_active.set.autocomplete', autoCompleteSet);
    flow.on('trigger.none_active_changed.set.autocomplete', autoCompleteSet);
    flow.on('trigger.all_active.set.autocomplete', autoCompleteSet);
    flow.on('trigger.not_all_active.set.autocomplete', autoCompleteSet);
    flow.on('trigger.all_active_changed.set.autocomplete', autoCompleteSet);
    flow.on('trigger.state_set.set.autocomplete', autoCompleteSet);
    flow.on('trigger.state_set.state.autocomplete', autoCompleteState);
    flow.on('trigger.state_reset.set.autocomplete', autoCompleteSet);
    flow.on('trigger.state_reset.state.autocomplete', autoCompleteState);
    flow.on('trigger.change.set.autocomplete', autoCompleteSet);

    // Conditions

    flow.on('condition.none_active', matchCondition('none_active', args => setManager.getNone(getSetId(args))));
    flow.on('condition.all_active', matchCondition('all_active', args => setManager.getAll(getSetId(args))));
    flow.on('condition.is_active', matchCondition('is_active', args => setManager.getState(getSetId(args), getStateId(args))));

    // Conditions auto completion

    flow.on('condition.none_active.set.autocomplete', autoCompleteSet);
    flow.on('condition.all_active.set.autocomplete', autoCompleteSet);
    flow.on('condition.is_active.set.autocomplete', autoCompleteSet);
    flow.on('condition.is_active.state.autocomplete', autoCompleteState);

    // Actions

    flow.on('action.activate_state', executeAction('activate_state', args => setManager.setState(getSetId(args), getStateId(args), true)));
    flow.on('action.activate_temp_state', executeAction('activate_temp_state', args => setManager.setState(getSetId(args), getStateId(args), args.timeout)));
    flow.on('action.deactivate_state', executeAction('deactivate_state', args => setManager.setState(getSetId(args), getStateId(args), false)));
    flow.on('action.activate_all', executeAction('activate_all', args => setManager.setAll(getSetId(args), true)));
    flow.on('action.deactivate_all', executeAction('deactivate_all', args => setManager.setAll(getSetId(args), false)));
    flow.on('action.activate_one', executeAction('activate_one', args => setManager.setExactlyOne(getSetId(args), getStateId(args))));

    // Actions auto completion

    flow.on('action.activate_state.set.autocomplete', autoCompleteSet);
    flow.on('action.activate_state.state.autocomplete', autoCompleteState);
    flow.on('action.activate_temp_state.set.autocomplete', autoCompleteSet);
    flow.on('action.activate_temp_state.state.autocomplete', autoCompleteState);
    flow.on('action.deactivate_state.set.autocomplete', autoCompleteSet);
    flow.on('action.deactivate_state.state.autocomplete', autoCompleteState);
    flow.on('action.activate_all.set.autocomplete', autoCompleteSet);
    flow.on('action.deactivate_all.set.autocomplete', autoCompleteSet);
    flow.on('action.activate_one.set.autocomplete', autoCompleteSet);
    flow.on('action.activate_one.state.autocomplete', autoCompleteState);

    console.log('flow initialized');
  }
};