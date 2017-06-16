"use strict";

function matchTrigger(name){
  return (callback, args, state) => {
    let result = args.set.id === state.setId;

    if (result && state.stateId){
      result = args.state.id === state.stateId;
    }

    if (result && state.trigger){
      result = args.trigger === state.trigger;
    }

    console.log(`matchTrigger "${name}":`, args,'==', state, '=>', result);
    callback(null, result);
  }
}

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

    //noinspection JSUnresolvedVariable
    const autoCompleteSet = (callback, args) => callback(
      null, setManager.autoCompleteSet(args.query)
    );
    //noinspection JSUnresolvedVariable
    const autoCompleteState = (callback, args) => callback(
      null, setManager.autoCompleteState(args.args.set.id, args.query)
    );

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

    flow.on('condition.none_active', matchCondition('none_active', args => setManager.getNone(args.set.id)));
    flow.on('condition.all_active', matchCondition('all_active', args => setManager.getAll(args.set.id)));
    flow.on('condition.is_active', matchCondition('is_active', args => setManager.getState(args.set.id, args.state.id)));

    // Conditions auto completion

    flow.on('condition.none_active.set.autocomplete', autoCompleteSet);
    flow.on('condition.all_active.set.autocomplete', autoCompleteSet);
    flow.on('condition.is_active.set.autocomplete', autoCompleteSet);
    flow.on('condition.is_active.state.autocomplete', autoCompleteState);

    // Actions

    flow.on('action.activate_state', executeAction('activate_state', args => setManager.setState(args.set.id, args.state.id, true)));
    flow.on('action.activate_temp_state', executeAction('activate_temp_state', args => setManager.setState(args.set.id, args.state.id, args.timeout)));
    flow.on('action.deactivate_state', executeAction('deactivate_state', args => setManager.setState(args.set.id, args.state.id, false)));
    flow.on('action.activate_all', executeAction('activate_all', args => setManager.setAll(args.set.id, true)));
    flow.on('action.deactivate_all', executeAction('deactivate_all', args => setManager.setAll(args.set.id, false)));

    // Actions auto completion

    flow.on('action.activate_state.set.autocomplete', autoCompleteSet);
    flow.on('action.activate_state.state.autocomplete', autoCompleteState);
    flow.on('action.activate_temp_state.set.autocomplete', autoCompleteSet);
    flow.on('action.activate_temp_state.state.autocomplete', autoCompleteState);
    flow.on('action.deactivate_state.set.autocomplete', autoCompleteSet);
    flow.on('action.deactivate_state.state.autocomplete', autoCompleteState);
    flow.on('action.activate_all.set.autocomplete', autoCompleteSet);
    flow.on('action.deactivate_all.set.autocomplete', autoCompleteSet);

    console.log('flow initialized');
  }
};